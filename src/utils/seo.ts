const DEFAULT_TITLE = '73Info 柒叁信息 - 资源与需求协作平台'
const DEFAULT_DESCRIPTION =
  '73Info 柒叁信息是内测中的资源与需求协作平台，优先沉淀网站开发和小工具资源，支持公开资源浏览、需求发布、沟通记录、合同签署、担保支付、交付验收和合规说明。'
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || 'https://73info.cn').replace(
  /\/+$/,
  '',
)

type SeoMetaInput = {
  title: string
  description?: string
  path?: string
  /** 标记为不收录（如 404 兜底页）：写 `noindex, follow`，避免这类页面进入搜索结果。 */
  noindex?: boolean
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
  // 每次调用都显式写 robots：否则从 404 页跳到不自己设置 SEO 的页面时，
  // 上一条 `noindex` 会留在 <head> 里，把正常页面也一起挡在搜索之外。
  setMeta('name', 'robots', input.noindex ? 'noindex, follow' : 'index, follow')
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
  const normalized = /^https?:\/\//i.test(path)
    ? new URL(path).pathname
    : path.startsWith('/')
      ? path
      : `/${path}`

  // 线上静态快照以目录形式提供（/resources/ 而非 /resources，无斜杠会 301），
  // canonical 统一输出带斜杠的最终形态，避免“canonical 指向重定向地址”。
  if (normalized === '/') {
    return '/'
  }

  return `${normalized.replace(/\/+$/, '')}/`
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
