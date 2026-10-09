"""Opciones de los desplegables.

Cada fila: (etiqueta en espanol que ve el usuario, fragmento en ingles para el prompt de la IA, ...).
El valor "-" en el fragmento significa "no mencionar en el prompt" (elemento que no aplica).
"""

ESTANCIA = [
    ("Salón", "living room"),
    ("Salón-comedor", "open living and dining room"),
    ("Comedor", "dining room"),
    ("Cocina", "kitchen"),
    ("Cocina abierta al salón", "open-plan kitchen connected to the living room"),
    ("Baño", "bathroom"),
    ("Aseo", "small guest toilet"),
    ("Dormitorio principal", "master bedroom"),
    ("Dormitorio", "bedroom"),
    ("Dormitorio infantil", "children's bedroom"),
    ("Despacho / estudio", "home office"),
    ("Recibidor", "entrance hall"),
    ("Pasillo", "hallway"),
    ("Terraza / balcón", "terrace or balcony"),
    ("Galería / lavadero", "utility and laundry room"),
    ("Buhardilla / ático", "attic room under a sloped roof"),
    ("Local comercial", "commercial premises"),
    ("Piso completo (vista general)", "apartment"),
]

TIPO = [
    ("Reforma integral", "complete renovation of all finishes, fixtures, lighting and furniture"),
    ("Lavado de cara (pintura y decoración)", "cosmetic refresh: new paint, decoration and soft furnishings only"),
    ("Home staging (vender / alquilar)", "home staging to sell or rent: clean, bright, neutral and inviting"),
    ("Reforma de cocina", "kitchen renovation"),
    ("Reforma de baño", "bathroom renovation"),
    ("Cambio de suelos", "new flooring"),
    ("Amueblar piso vacío", "furnishing of the empty space"),
    ("Vaciar estancia", "removal of all furniture and clutter, leaving the space empty and clean"),
    ("Rehabilitación de época", "respectful restoration that recovers the original period features"),
]

ESTILO = [
    ("Nórdico", "Scandinavian: light woods, white and soft neutral tones, cozy textiles, simple functional furniture"),
    ("Moderno", "modern contemporary: clean lines, neutral palette, sleek finishes"),
    ("Minimalista", "minimalist: uncluttered, essential furniture, hidden storage, calm monochrome palette"),
    ("Industrial", "industrial: black metal, raw wood, concrete textures, exposed materials"),
    ("Mediterráneo", "Mediterranean: whitewashed walls, natural fibers, terracotta, warm wood and touches of blue"),
    ("Japandi", "Japandi: natural wood, earthy muted tones, low furniture, serene atmosphere"),
    ("Rústico moderno", "modern rustic: natural wood, stone and warm textures with modern comfort"),
    ("Clásico elegante", "classic elegant: moldings, refined furniture, symmetry and soft neutral colors"),
    ("Lujo contemporáneo", "contemporary luxury: marble, brass details, designer lighting, rich textures"),
    ("Boho", "bohemian: rattan, natural fibers, plants, warm earthy colors, layered textiles"),
    ("Mid-century", "mid-century modern: walnut wood, tapered legs, organic shapes, retro accent colors"),
    ("Modernista (Gaudí)", "Catalan Modernisme inspired by Antoni Gaudi: organic curves, hydraulic mosaic tiles, "
                          "trencadis accents, stained glass, wrought iron and natural motifs"),
    ("Costero", "coastal: airy whites, sand and soft blue tones, natural linen, light woods"),
    ("Neutro para vender", "neutral, bright and universally appealing, ideal for a property listing"),
]

INTENSIDAD = [
    ("Sutil", "Make subtle, refined changes that stay close to the original look."),
    ("Media", "Make clearly visible changes while keeping a realistic, coherent result."),
    ("Transformación total", "Make a complete transformation of finishes, colors and furniture "
                             "(but never of the architecture)."),
]

SUELO = [
    ("Mantener actual", "keep the existing floor exactly as it is"),
    ("Parquet de roble natural", "natural oak wood plank flooring"),
    ("Parquet en espiga", "herringbone oak parquet"),
    ("Tarima vinílica efecto madera", "wood-effect vinyl plank flooring"),
    ("Porcelánico gran formato gris", "large-format light grey porcelain tiles"),
    ("Porcelánico efecto mármol", "large-format marble-effect porcelain tiles"),
    ("Porcelánico efecto madera", "wood-effect porcelain tiles"),
    ("Microcemento", "seamless microcement floor in a soft neutral tone"),
    ("Baldosa hidráulica", "traditional patterned hydraulic cement tiles"),
    ("Terrazo", "terrazzo floor"),
    ("Barro cocido", "handmade terracotta tiles"),
    ("Moqueta", "wall-to-wall carpet in a neutral tone"),
    ("Restaurar el suelo actual", "the existing floor restored and polished, keeping its original pattern"),
]

