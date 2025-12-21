import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DataForSEOConfigService {
  private readonly logger = new Logger(DataForSEOConfigService.name);
  private readonly email: string;
  private readonly password: string;
  private readonly baseUrl = 'https://api.dataforseo.com/v3';

  constructor(private configService: ConfigService) {
    this.email = this.configService.get<string>('DATAFORSEO_EMAIL') || '';
    this.password = this.configService.get<string>('DATAFORSEO_PASSWORD') || '';

    if (!this.email || !this.password) {
      this.logger.warn(
        'DataForSEO credentials not configured. Google Lens fallback will not be available.',
      );
    }
  }

  getAuthHeader(): string {
    if (!this.email || !this.password) {
      throw new Error('DataForSEO credentials not configured');
    }
    const credentials = `${this.email}:${this.password}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  isConfigured(): boolean {
    return !!(this.email && this.password);
  }
}
