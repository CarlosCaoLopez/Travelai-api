import { Injectable, Logger } from '@nestjs/common';

/**
 * Service to map art period/style strings to database category IDs
 * Maps from AI-detected period strings to the 180+ categories in the database
 */
@Injectable()
export class CategoryMappingService {
  private readonly logger = new Logger(CategoryMappingService.name);

  /**
   * Mapping of category IDs to their keywords for matching
   * Keywords support Spanish, English, and French terms
   */
  private readonly categoryKeywords: Record<string, string[]> = {
    // Abstract and Modern Movements
    'abstract-expressionismo': [
      'abstract expressionism',
      'expresionismo abstracto',
      'expressionnisme abstrait',
      'pollock',
      'rothko',
      'de kooning',
    ],
    'arte-abstracto': [
      'abstract',
      'abstracto',
      'abstrait',
      'abstraction',
      'non-figurative',
    ],
    'abstraction-geometrique': [
      'geometric abstraction',
      'abstracción geométrica',
      'geometrique',
      'constructivism',
      'suprematism',
    ],
    'arte-conceptual': [
      'conceptual',
      'conceptuel',
      'concept art',
      'idea art',
    ],

    // Academic and Classical Styles
    academismo: [
      'academic',
      'academicismo',
      'académique',
      'academic art',
      'salon',
    ],
    'academismo-clasico': [
      'academic classicism',
      'academicismo clásico',
      'classical academic',
    ],
    'academismo-realista': [
      'academic realism',
      'academicismo realista',
      'realistic academic',
    ],

    // Art Nouveau and Decorative Arts
    'art-nouveau': [
      'art nouveau',
      'modernismo',
      'jugendstil',
      'liberty',
      'secession',
    ],
    'art-deco': ['art deco', 'art déco', 'deco', 'streamline'],
    'aesthetic-movement': [
      'aesthetic',
      'aestheticism',
      'esteticismo',
      'esthétique',
    ],

    // Impressionism and Post-Impressionism
    impresionismo: [
      'impressionism',
      'impresionismo',
      'impressionnisme',
      'monet',
      'renoir',
      'degas',
    ],
    'american-impressionism': [
      'american impressionism',
      'impresionismo americano',
    ],
    'neo-impresionismo': [
      'neo-impressionism',
      'pointillism',
      'puntillismo',
      'seurat',
      'signac',
    ],
    'post-impressionismo': [
      'post-impressionism',
      'postimpresionismo',
      'post-impressionnisme',
      'cezanne',
      'van gogh',
      'gauguin',
    ],

    // Renaissance
    renacimiento: [
      'renaissance',
      'renacimiento',
      'renaixement',
      'rinascimento',
    ],
    quattrocento: ['quattrocento', 'early renaissance', 'temprano'],
    'alto-renacimiento': [
      'high renaissance',
      'alto renacimiento',
      'haute renaissance',
      'leonardo',
      'michelangelo',
      'rafael',
    ],
    'renacimiento-nordico': [
      'northern renaissance',
      'renacimiento nórdico',
      'renaissance nordique',
      'flemish renaissance',
    ],

    // Baroque
    barroco: ['baroque', 'barroco', 'barocco'],
    'barroco-espanol': [
      'spanish baroque',
      'barroco español',
      'baroque espagnol',
      'velazquez',
      'murillo',
    ],
    'barroco-flamenco': [
      'flemish baroque',
      'barroco flamenco',
      'rubens',
      'van dyck',
    ],

    // Gothic and Medieval
    'arte-gotico': [
      'gothic',
      'gótico',
      'gothique',
      'medieval gothic',
      'gotico',
    ],
    'arte-medieval-gotico': [
      'medieval gothic',
      'gótico medieval',
      'late medieval',
    ],
    'arte-medieval-romanico': [
      'romanesque',
      'románico',
      'roman',
      'romanico',
    ],
    'arte-romanico': ['romanesque', 'románico', 'romanico'],
    'arte-medieval': ['medieval', 'middle ages', 'edad media', 'médiéval'],

    // Byzantine and Ancient
    'arte-bizantino': ['byzantine', 'bizantino', 'byzantin'],
    'arte-antiguo': ['ancient', 'antiguo', 'antique', 'antiquity'],
    'arte-romano': ['roman', 'romano', 'romain', 'ancient rome'],
    'arte-griego': ['greek', 'griego', 'grec', 'hellenic', 'helenístico'],
    'arte-egipcio': ['egyptian', 'egipcio', 'égyptien', 'egypt'],
    neolitico: ['neolithic', 'neolítico', 'néolithique', 'stone age'],

    // Modern Art Movements
    cubismo: ['cubism', 'cubismo', 'cubisme', 'picasso', 'braque'],
    surrealismo: [
      'surrealism',
      'surrealismo',
      'surréalisme',
      'dali',
      'magritte',
    ],
    dadaismo: ['dada', 'dadaism', 'dadaísmo', 'dadaïsme'],
    futurismo: ['futurism', 'futurismo', 'futurisme', 'boccioni'],
    expresionismo: [
      'expressionism',
      'expresionismo',
      'expressionnisme',
      'munch',
    ],
    'neo-expressionismo': [
      'neo-expressionism',
      'neo-expresionismo',
      'neue wilde',
    ],
    fauvismo: ['fauvism', 'fauvismo', 'fauvisme', 'matisse', 'derain'],

    // Contemporary and Post-Modern
    'arte-contemporaneo': [
      'contemporary',
      'contemporáneo',
      'contemporain',
      'current art',
    ],
    'neo-pop': ['neo-pop', 'neo pop', 'new pop'],
    'pop-art': ['pop art', 'pop', 'warhol', 'lichtenstein'],
    'op-art': ['op art', 'optical art', 'arte óptico'],

    // Realism
    realismo: ['realism', 'realismo', 'réalisme', 'realistic'],
    'hiperrealismo-fotorrealismo': [
      'hyperrealism',
      'photorealism',
      'hiperrealismo',
      'fotorrealismo',
    ],
    'realismo-magico': [
      'magic realism',
      'realismo mágico',
      'réalisme magique',
    ],
    'realismo-social': ['social realism', 'realismo social', 'socialist'],
    'realismo-socialista': [
      'socialist realism',
      'realismo socialista',
      'soviet',
    ],

    // Romanticism
    romanticismo: [
      'romanticism',
      'romanticismo',
      'romantisme',
      'romantic',
    ],
    'romanticismo-americano': [
      'american romanticism',
      'romanticismo americano',
    ],

    // Neoclassicism
    neoclasicismo: [
      'neoclassicism',
      'neoclasicismo',
      'néoclassicisme',
      'neoclassical',
    ],

    // Rococo
    rococo: ['rococo', 'rococó', 'rocaille'],

    // Mannerism
    manierismo: ['mannerism', 'manierismo', 'maniérisme', 'mannerist'],

    // Bauhaus and Design Movements
    bauhaus: ['bauhaus', 'gropius', 'modernist design'],
    'de-stijl': ['de stijl', 'neoplasticism', 'mondrian'],

    // Symbolism
    simbolismo: ['symbolism', 'simbolismo', 'symbolisme', 'symbolist'],

    // Minimalism
    minimalismo: [
      'minimalism',
      'minimalismo',
      'minimalisme',
      'minimal art',
    ],

    // Asian Art
    'ukiyo-e': ['ukiyo-e', 'ukiyo', 'japanese prints', 'hokusai', 'hiroshige'],
    nihonga: ['nihonga', 'japanese painting', 'pintura japonesa'],
    'arte-mughal': ['mughal', 'mogol', 'moghul', 'indian miniature'],
    'arte-chino-clasico': [
      'chinese',
      'chino',
      'chinois',
      'china',
      'song',
      'ming',
      'qing',
    ],
    'arte-japones': ['japanese', 'japonés', 'japonais', 'japan', 'edo'],
    'arte-budista': ['buddhist', 'budista', 'bouddhiste', 'buddha'],
    'arte-islamico': ['islamic', 'islámico', 'islamique', 'muslim'],

    // African and Indigenous Art
    'arte-africano': ['african', 'africano', 'africain', 'africa'],
    'arte-benin': ['benin', 'benín', 'kingdom of benin'],
    'arte-aborigen-australiano': [
      'aboriginal',
      'aborigen',
      'aborigène',
      'australian indigenous',
    ],
    'arte-precolombino': [
      'pre-columbian',
      'precolombino',
      'précolombien',
      'aztec',
      'maya',
      'inca',
    ],

    // American Art Movements
    'american-regionalism': [
      'american regionalism',
      'regionalismo americano',
      'grant wood',
    ],
    'american-realism': ['american realism', 'realismo americano'],
    'ashcan-school': ['ashcan', 'ash can', 'the eight'],
    'hudson-river-school': [
      'hudson river',
      'hudson river school',
      'american landscape',
    ],
    'harlem-renaissance': [
      'harlem renaissance',
      'renacimiento de harlem',
      'harlem',
    ],

    // Latin American Art
    'muralismo-mexicano': [
      'mexican muralism',
      'muralismo mexicano',
      'rivera',
      'orozco',
      'siqueiros',
    ],
    'arte-latinoamericano': [
      'latin american',
      'latinoamericano',
      'latino-américain',
    ],

    // Color Field and Abstract
    'color-field-painting': [
      'color field',
      'campo de color',
      'rothko',
      'newman',
    ],
    'tachisme-art-informel': ['tachisme', 'art informel', 'informal art'],

    // Landscape and Nature
    'pintura-paisaje': ['landscape', 'paisaje', 'paysage'],
    'pintura-marina': ['marine', 'marina', 'seascape'],
    'arte-botanico': ['botanical', 'botánico', 'botanique', 'flower painting'],

    // Portraiture and Genre
    retratismo: ['portrait', 'retrato', 'portraiture'],
    'pintura-genero': ['genre painting', 'pintura de género', 'genre'],

    // Religious and Mythological
    'arte-religioso': ['religious', 'religioso', 'religieux', 'sacred'],
    'arte-cristiano': [
      'christian',
      'cristiano',
      'chrétien',
      'christianity',
    ],
    'pintura-mitologica': [
      'mythological',
      'mitológica',
      'mythologique',
      'mythology',
    ],

    // Other Historical Periods
    'arte-victoriano': ['victorian', 'victoriano', 'victorien'],
    'arte-eduardiano': ['edwardian', 'eduardiano', 'édouardien'],
    'belle-epoque': ['belle époque', 'belle epoque', 'beautiful era'],
    'arte-anglo-sajon': ['anglo-saxon', 'anglo-sajón'],

    // Modern and Avant-Garde
    'arte-moderno': [
      'modern',
      'moderno',
      'moderne',
      'modernist',
      '20th century',
      'siglo xx',
    ],
    modernismo: ['modernism', 'modernismo', 'modernisme'],
    vanguardias: ['avant-garde', 'vanguardia', 'avant garde'],

    // Outsider and Folk Art
    'art-brut': ['art brut', 'outsider art', 'raw art'],
    'arte-naif': ['naive', 'naïf', 'naif', 'primitive', 'folk art'],
    'arte-popular': ['folk', 'popular', 'populaire', 'traditional'],

    // Photorealism and Digital
    'arte-digital': ['digital', 'digital art', 'arte digital', 'computer art'],

    // Orientalism
    orientalismo: ['orientalism', 'orientalismo', 'orientalisme', 'orient'],

    // Primitivism
    primitivismo: ['primitivism', 'primitivismo', 'primitivisme', 'primitive'],

    // Constructivism
    constructivismo: [
      'constructivism',
      'constructivismo',
      'constructivisme',
    ],

    // Suprematism
    suprematismo: ['suprematism', 'suprematismo', 'suprématisme', 'malevich'],

    // Tonalism
    tonalismo: ['tonalism', 'tonalismo', 'tonalisme'],

    // Luminism
    luminismo: ['luminism', 'luminismo', 'luminisme'],

    // Pre-Raphaelite
    'arte-prerrafaelita': [
      'pre-raphaelite',
      'prerrafaelita',
      'préraphaélite',
      'prb',
    ],

    // Arts and Crafts
    'arts-and-crafts': [
      'arts and crafts',
      'artes y oficios',
      'william morris',
    ],

    // Vienna Secession
    'arte-secesion-vienesa': [
      'vienna secession',
      'secession',
      'secesión vienesa',
      'klimt',
    ],

    // Pointillism (if not covered by neo-impressionism)
    puntillismo: ['pointillism', 'puntillismo', 'pointillisme'],

    // Naturalism
    naturalismo: ['naturalism', 'naturalismo', 'naturalisme', 'naturalist'],

    // Verism
    verismo: ['verism', 'verismo', 'vérisme'],

    // Cloisonnism
    cloisonnismo: ['cloisonnism', 'cloisonnismo', 'cloisonnisme'],

    // Nabis
    nabis: ['nabis', 'nabi', 'bonnard', 'vuillard'],

    // Orphism
    orfismo: ['orphism', 'orfismo', 'orphisme', 'delaunay'],

    // Vorticism
    vorticismo: ['vorticism', 'vorticismo', 'vorticisme', 'lewis'],

    // Precisionism
    precisionismo: ['precisionism', 'precisionismo', 'precisionnisme'],

    // Social Realism variations
    'arte-proletario': ['proletarian', 'proletario', 'prolétarien', 'worker'],

    // Environmental and Land Art
    'land-art-arte-tierra': [
      'land art',
      'earth art',
      'arte de tierra',
      'earthworks',
    ],

    // Performance and Installation
    'arte-performance': ['performance', 'performance art', 'happening'],
    'arte-instalacion': [
      'installation',
      'instalación',
      'installation art',
    ],

    // Video and New Media
    'video-art': ['video art', 'video', 'arte de video'],

    // Kinetic Art
    'arte-cinetico': ['kinetic', 'cinético', 'cinétique', 'kinetic art'],

    // Arte Povera
    'arte-povera': ['arte povera', 'povera'],

    // Fluxus
    fluxus: ['fluxus'],

    // Neo-Dada
    'neo-dada': ['neo-dada', 'neo dada'],

    // Hard-edge painting
    'hard-edge-painting': ['hard-edge', 'hard edge', 'geometric'],

    // Lyrical Abstraction
    'abstraccion-lirica': [
      'lyrical abstraction',
      'abstracción lírica',
      'abstraction lyrique',
    ],

    // Post-Painterly Abstraction
    'abstraccion-pospictorialista': [
      'post-painterly',
      'post painterly',
      'pospictorialista',
    ],

    // Transavantgarde
    transvanguardia: ['transavantgarde', 'transvanguardia', 'trans-avant'],

    // New Leipzig School
    'nueva-escuela-leipzig': [
      'new leipzig',
      'leipzig school',
      'nueva leipzig',
    ],

    // Stuckism
    stuckismo: ['stuckism', 'stuckismo', 'stuckist'],

    // Superflat
    superflat: ['superflat', 'murakami'],

    // Neo-Geo
    'neo-geo': ['neo-geo', 'neo geo', 'geometric'],

    // Pictures Generation
    'pictures-generation': [
      'pictures generation',
      'generación pictures',
      'cindy sherman',
    ],

    // Young British Artists
    'young-british-artists': ['yba', 'young british artists', 'brit art'],

    // Neo-Romanticism
    'neo-romanticismo': ['neo-romanticism', 'neo-romanticismo'],

    // Magic Realism (different from realismo-magico)
    'new-objectivity': [
      'neue sachlichkeit',
      'new objectivity',
      'nueva objetividad',
    ],

    // Metaphysical Art
    'arte-metafisico': [
      'metaphysical',
      'metafísico',
      'métaphysique',
      'de chirico',
    ],

    // Kinetic and Op Art overlap
    'arte-optico-cinetico': ['optical kinetic', 'óptico cinético'],

    // Neo-Classicism variations
    'neoclasicismo-weimar': ['weimar classicism', 'weimar neoclassicism'],

    // Historical Japanese styles
    'rinpa-school': ['rinpa', 'rimpa', 'sotatsu', 'korin'],

    // Chinese painting styles
    'pintura-literati': [
      'literati',
      'wenren',
      'scholar painting',
      'pintura erudita',
    ],

    // Persian and Middle Eastern
    'arte-persa': ['persian', 'persa', 'perse', 'iran', 'safavid'],

    // Ottoman Art
    'arte-otomano': ['ottoman', 'otomano', 'ottoman empire'],

    // Tibetan Art
    'arte-tibetano': ['tibetan', 'tibetano', 'tibet', 'thangka'],

    // Korean Art
    'arte-coreano': ['korean', 'coreano', 'coréen', 'korea', 'joseon'],

    // Southeast Asian
    'arte-khmer': ['khmer', 'cambodian', 'camboyano', 'angkor'],
    'arte-thai': ['thai', 'tailandés', 'thaïlandais', 'thailand'],

    // Pacific Art
    'arte-maori': ['maori', 'maorí', 'new zealand'],
    'arte-polinesio': ['polynesian', 'polinesio', 'polynésien'],

    // Native American
    'arte-nativo-americano': [
      'native american',
      'nativo americano',
      'indigenous american',
    ],

    // Inuit Art
    'arte-inuit': ['inuit', 'eskimo', 'arctic'],
  };

  /**
   * Maps a period/style string to a category ID
   * @param period The art period or style detected by AI (e.g., "Renacimiento", "Impressionism")
   * @returns The category ID if a match is found, null otherwise
   */
  mapPeriodToCategory(period: string | undefined): string | null {
    if (!period || period.trim() === '') {
      this.logger.log('Empty period provided, returning null');
      return null;
    }

    const normalizedPeriod = period.toLowerCase().trim();
    this.logger.log(`Attempting to map period: "${period}"`);

    // First, try exact match with category ID
    if (this.categoryKeywords[normalizedPeriod]) {
      this.logger.log(`Exact match found: ${normalizedPeriod}`);
      return normalizedPeriod;
    }

    // Second, search through all keywords
    for (const [categoryId, keywords] of Object.entries(
      this.categoryKeywords,
    )) {
      for (const keyword of keywords) {
        // Check if the period contains the keyword or vice versa
        if (
          normalizedPeriod.includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(normalizedPeriod)
        ) {
          this.logger.log(
            `Matched "${period}" to category "${categoryId}" via keyword "${keyword}"`,
          );
          return categoryId;
        }
      }
    }

    // No match found
    this.logger.log(
      `No match found for period "${period}", will use default "unknown"`,
    );
    return null;
  }
}
