import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ArtworkDetailsRequestDto } from '../dto/artwork-details-request.dto';
import { DetailedInfoDto } from '../dto/artwork-details-response.dto';

interface QwenArtworkResponse {
  historicalContext: string;
  visualDescription: string;
  symbolism: string;
  artistBio: string;
  interestingFacts: string[];
}

@Injectable()
export class ArtworkDetailsService {
  private readonly logger = new Logger(ArtworkDetailsService.name);
  private readonly qwenClient: OpenAI;
  private readonly qwenModel: string;

  constructor(private readonly configService: ConfigService) {
    // Initialize OpenAI client for Qwen text model
    const qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    const qwenBaseUrl =
      this.configService.get<string>('QWEN_BASE_URL') ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.qwenModel = this.configService.get<string>('QWEN_MODEL', 'qwen-flash');

    this.qwenClient = new OpenAI({
      apiKey: qwenApiKey,
      baseURL: qwenBaseUrl,
      timeout: 45000, // 45 second timeout for detailed generation
      maxRetries: 1,
    });
  }

  async getEnrichedDetails(
    request: ArtworkDetailsRequestDto,
    language: string = 'es',
  ): Promise<DetailedInfoDto> {
    this.logger.log(
      `Generating enriched details for "${request.title}" in language: ${language}`,
    );

    try {
      const prompt = this.buildPrompt(request, language);

      // 🔍 LOG PROMPT BEING SENT TO QWEN-FLASH
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🤖 QWEN-FLASH PROMPT (artwork-details.service.ts)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(prompt);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const response = await this.qwenClient.chat.completions.create({
        model: this.qwenModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.4, // Balance between creativity and factual accuracy
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Qwen');
      }

      const parsedResponse = this.parseQwenResponse(content);

      return this.buildDetailedInfo(parsedResponse);
    } catch (error) {
      this.logger.error('Error generating artwork details:', error);
      throw new InternalServerErrorException(
        'Failed to generate artwork details',
      );
    }
  }

  private buildPrompt(
    request: ArtworkDetailsRequestDto,
    language: string,
  ): string {
    const prompts: Record<string, string> = {
      es: `Eres un experto historiador del arte. Proporciona información detallada sobre esta obra en ESPAÑOL:

Título: ${request.title}
Artista: ${request.artist || 'desconocido'}
Año: ${request.year || 'desconocido'}
Descripción básica: ${request.description || 'no disponible'}

Genera un JSON con la siguiente estructura (IMPORTANTE: responde SOLO con el JSON válido, sin texto adicional antes ni después). Sé conciso pero informativo:
{
  "historicalContext": "Contexto histórico del período y relevancia (100-150 palabras)",
  "visualDescription": "Descripción visual detallada: composición, colores, elementos principales, luz y perspectiva (150-200 palabras)",
  "symbolism": "Análisis del simbolismo y significado (100-150 palabras)",
  "artistBio": "Biografía concisa del artista (80-100 palabras)",
  "interestingFacts": ["dato curioso 1", "dato curioso 2", "dato curioso 3"]
}

CRÍTICO: TODOS los valores de texto en el JSON deben estar EXCLUSIVAMENTE EN ESPAÑOL. No uses ningún texto en inglés, francés u otro idioma. Ejemplos:
- INCORRECTO: "title": "The Last Judgment"
- CORRECTO: "title": "El Juicio Final"
- INCORRECTO: "historicalContext": "This masterpiece was created during..."
- CORRECTO: "historicalContext": "Esta obra maestra fue creada durante..."`,

      en: `You are an expert art historian. Provide detailed information about this artwork in ENGLISH:

Title: ${request.title}
Artist: ${request.artist || 'unknown'}
Year: ${request.year || 'unknown'}
Basic description: ${request.description || 'not available'}

Generate a JSON with the following structure (IMPORTANT: respond with ONLY valid JSON, no additional text before or after). Be concise but informative:
{
  "historicalContext": "Historical context of the period and relevance (100-150 words)",
  "visualDescription": "Detailed visual description: composition, colors, main elements, light and perspective (150-200 words)",
  "symbolism": "Analysis of symbolism and meaning (100-150 words)",
  "artistBio": "Concise artist biography (80-100 words)",
  "interestingFacts": ["interesting fact 1", "interesting fact 2", "interesting fact 3"]
}

CRITICAL: ALL text values in the JSON must be EXCLUSIVELY IN ENGLISH. Do not use any Spanish, French, or other language text. Examples:
- INCORRECT: "title": "El Juicio Final"
- CORRECT: "title": "The Last Judgment"
- INCORRECT: "historicalContext": "Esta obra maestra fue creada durante..."
- CORRECT: "historicalContext": "This masterpiece was created during..."`,

      fr: `Vous êtes un expert historien de l'art. Fournissez des informations détaillées sur cette œuvre en FRANÇAIS:

Titre: ${request.title}
Artiste: ${request.artist || 'inconnu'}
Année: ${request.year || 'inconnue'}
Description basique: ${request.description || 'non disponible'}

Générez un JSON avec la structure suivante (IMPORTANT: répondez UNIQUEMENT avec le JSON valide, sans texte supplémentaire avant ou après). Soyez concis mais informatif:
{
  "historicalContext": "Contexte historique de la période et pertinence (100-150 mots)",
  "visualDescription": "Description visuelle détaillée: composition, couleurs, éléments principaux, lumière et perspective (150-200 mots)",
  "symbolism": "Analyse du symbolisme et signification (100-150 mots)",
  "artistBio": "Biographie concise de l'artiste (80-100 mots)",
  "interestingFacts": ["fait intéressant 1", "fait intéressant 2", "fait intéressant 3"]
}

CRITIQUE: TOUTES les valeurs de texte dans le JSON doivent être EXCLUSIVEMENT EN FRANÇAIS. N'utilisez aucun texte en anglais, espagnol ou autre langue. Exemples:
- INCORRECT: "title": "The Last Judgment"
- CORRECT: "title": "Le Jugement dernier"
- INCORRECT: "historicalContext": "This masterpiece was created during..."
- CORRECT: "historicalContext": "Ce chef-d'œuvre a été créé pendant..."`,
    };

    return prompts[language] || prompts['en'];
  }

  private parseQwenResponse(content: string): QwenArtworkResponse {
    try {
      // Clean content: remove markdown code blocks if present
      let cleanedContent = content.trim();

      // Remove ```json or ``` markers
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '');
      cleanedContent = cleanedContent.replace(/^```\s*/, '');
      cleanedContent = cleanedContent.replace(/\s*```\s*$/, '');
      cleanedContent = cleanedContent.trim();

      this.logger.debug(
        `Attempting to parse JSON of length: ${cleanedContent.length}`,
      );
      this.logger.debug(`First 100 chars: ${cleanedContent.substring(0, 100)}`);
      this.logger.debug(
        `Last 100 chars: ${cleanedContent.substring(cleanedContent.length - 100)}`,
      );

      // Try to parse directly first
      let parsed: QwenArtworkResponse;
      try {
        parsed = JSON.parse(cleanedContent) as QwenArtworkResponse;
        this.logger.debug('Successfully parsed JSON directly');
      } catch (directParseError) {
        // If direct parse fails, try to extract JSON object
        this.logger.debug(
          'Direct parse failed, attempting to extract JSON object',
        );
        this.logger.error(
          `Parse error: ${directParseError instanceof Error ? directParseError.message : 'Unknown error'}`,
        );

        // Try to find the JSON object boundaries more carefully
        const firstBrace = cleanedContent.indexOf('{');
        const lastBrace = cleanedContent.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
          this.logger.error(
            `Invalid JSON structure. First brace at ${firstBrace}, last brace at ${lastBrace}`,
          );
          this.logger.error(`Content: ${cleanedContent.substring(0, 500)}`);
          throw new Error('No valid JSON found in response');
        }

        const jsonString = cleanedContent.substring(firstBrace, lastBrace + 1);
        this.logger.debug(`Extracted JSON length: ${jsonString.length}`);

        try {
          parsed = JSON.parse(jsonString) as QwenArtworkResponse;
          this.logger.debug('Successfully parsed extracted JSON');
        } catch (extractParseError) {
          this.logger.error(
            `Failed to parse extracted JSON: ${extractParseError instanceof Error ? extractParseError.message : 'Unknown error'}`,
          );
          this.logger.error(
            `Extracted content (first 500 chars): ${jsonString.substring(0, 500)}`,
          );
          throw new Error('Failed to parse extracted JSON');
        }
      }

      // Validate required fields
      if (!parsed.historicalContext || !parsed.visualDescription) {
        this.logger.error(
          'Missing required fields. Received:',
          JSON.stringify(parsed, null, 2),
        );
        throw new Error('Missing required fields in AI response');
      }

      return parsed;
    } catch (error) {
      this.logger.error('Error parsing Qwen response:', error);
      if (error instanceof Error) {
        this.logger.error('Error details:', error.message);
      }
      throw new Error('Failed to parse AI response');
    }
  }

  private buildDetailedInfo(aiResponse: QwenArtworkResponse): DetailedInfoDto {
    return {
      historicalContext: aiResponse.historicalContext,
      visualDescription: aiResponse.visualDescription,
      symbolism: aiResponse.symbolism || '',
      artistBio: aiResponse.artistBio || '',
      interestingFacts: aiResponse.interestingFacts || [],
    };
  }
}
