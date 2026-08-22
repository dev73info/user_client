import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distRoot = resolve(projectRoot, 'dist')
const siteUrl = normalizeBaseUrl(process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || 'https://73info.cn')

const navigationLinks = [
  {
    href: '/free-resources',
    title: '免费资源',
    description: '浏览 Minecraft、网站开发、小工具等公开资源。',
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
      '73Info 柒叁信息面向 Minecraft、网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    heading: '73Info 柒叁信息 - 资源与需求协作平台',
    lead: '面向 Minecraft、网站开发和小工具场景提供资源发现、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
  },
  {
    path: '/free-resources',
    title: '免费资源 - 73Info 柒叁信息',
    description:
      '在 73Info 免费资源区浏览 Minecraft、网站开发和小工具等公开资源，查看资源介绍、分类标签、作者信息与下载入口。',
    heading: '免费资源',
    lead: '浏览 Minecraft、网站开发、小工具等公开资源，按分类标签找到资源介绍、作者信息和下载入口。',
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
    const html = renderPageHtml(template, page)
    for (const outputPath of outputPathsForPage(page.path, templatePath)) {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, html, 'utf8')
    }
  }

  console.log(`[seo] generated ${pages.length} static entry pages -> ${distRoot}`)
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
  const url = `${siteUrl}${page.path}`
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

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

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