PAREDES = [
    ("Mantener actual", "keep the existing wall finish"),
    ("Pintura lisa", "smooth painted walls"),
    ("Papel pintado", "elegant wallpaper"),
    ("Microcemento", "microcement wall finish"),
    ("Revestimiento de madera", "wood panel wall cladding"),
    ("Ladrillo visto", "exposed brick"),
    ("Azulejo / porcelánico", "wall tiles"),
    ("Zócalo de azulejo + pintura", "tiled wainscot with painted wall above"),
    ("Molduras (boiserie)", "classic wall moldings (boiserie)"),
    ("Estuco / cal", "lime plaster or Venetian stucco finish"),
    ("Piedra natural", "natural stone cladding"),
]

COLOR = [
    ("Mantener actual", "keep the existing colors"),
    ("Blanco roto", "warm off-white"),
    ("Blanco puro", "pure white"),
    ("Gris perla", "pearl grey"),
    ("Greige", "greige (warm grey-beige)"),
    ("Beige arena", "sand beige"),
    ("Verde salvia", "sage green"),
    ("Azul nórdico", "soft Nordic blue"),
    ("Azul marino", "navy blue"),
    ("Terracota", "terracotta"),
    ("Tonos tierra", "earthy tones"),
    ("Rosa empolvado", "dusty pink"),
    ("Gris antracita", "anthracite grey"),
    ("Negro", "black"),
]

TECHO = [
    ("Mantener actual", "keep the existing ceiling exactly as it is"),
    ("Liso blanco", "smooth flat white ceiling"),
    ("Foseado con LED indirecto", "perimeter ceiling cove with indirect LED light (ceiling height unchanged)"),
    ("Vigas de madera vistas (si existen)", "the existing ceiling beams exposed and finished in natural wood"),
    ("Bóveda catalana restaurada (si existe)", "the existing Catalan vault ceiling restored with exposed brick"),
    ("Molduras clásicas", "classic plaster cornices and ceiling moldings"),
    ("Listones de madera", "wooden slat ceiling cladding"),
]

CARPINTERIA = [
    ("Mantener actual", "keep the existing doors and windows unchanged"),
    ("Puertas lacadas en blanco", "white lacquered interior doors"),
    ("Puertas de roble", "natural oak interior doors"),
    ("Puertas negras modernas", "modern black interior doors"),
    ("Ventanas de aluminio negro", "black aluminium window frames"),
    ("Ventanas de PVC blanco", "white PVC window frames"),
    ("Ventanas de madera", "wooden window frames"),
    ("Puertas y ventanas nuevas a juego", "new doors and window frames matching the chosen style"),
]

COCINA = [
    ("Mantener / no aplica", "-"),
    ("Blanca lacada sin tiradores", "handleless white lacquered cabinets"),
    ("Madera natural", "natural wood cabinets"),
    ("Verde salvia", "sage green cabinets"),
    ("Gris antracita mate", "matte anthracite grey cabinets"),
    ("Azul marino", "navy blue cabinets"),
    ("Bicolor madera + blanco", "two-tone cabinets: wood lower units and white upper units"),
    ("Negra mate", "matte black cabinets"),
    ("Rústica con cuarterones", "rustic framed shaker-style cabinets"),
]

ENCIMERA = [
    ("Mantener / no aplica", "-"),
    ("Cuarzo blanco", "white quartz"),
    ("Porcelánico efecto mármol", "marble-effect porcelain"),
    ("Madera maciza", "solid wood"),
    ("Granito negro", "black granite"),
    ("Microcemento", "microcement"),
    ("Acero inoxidable", "stainless steel"),
]

BANO = [
    ("Mantener / no aplica", "-"),
    ("Baño moderno completo", "fully renovated modern bathroom: walk-in shower, wall-hung vanity, large mirror and "
                              "large-format tiles, all in the same positions as the existing fixtures"),
    ("Plato de ducha + mampara", "walk-in shower with flush tray and glass screen in the place of the existing "
                                 "bath or shower"),
    ("Bañera exenta", "freestanding bathtub in the place of the existing bath"),
    ("Mueble suspendido de madera", "wall-hung wooden vanity with modern washbasin"),
    ("Mueble suspendido blanco", "wall-hung white vanity with modern washbasin"),
    ("Grifería negra mate", "matte black taps and fittings"),
    ("Grifería dorada", "brushed brass taps and fittings"),
]

ILUMINACION = [
    ("Mantener actual", "keep the existing light fittings"),
    ("Focos empotrados", "recessed ceiling spotlights"),
    ("Tiras LED indirectas", "indirect LED strip lighting"),
    ("Lámparas colgantes de diseño", "designer pendant lamps"),
    ("Lámparas de pie y sobremesa", "floor and table lamps for warm ambient light"),
    ("Carril con focos", "ceiling track with spotlights"),
    ("Apliques de pared", "wall sconces"),
]

