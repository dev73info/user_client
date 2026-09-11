import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchCommunityPostDetail,
  fetchPublishedPosts,
  fetchPublishedResources,
  positiveInteger,
  resourceDetailSlug,
  resolveApiBaseUrl,
  resolveSiteUrl,
} from './lib/seo-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distRoot = resolve(projectRoot, 'dist')
const siteUrl = resolveSiteUrl()
const apiBaseUrl = resolveApiBaseUrl(projectRoot)
// 详情页快照数量上限：防止内容量过大时构建产物爆炸（每个页面写入 2 个文件）。
const maxDetailPages = positiveInteger(process.env.SEO_MAX_DETAIL_PAGES, 1000)
// 帖子正文需要逐条拉详情接口，限制并发避免把 API 打爆。
const postDetailConcurrency = positiveInteger(process.env.SEO_POST_DETAIL_CONCURRENCY, 6)

const navigationLinks = [
  {
    href: '/free-resources',
    title: '免费资源',
    description: '浏览网站开发、小工具等公开资源。',
  },
  {
    href: '/requirement-hall',
    title: '需求大厅',
    description: '发布需求、查看合作机会、对接开发者。',
  },
  {
    href: '/community',
    title: '社区交流',
    description: '查看平台公告、经验分享和用户讨论。',
  },
  {
    href: '/about',
    title: '关于我们',
    description: '了解 73Info 平台定位、合规说明与联系方式。',
  },
  {
    href: '/terms',
    title: '用户协议',
    description: '查看平台服务规则、账号使用与内容规范。',
  },
  {
    href: '/privacy',
    title: '隐私政策',
    description: '了解个人信息处理、数据使用和安全保护说明。',
  },
]

const pages = [
  {
    path: '/',
    title: '73Info 柒叁信息 - 资源与需求协作平台',
    description:
      '73Info 柒叁信息面向网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    heading: '73Info 柒叁信息 - 资源与需求协作平台',
    lead: '面向网站开发和小工具场景提供资源发现、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
  },
  {
    path: '/free-resources',
    title: '免费资源 - 73Info 柒叁信息',
    description:
      '在 73Info 免费资源区浏览网站开发和小工具等公开资源，查看资源介绍、分类标签、作者信息与下载入口。',
    heading: '免费资源',
    lead: '浏览网站开发、小工具等公开资源，按分类标签找到资源介绍、作者信息和下载入口。',
  },
  {
    path: '/requirement-hall',
    title: '需求大厅 - 73Info 柒叁信息',
    description:
      '73Info 需求大厅展示公开合作机会，支持发布需求、查看预算与交付方式、对接开发者并沉淀沟通记录。',
    heading: '需求大厅',
    lead: '查看公开合作机会，发布需求，了解预算、交付方式和沟通记录，对接适合的开发者。',
  },
  {
    path: '/community',
    title: '社区交流 - 73Info 柒叁信息',
    description: '73Info 社区用于发布平台公告、经验分享、资源反馈和用户讨论，帮助需求方与开发者建立公开沟通。',
    heading: '社区交流',
    lead: '查看平台公告、经验分享、资源反馈和用户讨论，了解 73Info 的最新动态。',
  },
  {
    path: '/about',
    title: '关于我们 - 73Info 柒叁信息',
    description:
      '了解 73Info 柒叁信息的平台定位、内测状态、资源与需求协作模式、合规说明、备案信息和联系方式。',
    heading: '关于我们',
    lead: '了解 73Info 柒叁信息的平台定位、内测状态、资源与需求协作模式、合规说明和联系方式。',
  },
  {
    path: '/terms',
    title: '用户协议 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息用户协议，了解账号使用、内容发布、资源浏览、需求协作和平台服务规则。',
    heading: '用户协议',
    lead: '查看账号使用、内容发布、资源浏览、需求协作和平台服务规则。',
  },
  {
    path: '/privacy',
    title: '隐私政策 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息隐私政策，了解个人信息处理、数据使用、存储保护和用户权利说明。',
    heading: '隐私政策',
    lead: '了解个人信息处理、数据使用、存储保护和用户权利说明。',
  },
  {
    path: '/payment-refund',
    title: '支付与退款说明 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息支付与退款说明，了解需求协作中的支付阶段、退款条件和处理流程。',
    heading: '支付与退款说明',
    lead: '了解需求协作中的支付阶段、退款条件和处理流程。',
  },
]

