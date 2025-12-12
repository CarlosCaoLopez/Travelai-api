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

    // Renaissance
    renacimiento: [
      'renaissance',
      'renacimiento',
      'renaixement',
      'rinascimento',
      'quattrocento',
      'early renaissance',
      'high renaissance',
      'alto renacimiento',
      'haute renaissance',
      'leonardo',
      'michelangelo',
      'rafael',
      'northern renaissance',
      'renacimiento nórdico',
      'renaissance nordique',
      'flemish renaissance',
    ],

    // Baroque
    barroco: [
      'baroque',
      'barroco',
      'barocco',
      'spanish baroque',
      'barroco español',
      'baroque espagnol',
      'velazquez',
      'murillo',
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
      'gótico medieval',
      'late medieval',
    ],
    'arte-romanico': ['romanesque', 'románico', 'romanico', 'roman'],
    'arte-medieval': ['medieval', 'middle ages', 'edad media', 'médiéval'],

    // Byzantine and Ancient
    'arte-bizantino': ['byzantine', 'bizantino', 'byzantin'],
    'arte-antiguo': [
      'ancient',
      'antiguo',
      'antique',
      'antiquity',
      'greek',
      'griego',
      'grec',
      'hellenic',
      'helenístico',
      'egyptian',
      'egipcio',
      'égyptien',
      'egypt',
      'neolithic',
      'neolítico',
      'néolithique',
      'stone age',
    ],
    'arte-romano': ['roman', 'romano', 'romain', 'ancient rome'],

    // Modern Art Movements
    cubismo: ['cubism', 'cubismo', 'cubisme', 'picasso', 'braque'],
    surrealismo: [
      'surrealism',
      'surrealismo',
      'surréalisme',
      'dali',
      'magritte',
    ],
    futurismo: ['futurism', 'futurismo', 'futurisme', 'boccioni'],
    expresionismo: [
      'expressionism',
      'expresionismo',
      'expressionnisme',
      'munch',
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
      'neo-pop',
      'neo pop',
      'new pop',
    ],
    'pop-art': ['pop art', 'pop', 'warhol', 'lichtenstein'],
    'op-art': ['op art', 'optical art', 'arte óptico'],

    // Realism
    realismo: ['realism', 'realismo', 'réalisme', 'realistic'],
    'realismo-social': ['social realism', 'realismo social', 'socialist'],

    // Romanticism
    romanticismo: [
      'romanticism',
      'romanticismo',
      'romantisme',
      'romantic',
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

    // Asian Art
    'ukiyo-e': ['ukiyo-e', 'ukiyo', 'japanese prints', 'hokusai', 'hiroshige'],
    nihonga: [
      'nihonga',
      'japanese painting',
      'pintura japonesa',
      'japanese',
      'japonés',
      'japonais',
      'japan',
      'edo',
    ],
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
      'american realism',
      'realismo americano',
      'ashcan',
      'ash can',
      'the eight',
    ],
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

    // Landscape and Nature
    'arte-botanico': ['botanical', 'botánico', 'botanique', 'flower painting'],

    // Other Historical Periods
    'arte-victoriano': ['victorian', 'victoriano', 'victorien'],
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

    // Orientalism
    orientalismo: ['orientalism', 'orientalismo', 'orientalisme', 'orient'],

    // Primitivism
    primitivismo: ['primitivism', 'primitivismo', 'primitivisme', 'primitive'],

    // Suprematism
    suprematismo: ['suprematism', 'suprematismo', 'suprématisme', 'malevich'],

    // Tonalism
    tonalismo: ['tonalism', 'tonalismo', 'tonalisme'],

    // Luminism
    luminismo: ['luminism', 'luminismo', 'luminisme'],

    // Arts and Crafts
    'arts-and-crafts': ['arts and crafts', 'artes y oficios', 'william morris'],

    // Naturalism
    naturalismo: ['naturalism', 'naturalismo', 'naturalisme', 'naturalist'],

    // Nabis
    nabis: ['nabis', 'nabi', 'bonnard', 'vuillard'],

    // Precisionism
    precisionismo: ['precisionism', 'precisionismo', 'precisionnisme'],

    // Tibetan Art
    'arte-tibetano': ['tibetan', 'tibetano', 'tibet', 'thangka'],

    // Phase 1: Modern Art Movements (20th century)
    photorealism: [
      'photorealism',
      'hyperrealism',
      'fotorrealismo',
      'hiperrealismo',
      'super realism',
      'photo-realism',
    ],
    'pittura-metafisica': [
      'metaphysical painting',
      'pittura metafisica',
      'pintura metafísica',
      'de chirico',
      'metaphysical art',
    ],
    'metaphysical-painting': [
      'metaphysical painting',
      'pintura metafísica',
      'metaphysical art',
    ],
    dada: [
      'dada',
      'dadaism',
      'dadaísmo',
      'dadaïsme',
      'anti-art',
      'duchamp',
      'tzara',
    ],
    'dystopian-surrealism': [
      'dystopian surrealism',
      'surrealismo distópico',
      'dystopian',
      'distopía',
    ],
    'surrealismo-dystopico': [
      'dystopian surrealism',
      'surrealismo distópico',
      'dystopian',
    ],
    'cubismo-sintetico': [
      'synthetic cubism',
      'cubismo sintético',
      'cubisme synthétique',
      'collage cubism',
    ],
    'cubo-futurismo': [
      'cubo-futurism',
      'cubo futurismo',
      'cubo futurismo',
      'russian futurism',
    ],
    'expresionismo-aleman': [
      'german expressionism',
      'expresionismo alemán',
      'die brücke',
      'der blaue reiter',
      'expressionisme allemand',
    ],
    'expresionismo-austriaco': [
      'austrian expressionism',
      'expresionismo austriaco',
      'egon schiele',
      'oskar kokoschka',
    ],
    'expresionismo-temprano': [
      'early expressionism',
      'expresionismo temprano',
      'proto-expressionism',
    ],
    'fantastico-realismo': [
      'fantastic realism',
      'realismo fantástico',
      'vienna school of fantastic realism',
    ],
    'neo-figurativo': [
      'neo-figurative',
      'nueva figuración',
      'new figuration',
      'néo-figuratif',
    ],
    divisionismo: [
      'divisionism',
      'divisionismo',
      'divisionnisme',
      'chromoluminarism',
      'italian pointillism',
    ],
    orphism: [
      'orphism',
      'orfismo',
      'orphisme',
      'robert delaunay',
      'sonia delaunay',
      'orphic cubism',
    ],
    synthetism: [
      'synthetism',
      'sintetismo',
      'synthétisme',
      'cloisonnism',
      'pont-aven school',
      'gauguin',
      'bernard',
    ],
    neoplasticismo: [
      'neoplasticism',
      'neoplasticismo',
      'néoplasticisme',
      'de stijl',
      'mondrian',
      'theo van doesburg',
    ],
    'grupo-de-los-siete': [
      'group of seven',
      'grupo de los siete',
      'canadian landscape',
      'tom thomson',
      'lawren harris',
    ],
    'hague-school': [
      'hague school',
      'escuela de la haya',
      'haagse school',
      'dutch impressionism',
      'grey school',
    ],
    'fotografia-de-arte-moderno': [
      'modern art photography',
      'fotografía de arte moderno',
      'art photography',
      'fine art photography',
    ],

    // Phase 2: Historical & Asian Art
    medieval: [
      'medieval',
      'middle ages',
      'edad media',
      'médiéval',
      'medieval art',
    ],
    'gotico-internacional': [
      'international gothic',
      'gótico internacional',
      'gothique international',
      'soft style',
    ],
    'proto-renacimiento': [
      'proto-renaissance',
      'proto renacimiento',
      'early renaissance',
      'pre-renaissance',
      'trecento',
    ],
    'arte-folk': [
      'folk art',
      'arte popular',
      'art populaire',
      'traditional folk',
    ],
    'arte-folk-americano': ['american folk art', 'arte popular americano'],
    'arte-folk-ucraniano': [
      'ukrainian folk art',
      'arte popular ucraniano',
      'petrykivka',
    ],
    'yamato-e': [
      'yamato-e',
      'yamato e',
      'japanese classical painting',
      'heian period painting',
    ],
    'shin-hanga': [
      'shin-hanga',
      'shin hanga',
      'new prints',
      'neo-ukiyo-e',
      'modern japanese prints',
    ],
    bunjinga: [
      'bunjinga',
      'literati painting',
      'nanga',
      'japanese literati',
      'scholar painting',
    ],
    rinpa: [
      'rinpa',
      'rimpa',
      'decorative japanese',
      'sotatsu',
      'korin',
      'rinpa school',
    ],
    'arte-chino': [
      'chinese art',
      'arte chino',
      'art chinois',
      'chinese painting',
      'chinese traditional',
    ],
    'arte-chino-tradicional': [
      'traditional chinese art',
      'arte chino tradicional',
      'chinese classical',
    ],
    'arte-joseon': [
      'joseon art',
      'arte joseon',
      'korean classical',
      'joseon dynasty',
    ],
    'arte-de-la-dinastia-joseon': [
      'joseon dynasty art',
      'arte de la dinastía joseon',
      'korean dynasty art',
    ],
    'arte-maya': [
      'maya art',
      'arte maya',
      'mayan art',
      'mesoamerican maya',
      'maya civilization',
    ],
    japonismo: [
      'japonisme',
      'japonismo',
      'japonism',
      'japanese influence',
      'japonaiserie',
    ],
    jugendstil: [
      'jugendstil',
      'german art nouveau',
      'youth style',
      'secession style',
    ],
    manuelino: [
      'manueline',
      'manuelino',
      'portuguese late gothic',
      'manuel style',
    ],
    'arte-mughal-miniatura': [
      'mughal miniature',
      'miniatura mogol',
      'mughal miniature painting',
      'indian miniature',
    ],
    'arte-rajasthani': [
      'rajasthani painting',
      'rajasthani art',
      'rajasthani miniature',
      'indian miniature rajasthan',
    ],
    'arte-rajput': [
      'rajput painting',
      'arte rajput',
      'rajput school',
      'rajput miniature',
    ],
    'arte-indio': ['indian art', 'arte indio', 'art indien'],
    'arte-indio-tradicional': [
      'traditional indian art',
      'arte indio tradicional',
    ],
    'arte-hindu-clasico': [
      'classical hindu art',
      'arte hindú clásico',
      'hindu classical',
      'temple art',
    ],
    'arte-del-periodo-song': [
      'song dynasty art',
      'arte del período song',
      'song period',
      'song painting',
    ],

    // Phase 3: Specialized & Genre Categories
    vanitas: [
      'vanitas',
      'vanitas still life',
      'memento mori',
      'mortality still life',
    ],
    'trompe-l-il': [
      "trompe l'oeil",
      "trompe l'il",
      'optical illusion',
      'trampantojo',
      "trompe-l'oeil",
    ],
    pronkstilleven: [
      'pronkstilleven',
      'pronk stilleven',
      'dutch still life',
      'opulent still life',
    ],
    caricatura: ['caricature', 'caricatura', 'cartoon', 'satirical drawing'],
    'para-surrealismo': ['para-surrealism', 'para surrealismo'],
    'pre-rafaelismo': [
      'pre-raphaelite',
      'pre raphaelite',
      'prerrafaelita',
      'prb',
      'pre-raphaelite brotherhood',
    ],
    'primitivos-flamencos': [
      'flemish primitives',
      'early netherlandish',
      'primitivos flamencos',
      'flemish renaissance early',
      'van eyck',
    ],
    regionalismo: [
      'regionalism',
      'regionalismo',
      'régionalisme',
      'regional art',
    ],
    rembrandt: ['rembrandt', 'rembrandt style', 'rembrandt school'],
    rembrandtesco: ['rembrandtesque', 'rembrandt-like', 'rembrandtesco'],
    'victoriano-clasicismo': [
      'victorian classicism',
      'victorian neoclassicism',
      'victoriano clasicismo',
    ],
    'victoriano-esteticismo': [
      'victorian aestheticism',
      'aesthetic movement victorian',
      'victoriano esteticismo',
    ],
    'victoriano-historico': [
      'victorian historical painting',
      'victorian history painting',
      'victoriano histórico',
    ],
    'viennese-secession': [
      'vienna secession',
      'viennese secession',
      'secesión vienesa',
      'klimt',
      'wiener secession',
    ],
    'arte-aesthetic': [
      'aesthetic art',
      'aesthetic movement',
      'arte estético',
      'aestheticism',
    ],
    'arte-flamenco': [
      'flemish art',
      'arte flamenco',
      'art flamand',
      'netherlandish',
    ],
    'arte-flamenco-renacentista': [
      'flemish renaissance',
      'renacimiento flamenco',
      'northern renaissance flemish',
    ],
    'arte-gotico-internacional': [
      'international gothic',
      'gótico internacional',
      'soft style gothic',
    ],
    clasicismo: ['classicism', 'clasicismo', 'classicisme', 'classical style'],
    cloisonnism: [
      'cloisonnism',
      'cloisonnismo',
      'cloisonnisme',
      'synthetism',
      'pont-aven',
    ],
    costumbrismo: [
      'costumbrismo',
      'genre painting spanish',
      'customs painting',
      'manners painting',
    ],
    decadentismo: [
      'decadentism',
      'decadentismo',
      'décadentisme',
      'decadent movement',
    ],
    'diseno-moderno': ['modern design', 'diseño moderno', 'design moderne'],
    biedermeier: ['biedermeier', 'biedermeier style', 'german biedermeier'],
    empire: ['empire style', 'empire', 'estilo imperio', 'napoleonic style'],
    'les-nabis': ['les nabis', 'nabis', 'bonnard', 'vuillard', 'nabi group'],
    'mexican-muralism': [
      'mexican muralism',
      'muralismo mexicano',
      'diego rivera',
      'orozco',
      'siqueiros',
    ],
    muralismo: ['muralism', 'muralismo', 'mural painting', 'mural art'],
    'neo-rococo': ['neo-rococo', 'neo rococo', 'rococo revival'],
    'neo-romanticismo': [
      'neo-romanticism',
      'neo-romanticismo',
      'neo romanticismo',
      'new romanticism',
    ],
    'neue-sachlichkeit': [
      'neue sachlichkeit',
      'new objectivity',
      'nueva objetividad',
      'magic realism german',
    ],

    // Phase 4: Remaining Categories (Rare/Niche/Regional)
    'arte-de-las-tierras-del-noroeste': [
      'northwest coast art',
      'pacific northwest',
      'native northwest',
    ],
    'arte-de-los-mughal-y-escuelas-regionales-estilo-kishangarh': [
      'kishangarh mughal',
      'kishangarh style',
      'mughal regional kishangarh',
    ],
    'arte-del-siglo-xvii-estilo-dorado-holandes': [
      'dutch golden age',
      'siglo de oro holandés',
      '17th century dutch',
    ],
    'siglo-de-oro-holandes': [
      'dutch golden age',
      'siglo de oro holandés',
      'gouden eeuw',
      '17th century dutch',
    ],
    'arte-del-siglo-xviii-naturalismo-cientifico': [
      '18th century naturalism',
      'scientific naturalism',
      'naturalismo científico',
    ],
    'arte-hellenistico': [
      'hellenistic art',
      'arte helenístico',
      'hellenistic period',
      'greek hellenistic',
    ],
    'arte-indigena-contemporaneo': [
      'contemporary indigenous',
      'indigenous contemporary',
      'arte indígena contemporáneo',
    ],
    'arte-indigena-plano': [
      'plains indigenous art',
      'plains indian art',
      'arte indígena de las llanuras',
    ],
    'arte-insular': [
      'insular art',
      'hiberno-saxon',
      'celtic christian',
      'book of kells',
    ],
    'arte-neolitico': [
      'neolithic art',
      'arte neolítico',
      'stone age',
      'prehistoric',
    ],
    'arte-ottoman': [
      'ottoman art',
      'arte otomano',
      'ottoman empire',
      'turkish ottoman',
    ],
    'arte-persa-miniatura-safavi': [
      'safavid persian miniature',
      'safavid miniature',
      'persian safavid',
      'miniatura persa safaví',
    ],
    'miniatura-persa': [
      'persian miniature',
      'miniatura persa',
      'persian painting',
      'islamic persian',
    ],
    'arte-tradicional-africano': [
      'traditional african art',
      'arte tradicional africano',
      'african traditional',
    ],
    'arte-zen': ['zen art', 'arte zen', 'zen buddhist', 'zen painting'],
    'biomorfica-abstracta': [
      'biomorphic abstraction',
      'biomorphic abstract',
      'biomórfica abstracta',
      'organic abstraction',
    ],
    'company-style': [
      'company style',
      'company painting',
      'colonial indian painting',
      'east india company art',
    ],
    'deccan-painting': [
      'deccan painting',
      'deccani painting',
      'deccan school',
      'indian deccan',
    ],
    'ilustracion-infantil': [
      'children illustration',
      'ilustración infantil',
      'childrens book art',
    ],
    'kalighat-painting': [
      'kalighat painting',
      'kalighat pat',
      'bengali folk painting',
    ],
    'kishangarh-school-of-miniatures': [
      'kishangarh school',
      'kishangarh miniatures',
      'rajasthani kishangarh',
    ],
    'paisaje-clasico': [
      'classical landscape',
      'paisaje clásico',
      'ideal landscape',
      'claude lorrain',
    ],
    'paisajismo-clasico': [
      'classical landscape painting',
      'paisajismo clásico',
      'classical landscape tradition',
    ],
    'paisajismo-holandes-del-siglo-xvii': [
      '17th century dutch landscape',
      'dutch landscape painting',
      'paisajismo holandés',
    ],
    'photo-secession': [
      'photo-secession',
      'photo secession',
      'pictorialism',
      'stieglitz',
    ],
    'pintura-de-vedute': [
      'vedute painting',
      'veduta',
      'view painting',
      'canaletto',
      'vedutismo',
    ],
    'pintura-del-siglo-xviii': [
      '18th century painting',
      'pintura del siglo xviii',
      'eighteenth century',
    ],
    postimpresionismo: [
      'post-impressionism',
      'postimpresionismo',
      'post-impressionnisme',
      'cezanne',
      'van gogh',
      'gauguin',
    ],
    'pre-columbino': [
      'pre-columbian',
      'precolombino',
      'precolumbian',
      'mesoamerican',
    ],
    'proto-cubismo': [
      'proto-cubism',
      'proto cubismo',
      'early cubism',
      'cezannesque',
    ],
    'punjab-hills-school': [
      'punjab hills school',
      'pahari painting',
      'himalayan painting',
    ],
    'rajput-school': [
      'rajput school',
      'rajput painting school',
      'indian rajput tradition',
    ],
    'realismo-expresionista': [
      'expressionist realism',
      'realismo expresionista',
      'expressive realism',
    ],
    'slovak-modernism': [
      'slovak modernism',
      'modernismo eslovaco',
      'czechoslovak modernism',
    ],
    'socialist-realism': [
      'socialist realism',
      'realismo socialista',
      'soviet realism',
      'social realism soviet',
    ],
    stimmungsimpressionismus: [
      'stimmungsimpressionismus',
      'mood impressionism',
      'atmospheric impressionism',
    ],
    'arte-naturalista': [
      'naturalist art',
      'arte naturalista',
      'naturalistic painting',
    ],
    unknown: ['unknown', 'unidentified', 'unclear', 'not classified'],
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

    // No match found, return 'unknown' as fallback category
    this.logger.log(
      `No match found for period "${period}", returning "unknown" category`,
    );
    return 'unknown';
  }
}
