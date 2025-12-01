import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { QwenVisionService } from './services/qwen-vision.service';
import {
  GoogleVisionService,
  WebDetection,
} from './services/google-vision.service';
import { WebScraperService } from './services/web-scraper.service';
import { SupabaseStorageService } from './services/supabase-storage.service';
import { ArtworkMatchingService } from './services/artwork-matching.service';
import { ImageProcessingService } from './services/image-processing.service';
import { RecognitionResponseDto } from './dto/recognition-response.dto';
import { DeviceMetadataDto } from './dto/device-metadata.dto';
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
  private readonly qwenApiKey: string;
  private readonly qwenApiUrl: string;
  private readonly qwenModel: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly qwenVisionService: QwenVisionService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly webScraperService: WebScraperService,
    private readonly storageService: SupabaseStorageService,
    private readonly matchingService: ArtworkMatchingService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.minConfidence = this.configService.get<number>(
      'MIN_CONFIDENCE_THRESHOLD',
      0.6,
    );
    this.qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    this.qwenApiUrl = this.configService.get<string>('QWEN_API_URL') || '';
    this.qwenModel = this.configService.get<string>('QWEN_MODEL', 'qwen-flash');
  }

  async recognizeArtwork(
    imageBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    userId: string,
    language: string = 'es',
    deviceMetadata?: DeviceMetadataDto,
  ): Promise<RecognitionResponseDto> {
    this.logger.log(
      `Recognition request from user ${userId}, language: ${language}`,
    );

    // 1. Convert image to base64
    const base64Image = this.imageProcessingService.bufferToBase64(
      imageBuffer,
      mimeType,
    );

    // 2. Parallel recognition
    const [qwenResult, visionResult] = await Promise.allSettled([
      this.qwenVisionService.analyzeArtworkImage(base64Image, language),
      this.googleVisionService.detectWeb(base64Image, language),
    ]);

    // 3. Determine if artwork was identified
    let artworkData: ArtworkData | null = null;
    let identified = false;

    if (qwenResult.status === 'fulfilled' && qwenResult.value.identified) {
      artworkData = qwenResult.value;
      identified = artworkData.confidence >= this.minConfidence;
      this.logger.log(
        `Qwen identified: ${identified}, confidence: ${artworkData.confidence}`,
      );
    }

    // Fallback to Vision + web scraping + Qwen text analysis
    if (!identified && visionResult.status === 'fulfilled') {
      this.logger.log('Attempting fallback: Vision + web scraping + Qwen text');
      artworkData = await this.fallbackWebScraping(
        visionResult.value,
        language,
      );
      identified =
        artworkData !== null && artworkData.confidence >= this.minConfidence;
      this.logger.log(`Fallback identified: ${identified}`);
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

    // 6. NOW upload image to storage (only if identified)
    // Determine context: use artist name, or country if it's a monument/architecture
    const contextName = this.determineContextName(artworkData, matchedArtwork);

    const filename = this.imageProcessingService.generateFilename(
      userId,
      originalFilename,
    );

    // Upload with organized folder structure: artworks/{userId}/{artistOrCountry}/{filename}
    const storagePath = await this.storageService.uploadRecognizedArtwork(
      imageBuffer,
      filename,
      mimeType,
      userId,
      contextName,
    );

    // 7. Save to user collection
    try {
      const collectionItem = await this.saveToCollection(
        userId,
        storagePath,
        matchedArtwork,
        artworkData,
      );

      // 8. Build success response
      return this.buildSuccessResponse(
        collectionItem,
        artworkData,
        matchedArtwork,
        language,
      );
    } catch (error) {
      // Rollback: delete uploaded image if DB save fails
      this.logger.error(`Database save failed, rolling back: ${error.message}`);
      await this.storageService.deleteImage(storagePath);
      throw new InternalServerErrorException(
        getMessage(language, 'PROCESSING_ERROR'),
      );
    }
  }

  private async fallbackWebScraping(
    visionData: WebDetection,
    language: string,
  ): Promise<ArtworkData | null> {
    // Get top URLs (prioritize museum/Wikipedia)
    const urls = this.webScraperService
      .prioritizeArtUrls(visionData.pagesWithMatchingImages.slice(0, 5))
      .slice(0, 3);

    if (urls.length === 0) {
      this.logger.log('No matching pages found');
      return null;
    }

    this.logger.log(`Scraping ${urls.length} URLs`);

    // Scrape web pages
    const htmlResults = await this.webScraperService.fetchMultipleUrls(urls);
    const combinedText = htmlResults
      .filter((r) => r.html)
      .map((r) => this.webScraperService.extractCleanText(r.html || ''))
      .join('\n\n');

    if (!combinedText || combinedText.length < 100) {
      this.logger.log('Insufficient content from web scraping');
      return null;
    }

    // Use Qwen Flash (text model) to analyze the scraped content
    this.logger.log('Analyzing scraped content with Qwen Flash');
    const artworkInfo = await this.analyzeWebContentForArtwork(
      combinedText,
      visionData.bestGuessLabels,
      language,
    );

    return artworkInfo;
  }

  /**
   * Use Qwen Flash (text model) to identify artwork from web content
   */
  private async analyzeWebContentForArtwork(
    webContent: string,
    bestGuessLabels: Array<{ label: string; languageCode?: string }>,
    language: string,
  ): Promise<ArtworkData | null> {
    try {
      const prompt = this.buildWebAnalysisPrompt(
        webContent,
        bestGuessLabels,
        language,
      );

      const response = await firstValueFrom(
        this.httpService.post(
          this.qwenApiUrl,
          {
            model: this.qwenModel,
            input: {
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            },
            parameters: {
              max_tokens: 1500,
              temperature: 0.1,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${this.qwenApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );

      const content = response.data.output.choices[0].message.content;
      return this.parseWebAnalysisResponse(content);
    } catch (error) {
      this.logger.error(`Qwen web content analysis failed: ${error.message}`);
      return null;
    }
  }

  private buildWebAnalysisPrompt(
    webContent: string,
    bestGuessLabels: Array<{ label: string; languageCode?: string }>,
    language: string,
  ): string {
    const hints = bestGuessLabels.map((l) => l.label).join(', ');

    const prompts = {
      es: `Eres un historiador de arte experto con amplio conocimiento sobre obras de arte mundiales. Tu especialidad es identificar y proporcionar información precisa, verificable y concisa sobre pinturas, esculturas, arquitectura y monumentos.

Tu misión es encontrar e identificar una obra de arte específica a partir de la información obtenida de realizar la búsqueda de una imagen en la web.

PISTAS DE LA BÚSQUEDA WEB: ${hints || 'No disponibles'}

INFORMACIÓN EXTRAÍDA DE LAS PÁGINAS WEB:
${webContent}

Analiza cuidadosamente esta información. Si reconoces una obra de arte específica, responde con un objeto JSON válido con este formato exacto:

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
- El campo "isMonument" es OBLIGATORIO y debe ser un booleano:
  * true: SOLO para estructuras arquitectónicas físicas (catedrales, torres, puentes, castillos, palacios, templos, edificios históricos, arcos monumentales)
  * false: Para pinturas, esculturas, obras de arte tradicionales (aunque representen arquitectura)
- El campo "country" es OPCIONAL:
  * Inclúyelo SOLO si "isMonument" es true
  * Debe ser el nombre del país donde está ubicado el monumento
  * Si "isMonument" es false, omite este campo o déjalo como null`,

      en: `You are an expert art historian with extensive knowledge of world artworks. Your specialty is to identify and provide accurate, verifiable, and concise information about paintings, sculptures, architecture, and monuments.

Your mission is to find and identify a specific artwork from the information obtained by performing a web search of an image.

WEB SEARCH HINTS: ${hints || 'Not available'}

INFORMATION EXTRACTED FROM WEB PAGES:
${webContent}

Carefully analyze this information. If you recognize a specific artwork, respond with a valid JSON object in this exact format:

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
- The "isMonument" field is REQUIRED and must be a boolean:
  * true: ONLY for physical architectural structures (cathedrals, towers, bridges, castles, palaces, temples, historic buildings, monumental arches)
  * false: For paintings, sculptures, traditional artworks (even if they depict architecture)
- The "country" field is OPTIONAL:
  * Include it ONLY if "isMonument" is true
  * Must be the name of the country where the monument is located
  * If "isMonument" is false, omit this field or leave it as null`,

      fr: `Vous êtes un historien d'art expert avec une connaissance approfondie des œuvres d'art mondiales. Votre spécialité est d'identifier et de fournir des informations précises, vérifiables et concises sur les peintures, sculptures, architecture et monuments.

Votre mission est de trouver et identifier une œuvre d'art spécifique à partir des informations obtenues en effectuant une recherche web d'une image.

INDICES DE LA RECHERCHE WEB : ${hints || 'Non disponibles'}

INFORMATIONS EXTRAITES DES PAGES WEB :
${webContent}

Analysez attentivement ces informations. Si vous reconnaissez une œuvre d'art spécifique, répondez avec un objet JSON valide dans ce format exact :

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

  /**
   * Determine context name for folder organization
   * Returns country name for monuments or artist name for artworks
   */
  private determineContextName(
    artworkData: ArtworkData,
    matchedArtwork: any,
  ): string {
    // Use isMonument field from AI response (default: false)
    const isMonument = artworkData.isMonument ?? false;

    if (isMonument && matchedArtwork?.country) {
      // Use country name for monuments
      const countryName =
        matchedArtwork.country.translations?.[0]?.name ||
        matchedArtwork.country.defaultName;
      return countryName || 'unknown_country';
    }

    // Default: use artist name (for artworks or monuments without DB match)
    const artistName =
      matchedArtwork?.author?.name || artworkData.artist || 'unknown_artist';

    return artistName;
  }

  private async saveToCollection(
    userId: string,
    capturedImageUrl: string,
    matchedArtwork: any,
    artworkData: ArtworkData,
  ) {
    return this.prisma.userCollectionItem.create({
      data: {
        userId,
        artworkId: matchedArtwork?.id || null,
        capturedImageUrl,
        identifiedAt: new Date(),

        // If no DB match, store custom data
        customTitle: matchedArtwork ? null : artworkData.title,
        customAuthor: matchedArtwork ? null : artworkData.artist,
        customYear: matchedArtwork ? null : artworkData.year,
        customPeriod: matchedArtwork ? null : artworkData.period,
        customTechnique: matchedArtwork ? null : artworkData.technique,
        customDimensions: matchedArtwork ? null : artworkData.dimensions,
        customDescription: matchedArtwork ? null : artworkData.description,
        customCountry: matchedArtwork ? null : artworkData.country,
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

    return {
      success: true,
      identified: true,
      artwork: {
        id: collectionItem.id,
        title: translation?.title || artworkData.title || 'Unknown',
        artist: matchedArtwork?.author?.name || artworkData.artist || 'Unknown',
        year: matchedArtwork?.year || artworkData.year || 'Unknown',
        period: translation?.period || artworkData.period || 'Unknown',
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
