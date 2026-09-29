/*
 * Diccionario de temas para clasificar reseñas de libros (español + inglés).
 *
 * Las palabras se comparan contra el texto normalizado (minúsculas, sin
 * tildes ni eñes: "tamaño" -> "tamano"). Un "*" final equivale a
 * "cualquier terminación" y los espacios admiten varios espacios.
 * Para añadir un tema basta con copiar un bloque y cambiar sus palabras.
 */
(function (root, factory) {
  var lexicon = factory();
  if (typeof module === 'object' && module.exports) module.exports = lexicon;
  root.KDP_LEXICON = lexicon;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var themes = [
    {
      id: 'fotos',
      label: 'Fotografías e imágenes',
      short: 'Fotos',
      words: ['fotograf*', 'foto', 'fotos', 'photo', 'photos', 'photograph*', 'picture*', 'pics',
        'image', 'images', 'imagen', 'imagenes', 'ilustrac*', 'illustrat*', 'lamina*', 'visual*',
        'imagery', 'color plates', 'full color', 'a todo color', 'a color', 'words only', 'words-only', 'solo con palabras',
        'solo texto', 'text only']
    },
    {
      id: 'impresion',
      label: 'Calidad de impresión y encuadernación',
      short: 'Impresión',
      words: ['impresion', 'impreso', 'impresa', 'printing', 'printed', 'print quality', 'paper', 'papel',
        'binding', 'bound', 'encuadern*', 'hardcover', 'hard cover', 'tapa dura', 'tapa blanda', 'paperback',
        'glossy', 'satinado', 'spine', 'lomo', 'well made', 'bien editado', 'edicion cuidada', 'cuidada edicion',
        'production quality', 'beautifully produced', 'calidad del libro', 'book quality', 'quality of the book',
        'pages fell', 'hojas sueltas', 'se despega', 'cheaply made', 'sturdy', 'robusto', 'thick pages', 'paginas gruesas',
        'fingerprint*', 'huellas', 'hardback', 'matte', 'mate']
    },
    {
      id: 'formato',
      label: 'Tamaño y formato',
      short: 'Tamaño',
      words: ['size', 'sized', 'tamano', 'small', 'smaller', 'tiny', 'pequen*', 'diminut*', 'large', 'larger',
        'heavy', 'pesad*', 'weight', 'coffee table', 'mesa de centro', 'pocket',
        'bolsillo', 'dimension*', 'compact*', 'thin', 'delgado', 'fino', 'thick', 'grueso', 'manejable', 'few pages', 'pocas paginas', 'short book', 'libro corto',
        'breve', 'brief', 'concise', 'conciso']
    },
    {
      id: 'redaccion',
      label: 'Redacción y estilo',
      short: 'Redacción',
      words: ['well written', 'beautifully written', 'bien escrit*', 'mal escrit*', 'poorly written', 'the writing',
        'la escritura', 'writer', 'escritor', 'escritora', 'writing style', 'accessible', 'accesible', 'prose', 'prosa', 'readable', 'ameno', 'amena', 'engaging', 'entretenid*', 'boring', 'bored',
        'aburrid*', 'dry', 'arido', 'dense', 'denso', 'densa', 'tedious', 'tedios*', 'style', 'estilo',
        'narrative', 'narrativa', 'easy to read', 'facil de leer', 'hard to read', 'dificil de leer', 'academic',
        'academico', 'flows', 'se lee', 'page turner', 'engancha', 'storytelling', 'wordy', 'verbose']
    },
    {
      id: 'profundidad',
      label: 'Profundidad e investigación',
      short: 'Profundidad',
      words: ['detail', 'details', 'detailed', 'detall*', 'thorough*', 'exhaustiv*', 'in-depth', 'in depth',
        'depth', 'profund*', 'research*', 'investigac*', 'investigad*', 'comprehensive', 'complete', 'completo', 'completa', 'completisimo',
        'superficial*', 'shallow', 'basic', 'basico', 'basica', 'overview', 'introduction', 'introduccion',
        'scholarly', 'erudit*', 'informative', 'informativo', 'informativa', 'insight*', 'lacks depth',
        'not much information', 'poca informacion', 'mucha informacion', 'lots of information']
    },
    {
      id: 'historia',
      label: 'Historia y biografía',
      short: 'Historia',
      words: ['history', 'historia', 'historic*', 'historico', 'historica', 'biograph*', 'biografia', 'life of',
        'his life', 'su vida', 'vida de', 'story of', 'backstory', 'contexto', 'context', 'catalan*',
        'catalunya', 'cataluna', 'civil war', 'guerra civil', 'modernis*', 'renaixenca', 'anarchis*',
        'epoca', 'century', 'siglo', 'career', 'trayectoria', 'roots', 'raices', 'nationalis*', 'nacionalis*',
        'cronica']
    },
    {
      id: 'arquitectura',
      label: 'Arquitectura, técnica y geometría',
      short: 'Arquitectura',
      words: ['architecture', 'architectural', 'arquitectura', 'arquitectonic*', 'structural', 'structures', 'estructural', 'estructurales', 'estructuras',
        'geometr*', 'engineer*', 'ingenier*', 'catenar*', 'hyperbol*', 'hiperbol*', 'paraboloid*',
        'column', 'columns', 'columna*', 'vault*', 'boveda*', 'arches', 'arcos', 'construction technique*',
        'tecnica*', 'technique*', 'building method*', 'materials', 'materiales', 'stone', 'piedra', 'organic forms',
        'formas organicas', 'gravity', 'gravedad', 'load', 'cargas']
    },
    {
      id: 'simbolismo',
      label: 'Simbolismo y espiritualidad',
      short: 'Simbolismo',
      words: ['symbol*', 'simbol*', 'religio*', 'faith', 'spiritual*', 'espiritual*', 'catholic*',
        'catolic*', 'god', 'dios', 'christ', 'christian*', 'cristo', 'cristian*', 'bibl*', 'prayer',
        'oracion', 'sacred', 'lo sagrado', 'arte sacro', 'liturg*', 'iconograph*', 'iconograf*', 'meaning', 'significado',
        'theolog*', 'teolog*', 'devotion', 'devocion', 'santo', 'santa', 'fe cristiana', 'la fe', 'la luz', 'the light',
        'in light', 'stained glass', 'vidriera*', 'vitral*']
    },
    {
      id: 'visita',
      label: 'Uso para la visita o el viaje',
      short: 'Visita',
      words: ['visit', 'visits', 'visited', 'visiting', 'visita*', 'visitar*', 'trip', 'viaje', 'travel*',
        'tour', 'tours', 'touris*', 'turist*', 'guidebook', 'guide book', 'guia', 'before going',
        'antes de ir', 'after visiting', 'despues de visitar', 'souvenir', 'recuerdo', 'vacation', 'vacaciones',
        'holiday', 'when we were there', 'cuando estuve', 'went there', 'fuimos', 'estuvimos', 'in person',
        'en persona', 'itinerar*', 'no has estado', 'never been', 'never visited', 'been to barcelona',
        'seen in barcelona', 'bought it in barcelona', 'comprado en barcelona', 'compre en barcelona', 'nunca pudo']
    },
    {
      id: 'planos',
      label: 'Planos, dibujos y diagramas',
      short: 'Planos',
      words: ['floor plan*', 'plano', 'planos', 'plans', 'drawing', 'drawings', 'dibujo*', 'diagram*',
        'diagrama*', 'sketch*', 'boceto*', '3d', 'map', 'maps', 'mapa', 'mapas', 'cutaway*', 'cross section*',
        'maqueta*', 'render*', 'infograf*', 'illustrated plan*', 'elevation*', 'alzado*']
    },
    {
      id: 'actualidad',
      label: 'Actualidad o información desactualizada',
      short: 'Actualidad',
      words: ['outdated', 'out of date', 'dated', 'desactualiz*', 'actualiz*', 'updated', 'update', 'up to date',
        'latest', 'old edition', 'edicion antigua', 'completion', 'completion date',
        'will be completed', 'will be finished', 'se terminara', 'cuando se termine', 'fecha de finalizacion', '2026', 'tower of jesus', 'torre de jesus', 'still under construction',
        'todavia en construccion', 'sigue en construccion', 'unfinished', 'inacabad*', 'new edition',
        'nueva edicion']
    },
    {
      id: 'precio',
      label: 'Precio y relación calidad-precio',
      short: 'Precio',
      words: ['price', 'priced', 'precio', 'value', 'worth', 'vale la pena', 'merece la pena', 'expensive',
        'caro', 'cara', 'cheap', 'barato', 'barata', 'overpriced', 'bargain', 'ganga', 'money', 'dinero',
        'cost', 'costs', 'cuesta', 'costos*', 'for the price', 'por el precio', 'calidad precio',
        'calidad-precio', 'affordable', 'asequible']
    },
    {
      id: 'traduccion',
      label: 'Traducción, idioma y erratas',
      short: 'Idioma',
      words: ['translat*', 'traduc*', 'typo', 'typos', 'errata*', 'errors', 'errores', 'mistake*',
        'spelling', 'ortograf*', 'in english', 'en ingles', 'in spanish', 'en espanol', 'en castellano',
        'language', 'idioma', 'proofread*', 'grammar', 'gramatic*', 'catalan version', 'version en']
    },
    {
      id: 'digital',
      label: 'Edición Kindle o digital',
      short: 'Kindle',
      words: ['kindle', 'ebook', 'e-book', 'e book', 'digital', 'tablet', 'ipad', 'zoom', 'formatting',
        'on my phone', 'en el movil', 'pantalla', 'screen', 'libro electronico', 'edicion digital',
        'kindle unlimited']
    },
    {
      id: 'envio',
      label: 'Envío y estado del ejemplar',
      short: 'Envío',
      words: ['arrived', 'arrive', 'llego', 'llegaron', 'damaged', 'danad*', 'shipping', 'shipped', 'envio',
        'packag*', 'paquete', 'embalaje', 'condition', 'en mal estado', 'dent*', 'golpead*', 'torn', 'roto',
        'rota', 'used copy', 'usado', 'usada', 'delivery', 'entrega', 'bent', 'doblad*', 'scratched', 'sticker', 'pegatina', 'residue', 'residuo']
    },
    {
      id: 'regalo',
      label: 'Regalo',
      short: 'Regalo',
      words: ['gift', 'gifts', 'gifted', 'regalo', 'regalos', 'regale', 'regalar', 'birthday', 'cumpleanos',
        'christmas', 'navidad', 'present for', 'para mi padre', 'para mi madre', 'for my husband',
        'for my wife', 'for my father', 'for my mother', 'for my son', 'for my daughter']
    },
    {
      id: 'repetitivo',
      label: 'Repetición y relleno',
      short: 'Relleno',
      words: ['repetit*', 'repeat*', 'repite', 'redundan*', 'filler', 'relleno', 'padding', 'padded',
        'too long', 'demasiado largo', 'demasiado larga', 'drags', 'se hace pesado', 'se hace largo',
        'rambl*', 'goes on', 'could be shorter', 'podria ser mas corto']
    },
    {
      id: 'organizacion',
      label: 'Organización y estructura del libro',
      short: 'Organización',
      words: ['organized', 'organised', 'organization', 'organizad*', 'organizacion', 'chronolog*',
        'cronolog*', 'confus*', 'jumps around', 'salta de', 'index', 'indice', 'chapters', 'capitulos',
        'layout', 'maquetacion', 'captions', 'caption', 'pie de foto', 'pies de foto', 'easy to follow',
        'facil de seguir', 'hard to follow', 'dificil de seguir', 'well structured', 'bien estructurad*',
        'disjointed', 'inconex*', 'away from the text', 'lejos del texto', 'bite-sized', 'bite sized', 'fragmentos breves',
        'lumpy']
    },
    {
      id: 'gaudi_persona',
      label: 'Gaudí como persona',
      short: 'Gaudí persona',
      words: ['personality', 'personalidad', 'character', 'caracter', 'genius', 'genio', 'humble', 'humilde',
        'eccentric', 'excentric*', 'devout', 'devoto', 'tram', 'tranvia', 'his death', 'su muerte', 'beatif*',
        'venerable', 'saint', 'the man', 'el hombre', 'as a person', 'como persona', 'private life',
        'vida privada', 'his faith', 'su fe']
    },
    {
      id: 'ninos',
      label: 'Niños, familia y estudiantes',
      short: 'Niños',
      words: ['kid', 'kids', 'child', 'children', 'nino', 'ninos', 'nina', 'ninas', 'hijo', 'hijos', 'hija',
        'my family', 'our family', 'whole family', 'mi familia', 'nuestra familia', 'toda la familia', 'teen*', 'adolescent*', 'school', 'colegio', 'student*', 'estudiante*',
        'grandson', 'granddaughter', 'nieto*', 'nieta*', 'young reader*']
    },
    {
      id: 'autoridad',
      label: 'Autoridad y conocimiento del autor',
      short: 'Autoridad',
      words: ['author knows', 'the author', 'el autor', 'la autora', 'expert', 'experta', 'experto',
        'knowledgeable', 'authority', 'autoridad', 'scholar', 'historian', 'historiador*', 'conocimiento',
        'knowledge', 'credib*', 'credibil*', 'sources', 'fuentes', 'bibliograph*', 'bibliografia', 'notes',
        'notas']
    },
    {
      id: 'emocion',
      label: 'Emoción e inspiración',
      short: 'Emoción',
      words: ['inspir*', 'moving', 'moved', 'conmov*', 'emocion*', 'awe', 'asombr*', 'breathtaking',
        'goosebumps', 'piel de gallina', 'wonder', 'maravill*', 'magic*', 'magia', 'unforgettable', 'inolvidable']
    }
  ];

  // Palabras que, dentro de una frase, señalan una queja o carencia.
  var negativeCues = ['poor', 'poorly', 'pobre', 'pobres', 'mala', 'malo', 'malas', 'malos', 'bad', 'badly',
    'disappoint*', 'decepcion*', 'decepciona*', 'lack', 'lacks', 'lacking', 'le falta', 'le faltan', 'missing',
    'carece', 'carecen', 'too small', 'too short', 'too long', 'too much', 'too little', 'too dense', 'too dry',
    'too basic', 'demasiado', 'demasiada', 'demasiados', 'demasiadas', 'unfortunately', 'lamentablemente',
    'desgraciadamente', 'boring', 'aburrid*', 'confus*', 'outdated', 'desactualiz*', 'worst', 'peor',
    'waste', 'hard to read', 'hard to follow', 'dificil de leer', 'dificil de seguir', 'annoying', 'molest*',
    'irritat*', 'problem', 'problems', 'problema', 'problemas', 'issue', 'issues', 'defect*', 'defecto*',
    'blurry', 'borros*', 'too dark', 'muy oscur*', 'tiny', 'diminut*', 'cheaply', 'flimsy', 'overpriced',
    'expected more', 'esperaba mas', 'esperaba otra cosa', 'not worth', 'no vale', 'no merece', 'not enough',
    'not much', 'not very', 'not as good', 'no aporta', "didn't like", 'did not like', 'no me gusto',
    'no me ha gustado', 'muy poco', 'muy poca', 'pocas fotos', 'poca informacion', 'few photos', 'few pictures',
    'mediocre', 'superficial*', 'shallow', 'dry', 'tedious', 'tedios*', 'repetit*', 'error', 'errors', 'errores',
    'typo', 'typos', 'erratas', 'damaged', 'danado', 'danada', 'roto', 'rota', 'misleading', 'enganos*',
    'regret', 'arrepient*', 'returned it', 'lo devolvi', 'devoluc*', 'meh', 'small side',
    'a bit small', 'quite small', 'rather small', 'very small', 'smaller than', 'muy pequen*', 'algo pequen*',
    'un poco pequen*', 'mas pequen*', 'fingerprint*', 'huellas', 'no photos', 'no pictures', 'no images',
    'sin fotos', 'sin imagenes', 'without pictures', 'without photos', 'words only', 'words-only'];

  // Deseos explícitos: "me hubiera gustado", "ojalá", "le falta"... (señal de hueco).
  var wishCues = ['wish', 'wished', 'would have liked', 'would have loved', 'would have been nice',
    'would be nice', 'would love', 'could have', 'should have', 'ojala', 'me hubiera gustado',
    'me habria gustado', 'hubiera preferido', 'habria preferido', 'hubiese gustado', 'echo de menos',
    'eche de menos', 'le falta', 'le faltan', 'le sobra', 'le sobran', 'seria mejor', 'would be better',
    'only complaint', 'unico pero', 'unica pega', 'my only', 'mi unica', 'needs more', 'necesita mas',
    'lacks', 'lacking', 'missing', 'more photos', 'mas fotos', 'more pictures', 'more plans', 'mas planos',
    'more maps', 'mas mapas', 'more detail', 'mas detalle', 'more information', 'mas informacion'];

  // Elogios claros: evitan leer como queja un "caro, pero merece la pena".
  var positiveCues = ['worth', 'worth it', 'vale la pena', 'merece la pena', 'great', 'love', 'loved', 'excelente',
    'excellent', 'recomiendo', 'recommend*', 'beautiful', 'precios*', 'bonit*', 'good', 'bueno', 'buena',
    'overall', 'en general', 'still', 'aun asi', 'lovely', 'wonderful', 'maravillos*', 'fantastic*', 'perfect*',
    'perfecto', 'perfecta', 'encanta*', 'enjoy*', 'disfrut*'];

  // Conectores de contraste: lo que viene después suele ser la pega.
  var contrastMarkers = ['but', 'pero', 'however', 'sin embargo', 'although', 'aunque', 'except', 'excepto',
    'salvo', 'though', 'no obstante'];

  var stopwords = ('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bajo bien cada casi ' +
    'como con contra cual cuales cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa ' +
    'esas ese eso esos esta estaba estan estar estas este esto estos fue fueron ha habia han hasta hay he la las le ' +
    'les lo los mas me mi mis mismo mucho muchos muy nada ni no nos nosotros nuestra nuestro o otra otras otro otros ' +
    'para pero poco por porque que quien se sea ser si sido sin sobre solo son su sus tambien tan tanto te tener ' +
    'tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ya yo fui he hemos muy libro libros leer ' +
    'lei leido lectura pagina paginas gaudi sagrada familia basilica barcelona edicion ' +
    'the and for are but not you all any can had her was one our out has him his how its may new now old see two ' +
    'way who did get has let put say she too use a an as at be by do if in is it me my no of on or so to up we ' +
    'this that with from they have were been will would there their them then than these those what when which ' +
    'while about after again also am because before being both could does each few further here into just more ' +
    'most other over own same should some such very where why your yours book books read reading page pages ' +
    'gaudi sagrada familia basilica barcelona edition really much many well even though still got like just ' +
    'es la el en y de que un una los las por con para su al lo como mas pero sus le ya o este si porque esta ' +
    'entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra ' +
    'otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes ' +
    'nada muchos cual poco ella estar estas algunas algo nosotros').split(/\s+/);

  return {
    version: 1,
    themes: themes,
    negativeCues: negativeCues,
    wishCues: wishCues,
    contrastMarkers: contrastMarkers,
    positiveCues: positiveCues,
    stopwords: stopwords
  };
});
