export const EXTRACTION_PROMPT = `
Analiza todo el contenido anterior (sitio web, brandbook si existe, screenshots de Instagram si existen)
y extrae la información del estudio de fitness.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin backticks, sin explicaciones.
El JSON debe seguir exactamente este schema:

{
  "identity": {
    "name": string,
    "tagline": string | null,
    "slogan": string | null,
    "seoDescription": string | null,
    "homeHeadline": string | null,
    "websiteUrl": string
  },
  "brand": {
    "primaryColor": string | null,       // hex #RRGGBB — color PRINCIPAL de la marca
    "accentColor": string | null,        // hex #RRGGBB — color de acento para botones/CTAs en la app
    "secondaryColors": string[],         // hex #RRGGBB[] — paleta de 2-4 colores secundarios de la marca
    "landingBgColor": string | null,     // hex #RRGGBB — color de fondo oscuro de hero/secciones
    "logoUrl": string | null,            // URL absoluta del logo (buscar en [logo-candidate] o [og:image])
    "currency": string                   // "EUR" | "MXN" | "BRL" | "USD" etc.
  },
  "locations": [
    {
      "name": string,
      "city": string | null,
      "address": string | null,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "disciplines": [
    {
      "name": string,
      "description": string | null,
      "durationMinutes": number | null,
      "level": "all" | "beginner" | "intermediate" | "advanced" | null,
      "tags": string[],
      "suggestedColor": string | null,  // hex — derivar de los colores de marca, cada disciplina un tono distinto
      "suggestedIcon": string | null,   // nombre de icono Lucide (ver lista abajo)
      "source": "website" | "instagram" | "both",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "coaches": [
    {
      "name": string,                    // nombre completo del coach/instructor
      "photoUrl": string | null,         // URL absoluta de su foto si se ve en el sitio (convertir relativas a absolutas)
      "specialties": string[],           // disciplinas que imparte (ej: ["Yoga", "Pilates"])
      "source": "website" | "instagram" | "both",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "packages": [
    {
      "name": string,
      "type": "offer" | "package" | "subscription",
      "description": string | null,
      "price": number | null,
      "credits": number | null,       // null si ilimitado
      "unlimited": boolean,
      "validityDays": number | null,
      "periodicity": "monthly" | "annual" | null,  // solo para subscriptions
      "confidence": "high" | "medium" | "low"
    }
  ],
  "schedule": [
    {
      "dayOfWeek": number,               // 1=Lunes, 2=Martes, ..., 7=Domingo (ISO)
      "startTime": string,               // "07:00" formato HH:mm
      "disciplineName": string,           // nombre EXACTO que coincida con una disciplina extraída
      "coachName": string | null,         // nombre del coach si es visible, null si no
      "durationMinutes": number | null,   // duración en minutos si se ve, null si no
      "confidence": "high" | "medium" | "low"
    }
  ],
  "manualRequired": {
    "rooms": true,
    "schedule": boolean,                  // false si se extrajeron slots del horario
    "notes": string
  },
  "sources": {
    "websiteAnalyzed": boolean,
    "brandbookAnalyzed": boolean,
    "instagramAnalyzed": boolean,
    "instagramScreenshotsCount": number,
    "scheduleScreenshotsAnalyzed": boolean,
    "scheduleScreenshotsCount": number
  }
}

=== INSTRUCCIONES CRÍTICAS PARA EXTRACCIÓN DE COLORES DE MARCA ===

La extracción de colores de marca es una de las tareas MÁS IMPORTANTES. Los colores deben reflejar
la identidad REAL de la marca. Usa estas fuentes en orden de prioridad:

1. **BRANDBOOK / MANUAL DE MARCA (máxima prioridad):**
   Si se incluye un PDF de brandbook, los colores definidos ahí son la verdad absoluta.
   Extraer primarios, acentos y secundarios tal como aparecen en el manual.

2. **SCREENSHOTS DE INSTAGRAM (alta prioridad):**
   Las imágenes de Instagram revelan la paleta real que usa la marca día a día.
   ANALIZA VISUALMENTE cada imagen:
   - ¿Cuál es el color de fondo dominante que se repite en las publicaciones?
   - ¿Qué color usan para texto destacado, títulos, o elementos de diseño?
   - ¿Hay un patrón de colores consistente entre las imágenes?
   - Los colores que aparecen en 3+ imágenes SON los colores de la marca.
   - Ignora colores de la interfaz de Instagram (blanco, negro del UI de la app).

3. **SITIO WEB (prioridad normal):**
   El contenido del sitio web incluye señales de marca extraídas del HTML:
   - [css-colors-found]: colores hex del CSS
   - [css-var]: variables CSS (ej: --primary: #c7a56c)
   - [theme-color]: meta tag theme-color
   - [logo-candidate]: imágenes con "logo" en src/alt
   - [og:image]: imagen Open Graph
   - [favicon]: icono del sitio
   NOTA: Si el sitio web tiene contenido vacío o mínimo (muchos SPAs modernos cargan
   por JavaScript y no muestran contenido), NO inventes colores del sitio.
   Usa las imágenes de Instagram o el brandbook como fuente primaria.

=== QUÉ SIGNIFICA CADA COLOR ===

- **primaryColor**: El color que DEFINE la marca. El tono principal que ves repetidamente
  en su identidad visual. Ejemplo: el rojo de Coca-Cola, el azul de Facebook.
  Si en Instagram siempre usan un fondo marrón/olive/khaki, ese ES el primary.

- **accentColor**: Un color complementario que funcione como acento en una app.
  Se usa para botones, CTAs, links, badges. Debe contrastar con primaryColor.
  Si el primary es oscuro, el accent puede ser un tono más claro o un complementario.
  Si solo hay un color de marca, derivar un acento que funcione bien con él.

- **secondaryColors**: Array de 2-4 colores adicionales que usa la marca.
  Colores de textos, fondos alternativos, bordes, etc. Incluir variaciones
  claras y oscuras del color primario si no hay más colores evidentes.

- **landingBgColor**: Color de fondo para secciones hero/oscuras de la landing.
  Puede ser el mismo que primaryColor si es oscuro, o un tono más oscuro.

=== INSTRUCCIONES PARA COLORES DE DISCIPLINAS ===

Cada disciplina debe tener un suggestedColor DISTINTO. Generar una paleta derivada
de los colores de marca (primaryColor, accentColor, secondaryColors):
- Usar variaciones de tono (hue shift), saturación y luminosidad
- Cada disciplina debe ser visualmente distinguible de las demás
- Mantener la "familia" de colores coherente con la marca
- Pueden basarse en los secondaryColors existentes si hay suficientes

=== INSTRUCCIONES PARA ICONOS DE DISCIPLINAS ===

Asignar un icono de Lucide React que represente cada disciplina.
SOLO usar estos nombres exactos de iconos disponibles:

Fitness/fuerza: "dumbbell", "weight", "biceps-flexed", "trophy"
Cardio/movimiento: "heart-pulse", "flame", "zap", "activity", "trending-up"
Yoga/pilates/barre: "person-standing", "accessibility", "stretch-horizontal"
Cycling/spinning: "bike"
Running: "footprints"
Boxing/combat: "swords", "shield"
Dance: "music", "disc"
Swimming: "waves"
Recovery/wellness: "sparkles", "snowflake", "thermometer", "bath", "leaf"
Personal training: "users", "target", "crosshair"
Meditation/mindfulness: "brain", "wind", "moon"
General: "star", "circle-dot", "sun", "mountain"

Elegir el icono que mejor represente la naturaleza de cada disciplina.

=== INSTRUCCIONES PARA COACHES/INSTRUCTORES ===

Extraer todos los coaches, instructores o profesores mencionados en el sitio web o Instagram:
- Buscar secciones como "Equipo", "Nuestros coaches", "Instructores", "Team", "Profesores"
- Para cada coach extraer su nombre completo tal como aparece
- Si hay foto del coach en el sitio, incluir la URL absoluta en photoUrl
  (convertir URLs relativas a absolutas usando el dominio del sitio)
- Si se mencionan qué clases o disciplinas imparte, incluirlas en specialties
- En Instagram, si los posts mencionan o tagean coaches, extraerlos también
- NO inventar coaches. Solo incluir los que aparezcan explícitamente
- Si no hay coaches visibles en ninguna fuente, devolver array vacío []

=== INSTRUCCIONES PARA LOGO ===

Para brand.logoUrl:
- Usar [logo-candidate] del HTML si hay alguno, verificando que la URL sea válida
- Luego [og:image] como fallback
- Convertir URLs relativas a absolutas usando el dominio del sitio
- Si el sitio web está vacío y solo hay screenshots de Instagram, dejar null
  (no inventar URLs)

=== INSTRUCCIONES PARA EXTRACCIÓN DE HORARIOS/SCHEDULE ===

Si se incluyen screenshots de horarios (imágenes de la programación semanal de clases):

1. **ANALIZA VISUALMENTE** cada imagen de horario:
   - Identifica la estructura de la tabla/grid (días como columnas, horas como filas o viceversa)
   - Para cada celda/bloque que contenga una clase, extrae:
     - Día de la semana (convertir a ISO: 1=Lunes, 2=Martes, ..., 7=Domingo)
     - Hora de inicio en formato HH:mm (24 horas)
     - Nombre de la clase/disciplina — DEBE coincidir exactamente con una disciplina del array "disciplines"
     - Nombre del coach si aparece visible
     - Duración si se muestra o se puede inferir del bloque de tiempo

2. **NOMBRES DE DISCIPLINAS:**
   - El campo disciplineName DEBE coincidir EXACTAMENTE con el name de una disciplina en el array "disciplines"
   - Si ves un nombre en el horario que no has incluido en disciplines, PRIMERO agrégalo a disciplines
   - Ejemplo: si el horario dice "Power Yoga" y en disciplines tienes "Power Yoga", usa "Power Yoga"

3. **NOMBRES DE COACHES:**
   - Si ves nombres de coaches en el horario que no has incluido en coaches, PRIMERO agrégalos al array "coaches"
   - Si solo se ve el primer nombre, úsalo tal cual

4. **Si NO hay screenshots de horarios:**
   - Devolver schedule como array vacío []
   - manualRequired.schedule debe ser true

5. **Si SÍ hay screenshots de horarios con datos extraídos:**
   - Llenar schedule con todos los slots detectados
   - manualRequired.schedule debe ser false

=== REGLAS GENERALES ===

- Si no puedes extraer algo con confianza, usa null en vez de inventar datos
- NUNCA inventes colores aleatorios. Si no hay datos de color de NINGUNA fuente, usa null
- Los colores deben ser hex válidos (#RRGGBB)
- Los precios deben ser números sin símbolo de moneda
- confidence "high" = claramente visible en el contenido
- confidence "medium" = inferido con razonable certeza
- confidence "low" = posible pero incierto
- Para disciplinas, usa los nombres exactos como aparecen en el contenido
- Para paquetes, extrae TODOS los que aparezcan en la página de precios
- identity.websiteUrl debe ser la URL canónica del sitio analizado
- Si el sitio web no tiene contenido útil (SPA vacío), indica websiteAnalyzed: false
  y extrae toda la info de Instagram/brandbook
`;
