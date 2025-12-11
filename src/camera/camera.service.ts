import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../database/prisma.service';
import { QwenVisionService } from './services/qwen-vision.service';
import {
  GoogleVisionService,
  WebDetection,
} from './services/google-vision.service';
import { WebScraperService } from './services/web-scraper.service';
import { ArtworkMatchingService } from './services/artwork-matching.service';
import { ImageProcessingService } from './services/image-processing.service';
import { CategoryMappingService } from './services/category-mapping.service';
import { RecognitionResponseDto } from './dto/recognition-response.dto';
import { getMessage } from './constants/messages';

interface ArtworkData {
  identified: boolean;
  confidence: number;
  isMonument?: boolean;
  country?: string;
  title?: string;
  artist?: string;
  year?: string;
  period?: string;
  technique?: string;
  description?: string;
  tags?: string[];
  dimensions?: string;
}

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);
  private readonly minConfidence: number;
  private readonly qwenClient: OpenAI;
  private readonly qwenModel: string;

  constructor(
    private readonly qwenVisionService: QwenVisionService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly webScraperService: WebScraperService,
    private readonly matchingService: ArtworkMatchingService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly categoryMappingService: CategoryMappingService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.minConfidence = this.configService.get<number>(
      'MIN_CONFIDENCE_THRESHOLD',
      0.6,
    );

    // Initialize OpenAI client for Qwen text model
    const qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    const qwenBaseUrl =
      this.configService.get<string>('QWEN_BASE_URL') ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    this.qwenModel = this.configService.get<string>('QWEN_MODEL', 'qwen-flash');

    this.qwenClient = new OpenAI({
      apiKey: qwenApiKey,
      baseURL: qwenBaseUrl,
      timeout: 30000, // 30 second timeout for web content analysis
      maxRetries: 0,
    });
  }

  async recognizeArtwork(
    imageBuffer: Buffer,
    _originalFilename: string,
    _mimeType: string,
    userId: string,
    localUri: string,
    language: string = 'es',
  ): Promise<RecognitionResponseDto> {
    this.logger.log(
      `Recognition request from user ${userId}, language: ${language}`,
    );

    // 1. Convert image to base64 for AI analysis
    const base64Image = this.imageProcessingService.bufferToBase64(imageBuffer);

    // 2. NEW FLOW: Parallel calls to Qwen VL and Google Vision
    this.logger.log(
      '🚀 Starting parallel analysis: Qwen VL + Google Vision...',
    );
    const [qwenResult, visionResult] = await Promise.all([
      this.qwenVisionService.analyzeArtworkImage(base64Image, language),
      this.googleVisionService.detectWeb(base64Image, language),
    ]);

    let artworkData: ArtworkData | null = null;
    let identified = false;

    // Log results from parallel calls
    this.logger.log(
      `📊 Qwen VL result: identified=${qwenResult.identified}, confidence=${qwenResult.confidence}`,
    );
    this.logger.log(
      `📊 Google Vision result: ${visionResult.pagesWithMatchingImages.length} pages with matching images`,
    );
    if (visionResult.pagesWithMatchingImages.length > 0) {
      this.logger.log(
        `📌 URLs found:\n${visionResult.pagesWithMatchingImages
          .slice(0, 5)
          .map((page, idx) => `  ${idx + 1}. ${page.url}`)
          .join(
            '\n',
          )}${visionResult.pagesWithMatchingImages.length > 5 ? `\n  ... and ${visionResult.pagesWithMatchingImages.length - 5} more` : ''}`,
      );
    }

    // 3. Evaluate Qwen VL result first (HIGH CONFIDENCE CHECK)
    const QWEN_VL_HIGH_CONFIDENCE = 0.99;
    if (
      qwenResult.identified &&
      qwenResult.confidence >= QWEN_VL_HIGH_CONFIDENCE
    ) {
      artworkData = qwenResult;
      identified = true;
      this.logger.log(
        `✅ HIGH CONFIDENCE identification via Qwen VL: "${artworkData.title}", confidence: ${artworkData.confidence}`,
      );
    } else {
      // 4. Fallback: Enhanced Web Scraping with Qwen Flash
      if (qwenResult.identified) {
        this.logger.log(
          `⚠️ Qwen VL confidence too low (${qwenResult.confidence} < ${QWEN_VL_HIGH_CONFIDENCE}), falling back to web scraping...`,
        );
      } else {
        this.logger.log(
          `⚠️ Qwen VL could not identify artwork, falling back to web scraping...`,
        );
      }

      if (visionResult.pagesWithMatchingImages.length > 0) {
        this.logger.log(
          `🔍 Attempting enhanced web scraping with ${visionResult.pagesWithMatchingImages.length} URLs...`,
        );
        artworkData = await this.fallbackEnhancedWebScraping(
          visionResult,
          qwenResult,
          language,
        );
        identified =
          artworkData !== null && artworkData.confidence >= this.minConfidence;

        if (identified) {
          this.logger.log(
            `✅ Identified via Enhanced Web Scraping: "${artworkData?.title}", confidence: ${artworkData?.confidence}`,
          );
        } else {
          this.logger.log(
            `❌ Enhanced web scraping failed to identify with sufficient confidence`,
          );
        }
      } else {
        this.logger.log('❌ No URLs found by Google Vision for web scraping');
      }
    }

    // 4. DECISION POINT: Only proceed if identified
    if (!identified || !artworkData) {
      return {
        success: true,
        identified: false,
        artwork: null,
        savedToCollection: false,
        message: getMessage(language, 'NOT_IDENTIFIED'),
      };
    }

    // 5. Match against database
    const matchedArtwork = await this.matchingService.findMatchingArtwork(
      artworkData.title || '',
      artworkData.artist || '',
      language,
    );

    // 6. Save to user collection with localUri (no upload to storage)
    const collectionItem = await this.saveToCollection(
      userId,
      localUri,
      matchedArtwork,
      artworkData,
    );

    // 7. Build success response
    return this.buildSuccessResponse(
      collectionItem,
      artworkData,
      matchedArtwork,
      language,
    );
  }

  /**
   * Enhanced fallback: Web scraping with Qwen Flash
   * Uses ALL URLs from Google Vision (no Qwen VL context)
   */
  private async fallbackEnhancedWebScraping(
    visionData: WebDetection,
    qwenVLResult: ArtworkData,
    language: string,
  ): Promise<ArtworkData | null> {
    // Get ALL URLs (prioritize museum/Wikipedia, but include more)
    const allUrls = this.webScraperService.prioritizeArtUrls(
      visionData.pagesWithMatchingImages,
    );
    // Limit to first 10 URLs to avoid excessive scraping time
    const urls = allUrls.slice(0, 10);

    if (urls.length === 0) {
      this.logger.log('No matching pages found');
      return null;
    }

    this.logger.log(`📡 Scraping ${urls.length} URLs in parallel...`);

    // Scrape web pages
    const htmlResults = await this.webScraperService.fetchMultipleUrls(urls);
    const successfulScrapes = htmlResults.filter((r) => r.html);
    this.logger.log(
      `✅ Successfully scraped ${successfulScrapes.length}/${urls.length} URLs`,
    );

    const combinedText = successfulScrapes
      .map((r) => this.webScraperService.extractCleanText(r.html || ''))
      .join('\n\n');

    if (!combinedText || combinedText.length < 100) {
      this.logger.log('⚠️ Insufficient content from web scraping');
      return null;
    }

    // Use enhanced Qwen Flash analysis with URLs (NO Qwen VL context)
    this.logger.log('🤖 Analyzing with Qwen Flash (enhanced with URLs)...');
    const artworkInfo = await this.analyzeWebContentForArtworkEnhanced(
      combinedText,
      urls,
      visionData.bestGuessLabels,
      language,
    );

    return artworkInfo;
  }

  /**
   * Enhanced Qwen Flash analysis with raw URLs from Google Vision
   * Does NOT include Qwen VL context
   */
  private async analyzeWebContentForArtworkEnhanced(
    webContent: string,
    rawUrls: string[],
    bestGuessLabels: Array<{ label: string; languageCode?: string }>,
    language: string,
  ): Promise<ArtworkData | null> {
    try {
      const prompt = this.buildEnhancedWebAnalysisPrompt(
        webContent,
        rawUrls,
        bestGuessLabels,
        language,
      );

      this.logger.log('📤 Sending enhanced request to Qwen Flash...');
      this.logger.log(`  Web content length: ${webContent.length} characters`);
      this.logger.log(`  Number of URLs: ${rawUrls.length}`);
      this.logger.log(
        `  Best guess labels: ${bestGuessLabels.map((l) => l.label).join(', ')}`,
      );

      const response = await this.qwenClient.chat.completions.create({
        model: this.qwenModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('Empty response from Qwen enhanced web analysis');
        return null;
      }

      this.logger.log('📥 Raw response from Qwen Flash (enhanced):');
      this.logger.log(`${content}`);

      const parsedResult = this.parseWebAnalysisResponse(content);

      if (parsedResult) {
        this.logger.log('✅ Parsed enhanced Qwen Flash result:');
        this.logger.log(`  identified: ${parsedResult.identified}`);
        this.logger.log(`  confidence: ${parsedResult.confidence}`);
        this.logger.log(`  title: ${parsedResult.title || 'N/A'}`);
        this.logger.log(`  artist: ${parsedResult.artist || 'N/A'}`);
        this.logger.log(`  isMonument: ${parsedResult.isMonument || false}`);
        this.logger.log(`  country: ${parsedResult.country || 'N/A'}`);
      } else {
        this.logger.warn('⚠️ Failed to parse enhanced Qwen Flash response');
      }

      return parsedResult;
    } catch (error) {
      this.logger.error(`Qwen enhanced web analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build enhanced prompt with raw URLs included
   */
  private buildEnhancedWebAnalysisPrompt(
    webContent: string,
    rawUrls: string[],
    bestGuessLabels: Array<{ label: string; languageCode?: string }>,
    language: string,
  ): string {
    const hints = bestGuessLabels.map((l) => l.label).join(', ');
    const urlsList = rawUrls.map((url, idx) => `${idx + 1}. ${url}`).join('\n');

    const prompts = {
      es: `Eres un historiador de arte experto con amplio conocimiento sobre obras de arte mundiales. Tu especialidad es identificar y proporcionar información precisa, verificable y concisa sobre pinturas, esculturas, arquitectura y monumentos.

Tu misión es encontrar e identificar una obra de arte específica a partir de la información obtenida de realizar la búsqueda de una imagen en la web.

URLS ENCONTRADAS EN LA WEB (${rawUrls.length} fuentes):
${urlsList}

PISTAS DE LA BÚSQUEDA WEB: ${hints || 'No disponibles'}

INFORMACIÓN EXTRAÍDA DE LAS PÁGINAS WEB:
${webContent}

Analiza cuidadosamente esta información. Las URLs proporcionadas pueden indicar la fuente y veracidad de la información. Prioriza información de fuentes confiables como museos, Wikipedia, y sitios culturales reconocidos.

Si reconoces una obra de arte específica, responde con un objeto JSON válido con este formato exacto:

{
  "identified": true,
  "confidence": 0.95,
  "isMonument": true,
  "country": "España",
  "title": "título exacto de la obra",
  "artist": "nombre completo del artista",
  "year": "año o período exacto",
  "period": "período artístico (ej: Renacimiento, Barroco, Impresionismo)",
  "technique": "técnica utilizada (ej: óleo sobre lienzo, mármol, fresco)",
  "dimensions": "dimensiones de la obra si las conoces",
  "description": "descripción de 2-3 frases sobre la obra, su importancia histórica y algún dato curioso o detalle específico",
  "tags": ["tag1", "tag2", "tag3"]
}

Si NO puedes identificar la obra con certeza, responde:

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANTE:
- Responde ÚNICAMENTE con el JSON, sin texto adicional antes o después
- Si no conoces algún dato con certeza, usa "Desconocido" en lugar de inventar información
- Prioriza la precisión sobre la completitud
- El campo "confidence" debe reflejar tu nivel de certeza (0.0-1.0)
- Como esta es información indirecta (de páginas web), el "confidence" debería ser menor a 0.8
- Considera la reputación de las fuentes (URLs) al asignar el nivel de confianza
- El campo "isMonument" es OBLIGATORIO y debe ser un booleano:
  * true: SOLO para estructuras arquitectónicas físicas (catedrales, torres, puentes, castillos, palacios, templos, edificios históricos, arcos monumentales)
  * false: Para pinturas, esculturas, obras de arte tradicionales (aunque representen arquitectura)
- El campo "country" es OPCIONAL:
  * Inclúyelo SOLO si "isMonument" es true
  * Debe ser el nombre del país donde está ubicado el monumento
  * Si "isMonument" es false, omite este campo o déjalo como null`,

      en: `You are an expert art historian with extensive knowledge of world artworks. Your specialty is to identify and provide accurate, verifiable, and concise information about paintings, sculptures, architecture, and monuments.

Your mission is to find and identify a specific artwork from the information obtained by performing a web search of an image.

URLS FOUND ON THE WEB (${rawUrls.length} sources):
${urlsList}

WEB SEARCH HINTS: ${hints || 'Not available'}

INFORMATION EXTRACTED FROM WEB PAGES:
${webContent}

Carefully analyze this information. The URLs provided can indicate the source and veracity of the information. Prioritize information from trusted sources such as museums, Wikipedia, and recognized cultural sites.

If you recognize a specific artwork, respond with a valid JSON object in this exact format:

{
  "identified": true,
  "confidence": 0.95,
  "isMonument": true,
  "country": "Spain",
  "title": "exact title of the artwork",
  "artist": "full name of the artist",
  "year": "exact year or period",
  "period": "artistic period (e.g., Renaissance, Baroque, Impressionism)",
  "technique": "technique used (e.g., oil on canvas, marble, fresco)",
  "dimensions": "dimensions of the artwork if you know them",
  "description": "2-3 sentence description about the work, its historical importance and some curious fact or specific detail",
  "tags": ["tag1", "tag2", "tag3"]
}

If you CANNOT identify the work with certainty, respond:

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANT:
- Respond ONLY with the JSON, no additional text before or after
- If you don't know a piece of data with certainty, use "Unknown" instead of making up information
- Prioritize accuracy over completeness
- The "confidence" field should reflect your level of certainty (0.0-1.0)
- Since this is indirect information (from web pages), "confidence" should be less than 0.8
- Consider the reputation of sources (URLs) when assigning confidence level
- The "isMonument" field is REQUIRED and must be a boolean:
  * true: ONLY for physical architectural structures (cathedrals, towers, bridges, castles, palaces, temples, historic buildings, monumental arches)
  * false: For paintings, sculptures, traditional artworks (even if they depict architecture)
- The "country" field is OPTIONAL:
  * Include it ONLY if "isMonument" is true
  * Must be the name of the country where the monument is located
  * If "isMonument" is false, omit this field or leave it as null`,

      fr: `Vous êtes un historien d'art expert avec une connaissance approfondie des œuvres d'art mondiales. Votre spécialité est d'identifier et de fournir des informations précises, vérifiables et concises sur les peintures, sculptures, architecture et monuments.

Votre mission est de trouver et identifier une œuvre d'art spécifique à partir des informations obtenues en effectuant une recherche web d'une image.

URLS TROUVÉES SUR LE WEB (${rawUrls.length} sources) :
${urlsList}

INDICES DE LA RECHERCHE WEB : ${hints || 'Non disponibles'}

INFORMATIONS EXTRAITES DES PAGES WEB :
${webContent}

Analysez attentivement ces informations. Les URLs fournies peuvent indiquer la source et la véracité de l'information. Priorisez les informations provenant de sources fiables telles que les musées, Wikipédia et les sites culturels reconnus.

Si vous reconnaissez une œuvre d'art spécifique, répondez avec un objet JSON valide dans ce format exact :

{
  "identified": true,
  "confidence": 0.95,
  "isMonument": true,
  "country": "Espagne",
  "title": "titre exact de l'œuvre",
  "artist": "nom complet de l'artiste",
  "year": "année ou période exacte",
  "period": "période artistique (ex: Renaissance, Baroque, Impressionnisme)",
  "technique": "technique utilisée (ex: huile sur toile, marbre, fresque)",
  "dimensions": "dimensions de l'œuvre si vous les connaissez",
  "description": "description de 2-3 phrases sur l'œuvre, son importance historique et un fait curieux ou détail spécifique",
  "tags": ["tag1", "tag2", "tag3"]
}

Si vous NE pouvez PAS identifier l'œuvre avec certitude, répondez :

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANT :
- Répondez UNIQUEMENT avec le JSON, sans texte supplémentaire avant ou après
- Si vous ne connaissez pas une donnée avec certitude, utilisez "Inconnu" au lieu d'inventer l'information
- Priorisez la précision plutôt que l'exhaustivité
- Le champ "confidence" doit refléter votre niveau de certitude (0.0-1.0)
- Comme ce sont des informations indirectes (de pages web), "confidence" devrait être inférieur à 0.8
- Considérez la réputation des sources (URLs) lors de l'attribution du niveau de confiance
- Le champ "isMonument" est OBLIGATOIRE et doit être un booléen :
  * true: UNIQUEMENT pour les structures architecturales physiques (cathédrales, tours, ponts, châteaux, palais, temples, bâtiments historiques, arcs monumentaux)
  * false: Pour les peintures, sculptures, œuvres d'art traditionnelles (même si elles représentent de l'architecture)
- Le champ "country" est OPTIONNEL :
  * Incluez-le SEULEMENT si "isMonument" est true
  * Doit être le nom du pays où le monument est situé
  * Si "isMonument" est false, omettez ce champ ou laissez-le comme null`,
    };

    return prompts[language] || prompts.es;
  }

  private parseWebAnalysisResponse(content: string): ArtworkData | null {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(jsonStr.trim());

      // Validate required fields
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof parsed.identified !== 'boolean') {
        throw new Error('Invalid response format');
      }

      // Ensure isMonument has a default value if missing
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof parsed.isMonument !== 'boolean') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        parsed.isMonument = false;
      }

      return parsed as ArtworkData;
    } catch (error) {
      this.logger.warn(
        `Failed to parse web analysis response: ${error.message}`,
      );
      return null;
    }
  }

  private async saveToCollection(
    userId: string,
    capturedImageUrl: string,
    matchedArtwork: any,
    artworkData: ArtworkData,
  ) {
    // Map the period to a category ID if no DB match
    const mappedCategoryId = matchedArtwork
      ? null
      : this.categoryMappingService.mapPeriodToCategory(artworkData.period);

    return this.prisma.userCollectionItem.create({
      data: {
        userId,
        artworkId: matchedArtwork?.id || null,
        capturedImageUrl,
        identifiedAt: new Date(),

        // If no DB match, store custom data
        customTitle: matchedArtwork ? null : artworkData.title,
        customAuthor: matchedArtwork ? null : artworkData.artist,
        customYear: matchedArtwork
          ? null
          : artworkData.year
            ? String(artworkData.year)
            : null,
        customTechnique: matchedArtwork ? null : artworkData.technique,
        customDimensions: matchedArtwork ? null : artworkData.dimensions,
        customDescription: matchedArtwork ? null : artworkData.description,
        customCountry: matchedArtwork ? null : artworkData.country,
        customCategoryId: mappedCategoryId || 'unknown',
      },
    });
  }

  private buildSuccessResponse(
    collectionItem: any,
    artworkData: ArtworkData,
    matchedArtwork: any,
    language: string,
  ): RecognitionResponseDto {
    const translation = matchedArtwork?.translations?.[0];
    const categoryTranslation = matchedArtwork?.category?.translations?.[0];

    return {
      success: true,
      identified: true,
      artwork: {
        id: collectionItem.id,
        title: translation?.title || artworkData.title || 'Unknown',
        artist: matchedArtwork?.author?.name || artworkData.artist || 'Unknown',
        year: matchedArtwork?.year || artworkData.year || 'Unknown',
        period: categoryTranslation?.name || artworkData.period || 'Unknown',
        description: translation?.description || artworkData.description || '',
        confidence: artworkData.confidence,
        tags: artworkData.tags || [],
        capturedImageUrl: collectionItem.capturedImageUrl,
        identifiedAt: collectionItem.identifiedAt.toISOString(),
      },
      savedToCollection: true,
      message: getMessage(language, 'SUCCESS_IDENTIFIED'),
    };
  }
}
