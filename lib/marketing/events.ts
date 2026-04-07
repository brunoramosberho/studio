'use client'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

interface AnalyticsConfig {
  ga4EventViewItem?: boolean
  ga4EventPurchase?: boolean
  ga4EventBeginCheckout?: boolean
  ga4EventSignUp?: boolean
  metaEventViewContent?: boolean
  metaEventPurchase?: boolean
  metaEventInitiateCheckout?: boolean
  metaEventCompleteRegistration?: boolean
}

let _config: AnalyticsConfig = {}

export function setAnalyticsConfig(config: AnalyticsConfig) {
  _config = config
}

export function trackViewItem(entity: { name: string; price: number; type: string }) {
  if (typeof window === 'undefined') return

  if (window.gtag && _config.ga4EventViewItem !== false) {
    window.gtag('event', 'view_item', {
      currency: 'EUR',
      value: entity.price,
      items: [{ item_name: entity.name, item_category: entity.type, price: entity.price }],
    })
  }

  if (window.fbq && _config.metaEventViewContent !== false) {
    window.fbq('track', 'ViewContent', {
      content_name: entity.name,
      content_type: entity.type,
      value: entity.price,
      currency: 'EUR',
    })
  }
}

export function trackPurchase(params: {
  transactionId: string
  value: number
  items: Array<{ name: string; price: number }>
}) {
  if (typeof window === 'undefined') return

  if (window.gtag && _config.ga4EventPurchase !== false) {
    window.gtag('event', 'purchase', {
      transaction_id: params.transactionId,
      value: params.value,
      currency: 'EUR',
      items: params.items.map((i) => ({ item_name: i.name, price: i.price })),
    })
  }

  if (window.fbq && _config.metaEventPurchase !== false) {
    window.fbq('track', 'Purchase', { value: params.value, currency: 'EUR' })
  }
}

export function trackBeginCheckout(params: { value: number; items: Array<{ name: string; price: number }> }) {
  if (typeof window === 'undefined') return

  if (window.gtag && _config.ga4EventBeginCheckout !== false) {
    window.gtag('event', 'begin_checkout', {
      currency: 'EUR',
      value: params.value,
      items: params.items.map((i) => ({ item_name: i.name, price: i.price })),
    })
  }

  if (window.fbq && _config.metaEventInitiateCheckout !== false) {
    window.fbq('track', 'InitiateCheckout', { value: params.value, currency: 'EUR' })
  }
}

export function trackSignUp() {
  if (typeof window === 'undefined') return

  if (window.gtag && _config.ga4EventSignUp !== false) {
    window.gtag('event', 'sign_up', { method: 'email' })
  }

  if (window.fbq && _config.metaEventCompleteRegistration !== false) {
    window.fbq('track', 'CompleteRegistration')
  }
}

export function hasUtmParams(searchParams: URLSearchParams): boolean {
  return !!(
    searchParams.get('utm_source') ||
    searchParams.get('utm_medium') ||
    searchParams.get('utm_campaign')
  )
}

export function extractUtmParams(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get('utm_source') || undefined,
    utmMedium: searchParams.get('utm_medium') || undefined,
    utmCampaign: searchParams.get('utm_campaign') || undefined,
    utmContent: searchParams.get('utm_content') || undefined,
    utmTerm: searchParams.get('utm_term') || undefined,
  }
}
