/*
 * Estrategia redactada a partir de los datos: nichos, avatares, enfoques,
 * cómo entrar, cómo no entrar, fortalezas, debilidades y posicionamiento.
 *
 * "basis" indica en qué se apoya: 'preliminar' = metadatos + señales
 * públicas + contexto 2026 (sin las reseñas completas de Amazon). Cuando
 * se importen las reseñas, el panel añade al lado de cada punto los
 * números reales por tema (campo "themes").
 */
window.KDP_INSIGHTS = {
  version: 1,
  updated: '2026-09-29',
  basis: 'preliminar',
  basisNote: 'Basado en los datos de los 8 libros, 45 señales públicas de lectores y crítica, 19 competidores más y el contexto de 2026. Las reseñas completas de Amazon aún no están importadas: cuando lo estén, cada punto mostrará cuántas reseñas lo respaldan.',

  name: {
    chosen: 'Catenaria',
    tagline: 'Radar de nichos KDP',
    why: 'Gaudí colgaba cadenas con pesos para que la gravedad le dibujara la forma exacta de sus arcos (su maqueta polifunicular). Este panel hace lo mismo con el mercado: cuelga cientos de reseñas y deja que marquen la forma de tu libro.',
    alternatives: [
      { name: 'Trencadís', why: 'Como el mosaico de Gaudí: muchas reseñas sueltas que juntas forman la imagen del nicho.' },
      { name: 'Piedra Angular', why: 'La primera piedra de tu libro. Tono sobrio, sirve para cualquier tema.' },
      { name: 'Hueco KDP', why: 'Directo y reutilizable para otros nichos: dice exactamente lo que busca.' },
      { name: 'La Maqueta', why: 'Gaudí probaba todo en maquetas antes de construir; aquí pruebas tu libro antes de escribirlo.' }
    ]
  },

  summary: {
    headline: 'Hay sitio para un libro en inglés, visual y actualizado a 2026 que explique la Sagrada Família a quien no sabe nada de arquitectura.',
    bullets: [
      'La demanda está en máximos: 4,9 millones de visitantes en 2025, el centenario de 2026 y la Torre de Jesucristo recién terminada.',
      'La competencia fuerte son libros de fotos de editoriales grandes (TASCHEN 4,8★) o ensayos sin imágenes; casi todos son anteriores a 2025.',
      'Las quejas se repiten: libros solo de texto, desordenados, demasiado teológicos o que dan por sabida la obra de Gaudí.',
      'Los fotolibros autoeditados de 2025-2026 que se revisaron no tienen valoraciones visibles: entrar con otro libro de fotos es la peor opción.'
    ]
  },

  niches: [
    {
      id: 'guia-lectura', name: 'Guía visual para «leer» la Sagrada Família', verdict: 'recomendado',
      pitch: 'Qué mirar en cada fachada, en el interior y en las torres, y qué significa, con diagramas anotados. Para antes y después de la visita.',
      demand: 'alta', competition: 'media', fit: 'alta',
      evidence: [
        { text: '4.877.567 visitantes en 2025; EE. UU. es el primer país de origen (más del 15 %).', source: 'https://www.infobae.com/espana/viajes/2026/03/24/la-sagrada-familia-rompe-records-en-2025-con-casi-5-millones-de-visitantes-y-enamora-al-viajero-estadounidense/' },
        { text: 'Queja recurrente: «Difícil de seguir si no has estado en Barcelona».', asin: '0060935634' },
        { text: 'Lo más elogiado de TASCHEN: «Hundreds of photos, plans and illustrations».', asin: '3836566192' }
      ],
      risks: ['Las guías de viaje generales (Rick Steves 2026, DK Top 10) ya cubren la visita básica.', 'Ya hay alguna guía autoeditada de la basílica («Sagrada Família Complete Guide»): revisa sus reseñas antes de decidir.', 'Necesitas imágenes propias o con licencia.', 'Los datos prácticos cambian: hay que actualizar.'],
      themes: ['visita', 'planos', 'fotos', 'organizacion']
    },
    {
      id: 'explicada-2026', name: 'La Sagrada Família explicada, edición 2026', verdict: 'recomendado',
      pitch: 'Arquitectura, símbolos e historia en un solo libro, puesto al día con la torre de Jesucristo, el récord de altura y lo que falta por construir.',
      demand: 'alta', competition: 'media', fit: 'alta',
      evidence: [
        { text: '7 de los 8 libros son anteriores a la torre de Jesucristo (2026) y a la declaración de Gaudí como Venerable (2025).' },
        { text: 'Queja a Curti: «la obsesión por la religión y no por la arquitectura me decepcionó».', asin: '8484788946' },
        { text: 'Queja a van Hensbergen: «ni un diagrama, ni una foto, ni un dibujo».', asin: '1632867818' }
      ],
      risks: ['Se solapa con la guía visual: pueden ser el mismo libro.', 'Van Hensbergen y Curti tienen autoridad reconocida.'],
      themes: ['actualidad', 'arquitectura', 'simbolismo', 'historia']
    },
    {
      id: 'geometria', name: 'La geometría de Gaudí para curiosos', verdict: 'posible',
      pitch: 'Cómo diseñaba con cadenas, luz y formas de la naturaleza (catenarias, hiperboloides, columnas arbóreas), explicado con dibujos sencillos.',
      demand: 'media', competition: 'baja', fit: 'media',
      evidence: [
        { text: '«Su foco en la luz ignora la gravedad, cuyo manejo fue el genio estructural de Gaudí.»', asin: '8484788946' },
        { text: 'El único libro técnico (Riera Ojeda y otros) se dirige a profesionales.' }
      ],
      risks: ['Público más pequeño.', 'Exige dibujos muy claros y buena documentación.'],
      themes: ['arquitectura', 'planos']
    },
    {
      id: 'espiritual', name: 'Gaudí, el arquitecto de Dios: fe y símbolos', verdict: 'posible',
      pitch: 'La fe de Gaudí, la catequesis en piedra de las fachadas y su camino a los altares, para lectores creyentes y peregrinos.',
      demand: 'media', competition: 'media', fit: 'media',
      evidence: [
        { text: 'Venerable desde abril de 2025; un posible milagro en estudio en 2026.', source: 'https://www.vaticannews.va/en/vatican-city/news/2025-04/antoni-gaudi-gods-architect-declared-venerable.html' },
        { text: 'León XIV bendijo la torre de Jesucristo el 10 de junio de 2026.' },
        { text: 'Hay un biopic anunciado de Alejandro Monteverde, director con mucho público católico en EE. UU.' }
      ],
      risks: ['La demanda depende de noticias (beatificación, película) con fecha incierta.', 'Los dos títulos contemplativos de Pandya no tienen valoraciones visibles.'],
      themes: ['simbolismo', 'gaudi_persona']
    },
    {
      id: 'biografia-breve', name: 'Gaudí en 100 páginas (1852-1926-2026)', verdict: 'posible',
      pitch: 'Biografía breve, amena y actualizada, con la obra y el legado hasta hoy.',
      demand: 'media', competition: 'alta', fit: 'media',
      evidence: [
        { text: 'En español hay muchas biografías nuevas del centenario (Taurus, Arpa, Triangle).' },
        { text: 'En inglés, la biografía de referencia es de 2003 y la crítica la ve densa: «a substantial but lumpy stew».', asin: '0060935634' }
      ],
      risks: ['Solo tiene sentido en inglés.', 'Compite con la autoridad de van Hensbergen.'],
      themes: ['historia', 'gaudi_persona', 'redaccion']
    },
    {
      id: 'familias', name: 'La Sagrada Família para niños que la van a visitar', verdict: 'posible',
      pitch: 'Libro de actividades de busca y encuentra para hacer durante la visita en familia (7-12 años).',
      demand: 'media', competition: 'media', fit: 'baja',
      evidence: [
        { text: 'En español ya hay pop-up (Combel) y busca y encuentra (Beascoa) del centenario; en inglés, un álbum de Susan B. Katz.' }
      ],
      risks: ['Exige ilustración profesional a color.', 'Las reseñas de la muestra no hablan de niños: es un nicho distinto que habría que validar aparte.'],
      themes: ['ninos', 'visita']
    },
    {
      id: 'fotolibro', name: 'Fotolibro o libro de mesa', verdict: 'evitar',
      pitch: 'Un libro de fotos grandes de la basílica.',
      demand: 'alta', competition: 'muy alta', fit: 'baja',
      evidence: [
        { text: 'TASCHEN ofrece 512 páginas a color por unos 30 US$ y 4,8★.', asin: '3836566192' },
        { text: 'Proliferan fotolibros autoeditados (40 fotos, sin texto, imágenes «hiperrealistas») sin valoraciones visibles.' }
      ],
      risks: ['Imprimir a color en KDP encarece mucho el ejemplar.', 'Derechos de imagen.'],
      themes: ['fotos', 'impresion', 'formato']
    },
    {
      id: 'colorear', name: 'Libro de colorear de Gaudí', verdict: 'evitar',
      pitch: 'Mosaicos y fachadas para colorear.',
      demand: 'media', competition: 'alta', fit: 'baja',
      evidence: [
        { text: 'Varios libros de colorear autoeditados en 2025-2026, alguno firmado por un «AI studio», sin valoraciones visibles.' },
        { text: 'Editoriales como Prestel o Viuleta ya tienen el suyo.' }
      ],
      risks: ['Contenido fácil de copiar y de baja percepción de valor.'],
      themes: []
    }
  ],

  avatars: [
    {
      id: 'viajero', name: 'El viajero que prepara la visita', primary: true,
      profile: 'Adulto que prepara un viaje a Barcelona, sobre todo de EE. UU. (primer país de origen de los visitantes) y otros países de habla inglesa. Compra en las semanas previas, a menudo al reservar las entradas; lee en papel o en tableta.',
      wants: ['Saber qué va a ver y en qué fijarse', 'Símbolos explicados en sencillo', 'Planos y un recorrido claro', 'Datos al día (torre de 2026, entradas)'],
      frustrations: ['Libros solo de texto', 'Prosa densa que da cosas por sabidas', 'Información desfasada'],
      triggers: ['Reservar las entradas', 'Un viaje o crucero por el Mediterráneo', 'Noticias del centenario'],
      promise: 'Llega sabiendo qué mirar y vuelve entendiendo lo que has visto.',
      evidence: ['EE. UU. es el primer país de origen de los visitantes (más del 15 %).', '«Difícil de seguir si no has estado en Barcelona» (lectores de la biografía).'],
      themes: ['visita', 'organizacion', 'planos']
    },
    {
      id: 'recuerdo', name: 'El que vuelve y quiere revivirlo (o regalarlo)',
      profile: 'Ya ha visitado la basílica; busca un recuerdo o un regalo para alguien que la admira.',
      wants: ['Fotos espectaculares', 'Buen papel y buena encuadernación', 'Un tamaño agradable'],
      frustrations: ['Libro pequeño', 'Páginas que marcan huellas', 'Mala impresión'],
      triggers: ['La vuelta del viaje', 'Cumpleaños y Navidad'],
      promise: 'Tu visita, para tenerla en la mesa.',
      evidence: ['«Absolutely stunning coffee table book» (TASCHEN).', 'Curti se regala a familiares que no pudieron ir.', 'Es terreno de TASCHEN, Triangle y Dosde: difícil de igualar en KDP.'],
      themes: ['fotos', 'impresion', 'regalo', 'formato']
    },
    {
      id: 'arquitectura', name: 'El curioso de la arquitectura y la ingeniería',
      profile: 'Estudiantes, ingenieros, arquitectos aficionados y amantes del diseño.',
      wants: ['Cómo se sostiene: estructura y geometría', 'Maquetas, planos y dibujos', 'Cómo se construye hoy (piedra, 3D, tecnología)'],
      frustrations: ['Demasiada teología', 'Ni un diagrama', '«Su foco en la luz ignora la gravedad»'],
      triggers: ['Visita a Barcelona', 'Estudios', 'Documentales'],
      promise: 'Entiende por qué la Sagrada Família se sostiene y por qué no se parece a nada.',
      evidence: ['Queja a Curti sobre la gravedad.', 'Queja a van Hensbergen: «not a diagram, photo, or line drawing anywhere».'],
      themes: ['arquitectura', 'planos']
    },
    {
      id: 'fe', name: 'El lector creyente o peregrino',
      profile: 'Católico practicante, a menudo de EE. UU. o Latinoamérica; viaja en peregrinación o sigue la causa de Gaudí.',
      wants: ['El significado de cada fachada', 'La fe de Gaudí', 'La visita del papa y la beatificación'],
      frustrations: ['Enfoques solo técnicos o que minimizan la fe', 'Lecturas «nacionalistas» del templo'],
      triggers: ['Noticias de la beatificación', 'El futuro biopic de Monteverde', 'Peregrinaciones'],
      promise: 'Reza con la Sagrada Família: cada piedra es una catequesis.',
      evidence: ['Venerable desde 2025; misa del papa en el templo el 10-06-2026.', 'A otros lectores la teología de Curti les sobra: define bien para quién escribes.'],
      themes: ['simbolismo', 'gaudi_persona']
    },
    {
      id: 'biografia', name: 'El lector de biografías e historia',
      profile: 'Lector habitual de no ficción que quiere conocer al hombre y su época.',
      wants: ['Un relato ameno', 'La Barcelona modernista', 'El Gaudí humano'],
      frustrations: ['Estilo inconexo', 'Que dé por sabida la obra', 'Fotos en blanco y negro lejos del texto'],
      triggers: ['El centenario', 'Listas de «mejores libros sobre Gaudí»'],
      promise: 'Conoce a Gaudí en una tarde.',
      evidence: ['Kirkus: «ha perdido de vista a su público».', 'Goodreads puntúa la biografía con 3,5.'],
      themes: ['historia', 'gaudi_persona', 'redaccion']
    }
  ],

  approaches: [
    {
      id: 'guia-visual', name: 'Guía visual para leer la Sagrada Família (edición 2026)', recommended: true,
      idea: 'Recorrido por zonas (Natividad, Pasión, Gloria, bosque interior, torres, cripta y museo) con diagramas anotados, «qué mirar», símbolos e historia en píldoras.',
      format: 'Tapa blanda 8 × 10 in, 120-160 páginas a color + Kindle en color',
      price: '16,99-22,99 US$ en papel · 5,99-7,99 US$ en Kindle',
      pros: ['Responde a las quejas más repetidas', 'Aprovecha la demanda turística', 'Fácil de actualizar cada año'],
      cons: ['El color encarece la impresión en KDP', 'Necesita imágenes propias o con licencia'],
      differentiation: 'Actualizada a 2026, diagramas propios y equilibrio entre cómo se sostiene y qué significa.',
      avatars: ['viajero', 'arquitectura', 'recuerdo'],
      scores: { demanda: 5, competencia: 4, encaje: 5, coste: 2 }
    },
    {
      id: 'explicada', name: 'La Sagrada Família explicada: arquitectura, símbolos e historia',
      idea: 'Ensayo divulgativo con diagramas de línea en blanco y negro (imprimen bien y abaratan) y un cuadernillo de fotos.',
      format: 'Tapa blanda 6 × 9 in, 180-220 páginas en blanco y negro + Kindle',
      price: '14,99-18,99 US$ en papel · 4,99-6,99 US$ en Kindle',
      pros: ['Coste de impresión bajo', 'Público amplio', 'Menos dependencia de fotos'],
      cons: ['Menos atractivo en la miniatura de Amazon', 'Compite de frente con van Hensbergen y Curti'],
      differentiation: 'Claridad para no expertos, diagramas junto al texto y datos de 2026.',
      avatars: ['viajero', 'biografia', 'arquitectura'],
      scores: { demanda: 4, competencia: 3, encaje: 4, coste: 5 }
    },
    {
      id: 'geometria', name: 'La geometría secreta de Gaudí',
      idea: 'Cómo diseñaba con cadenas colgantes, espejos, luz y formas de la naturaleza, explicado con dibujos paso a paso.',
      format: 'Tapa blanda 7 × 10 in, 100-140 páginas, dibujos en blanco y negro',
      price: '14,99-17,99 US$ · Kindle 4,99 US$',
      pros: ['Competencia baja', 'Contenido que no caduca'],
      cons: ['Público más pequeño', 'Exige mucha claridad técnica'],
      differentiation: 'El «cómo se sostiene» que los demás libros no explican.',
      avatars: ['arquitectura'],
      scores: { demanda: 3, competencia: 5, encaje: 4, coste: 4 }
    },
    {
      id: 'gaudi-100', name: 'Gaudí en 100 páginas (1852-1926-2026)',
      idea: 'Biografía breve con línea de tiempo, las 14 obras clave y el legado hasta la torre de 2026.',
      format: 'Tapa blanda 5,5 × 8,5 in, 100-120 páginas + Kindle',
      price: '12,99-14,99 US$ · Kindle 3,99-4,99 US$',
      pros: ['Barato de producir', 'Rápido de escribir'],
      cons: ['Mucha competencia en español', 'Menos diferencial'],
      differentiation: 'Ameno, breve y al día.',
      avatars: ['biografia', 'viajero'],
      scores: { demanda: 3, competencia: 2, encaje: 3, coste: 5 }
    },
    {
      id: 'fe-en-piedra', name: 'Catequesis en piedra: la fe de Gaudí en la Sagrada Família',
      idea: 'Lectura espiritual de las fachadas y del interior, la vida de fe de Gaudí y su causa de beatificación.',
      format: 'Tapa blanda 6 × 9 in, 140-180 páginas + Kindle',
      price: '14,99-17,99 US$ · Kindle 4,99 US$',
      pros: ['Público fiel y organizado (parroquias, peregrinaciones)', 'Picos de demanda previsibles'],
      cons: ['Depende de noticias con fecha incierta', 'Público distinto al del resto de enfoques'],
      differentiation: 'Actualizado con la visita del papa (2026) y el estado de la causa.',
      avatars: ['fe'],
      scores: { demanda: 3, competencia: 4, encaje: 3, coste: 4 }
    }
  ],

  enter: [
    {
      title: 'Escribe para quien va a visitarla o acaba de hacerlo, primero en inglés',
      why: 'La basílica recibió 4,9 millones de visitantes en 2025 y EE. UU. es el primer país de origen. En inglés casi no hay novedades de editoriales tradicionales, mientras que el mercado en español está lleno de títulos del centenario.',
      how: 'Publica en inglés en amazon.com y prepara después la edición en español para el público hispano de EE. UU. y Latinoamérica.',
      evidence: [{ text: 'Récord de 4.877.567 visitantes en 2025.', source: 'https://www.hosteltur.com/175053_la-sagrada-familia-marca-un-nuevo-record-casi-49-millones-de-visitantes-en-2025.html' }],
      themes: ['visita']
    },
    {
      title: 'Hazlo visual y pon cada imagen junto a su texto',
      why: 'La queja más repetida son los libros solo de texto («a words-only tour», «not a diagram, photo, or line drawing anywhere») y las fotos lejos del texto. Lo más elogiado son las fotos y los planos.',
      how: 'Diagramas anotados propios, planos simplificados, fotos con licencia y pies de foto que expliquen qué mirar.',
      evidence: [{ text: 'NCR tituló su reseña de van Hensbergen «words-only tour».', asin: '1632867818' }, { text: '«Hundreds of photos, plans and illustrations» es lo que más se elogia de TASCHEN.', asin: '3836566192' }],
      themes: ['fotos', 'planos']
    },
    {
      title: 'Actualízalo a 2026 y ponle fecha',
      why: 'Siete de los ocho libros son anteriores a la torre de Jesucristo, al récord de altura y a la declaración de Venerable. Un libro al día es una ventaja inmediata frente a todos ellos.',
      how: '«Actualizado a 2026» en el subtítulo, capítulo sobre lo que falta por construir (fachada de la Gloria, ≈ 2036) y compromiso de revisión anual.',
      evidence: [{ text: 'Torre de Jesucristo terminada por fuera el 20-02-2026 (172,5 m).', source: 'https://www.vaticannews.va/en/church/news/2026-02/basilica-sagrada-familia-cross-completed-tower-of-jesus-christ.html' }],
      themes: ['actualidad']
    },
    {
      title: 'Equilibra arquitectura y fe, y dilo en el subtítulo',
      why: 'A Curti le reprochan «la obsesión por la religión y no por la arquitectura» y que «ignora la gravedad»; a la biografía, que el foco católico y nacionalista no explica lo fantástico de la obra.',
      how: 'Para cada espacio, dos bloques fijos: «cómo se sostiene» y «qué significa».',
      evidence: [{ text: '«Her focus on light ignores gravity…»', asin: '8484788946' }],
      themes: ['arquitectura', 'simbolismo']
    },
    {
      title: 'Escribe para quien no sabe nada, sin perder rigor',
      why: 'La crítica dice que van Hensbergen escribe como alguien que «ha perdido de vista a su público», y que su libro del templo es «desordenado y confuso».',
      how: 'Estructura por recorrido, glosario, línea de tiempo, resumen al final de cada capítulo y fuentes al final.',
      evidence: [{ text: 'Kirkus sobre la biografía.', asin: '0060935634' }, { text: 'NCR: «somewhat disorganized and confusing».', asin: '1632867818' }],
      themes: ['redaccion', 'organizacion']
    },
    {
      title: 'Precio intermedio y formato manejable',
      why: 'El libro de van Hensbergen costaba 27 US$ sin una sola imagen («caro para menos de 200 páginas»). TASCHEN marca el listón de valor con 96 páginas por 20 US$.',
      how: 'Entre 16,99 y 22,99 US$ en papel según el color, y Kindle entre 5,99 y 7,99 US$: en Kindle el color no encarece.',
      evidence: [{ text: '«expensive ($36/hardback) for fewer than 200 pp.»', asin: '1632867818' }],
      themes: ['precio', 'formato']
    },
    {
      title: 'Cuida la ficha de Amazon: título claro y subtítulo con palabras clave',
      why: 'HarperCollins cambió el subtítulo de la biografía por uno lleno de palabras clave. La edición de lujo de Dosde aparece en Amazon.com como «ED. LUJO - SAGRADA FAMILIA - (INGLÉS)», una ficha que no ayuda a encontrarla.',
      how: 'Subtítulo con Sagrada Familia, Gaudí, guide, architecture, symbols y 2026; contenido A+ con diagramas y un «Echar un vistazo» cuidado.',
      evidence: [{ text: 'Subtítulo actual de la biografía en Amazon.com.', asin: '0060935634' }, { text: 'Ficha de Dosde en Amazon.com.', asin: '8491031987' }],
      themes: []
    },
    {
      title: 'Lanza con el calendario a favor',
      why: 'Año Gaudí hasta finales de 2026, congreso internacional del 22 al 24 de octubre, «Codi Gaudí» hasta enero de 2027, temporada turística de primavera y noticias posibles de la beatificación y del biopic.',
      how: 'Publica antes de la primavera de 2027 y deja preparada una actualización para cuando haya noticias de la beatificación.',
      evidence: [{ text: 'Programa del Año Gaudí 2026.', source: 'https://patrimoni.gencat.cat/ca/article/comenca-lany-gaudi-commemorar-el-centenari-de-la-mort-de-larquitecte' }],
      themes: []
    }
  ],

  avoid: [
    {
      title: 'Un fotolibro de poco contenido o con imágenes generadas por IA', severity: 'nunca',
      why: 'En 2025-2026 han aparecido más de una decena de fotolibros y libros de colorear autoeditados (40 fotos, sin texto, imágenes «hiperrealistas»); los que se revisaron no tienen valoraciones visibles. Compiten con TASCHEN (4,8★) y con editoriales que venden en la tienda del templo.',
      evidence: [{ text: 'Competencia ampliada: fotolibros autoeditados de 2025-2026.' }],
      themes: ['fotos']
    },
    {
      title: 'Copiar o imitar títulos de libros existentes', severity: 'nunca',
      why: 'Un autor autoeditado sacó «SAGRADA FAMÍLIA The Cathedral of Light», casi igual que el libro de Triangle. Confunde al comprador, parece una imitación y te expone a reclamaciones.',
      evidence: [{ text: 'Segundo título de Pandya.', asin: 'B0GF2QG1T9' }],
      themes: []
    },
    {
      title: 'Decir que la Sagrada Família ya está terminada', severity: 'nunca',
      why: 'En 2026 se terminó la torre central, no el templo: falta la fachada de la Gloria y la previsión oficial es de un máximo de 10 años. Un error así se paga con reseñas de 1★.',
      evidence: [{ text: 'Previsión de la Junta Constructora (22-09-2026).', source: 'https://www.religiondigital.org/arte/sagrada-familia-ve-avanzadas-negociaciones-fachada-gloria-centenario-gaudi_1_1467207.html' }],
      themes: ['actualidad']
    },
    {
      title: 'Usar fotos sin licencia', severity: 'nunca',
      why: 'Las fotos de terceros sin permiso acaban en reclamaciones y en la retirada del libro. Para fotos del interior, consulta antes las condiciones de uso comercial del templo.',
      evidence: [],
      themes: []
    },
    {
      title: 'Un libro solo de texto sobre arquitectura', severity: 'desaconsejado',
      why: '«Architecture is a visual art, and anything written on the subject is expected to be profusely illustrated.» Es la queja central contra el libro del templo de van Hensbergen (3,56 en Goodreads).',
      evidence: [{ text: 'Lectores de Goodreads.', asin: '1632867818' }],
      themes: ['fotos', 'planos']
    },
    {
      title: 'Competir con TASCHEN en obra completa o libro de mesa', severity: 'desaconsejado',
      why: 'TASCHEN vende unas 500 páginas a color por unos 30 US$. Con los costes de impresión a color de KDP no se puede igualar.',
      evidence: [{ text: '4,8★ y unas 354 valoraciones.', asin: '3836566192' }],
      themes: ['precio', 'impresion']
    },
    {
      title: 'Prometer arquitectura y entregar teología', severity: 'desaconsejado',
      why: 'Si el enfoque es espiritual, dilo claro en la portada; si es arquitectónico, no conviertas el libro en un sermón. Es lo que más se reprocha a Curti.',
      evidence: [{ text: '«the obsession with religion, not architecture was very disappointing»', asin: '8484788946' }],
      themes: ['simbolismo', 'arquitectura']
    },
    {
      title: 'Escribir para expertos', severity: 'desaconsejado',
      why: 'La crítica penaliza el estilo que da por sabida la obra de Gaudí; tu lector principal es un visitante, no un historiador.',
      evidence: [{ text: 'Kirkus sobre la biografía.', asin: '0060935634' }],
      themes: ['redaccion', 'organizacion']
    },
    {
      title: 'Entrar en español con una biografía o un infantil del centenario', severity: 'desaconsejado',
      why: 'En 2026 han salido biografías de Taurus, Arpa y Triangle, un cómic, un pop-up y un busca y encuentra de editoriales grandes.',
      evidence: [{ text: 'Novedades editoriales 2025-2026.', source: 'https://www.vaticannews.va/es/iglesia/news/2026-06/gaudi-un-libro-y-una-obra-para-el-centenario.html' }],
      themes: []
    },
    {
      title: 'Libros de colorear genéricos', severity: 'desaconsejado',
      why: 'Está lleno de libros de colorear autoeditados de baja calidad, y las editoriales tradicionales ya tienen los suyos.',
      evidence: [{ text: 'Competencia ampliada.' }],
      themes: []
    }
  ],

  strengths: [
    { theme: 'fotos', title: 'Fotografía abundante y de calidad', text: 'Es lo que más se elogia: «Stunning photography», «superb photography», «the photos are absolutely fantastic». Es el mínimo exigible, no un diferencial.', books: ['3836566192', '8484788946', '8491031987', '3836560283'] },
    { theme: 'planos', title: 'Planos, dibujos e ilustraciones 3D', text: '«Hundreds of photos, plans and illustrations», «nice photos and floor plans», las ilustraciones 3D de Dosde.', books: ['3836566192', '3836560283', '8491031987'] },
    { theme: 'profundidad', title: 'Detalle y rigor', text: '«Great for those who want to really go into the details», «more than thorough», «meticulously researched».', books: ['8484788946', '1632867818', '0060935634'] },
    { theme: 'redaccion', title: 'Prosa viva que engancha', text: '«Rich, poetic prose», «a spellbinding narrative», «engrossing, vivid». La narración gusta cuando está ordenada.', books: ['1632867818', '0060935634', 'B01FN37I44'] },
    { theme: 'precio', title: 'Mucho libro por el precio', text: '«Amazing value for money» (TASCHEN). El lector compara páginas, imágenes y precio.', books: ['3836566192'] },
    { theme: 'impresion', title: 'Edición robusta y agradable', text: '«Sturdy, beautiful thick pages», «high quality binding».', books: ['3836566192'] },
    { theme: 'formato', title: 'Lo esencial en pocas páginas', text: '«Explica en menos de 100 páginas todo lo básico que hay que saber sobre Gaudí.» La brevedad bien hecha se agradece.', books: ['3836560283'] },
    { theme: 'regalo', title: 'Funciona como regalo', text: 'Se regala a quien no pudo ir o a quien vuelve de Barcelona.', books: ['8484788946'] }
  ],

  weaknesses: [
    { theme: 'fotos', title: 'Sin imágenes, o con imágenes lejos del texto', text: '«Not a diagram, photo, or line drawing anywhere», «a words-only tour», fotos en blanco y negro separadas del edificio del que se habla.', books: ['1632867818', '0060935634', 'B01FN37I44'], opportunity: 'Cada página con su imagen o diagrama, pegado al texto.' },
    { theme: 'simbolismo', title: 'Demasiada teología para quien quiere arquitectura', text: '«The obsession with religion, not architecture was very disappointing», repite la teología de la luz.', books: ['8484788946'], opportunity: 'Separa y equilibra: cómo se sostiene y qué significa.' },
    { theme: 'arquitectura', title: 'No explican cómo se sostiene', text: '«Her focus on light ignores gravity, the handling of which was Gaudi\'s structural genius.»', books: ['8484788946'], opportunity: 'Explica la estructura (catenarias, columnas arbóreas, bóvedas) con dibujos sencillos.' },
    { theme: 'organizacion', title: 'Desordenados o que dan por sabida la obra', text: '«Somewhat disorganized and confusing», «disjointed, gnomic style», «difícil de seguir si no has estado».', books: ['1632867818', '0060935634'], opportunity: 'Estructura por recorrido, glosario, línea de tiempo y resúmenes.' },
    { theme: 'precio', title: 'Caros para lo que ofrecen', text: '«Expensive ($36/hardback) for fewer than 200 pp.»', books: ['1632867818'], opportunity: 'Precio intermedio con mucho contenido visual.' },
    { theme: 'formato', title: 'Tamaño pequeño y páginas que marcan huellas', text: '«A little on the small side», «the pages are absolute fingerprint magnets».', books: ['3836566192'], opportunity: 'Formato grande (8 × 10 in) y acabado mate.' },
    { theme: 'actualidad', title: 'Información desfasada', text: 'Ninguno recoge la torre de Jesucristo terminada (2026), el récord de altura (2025) ni la declaración de Venerable (2025).', books: ['3836566192', '3836560283', '1632867818', '0060935634', '8484788946', '8491031987', 'B01FN37I44'], opportunity: '«Actualizado a 2026» y revisión anual.' },
    { theme: 'envio', title: 'Detalles físicos', text: 'La pegatina de la portada dejó residuo (Curti).', books: ['8484788946'], opportunity: 'Menor en KDP: la impresión bajo demanda no lleva pegatinas.' }
  ],

  positioning: {
    titles: [
      { lang: 'EN', title: 'How to Read the Sagrada Família', subtitle: 'A Visual Guide to Gaudí\'s Basilica: Architecture, Symbols and History (Updated for 2026)', note: 'Recomendado: promete un método («cómo leer»), dice que es visual y que está al día.' },
      { lang: 'EN', title: 'The Sagrada Família Explained', subtitle: 'Gaudí\'s Masterpiece Stone by Stone, Updated for the Completion of the Tower of Jesus Christ', note: 'Más de ensayo; aprovecha la noticia de 2026.' },
      { lang: 'EN', title: 'Gaudí\'s Sagrada Família Made Simple', subtitle: 'What to See, What It Means and How It Stands (2026 Edition)', note: 'Para el visitante sin conocimientos; recoge las tres promesas.' },
      { lang: 'ES', title: 'Cómo leer la Sagrada Família', subtitle: 'Guía visual de la basílica de Gaudí: arquitectura, símbolos e historia (edición 2026)', note: 'Edición española del enfoque recomendado.' },
      { lang: 'ES', title: 'La Sagrada Família explicada', subtitle: 'La obra de Gaudí piedra a piedra, actualizada a 2026', note: 'Alternativa de ensayo.' }
    ],
    keywords: {
      EN: ['sagrada familia book', 'gaudi architecture guide', 'sagrada familia symbolism explained', 'barcelona travel gift', 'gaudi basilica history', 'tower of jesus christ 2026', 'how to visit sagrada familia'],
      ES: ['libro sagrada familia', 'guía sagrada familia barcelona', 'arquitectura de gaudí', 'simbolismo sagrada familia', 'regalo viaje barcelona', 'torre de jesucristo 2026', 'historia de la sagrada familia']
    },
    categories: [
      'Arte, cine y fotografía › Arquitectura › Edificios religiosos',
      'Viajes › Europa › España › Barcelona',
      'Arte, cine y fotografía › Arquitectura › Historia',
      'Religión › Iglesia cristiana › Historia'
    ],
    categoriesNote: 'Nombres orientativos del árbol de Amazon.com; elige los equivalentes exactos al publicar en KDP.',
    price: { print: '16,99-22,99 US$', kindle: '5,99-7,99 US$', note: 'Por debajo de van Hensbergen (27 US$) y cerca de TASCHEN Basic Art (20 US$), con más imágenes que el primero y más foco en la Sagrada Família que el segundo.' },
    format: { trim: '8 × 10 in (o 7 × 10 in)', pages: '120-160', interior: 'Color estándar, o blanco y negro con diagramas de línea', ebook: 'Kindle en color con las mismas imágenes' },
    description: {
      EN: 'The Sagrada Família is finally reaching the sky: in 2026 its central Tower of Jesus Christ was completed at 172.5 metres, and it is now the tallest church in the world. This visual guide shows you what to look for on each façade, inside the stone forest and up the towers, what every symbol means, and how Gaudí made it all stand. Annotated diagrams, simple plans and a clear route for before and after your visit, updated to 2026.',
      ES: 'La Sagrada Família por fin toca el cielo: en 2026 se terminó la torre de Jesucristo, de 172,5 metros, y el templo es ya la iglesia más alta del mundo. Esta guía visual te enseña qué mirar en cada fachada, en el bosque de piedra y en las torres, qué significa cada símbolo y cómo consiguió Gaudí que todo se sostenga. Diagramas anotados, planos sencillos y un recorrido claro para antes y después de la visita, actualizado a 2026.'
    }
  },

  plan: [
    { phase: 'Validar', when: 'Esta semana', steps: [
      'Extraer las reseñas completas de los 8 libros con el extractor e importarlas en el panel.',
      'Revisar en Temas y en Fortalezas y debilidades si las quejas confirman el enfoque.',
      'Anotar el ranking de ventas (BSR) y el precio real de cada libro.',
      'Buscar en Amazon las palabras clave propuestas y ver qué sale en la primera página.'
    ] },
    { phase: 'Definir', when: 'Semanas 1-2', steps: [
      'Elegir enfoque y avatar principal.',
      'Índice por recorrido: fachadas, interior, torres, cripta, museo, lo que falta.',
      'Lista de diagramas y plan de imágenes con sus licencias.',
      'Decidir color o blanco y negro con la calculadora de regalías.'
    ] },
    { phase: 'Escribir y diseñar', when: 'Semanas 3-10', steps: [
      'Escribir con dos bloques fijos por espacio: cómo se sostiene y qué significa.',
      'Diseñar diagramas anotados propios.',
      'Revisión de datos a fecha de publicación (torres, beatificación, entradas).',
      'Lectores beta: un visitante sin conocimientos y un aficionado a la arquitectura.'
    ] },
    { phase: 'Publicar', when: 'Antes de la primavera de 2027', steps: [
      'Ficha: título, subtítulo con palabras clave, 7 palabras clave y categorías.',
      'Contenido A+ con diagramas y «Echar un vistazo» cuidado.',
      'Papel y Kindle a la vez; declaración de uso de IA si procede.'
    ] },
    { phase: 'Lanzar y mantener', when: 'Continuo', steps: [
      'Primeras reseñas honestas con lectores anticipados.',
      'Anuncios de Amazon sobre los libros de la competencia y sus palabras clave.',
      'Actualización cuando haya noticias de la beatificación o de la fachada de la Gloria.',
      'Edición en español en una segunda fase.'
    ] }
  ],

  proposals: {
    homeData: [
      { text: 'Ranking de ventas (BSR) de cada libro y su evolución semanal.', status: 'con el extractor' },
      { text: 'Estimación de ventas mensuales a partir del BSR.', status: 'propuesta' },
      { text: 'Volumen de búsqueda de palabras clave en Amazon (Publisher Rocket, Helium 10 o similar).', status: 'propuesta' },
      { text: 'Tendencia de búsquedas de «Sagrada Familia» y «Gaudí» en Google Trends.', status: 'propuesta' },
      { text: 'Calendario de eventos que mueven la demanda.', status: 'incluido' },
      { text: 'Precio por página y coste de impresión en KDP.', status: 'incluido' },
      { text: 'Fecha de la última reseña de cada libro (¿el nicho sigue vivo?).', status: 'con las reseñas' },
      { text: 'Porcentaje de reseñas críticas por libro y por tema.', status: 'con las reseñas' }
    ],
    links: [
      { text: 'Ficha y página de reseñas de cada libro en Amazon.', status: 'incluido' },
      { text: 'Calculadora de regalías orientativa (en Título y posicionamiento); para las cifras exactas, la calculadora de KDP.', url: 'https://kdp.amazon.com/', linkText: 'KDP ↗', status: 'incluido' },
      { text: 'Normas de contenido de KDP, incluida la declaración de contenido generado con IA.', url: 'https://kdp.amazon.com/', linkText: 'KDP ↗', status: 'incluido' },
      { text: 'Búsqueda en Amazon con cada palabra clave propuesta.', status: 'incluido' }
    ],
    tools: [
      { text: 'Comparador de títulos y subtítulos (prueba con lectores).', status: 'propuesta' },
      { text: 'Alerta de nuevos competidores en el nicho.', status: 'propuesta' },
      { text: 'Exportar el informe a Word o PDF.', status: 'propuesta' },
      { text: 'Reutilizar el panel con otro nicho: cambiar data/enlaces.txt y volver a extraer.', status: 'incluido' }
    ]
  },

  bookNotes: {
    '3836566192': { learn: 'Cantidad de fotos y planos, buena encuadernación y un precio por página imbatible.', beat: 'No es una guía: abarca toda la obra, no enseña qué mirar y es anterior a 2021.' },
    '3836560283': { learn: 'Todo lo básico en menos de 100 páginas por 20 US$.', beat: 'Resume toda la obra y dedica poco a la Sagrada Família; edición de 2015.' },
    '1632867818': { learn: 'Una historia del templo bien contada y con autoridad.', beat: 'Ni una imagen, orden confuso, caro para lo que es y anterior a 2021.' },
    '0060935634': { learn: 'La biografía de referencia, muy documentada.', beat: 'Densa, da por sabida la obra y sus fotos están lejos del texto; de 2003.' },
    '8484788946': { learn: 'Una mirada propia (la luz), fotos de Pere Vivas y venta en la tienda del templo.', beat: 'Demasiada teología para quien busca arquitectura y no explica la estructura.' },
    '8491031987': { learn: 'Ilustraciones 3D y texto en píldoras.', beat: 'Ficha de Amazon.com muy pobre y sin valoraciones visibles allí.' },
    'B01FN37I44': { learn: 'La opción narrativa en español en Kindle.', beat: 'Sin imágenes, como la versión inglesa, y de 2016.' },
    'B0GF2QG1T9': { learn: 'Ángulo contemplativo, breve y barato de producir.', beat: '76 páginas, sin valoraciones ni autoridad visible; su autor imita títulos ajenos.' }
  }
};