MOBILIARIO = [
    ("Mantener actual", "keep the existing furniture"),
    ("Amueblar según el estilo", "new furniture and decor matching the chosen style, realistically sized for the space"),
    ("Home staging ligero", "light home staging: a few well-chosen furniture pieces, plants and decor"),
    ("Renovar textiles y decoración", "same furniture layout with updated textiles, cushions, rugs, curtains and decor"),
    ("Vaciar (sin muebles)", "remove all furniture and objects, leaving the room empty and clean"),
]

# (etiqueta, codigo de proporcion, texto para el prompt)
PROPORCION = [
    ("Igual que la foto original", "auto", "Keep exactly the same framing and aspect ratio as the original photo."),
    ("Horizontal 4:3", "4:3", None),
    ("Horizontal 3:2", "3:2", None),
    ("Horizontal 16:9", "16:9", None),
    ("Cuadrada 1:1", "1:1", None),
    ("Vertical 4:5 (Instagram)", "4:5", None),
    ("Vertical 3:4", "3:4", None),
    ("Vertical 9:16 (stories)", "9:16", None),
]
PROPORCION = [
    (a, b, c if c else f"Final image aspect ratio {b}: adapt the framing only by extending or cropping at the "
                       "edges, never altering the existing architecture.")
    for a, b, c in PROPORCION
]

# (etiqueta, imageSize de Gemini, quality de OpenAI)
CALIDAD = [
    ("Borrador rápido", "1K", "low"),
    ("Estándar (1K)", "1K", "medium"),
    ("Alta (2K)", "2K", "high"),
    ("Máxima (4K, más lenta)", "4K", "high"),
]

ESTILO_IMAGEN = [
    ("Foto realista", "photorealistic interior photograph, as if taken by a professional real-estate photographer"),
    ("Render 3D arquitectónico", "high-end photorealistic architectural 3D render"),
    ("Revista de decoración", "polished, carefully styled interior-design magazine photograph"),
    ("Boceto a mano", "hand-drawn architectural sketch with ink lines and a soft watercolor wash, same perspective"),
    ("Acuarela", "soft architectural watercolor illustration, same perspective"),
]

LUZ = [
    ("Como en la foto original", "keep the same lighting conditions and light direction as in the original photo"),
    ("Luz natural de día", "bright natural daylight entering through the existing windows"),
    ("Atardecer cálido", "warm golden-hour sunlight through the existing windows"),
    ("Día nublado, luz suave", "soft, diffuse overcast daylight"),
    ("Noche con luces encendidas", "evening ambience with the warm artificial lights switched on"),
]

MOTOR = [
    ("Google Gemini (recomendado)",),
    ("OpenAI (GPT Image)",),
]

MODELO_GEMINI = [
    ("gemini-3.1-flash-image",),
    ("gemini-3-pro-image-preview",),
]

MODELO_OPENAI = [
    ("gpt-image-1.5",),
    ("gpt-image-2",),
]

# nombre -> (filas, columnas de cabecera)
TODAS = {
    "Estancia": (ESTANCIA, ["Estancia", "EN"]),
    "Tipo": (TIPO, ["Tipo de reforma", "EN"]),
    "Estilo": (ESTILO, ["Estilo", "EN"]),
    "Intensidad": (INTENSIDAD, ["Intensidad", "EN"]),
    "Suelo": (SUELO, ["Suelo", "EN"]),
    "Paredes": (PAREDES, ["Paredes", "EN"]),
    "Color": (COLOR, ["Color", "EN"]),
    "Techo": (TECHO, ["Techo", "EN"]),
    "Carpinteria": (CARPINTERIA, ["Carpintería", "EN"]),
    "Cocina": (COCINA, ["Cocina", "EN"]),
    "Encimera": (ENCIMERA, ["Encimera", "EN"]),
    "Bano": (BANO, ["Baño", "EN"]),
    "Iluminacion": (ILUMINACION, ["Iluminación", "EN"]),
    "Mobiliario": (MOBILIARIO, ["Mobiliario", "EN"]),
    "Proporcion": (PROPORCION, ["Proporción", "Código", "EN"]),
    "Calidad": (CALIDAD, ["Calidad", "Gemini imageSize", "OpenAI quality"]),
    "EstiloImagen": (ESTILO_IMAGEN, ["Estilo de imagen", "EN"]),
    "Luz": (LUZ, ["Luz", "EN"]),
    "Motor": (MOTOR, ["Motor IA"]),
    "ModeloGemini": (MODELO_GEMINI, ["Modelo Gemini"]),
    "ModeloOpenAI": (MODELO_OPENAI, ["Modelo OpenAI"]),
}
