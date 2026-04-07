export type EntityType = 'class' | 'class-instance' | 'membership' | 'product' | 'schedule'

export interface UtmParams {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

const PATH_MAP: Record<string, string> = {
  class: '/schedule',
  'class-instance': '/class',
  membership: '/packages',
  product: '/shop',
  schedule: '/schedule',
}

export function getEntityUrl(
  tenantSlug: string,
  entityType: EntityType,
  entitySlugOrId: string,
  utmParams?: UtmParams,
): string {
  const base = `https://${tenantSlug}.mgic.app`

  let path: string
  if (entityType === 'class' && entitySlugOrId) {
    path = `${PATH_MAP.class}?discipline=${encodeURIComponent(entitySlugOrId)}`
  } else if (entityType === 'class-instance') {
    path = `${PATH_MAP['class-instance']}/${entitySlugOrId}`
  } else if (entityType === 'membership' && entitySlugOrId) {
    path = `${PATH_MAP.membership}/${entitySlugOrId}`
  } else {
    path = PATH_MAP[entityType]
  }

  const url = new URL(base + path)

  if (utmParams) {
    if (utmParams.source) url.searchParams.set('utm_source', utmParams.source)
    if (utmParams.medium) url.searchParams.set('utm_medium', utmParams.medium)
    if (utmParams.campaign) url.searchParams.set('utm_campaign', utmParams.campaign)
    if (utmParams.content) url.searchParams.set('utm_content', utmParams.content)
    if (utmParams.term) url.searchParams.set('utm_term', utmParams.term)
  }

  return url.toString()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

const DAY_SHORT: Record<string, string> = {
  lunes: 'lun', martes: 'mar', miercoles: 'mie', miércoles: 'mie',
  jueves: 'jue', viernes: 'vie', sabado: 'sab', sábado: 'sab', domingo: 'dom',
}

export function classSlug(name: string, dayOfWeek: string, time: string): string {
  const day = DAY_SHORT[dayOfWeek.toLowerCase()] || dayOfWeek.slice(0, 3).toLowerCase()
  const timeClean = time.replace(':', '')
  return `${slugify(name)}-${day}-${timeClean}`
}
