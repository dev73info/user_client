const DEFAULT_TITLE = '73Info 柒叁信息 - 资源与需求内测协作平台'
const DEFAULT_DESCRIPTION =
  '73Info 柒叁信息是内测中的资源与需求协作平台，优先沉淀 Minecraft、网站开发和小工具资源，支持公开资源浏览、需求发布、沟通记录、工单跟进与合规说明。平台担保、资金托管、代收代付和自动分账等涉及许可的交易功能暂未开放。'
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || 'https://73info.cn').replace(
  /\/+$/,
  '',
)

type SeoMetaInput = {
  title: string
  description?: string
  path?: string
}

export function setSeoMeta(input: SeoMetaInput): void {
  if (typeof document === 'undefined') {
    return
  }

  const title = input.title.trim() || DEFAULT_TITLE
  const description = normalizeDescription(input.description || DEFAULT_DESCRIPTION)
  const url = `${SITE_URL}${normalizePath(input.path || '/')}`

  document.title = title
  setMeta('name', 'description', description)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', url)
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setCanonical(url)
}

export function resetSeoMeta(): void {
  setSeoMeta({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, path: '/' })
}

function normalizeDescription(value: string): string {
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > 160 ? `${text.slice(0, 160)}...` : text || DEFAULT_DESCRIPTION
}

function normalizePath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return new URL(path).pathname
  }

  return path.startsWith('/') ? path : `/${path}`
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`
  let meta = document.head.querySelector<HTMLMetaElement>(selector)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute(attribute, key)
    document.head.appendChild(meta)
  }

  meta.content = content
}

function setCanonical(url: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }

  link.href = url
}
