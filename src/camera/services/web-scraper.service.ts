import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { convert } from 'html-to-text';

interface FetchResult {
  url: string;
  html?: string;
  error?: string;
}

@Injectable()
export class WebScraperService {
  private readonly logger = new Logger(WebScraperService.name);
  private readonly maxContentSize = 5000000; // 5000KB

  constructor(private readonly httpService: HttpService) {}

  async fetchMultipleUrls(urls: string[]): Promise<FetchResult[]> {
    const requests = urls.map(async (url): Promise<FetchResult> => {
      try {
        const response = await firstValueFrom(
          this.httpService.get(url, {
            timeout: 10000,
            maxContentLength: this.maxContentSize,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (compatible; TravelAI/1.0; +https://travelai.app)',
            },
            responseType: 'text',
          }),
        );

        return {
          url,
          html: response.data,
        };
      } catch (error) {
        this.logger.warn(`Failed to fetch ${url}: ${error.message}`);
        return {
          url,
          error: error.message,
        };
      }
    });

    return Promise.all(requests);
  }

  extractCleanText(html: string): string {
    try {
      // Parse HTML with Cheerio
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, footer, header, aside, iframe').remove();

      // Try to find main content
      const mainContent =
        $('article').first().html() ||
        $('main').first().html() ||
        $('.content').first().html() ||
        $('#content').first().html() ||
        $('body').html() ||
        '';

      // Convert to plain text
      const text = convert(mainContent, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
        ],
      });

      // Clean up whitespace
      return text.replace(/\s+/g, ' ').trim().substring(0, 10000);
    } catch (error) {
      this.logger.warn(`Failed to extract text: ${error.message}`);
      return '';
    }
  }

  /**
   * Prioritize URLs from trusted art sources
   */
  prioritizeArtUrls(
    pages: Array<{ url: string; pageTitle?: string }>,
  ): string[] {
    const trustedDomains = [
      'wikipedia.org',
      'wikiart.org',
      'artsy.net',
      'museum',
      'moma.org',
      'louvre.fr',
      'metmuseum.org',
      'britishmuseum.org',
      'prado.es',
      'guggenheim.org',
      'nationalgallery.org',
      'rijksmuseum.nl',
      'hermitagemuseum.org',
      'uffizi.it',
    ];

    const prioritized = pages.sort((a, b) => {
      const aTrusted = trustedDomains.some((domain) => a.url.includes(domain));
      const bTrusted = trustedDomains.some((domain) => b.url.includes(domain));

      if (aTrusted && !bTrusted) return -1;
      if (!aTrusted && bTrusted) return 1;
      return 0;
    });

    return prioritized.map((p) => p.url);
  }
}