async function main() {
  const templatePath = resolve(distRoot, 'index.html')
  const template = readFileSync(templatePath, 'utf8')

  for (const page of pages) {
    await writePageOutputs(page.path, renderPageHtml(template, page), templatePath)
  }

  console.log(`[seo] generated ${pages.length} static entry pages -> ${distRoot}`)

  await generateDetailPages(template, templatePath)
}

// 为已发布的资源与社区帖子生成带真实内容的静态快照页，
// 避免 sitemap 列出的详情 URL 只能返回无内容的 SPA 空壳。
async function generateDetailPages(template, templatePath) {
  const [resources, posts] = await Promise.all([
    fetchPublishedResources(apiBaseUrl).catch((error) => handleDetailFetchFailure('resources', error)),
    fetchPublishedPosts(apiBaseUrl, maxDetailPages).catch((error) =>
      handleDetailFetchFailure('community posts', error),
    ),
  ])

  const selectedResources = resources.slice(0, maxDetailPages)
  const selectedPosts = posts.slice(0, Math.max(maxDetailPages - selectedResources.length, 0))
  const postsWithContent = await fetchPostContents(selectedPosts)

  const pages = [
    ...selectedResources.map(renderResourceDetailPage),
    ...postsWithContent.map(renderPostDetailPage),
  ]

  for (const page of pages) {
    await writePageOutputs(page.path, renderDetailHtml(template, page), templatePath)
  }

  console.log(
    `[seo] generated ${pages.length} detail pages (${selectedResources.length} resources, ${postsWithContent.length} posts) -> ${distRoot}`,
  )

  const skipped = resources.length + posts.length - pages.length
  if (skipped > 0) {
    console.warn(`[seo] skipped ${skipped} detail pages (SEO_MAX_DETAIL_PAGES=${maxDetailPages})`)
  }
}

// 列表接口的帖子不带正文，这里按并发上限逐条拉详情；单条失败不影响整次构建。
async function fetchPostContents(posts) {
  const enriched = []

  for (let index = 0; index < posts.length; index += postDetailConcurrency) {
    const batch = posts.slice(index, index + postDetailConcurrency)
    const results = await Promise.all(
      batch.map(async (post) => {
        try {
          const detail = await fetchCommunityPostDetail(apiBaseUrl, post.id)
          return {
            ...post,
            content_html: detail?.content_html || '',
            comment_count: detail?.comment_count ?? post.comment_count,
            like_count: detail?.like_count ?? post.like_count,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`[seo] failed to fetch community post ${post.id}, using summary only: ${message}`)
          return post
        }
      }),
    )

    enriched.push(...results)
  }

  return enriched
}

