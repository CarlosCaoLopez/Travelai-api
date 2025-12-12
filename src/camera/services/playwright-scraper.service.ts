import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlaywrightScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightScraperService.name);
  private browser: Browser | null = null;
  private readonly headless: boolean;
  private readonly timeout: number;
  private readonly blockResources: boolean;

  constructor(private readonly configService: ConfigService) {
    this.headless =
      configService.get('PLAYWRIGHT_HEADLESS', 'true') === 'true';
    this.timeout = parseInt(
      configService.get('PLAYWRIGHT_TIMEOUT_MS', '30000'),
      10,
    );
    this.blockResources =
      configService.get('PLAYWRIGHT_BLOCK_RESOURCES', 'true') === 'true';
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('🔴 Browser closed');
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.logger.log('🚀 Launching Chromium browser...');
      this.browser = await chromium.launch({
        headless: this.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // For Docker
      });
    }
    return this.browser;
  }

  async fetchRenderedContent(url: string): Promise<string | null> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      const browser = await this.ensureBrowser();
      page = await browser.newPage();

      // RESOURCE BLOCKING: Block images, CSS, fonts, media for faster loading
      if (this.blockResources) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          const blockedTypes = ['image', 'stylesheet', 'font', 'media'];

          if (blockedTypes.includes(resourceType)) {
            route.abort(); // Block the request
          } else {
            route.continue(); // Allow HTML, JS, fetch, etc.
          }
        });
        this.logger.log(
          '🚫 Resource blocking enabled (images, CSS, fonts, media)',
        );
      }

      // Navigate to URL
      this.logger.log(`🌐 Navigating to: ${url}`);
      await page.goto(url, {
        waitUntil: 'networkidle', // Wait for network to be idle
        timeout: this.timeout,
      });

      // Extract text content from rendered page
      const content = await page.evaluate(() => {
        // Clone body to avoid modifying original DOM
        const clone = document.body.cloneNode(true) as HTMLElement;

        // Remove non-content elements
        clone
          .querySelectorAll(
            'script, style, nav, footer, header, iframe, noscript',
          )
          .forEach((el) => el.remove());

        // Return text content
        return clone.innerText || clone.textContent || '';
      });

      const elapsed = Date.now() - startTime;
      const contentLength = content.trim().length;

      this.logger.log(
        `✅ Content extracted in ${elapsed}ms: ${contentLength} chars`,
      );

      return content.trim();
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        `❌ Playwright error after ${elapsed}ms: ${error.message}`,
      );
      return null;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
}
