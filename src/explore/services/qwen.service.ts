import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenRequest {
  model: string;
  input: {
    messages: QwenMessage[];
  };
  parameters?: {
    result_format?: 'message' | 'text';
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

interface QwenResponse {
  output: {
    text?: string;
    choices?: Array<{
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  request_id: string;
}

@Injectable()
export class QwenService {
  private readonly logger = new Logger(QwenService.name);
  private readonly qwenApiKey: string;
  private readonly qwenApiUrl: string;
  private readonly qwenModel: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.qwenApiKey = this.configService.get<string>('QWEN_API_KEY') || '';
    this.qwenApiUrl =
      this.configService.get<string>('QWEN_API_URL') ||
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
    this.qwenModel =
      this.configService.get<string>('QWEN_MODEL') || 'qwen-flash';

    if (!this.qwenApiKey) {
      this.logger.warn(
        'QWEN_API_KEY not configured - will use fallback descriptions',
      );
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
    if (!this.qwenApiKey) {
      return this.getFallbackDescription(placeName, category);
    }

    const prompt = this.buildPrompt(placeName, category, language);

    this.logger.log(`Generating description for: ${placeName} (${category})`);

    try {
      const requestBody: QwenRequest = {
        model: this.qwenModel,
        input: {
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
        },
        parameters: {
          result_format: 'message',
          temperature: 0.7,
          max_tokens: 200,
        },
      };

      const response = await firstValueFrom(
        this.httpService
          .post<QwenResponse>(this.qwenApiUrl, requestBody, {
            headers: {
              Authorization: `Bearer ${this.qwenApiKey}`,
              'Content-Type': 'application/json',
            },
          })
          .pipe(
            timeout(5000), // 5 second timeout
            catchError((error) => {
              this.logger.warn(
                `Qwen API error for "${placeName}": ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      const description = this.extractDescription(response.data);

      if (description) {
        this.logger.log(
          `Generated description for "${placeName}" (${response.data.usage.total_tokens} tokens)`,
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

La descripción debe ser atractiva para turistas interesados en cultura.`;
    }

    if (language === 'en') {
      return `Generate a brief cultural description (max 3 sentences) for "${placeName}", a ${category}.

Focus on:
- Artistic or historical relevance
- What to see (notable works, architecture, nature)
- Recommended visit duration

The description should be engaging for tourists interested in culture.`;
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
   * Extract description from Qwen API response
   */
  private extractDescription(response: QwenResponse): string | null {
    if (response.output.choices && response.output.choices.length > 0) {
      return response.output.choices[0].message.content.trim();
    }

    if (response.output.text) {
      return response.output.text.trim();
    }

    return null;
  }

  /**
   * Get fallback description when LLM is unavailable or fails
   */
  private getFallbackDescription(placeName: string, category: string): string {
    return `${placeName} - ${category} cercano a tu ubicación.`;
  }
}