function handleDetailFetchFailure(label, error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[seo] failed to fetch ${label}, detail pages skipped: ${message}`)
  return []
}

async function writePageOutputs(pagePath, html, templatePath) {
  for (const outputPath of outputPathsForPage(pagePath, templatePath)) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html, 'utf8')
  }
}

function renderResourceDetailPage(resource) {
  const title = cleanText(resource.title) || '资源详情'
  const author = cleanText(resource.creator || resource.author)
  const platform = cleanText(resource.platform)
  const tags = resourceTagNames(resource)
  const description =
    truncateText(resource.description, 150) ||
    truncateText(
      `在 73Info 免费资源区浏览「${title}」${platform ? `（${platform}）` : ''}：查看资源介绍、标签、作者与下载入口。`,
      150,
    )
  const path = `/resources/${resourceDetailSlug(resource)}`
  const image = absoluteAssetUrl(resource.cover_url)
  const created = toDateTimeIso(resource.created_at)
  const updated = toDateTimeIso(resource.updated_at) || created

  return {
    path,
    ogType: 'article',
    title: `${title} - 免费资源 - 73Info 柒叁信息`,
    description,
    eyebrow: '73INFO · 免费资源',
    heading: title,
    lead: description,
    itemType: 'https://schema.org/CreativeWork',
    image,
    meta: [
      { label: '作者', value: author },
      { label: '平台', value: platform },
      { label: '标签', value: tags.join('、') },
      { label: '浏览', value: formatCount(resource.view_count) },
      { label: '下载', value: formatCount(resource.download_count) },
      { label: '点赞', value: formatCount(resource.like_count) },
    ],
    links: [
      { href: '/free-resources', title: '免费资源', description: '浏览更多网站开发与小工具资源。' },
      { href: '/requirement-hall', title: '需求大厅', description: '发布需求、查看合作机会、对接开发者。' },
      { href: '/community', title: '社区交流', description: '查看平台公告、经验分享和用户讨论。' },
      { href: '/', title: '返回首页', description: '回到 73Info 柒叁信息首页。' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: title,
      description,
      url: canonicalPageUrl(path),
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      ...(created ? { datePublished: created } : {}),
      ...(updated ? { dateModified: updated } : {}),
      ...(image ? { image } : {}),
      ...(tags.length > 0 ? { keywords: tags.join(',') } : {}),
    },
  }
}

function renderPostDetailPage(post) {
  const title = cleanText(post.title) || '社区帖子'
  const author = cleanText(post.author)
  const tags = (Array.isArray(post.tags) ? post.tags : [])
    .map((tag) => cleanText(tag?.name))
    .filter(Boolean)
    .slice(0, 8)
  const plain = stripHtml(post.content_html)
  const description =
    truncateText(plain, 150) ||
    truncateText(`73Info 社区帖子「${title}」${tags.length > 0 ? `，标签：${tags.join('、')}` : ''}。`, 150)
  const path = `/community/posts/${Number(post.id)}`
  const published = toDateTimeIso(post.published_at || post.created_at)
  const updated = toDateTimeIso(post.updated_at) || published

  return {
    path,
    ogType: 'article',
    title: `${title} - 73Info 社区交流`,
    description,
    eyebrow: '73INFO · 社区交流',
    heading: title,
    lead: truncateText(plain, 300) || description,
    itemType: 'https://schema.org/DiscussionForumPosting',
    image: '',
    meta: [
      { label: '作者', value: author },
      { label: '发布时间', value: formatDateTimeText(published) },
      { label: '标签', value: tags.join('、') },
      { label: '回复', value: formatCount(post.comment_count) },
      { label: '点赞', value: formatCount(post.like_count) },
    ],
    links: [
      { href: '/community', title: '社区交流', description: '查看平台公告、经验分享和用户讨论。' },
      { href: '/requirement-hall', title: '需求大厅', description: '发布需求、查看合作机会、对接开发者。' },
      { href: '/free-resources', title: '免费资源', description: '浏览网站开发与小工具等公开资源。' },
      { href: '/', title: '返回首页', description: '回到 73Info 柒叁信息首页。' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: title,
      url: canonicalPageUrl(path),
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      ...(published ? { datePublished: published } : {}),
      ...(updated ? { dateModified: updated } : {}),
      ...(plain ? { articleBody: truncateText(plain, 500) } : {}),
      ...(tags.length > 0 ? { keywords: tags.join(',') } : {}),
    },
  }
}

function renderDetailHtml(template, page) {
  const url = canonicalPageUrl(page.path)
  const extraHead = [`<style>${DETAIL_FALLBACK_STYLE}</style>`]

  if (page.image) {
    extraHead.push(`<meta property="og:image" content="${escapeAttribute(page.image)}" />`)
    extraHead.push(`<meta name="twitter:image" content="${escapeAttribute(page.image)}" />`)
  }

  extraHead.push(`<script type="application/ld+json">${serializeJsonLd(page.jsonLd)}</script>`)

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<meta\s+property="og:type"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.ogType || 'website')}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(url)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(url)}$2`)
    .replace(
      /<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->/,
      `<!-- SEO_FALLBACK_START -->\n${renderDetailFallback(page)}\n      <!-- SEO_FALLBACK_END -->`,
    )
    .replace('</head>', `    ${extraHead.join('\n    ')}\n  </head>`)
}

