import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class QwenService {
  private readonly logger = new Logger(QwenService.name);
  private readonly qwenClient: OpenAI | null = null;
  private readonly qwenModel: string;

  constructor(private readonly configService: ConfigService) {
    const qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    const qwenBaseUrl =
      this.configService.get<string>('QWEN_BASE_URL') ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.qwenModel =
      this.configService.get<string>('QWEN_MODEL') || 'qwen-flash';

    if (!qwenApiKey) {
      this.logger.warn(
        'QWEN_API_KEY not configured - will use fallback descriptions',
      );
    } else {
      // Initialize OpenAI client with Qwen's compatible endpoint
      this.qwenClient = new OpenAI({
        apiKey: qwenApiKey,
        baseURL: qwenBaseUrl,
        timeout: 5000, // 5 second timeout
        maxRetries: 0, // No retries - fail fast and use fallback
      });
    }
  }

  /**
   * Generate a cultural description for a place using Qwen LLM
   *
   * @param placeName - Name of the place
   * @param category - Category of the place (e.g., "Museo", "Parque")
   * @param language - Language code (ISO 639-1)
   * @returns Generated description or fallback description if LLM fails
   */
  async generateDescription(
    placeName: string,
    category: string,
    language: string = 'es',
  ): Promise<string> {
    // If API key is not configured, return fallback immediately
    if (!this.qwenClient) {
      return this.getFallbackDescription(placeName, category);
    }

    const prompt = this.buildPrompt(placeName, category, language);

    this.logger.log(`Generating description for: ${placeName} (${category})`);

    // 🔍 LOG PROMPT BEING SENT TO QWEN-FLASH
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 QWEN-FLASH PROMPT (qwen.service.ts)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(prompt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const response = await this.qwenClient.chat.completions.create({
        model: this.qwenModel,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(language),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const description = response.choices[0]?.message?.content?.trim();

      if (description) {
        this.logger.log(
          `Generated description for "${placeName}" (${response.usage?.total_tokens || 0} tokens)`,
        );
        return description;
      }

      // If no description in response, use fallback
      this.logger.warn(`Empty description from Qwen for "${placeName}"`);
      return this.getFallbackDescription(placeName, category);
    } catch (error) {
      // Log the error but don't throw - use fallback instead
      this.logger.warn(
        `Failed to generate description for "${placeName}": ${error.message}`,
      );
      return this.getFallbackDescription(placeName, category);
    }
  }

  /**
   * Build the prompt for the LLM based on language
   */
  private buildPrompt(
    placeName: string,
    category: string,
    language: string,
  ): string {
    if (language === 'es') {
      return `Genera una descripción cultural breve (máximo 3 oraciones) para "${placeName}", un ${category}.

Enfócate en:
- Relevancia artística o histórica
- Qué ver (obras destacadas, arquitectura, naturaleza)
- Tiempo estimado de visita recomendado

La descripción debe ser atractiva para turistas interesados en cultura.

IMPORTANTE: La descripción debe estar completamente EN ESPAÑOL. No uses palabras en inglés u otros idiomas.`;
    }

    if (language === 'en') {
      return `Generate a brief cultural description (max 3 sentences) for "${placeName}", a ${category}.

Focus on:
- Artistic or historical relevance
- What to see (notable works, architecture, nature)
- Recommended visit duration

The description should be engaging for tourists interested in culture.

IMPORTANT: The description must be completely IN ENGLISH. Do not use Spanish or other language words.`;
    }

    // Fallback to Spanish
    return this.buildPrompt(placeName, category, 'es');
  }

  /**
   * Get system prompt based on language
   */
  private getSystemPrompt(language: string): string {
    if (language === 'es') {
      return 'Eres un guía cultural experto. Genera descripciones breves y atractivas de lugares culturales para turistas.';
    }

    if (language === 'en') {
      return 'You are an expert cultural guide. Generate brief and engaging descriptions of cultural places for tourists.';
    }

    return this.getSystemPrompt('es');
  }

  /**
   * Get fallback description when LLM is unavailable or fails
   */
  private getFallbackDescription(placeName: string, category: string): string {
    return `${placeName} - ${category} cercano a tu ubicación.`;
  }
}
