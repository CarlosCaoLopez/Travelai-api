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
import { PlaywrightScraperService } from './services/playwright-scraper.service';
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
  private readonly qwenVLMinConfidence: number;
  private readonly qwenClient: OpenAI;
  private readonly qwenModel: string;

  constructor(
    private readonly qwenVisionService: QwenVisionService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly webScraperService: WebScraperService,
    private readonly playwrightScraperService: PlaywrightScraperService,
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
    this.qwenVLMinConfidence = this.configService.get<number>(
      'QWEN_VL_HIGH_CONFIDENCE_THRESHOLD',
      0.98,
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

    // 2. NEW FLOW: Sequential execution starting with Google Vision
    this.logger.log('🔍 Step 1: Google Vision API');
    const googleVisionStart = Date.now();
    const visionResult = await this.googleVisionService.detectWeb(
      base64Image,
      language,
    );
    const googleVisionTime = Date.now() - googleVisionStart;
    this.logger.log(`⏱️ Google Vision completed in ${googleVisionTime}ms`);

    let artworkData: ArtworkData | null = null;
    let identified = false;

    // Log complete Google Vision results
    this.logger.log('📊 Google Vision complete results:');
    this.logger.log(
      `  - Pages with matching images: ${visionResult.pagesWithMatchingImages.length}`,
    );
    this.logger.log(
      `  - Visually similar images: ${visionResult.visuallySimilarImages.length}`,
    );
    this.logger.log(`  - Web entities: ${visionResult.webEntities.length}`);
    this.logger.log(
      `  - Best guess labels: ${visionResult.bestGuessLabels.length}`,
    );

    // Log best guess labels
    if (visionResult.bestGuessLabels.length > 0) {
      this.logger.log('🏷️ Best Guess Labels:');
      visionResult.bestGuessLabels.forEach((label, idx) => {
        this.logger.log(
          `  ${idx + 1}. "${label.label}"${label.languageCode ? ` (${label.languageCode})` : ''}`,
        );
      });
    }

    // Log web entities with scores
    if (visionResult.webEntities.length > 0) {
      this.logger.log('🌐 Web Entities (top 10):');
      visionResult.webEntities.slice(0, 10).forEach((entity, idx) => {
        this.logger.log(
          `  ${idx + 1}. ${entity.description || 'N/A'} (score: ${entity.score?.toFixed(2) || 'N/A'})`,
        );
      });
    }

    // Log URLs
    if (visionResult.pagesWithMatchingImages.length > 0) {
      this.logger.log(
        `📌 URLs found:\n${visionResult.pagesWithMatchingImages
          .slice(0, 5)
          .map(
            (page, idx) =>
              `  ${idx + 1}. ${page.url}${page.pageTitle ? ` - "${page.pageTitle}"` : ''}`,
          )
          .join(
            '\n',
          )}${visionResult.pagesWithMatchingImages.length > 5 ? `\n  ... and ${visionResult.pagesWithMatchingImages.length - 5} more` : ''}`,
      );
    }

    // 2. Web Scraping with HTTP requests
    this.logger.log('📄 Step 2: HTTP Web Scraping');
    const urls = this.webScraperService.prioritizeArtUrls(
      visionResult.pagesWithMatchingImages || [],
    );

    let combinedText = '';
    let scrapedSuccessfully = false;

    if (urls.length > 0) {
      const scrapingStart = Date.now();
      const htmlResults = await this.webScraperService.fetchMultipleUrls(
        urls.slice(0, 5),
      );
      const scrapingTime = Date.now() - scrapingStart;

      combinedText = htmlResults
        .map((result) =>
          this.webScraperService.extractCleanText(result.html || ''),
        )
        .filter((text) => text.trim().length > 0)
        .join('\n\n');

      scrapedSuccessfully = combinedText.length >= 100;
      this.logger.log(
        `📊 HTTP scraping: ${combinedText.length} chars from ${urls.length} URLs in ${scrapingTime}ms`,
      );
    } else {
      this.logger.log('⚠️ No URLs found from Google Vision');
    }

    // 3. Playwright Fallback (if HTTP scraping failed)
    const minLength = parseInt(
      this.configService.get('MIN_SCRAPED_TEXT_LENGTH', '100'),
      10,
    );

    if (!scrapedSuccessfully && urls.length > 0) {
      this.logger.log(
        `⚠️ HTTP scraping insufficient (${combinedText.length} < ${minLength}), using Playwright...`,
      );

      const playwrightStart = Date.now();
      const renderedContent =
        await this.playwrightScraperService.fetchRenderedContent(urls[0]);
      const playwrightTime = Date.now() - playwrightStart;

      if (renderedContent && renderedContent.length >= minLength) {
        combinedText = renderedContent;
        scrapedSuccessfully = true;
        this.logger.log(
          `✅ Playwright success: ${renderedContent.length} chars in ${playwrightTime}ms`,
        );
      } else {
        this.logger.log(
          `❌ Playwright also failed: ${renderedContent?.length || 0} chars in ${playwrightTime}ms`,
        );
      }
    }

    // 4. Qwen Flash Analysis (primary method)
    this.logger.log('🤖 Step 3: Qwen Flash Analysis (primary)');

    if (scrapedSuccessfully && combinedText.length >= minLength) {
      artworkData = await this.analyzeWebContentForArtworkEnhanced(
        combinedText,
        urls,
        visionResult.bestGuessLabels || [],
        visionResult.webEntities || [],
        language,
      );

      identified =
        artworkData !== null && artworkData.confidence >= this.minConfidence;

      if (identified) {
        this.logger.log(
          `✅ Identified via Qwen Flash: "${artworkData?.title}", confidence: ${artworkData?.confidence}`,
        );
      } else {
        this.logger.log(
          `❌ Qwen Flash failed to identify with sufficient confidence`,
        );
      }
    } else {
      this.logger.log(
        `⚠️ Insufficient content for Qwen Flash (${combinedText.length} chars), will try Qwen VL`,
      );
    }

    // 5. Qwen VL Fallback (only if Qwen Flash failed)
    if (!identified) {
      this.logger.log('👁️ Step 4: Qwen VL Analysis (fallback - Flash failed)');

      // Extract top web entity for Qwen VL
      const topEntity =
        visionResult.webEntities.length > 0
          ? visionResult.webEntities.reduce((prev, current) =>
              (current.score || 0) > (prev.score || 0) ? current : prev,
            )
          : undefined;

      const qwenVLStart = Date.now();
      const qwenResult = await this.qwenVisionService.analyzeArtworkImage(
        base64Image,
        language,
        topEntity,
      );
      const qwenVLTime = Date.now() - qwenVLStart;
      this.logger.log(
        `⏱️ Qwen VL completed in ${qwenVLTime}ms with confidence ${qwenResult.confidence}`,
      );

      // Log results from Qwen VL
      this.logger.log('📊 Qwen VL result:');
      this.logger.log(`  - Identified: ${qwenResult.identified}`);
      this.logger.log(`  - Confidence: ${qwenResult.confidence}`);
      if (qwenResult.identified) {
        this.logger.log(`  - Title: "${qwenResult.title || 'N/A'}"`);
        this.logger.log(`  - Artist: "${qwenResult.artist || 'N/A'}"`);
        this.logger.log(`  - Year: "${qwenResult.year || 'N/A'}"`);
        this.logger.log(`  - Period: "${qwenResult.period || 'N/A'}"`);
        this.logger.log(`  - Is Monument: ${qwenResult.isMonument || false}`);
        if (qwenResult.isMonument && qwenResult.country) {
          this.logger.log(`  - Country: "${qwenResult.country}"`);
        }
      }

      // Use Qwen VL result if identified with sufficient confidence
      if (
        qwenResult.identified &&
        qwenResult.confidence >= this.qwenVLMinConfidence
      ) {
        artworkData = qwenResult;
        identified = true;
        this.logger.log(
          `✅ Identified via Qwen VL (fallback): "${artworkData.title}", confidence: ${artworkData.confidence} (threshold: ${this.qwenVLMinConfidence})`,
        );
      } else {
        this.logger.log(
          `❌ Qwen VL failed to identify with sufficient confidence (${qwenResult.confidence} < ${this.qwenVLMinConfidence})`,
        );
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
    _qwenVLResult: ArtworkData,
    language: string,
  ): Promise<ArtworkData | null> {
    // Get ALL URLs (prioritize museum/Wikipedia, but include more)
    const allUrls = this.webScraperService.prioritizeArtUrls(
      visionData.pagesWithMatchingImages,
    );
    // Limit to first 5 URLs to avoid excessive scraping time
    const urls = allUrls.slice(0, 5);

    if (urls.length === 0) {
      this.logger.log('No matching pages found');
      return null;
    }

    this.logger.log(`📡 Scraping ${urls.length} URLs in parallel...`);

    // Scrape web pages
    const startScraping = Date.now();
    const htmlResults = await this.webScraperService.fetchMultipleUrls(urls);
    const scrapingTime = Date.now() - startScraping;
    const successfulScrapes = htmlResults.filter((r) => r.html);
    this.logger.log(
      `✅ Successfully scraped ${successfulScrapes.length}/${urls.length} URLs in ${scrapingTime}ms`,
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
    const startQwenFlash = Date.now();
    const artworkInfo = await this.analyzeWebContentForArtworkEnhanced(
      combinedText,
      urls,
      visionData.bestGuessLabels,
      visionData.webEntities,
      language,
    );
    const qwenFlashTime = Date.now() - startQwenFlash;
    this.logger.log(`⏱️ Qwen Flash analysis took ${qwenFlashTime}ms`);

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
    webEntities: Array<{
      entityId?: string;
      score?: number;
      description?: string;
    }>,
    language: string,
  ): Promise<ArtworkData | null> {
    try {
      const prompt = this.buildEnhancedWebAnalysisPrompt(
        webContent,
        rawUrls,
        bestGuessLabels,
        webEntities,
        language,
      );

      this.logger.log('📤 Sending enhanced request to Qwen Flash...');
      this.logger.log(`  Web content length: ${webContent.length} characters`);
      this.logger.log(`  Number of URLs: ${rawUrls.length}`);
      this.logger.log(
        `  Best guess labels: ${bestGuessLabels.map((l) => l.label).join(', ')}`,
      );

      // Log top entity
      const topEntity =
        webEntities.length > 0
          ? webEntities.reduce((prev, current) =>
              (current.score || 0) > (prev.score || 0) ? current : prev,
            )
          : null;
      if (topEntity) {
        this.logger.log(
          `  Top web entity: "${topEntity.description}" (score: ${topEntity.score?.toFixed(2)})`,
        );
      }

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
    webEntities: Array<{
      entityId?: string;
      score?: number;
      description?: string;
    }>,
    language: string,
  ): string {
    const hints = bestGuessLabels.map((l) => l.label).join(', ');
    const urlsList = rawUrls.map((url, idx) => `${idx + 1}. ${url}`).join('\n');

    // Get top web entity (highest score)
    const topEntity =
      webEntities.length > 0
        ? webEntities.reduce((prev, current) =>
            (current.score || 0) > (prev.score || 0) ? current : prev,
          )
        : null;

    const topEntityInfo = topEntity
      ? `${topEntity.description} (confianza: ${(topEntity.score || 0).toFixed(2)})`
      : 'No disponible';

    const prompts = {
      es: `Eres un historiador de arte experto con amplio conocimiento sobre obras de arte mundiales. Tu especialidad es identificar y proporcionar información precisa, verificable y concisa sobre pinturas, esculturas, arquitectura y monumentos.

Tu misión es encontrar e identificar una obra de arte específica a partir de la información obtenida de realizar la búsqueda de una imagen en la web.

URLS ENCONTRADAS EN LA WEB (${rawUrls.length} fuentes):
${urlsList}

ENTIDAD PRINCIPAL IDENTIFICADA POR GOOGLE VISION: ${topEntityInfo}

PISTAS DE LA BÚSQUEDA WEB: ${hints || 'No disponibles'}

INFORMACIÓN EXTRAÍDA DE LAS PÁGINAS WEB:
${webContent}

Analiza cuidadosamente esta información. La "Entidad Principal" es la identificación más confiable que Google ha realizado de la imagen. Las URLs proporcionadas pueden indicar la fuente y veracidad de la información. Prioriza información de fuentes confiables como museos, Wikipedia, y sitios culturales reconocidos.

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

TOP ENTITY IDENTIFIED BY GOOGLE VISION: ${topEntityInfo}

WEB SEARCH HINTS: ${hints || 'Not available'}

INFORMATION EXTRACTED FROM WEB PAGES:
${webContent}

Carefully analyze this information. The "Top Entity" is the most reliable identification that Google has made of the image. The URLs provided can indicate the source and veracity of the information. Prioritize information from trusted sources such as museums, Wikipedia, and recognized cultural sites.

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

ENTITÉ PRINCIPALE IDENTIFIÉE PAR GOOGLE VISION : ${topEntityInfo}

INDICES DE LA RECHERCHE WEB : ${hints || 'Non disponibles'}

INFORMATIONS EXTRAITES DES PAGES WEB :
${webContent}

Analysez attentivement ces informations. L'"Entité Principale" est l'identification la plus fiable que Google a réalisée de l'image. Les URLs fournies peuvent indiquer la source et la véracité de l'information. Priorisez les informations provenant de sources fiables telles que les musées, Wikipédia et les sites culturels reconnus.

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