function renderDetailFallback(page) {
  const metaItems = page.meta
    .filter((item) => String(item.value ?? '').trim() !== '')
    .map(
      (item) =>
        `            <li><strong>${escapeHtml(item.label)}</strong>${escapeHtml(String(item.value))}</li>`,
    )
    .join('\n')

  const metaBlock = metaItems
    ? `        <ul class="seo-fallback__meta">\n${metaItems}\n        </ul>\n`
    : ''

  return `      <main class="seo-fallback" aria-label="${escapeAttribute(page.heading)}" itemscope itemtype="${escapeAttribute(page.itemType)}">
        <p class="seo-fallback__eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1 itemprop="name">${escapeHtml(page.heading)}</h1>
        <p class="seo-fallback__lead" itemprop="description">${escapeHtml(page.lead)}</p>
${metaBlock}        <nav class="seo-fallback__links" aria-label="站点核心入口" itemscope itemtype="https://schema.org/SiteNavigationElement">
${page.links.map(renderNavigationLink).join('\n')}
        </nav>
      </main>`
}

function resourceTagNames(resource) {
  const names = []

  for (const group of Array.isArray(resource.tag_selections) ? resource.tag_selections : []) {
    for (const name of Array.isArray(group?.tag_names) ? group.tag_names : []) {
      const cleaned = cleanText(name)
      if (cleaned && !names.includes(cleaned)) {
        names.push(cleaned)
      }
    }
  }

  return names.slice(0, 8)
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(value) {
  return cleanText(
    String(value ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}

function truncateText(value, limit) {
  const text = cleanText(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function formatCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? String(Math.trunc(count)) : ''
}

function formatDateTimeText(value) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, 19).replace('T', ' ') : ''
}

function toDateTimeIso(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/)

  if (match) {
    const time = match[2].length === 5 ? `${match[2]}:00` : match[2]
    return `${match[1]}T${time}+08:00`
  }

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function absoluteAssetUrl(value) {
  const path = String(value ?? '').trim()
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// 线上页面以目录形式提供（/xxx/），无斜杠 URL 会 301，统一输出最终形态。
function canonicalPageUrl(path) {
  if (path === '/') {
    return `${siteUrl}/`
  }

  return `${siteUrl}${String(path).replace(/\/+$/, '')}/`
}

function outputPathsForPage(path, templatePath) {
  if (path === '/') {
    return [templatePath]
  }

  const cleanPath = path.replace(/^\/+|\/+$/g, '')
  return [
    resolve(distRoot, `${cleanPath}.html`),
    resolve(distRoot, cleanPath, 'index.html'),
  ]
}

function renderPageHtml(template, page) {
  const url = canonicalPageUrl(page.path)
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(url)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(page.description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/, `$1${escapeAttribute(url)}$2`)
    .replace(
      /<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->/,
      `<!-- SEO_FALLBACK_START -->\n${renderFallback(page)}\n      <!-- SEO_FALLBACK_END -->`,
    )
}

function renderFallback(page) {
  return `      <main class="seo-fallback" aria-label="柒叁信息" itemscope itemtype="https://schema.org/WebSite">
        <p class="seo-fallback__eyebrow">73INFO · 柒叁信息</p>
        <h1 itemprop="name">${escapeHtml(page.heading)}</h1>
        <p class="seo-fallback__lead" itemprop="description">${escapeHtml(page.lead)}</p>
        <nav class="seo-fallback__links" aria-label="站点核心入口" itemscope itemtype="https://schema.org/SiteNavigationElement">
${navigationLinks.map(renderNavigationLink).join('\n')}
        </nav>
      </main>`
}

function renderNavigationLink(link) {
  return `          <a itemprop="url" href="${escapeAttribute(link.href)}">
            <span itemprop="name">${escapeHtml(link.title)}</span>
            <small>${escapeHtml(link.description)}</small>
          </a>`
}

const DETAIL_FALLBACK_STYLE =
  '.seo-fallback__meta{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 30px;padding:0;list-style:none;color:#475569;font-size:15px}' +
  '.seo-fallback__meta strong{margin-right:8px;color:#1e293b}'

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
