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
      return text.replace(/\s+/g, ' ').trim().substring(0, 5000);
    } catch (error) {
      this.logger.warn(`Failed to extract text: ${error.message}`);
      return '';
    }
  }

  /**
   * Prioritize URLs from trusted art and cultural heritage sources
   * Includes museums, monuments, architectural sites in ES, EN, FR, IT
   */
  prioritizeArtUrls(
    pages: Array<{ url: string; pageTitle?: string }>,
  ): string[] {
    const trustedDomains = [
      // Encyclopedic sources
      'wikipedia.org',
      'wikimedia.org',
      'wikiart.org',
      'britannica.com',

      // General art platforms
      'artsy.net',
      'art',
      'arte',
      'artwork',
      'gallery',
      'galeria',
      'galerie',
      'galleria',

      // Major museums
      'museum',
      'museo',
      'musee',
      'musée',
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
      'vam.ac.uk',
      'nga.gov',

      // Religious architecture - Cathedral / Catedral / Cathédrale / Cattedrale
      'cathedral',
      'catedral',
      'cathédrale',
      'cathérale',
      'cattedrale',

      // Church / Iglesia / Église / Chiesa
      'church',
      'iglesia',
      'église',
      'eglise',
      'chiesa',

      // Basilica
      'basilica',
      'basilique',

      // Monastery / Monasterio / Monastère / Monastero
      'monastery',
      'monasterio',
      'monastère',
      'monastere',
      'monastero',

      // Abbey / Abadía / Abbaye / Abbazia
      'abbey',
      'abadia',
      'abadía',
      'abbaye',
      'abbazia',

      // Chapel / Capilla / Chapelle / Cappella
      'chapel',
      'capilla',
      'chapelle',
      'cappella',

      // Temple / Templo / Temple / Tempio
      'temple',
      'templo',
      'tempio',

      // Mosque / Mezquita / Mosquée
      'mosque',
      'mezquita',
      'mosquée',
      'mosquee',
      'moschea',

      // Synagogue / Sinagoga
      'synagogue',
      'sinagoga',
      'synagoga',

      // Shrine / Santuario / Sanctuaire
      'shrine',
      'santuario',
      'sanctuaire',
      'santuario',

      // Sanctuary / Santuario
      'sanctuary',

      // Palace / Palacio / Palais / Palazzo
      'palace',
      'palacio',
      'palais',
      'palazzo',

      // Castle / Castillo / Château / Castello
      'castle',
      'castillo',
      'château',
      'chateau',
      'castello',

      // Fortress / Fortaleza / Forteresse / Fortezza
      'fortress',
      'fortaleza',
      'forteresse',
      'fortezza',

      // Citadel / Ciudadela / Citadelle / Cittadella
      'citadel',
      'ciudadela',
      'citadelle',
      'cittadella',

      // Tower / Torre / Tour / Torre
      'tower',
      'torre',
      'tour',

      // Bridge / Puente / Pont / Ponte
      'bridge',
      'puente',
      'pont',
      'ponte',

      // Arch / Arco / Arc / Arco
      'arch',
      'arco',
      'arc',

      // Statue / Estatua / Statue / Statua
      'statue',
      'estatua',
      'statua',

      // Sculpture / Escultura / Sculpture / Scultura
      'sculpture',
      'escultura',
      'scultura',

      // Memorial / Memorial / Mémorial / Memoriale
      'memorial',
      'mémorial',
      'memorial',
      'memoriale',

      // Landmark / Monumento emblemático / Monument
      'landmark',
      'emblematico',
      'emblemático',

      // Monument / Monumento
      'monument',
      'monumento',

      // Heritage / Patrimonio / Patrimoine
      'heritage',
      'patrimonio',
      'patrimoine',

      // Historic / Histórico / Historique / Storico
      'historic',
      'historico',
      'histórico',
      'historique',
      'storico',

      // Architecture / Arquitectura / Architecture / Architettura
      'architecture',
      'arquitectura',
      'architettura',
      'architectural',
      'arquitectonico',
      'arquitectónico',

      // Cultural & tourism sites
      'unesco.org',
      'turismo',
      'tourism',
      'tourisme',
      'turistica',
      'turística',
      'culture',
      'cultura',
      'cultural',
      'culturale',
      'culturel',
      'culturelle',
      'visit',
      'visita',
      'visite',
      'visitare',
      'discover',
      'descubrir',
      'découvrir',
      'decouvrir',
      'scoprire',

      // Regional/national heritage institutions
      'cultura.gob',
      'bic.es',
      'monumentos',
      'bienes-culturales',
      'patrimoine.gouv.fr',
      'beniculturali.it',
      'mibact.gov.it',
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
