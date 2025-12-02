import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface QwenVLResponse {
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
export class QwenVisionService {
  private readonly logger = new Logger(QwenVisionService.name);
  private readonly qwenClient: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY') ?? '';
    const baseURL =
      this.configService.get<string>('QWEN_BASE_URL') ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model =
      this.configService.get<string>('QWEN_VL_MODEL') ?? 'qwen-vl-max-latest';

    // Log configuration for debugging (mask API key for security)
    this.logger.log(
      `Initializing QwenVisionService with model: ${this.model}, baseURL: ${baseURL}`,
    );
    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        '⚠️  QWEN_API_KEY is not configured! Vision analysis will fail.',
      );
    } else {
      this.logger.log(
        `API Key configured: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)} (length: ${apiKey.length})`,
      );
    }

    this.qwenClient = new OpenAI({
      apiKey,
      baseURL,
      timeout: 30000, // 30 second timeout for vision requests
      maxRetries: 0, // No retries for vision - fail fast
    });
  }

  async analyzeArtworkImage(
    base64Image: string,
    language: string = 'es',
  ): Promise<QwenVLResponse> {
    try {
      const prompt = this.buildPrompt(language);

      this.logger.log(`Analyzing artwork with Qwen VL (language: ${language})`);

      const response = await this.qwenClient.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.1, // Low temperature for factual responses
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('Empty response from Qwen VL');
        return { identified: false, confidence: 0 };
      }

      return this.parseResponse(content);
    } catch (error) {
      // Enhanced error logging for debugging
      this.logger.error('❌ Qwen VL analysis failed with detailed error:');
      this.logger.error(`  Message: ${error.message}`);
      this.logger.error(`  Error Type: ${error.constructor.name}`);

      // Log detailed error information for OpenAI API errors
      if (error.status) {
        this.logger.error(`  HTTP Status: ${error.status}`);
      }
      if (error.code) {
        this.logger.error(`  Error Code: ${error.code}`);
      }
      if (error.type) {
        this.logger.error(`  Error Type: ${error.type}`);
      }

      // Log the response body if available (for API errors)
      if (error.response) {
        this.logger.error(
          `  Response Headers: ${JSON.stringify(error.response.headers)}`,
        );
        this.logger.error(
          `  Response Body: ${JSON.stringify(error.response.data)}`,
        );
      }

      // Log the full error object for maximum debugging info
      if (error.error) {
        this.logger.error(
          `  API Error Details: ${JSON.stringify(error.error)}`,
        );
      }

      // Log the request details (without sensitive data)
      this.logger.error(`  Model Used: ${this.model}`);
      this.logger.error(
        `  Image Size: ${Math.round(base64Image.length / 1024)}KB (base64)`,
      );

      // Log stack trace in development
      if (error.stack) {
        this.logger.debug(`  Stack Trace: ${error.stack}`);
      }

      return { identified: false, confidence: 0 };
    }
  }

  private buildPrompt(language: string): string {
    const prompts = {
      es: `Eres un historiador de arte experto con amplio conocimiento sobre obras de arte mundiales. Tu especialidad es identificar y proporcionar información precisa, verificable y concisa sobre pinturas, esculturas, arquitectura y monumentos.

Analiza cuidadosamente la imagen proporcionada. Si reconoces una obra de arte específica, responde con un objeto JSON válido con este formato exacto:

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

Si NO puedes identificar la obra con certeza o no es una obra de arte reconocible, responde:

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANTE:
- Responde ÚNICAMENTE con el JSON, sin texto adicional antes o después
- Si no conoces algún dato con certeza, usa "Desconocido" en lugar de inventar información
- Prioriza la precisión sobre la completitud
- El campo "confidence" debe reflejar tu nivel de certeza (0.0-1.0)
- El campo "isMonument" es OBLIGATORIO y debe ser un booleano:
  * true: SOLO para estructuras arquitectónicas físicas (catedrales, torres, puentes, castillos, palacios, templos, edificios históricos, arcos monumentales)
  * false: Para pinturas, esculturas, obras de arte tradicionales (aunque representen arquitectura)
- El campo "country" es OPCIONAL:
  * Inclúyelo SOLO si "isMonument" es true
  * Debe ser el nombre del país donde está ubicado el monumento
  * Si "isMonument" es false, omite este campo o déjalo como null`,

      en: `You are an expert art historian with extensive knowledge of world artworks. Your specialty is to identify and provide accurate, verifiable, and concise information about paintings, sculptures, architecture, and monuments.

Carefully analyze the provided image. If you recognize a specific artwork, respond with a valid JSON object in this exact format:

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

If you CANNOT identify the work with certainty or it is not a recognizable artwork, respond:

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANT:
- Respond ONLY with the JSON, no additional text before or after
- If you don't know a piece of data with certainty, use "Unknown" instead of making up information
- Prioritize accuracy over completeness
- The "confidence" field should reflect your level of certainty (0.0-1.0)
- The "isMonument" field is REQUIRED and must be a boolean:
  * true: ONLY for physical architectural structures (cathedrals, towers, bridges, castles, palaces, temples, historic buildings, monumental arches)
  * false: For paintings, sculptures, traditional artworks (even if they depict architecture)
- The "country" field is OPTIONAL:
  * Include it ONLY if "isMonument" is true
  * Must be the name of the country where the monument is located
  * If "isMonument" is false, omit this field or leave it as null`,

      fr: `Vous êtes un historien d'art expert avec une connaissance approfondie des œuvres d'art mondiales. Votre spécialité est d'identifier et de fournir des informations précises, vérifiables et concises sur les peintures, sculptures, architecture et monuments.

Analysez attentivement l'image fournie. Si vous reconnaissez une œuvre d'art spécifique, répondez avec un objet JSON valide dans ce format exact :

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

Si vous NE pouvez PAS identifier l'œuvre avec certitude ou ce n'est pas une œuvre d'art reconnaissable, répondez :

{
  "identified": false,
  "confidence": 0.0
}

IMPORTANT :
- Répondez UNIQUEMENT avec le JSON, sans texte supplémentaire avant ou après
- Si vous ne connaissez pas une donnée avec certitude, utilisez "Inconnu" au lieu d'inventer l'information
- Priorisez la précision plutôt que l'exhaustivité
- Le champ "confidence" doit refléter votre niveau de certitude (0.0-1.0)
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

  private parseResponse(content: string): QwenVLResponse {
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

      return parsed as QwenVLResponse;
    } catch (error) {
      this.logger.warn(`Failed to parse Qwen response: ${error.message}`);
      return { identified: false, confidence: 0, isMonument: false };
    }
  }
}
