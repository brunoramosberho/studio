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
    "primaryColor": string | null,     // hex #RRGGBB — color principal de botones/CTAs/links
    "landingBgColor": string | null,   // hex #RRGGBB — color de fondo oscuro de hero/secciones
    "logoUrl": string | null,          // URL absoluta del logo (buscar en [logo-candidate] o [og:image])
    "currency": string                 // "EUR" | "MXN" | "BRL" | "USD" etc.
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
  "manualRequired": {
    "rooms": true,
    "schedule": true,
    "notes": string
  },
  "sources": {
    "websiteAnalyzed": boolean,
    "brandbookAnalyzed": boolean,
    "instagramAnalyzed": boolean,
    "instagramScreenshotsCount": number
  }
}

=== INSTRUCCIONES PARA MARCA / COLORES ===

El contenido incluye señales de marca extraídas del HTML:
- [css-colors-found]: lista de colores hex encontrados en el CSS del sitio
- [css-var]: variables CSS con colores (ej: --primary: #c7a56c)
- [theme-color]: color del meta tag theme-color
- [logo-candidate]: URLs de imágenes que contienen "logo" en su src o alt
- [og:image]: imagen Open Graph del sitio
- [favicon]: icono del sitio

Para brand.primaryColor: buscar el color que más se usa en botones, links y CTAs.
  Priorizar colores de [css-var] con nombres como --primary, --accent, --brand.
  Evitar blanco (#FFFFFF), negro (#000000) y grises puros.
Para brand.landingBgColor: buscar el color de fondo de las secciones hero/oscuras.
  Buscar en [css-var] con nombres como --bg, --dark, --hero.
Para brand.logoUrl: usar [logo-candidate] primero, luego [og:image].
  Convertir URLs relativas a absolutas usando el dominio del sitio.

=== INSTRUCCIONES PARA COLORES DE DISCIPLINAS ===

Cada disciplina debe tener un suggestedColor DISTINTO. Generar una paleta derivada
del primaryColor de la marca:
- Usar variaciones de tono (hue shift), saturación y luminosidad
- Cada disciplina debe ser visualmente distinguible de las demás
- Mantener la "familia" de colores coherente con la marca
- Si hay 3 disciplinas y el primary es #c7a56c, podrías usar: #c7a56c, #6c9dc7, #c76c7a

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

=== REGLAS GENERALES ===

- Si no puedes extraer algo con confianza, usa null en vez de inventar datos
- Los colores deben ser hex válidos (#RRGGBB)
- Los precios deben ser números sin símbolo de moneda
- confidence "high" = claramente visible en el contenido
- confidence "medium" = inferido con razonable certeza
- confidence "low" = posible pero incierto
- Para disciplinas, usa los nombres exactos como aparecen en el sitio
- Para paquetes, extrae TODOS los que aparezcan en la página de precios
- identity.websiteUrl debe ser la URL canónica del sitio analizado
`;
