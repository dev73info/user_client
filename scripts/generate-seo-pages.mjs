import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectPublicProfiles,
  fetchCommunityPostDetail,
  fetchPublishedPosts,
  fetchPublishedResources,
  fetchPublicRequirementSpotlights,
  fetchUserServiceAgreement,
  isCashPaidListingResource,
  isFreeListingResource,
  normalizeResourceOwnerSlug,
  positiveInteger,
  publicProfilePath,
  resourceDetailSlug,
  resourceListingLabel,
  resourceListingPath,
  resourcePriceText,
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
// 列表快照最多列多少条：入口页要有实质内容与站内链接，同时避免单个 HTML 过大。
const listLimit = positiveInteger(process.env.SEO_LIST_LIMIT, 200)
// 社区帖正文进入 HTML 的字数上限。原先只放 300 字摘要，正文全靠 JS 渲染，爬虫看不到。
const bodyLimit = positiveInteger(process.env.SEO_BODY_TEXT_LIMIT, 4000)
// 详情页底部的横向内链条数（同标签资源 / 同作者资源 / 更多帖子）。
const relatedLimit = positiveInteger(process.env.SEO_RELATED_LIMIT, 8)
// 帖子正文需要逐条拉详情接口，限制并发避免把 API 打爆。
const postDetailConcurrency = positiveInteger(process.env.SEO_POST_DETAIL_CONCURRENCY, 6)

const navigationLinks = [
  {
    href: '/free-resources',
    title: '免费资源',
    description: '浏览网站开发、小工具等公开资源。',
  },
  {
    href: '/paid-resources',
    title: '付费资源',
    description: '浏览现金定价的付费资源与购买入口。',
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

// 法务与平台说明页的正文放在 src/shared/legalContent.json，与对应的 .vue 视图共用一份文案
// （视图那边由 src/shared/legalContent.ts 读它），避免同一段话在组件与脚本里各写一遍。
const legalContentPath = resolve(projectRoot, 'src/shared/legalContent.json')

// `kind` 决定这个入口页要预渲染哪部分真实内容（`none` 表示只有静态文案）：
// 只写一句定位 + 一个导航菜单的页面，在爬虫眼里是同一份模板反复出现，收录质量很差。
// `doc` 表示要把整篇正文（法务条款 / 平台说明）写进静态 HTML —— 这四页原先只有一句话，
// 是全站最薄的页面；`docKey` 指向 main() 里解析好的文档。
const pages = [
  {
    path: '/',
    kind: 'home',
    title: '73Info 柒叁信息 - 资源与需求协作平台',
    description:
      '73Info 柒叁信息面向网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    heading: '73Info 柒叁信息 - 资源与需求协作平台',
    lead: '面向网站开发和小工具场景提供资源发现、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
  },
  {
    path: '/free-resources',
    kind: 'resources',
    sale: 'free',
    title: '免费资源 - 73Info 柒叁信息',
    description:
      '在 73Info 免费资源区浏览网站开发和小工具等公开资源，查看资源介绍、分类标签、作者信息与下载入口。',
    heading: '免费资源',
    lead: '浏览网站开发、小工具等公开资源，按分类标签找到资源介绍、作者信息和下载入口。',
  },
  {
    path: '/paid-resources',
    kind: 'resources',
    sale: 'paid',
    title: '付费资源 - 73Info 柒叁信息',
    description:
      '浏览 73Info 上现金定价的付费资源，查看资源介绍、价格、版本、作者信息与购买入口。',
    heading: '付费资源',
    lead: '浏览现金定价的付费资源，查看资源介绍、价格、作者信息与购买入口。',
  },
  {
    path: '/requirement-hall',
    kind: 'requirements',
    title: '需求大厅 - 73Info 柒叁信息',
    description:
      '73Info 需求大厅展示公开合作机会，支持发布需求、查看预算与交付方式、对接开发者并沉淀沟通记录。',
    heading: '需求大厅',
    lead: '查看公开合作机会，发布需求，了解预算、交付方式和沟通记录，对接适合的开发者。',
  },
  {
    path: '/community',
    kind: 'posts',
    title: '社区交流 - 73Info 柒叁信息',
    description: '73Info 社区用于发布平台公告、经验分享、资源反馈和用户讨论，帮助需求方与开发者建立公开沟通。',
    heading: '社区交流',
    lead: '查看平台公告、经验分享、资源反馈和用户讨论，了解 73Info 的最新动态。',
  },
  {
    path: '/about',
    kind: 'doc',
    docKey: 'about',
    title: '关于我们 - 73Info 柒叁信息',
    description:
      '了解 73Info 柒叁信息的平台定位、内测状态、资源与需求协作模式、合规说明、备案信息和联系方式。',
    heading: '关于我们',
    lead: '了解 73Info 柒叁信息的平台定位、内测状态、资源与需求协作模式、合规说明和联系方式。',
  },
  {
    path: '/terms',
    kind: 'doc',
    docKey: 'terms',
    title: '用户协议 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息用户协议，了解账号使用、内容发布、资源浏览、需求协作和平台服务规则。',
    heading: '用户协议',
    lead: '查看账号使用、内容发布、资源浏览、需求协作和平台服务规则。',
  },
  {
    path: '/privacy',
    kind: 'doc',
    docKey: 'privacy',
    title: '隐私政策 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息隐私政策，了解个人信息处理、数据使用、存储保护和用户权利说明。',
    heading: '隐私政策',
    lead: '了解个人信息处理、数据使用、存储保护和用户权利说明。',
  },
  {
    path: '/payment-refund',
    kind: 'doc',
    docKey: 'payment-refund',
    title: '支付与退款说明 - 73Info 柒叁信息',
    description: '查看 73Info 柒叁信息支付与退款说明，了解需求协作中的支付阶段、退款条件和处理流程。',
    heading: '支付与退款说明',
    lead: '了解需求协作中的支付阶段、退款条件和处理流程。',
  },
]

async function main() {
  const templatePath = resolve(distRoot, 'index.html')
  const template = stripInjectedSeoJsonLd(readFileSync(templatePath, 'utf8'))

  await writeSpaFallbackShell(template)

  const dataset = await loadDataset()
  const documents = await loadDocuments()

  for (const page of pages) {
    const doc = page.docKey ? documents[page.docKey] : null
    await writePageOutputs(page.path, renderPageHtml(template, page, dataset, doc), templatePath)
  }

  console.log(
    `[seo] generated ${pages.length} static entry pages -> ${distRoot} ` +
      `(${dataset.resources.length} resources, ${dataset.requirements.length} requirements, ${dataset.posts.length} posts listed)`,
  )

  await generateDetailPages(template, templatePath, dataset)
}

// 没有命中任何静态快照的路径由服务端回落到这个壳（见 deploy/openresty/73info-user-client.conf）。
//
// 它必须是「SPA 外壳 + noindex」：这些地址里有真正不存在的（旧链接、删掉的资源），
// 也有只有执行 JS 才知道合法性的（前端通配路由 `/:rootSlug/:entrySlug?`）。
// 原先一律回落到 index.html——而 index.html 已被首页快照替换，于是任何未命中地址都返回
// 一份 200 的首页副本：既浪费抓取配额，又在 Search Console 里堆成重复页面。
// 规则：命中静态快照的地址照旧返回完整正文；未命中的返回 noindex 外壳，不进索引。
async function writeSpaFallbackShell(template) {
  const html = template
    .replace(/(<meta\s+name="robots"\s+content=")[^"]*("\s*\/?>)/, '$1noindex,follow$2')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/, '')
    // 壳里不能留下入口页正文：脚本是「先写壳、后覆盖各入口页」，所以重跑时读到的
    // index.html 已经是上一次构建的首页快照，直接照搬会把首页的列表（甚至已下架资源的标题）
    // 塞进这个 noindex 壳，等于让任意未命中地址返回一份内容陈旧的重复首页。
    .replace(/[ \t]*<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->\n?/, '')

  await writeFile(resolve(distRoot, 'spa-fallback.html'), html, 'utf8')
  console.log('[seo] generated SPA fallback shell (robots=noindex) -> dist/spa-fallback.html')
}

// 公开接口的数据只取一次，入口页与详情页共用同一份快照，避免同一页里出现两份不一致的列表。
async function loadDataset() {
  const [resources, posts, requirements] = await Promise.all([
    fetchPublishedResources(apiBaseUrl).catch((error) => handleFetchFailure('resources', error)),
    fetchPublishedPosts(apiBaseUrl, listLimit).catch((error) => handleFetchFailure('community posts', error)),
    fetchPublicRequirementSpotlights(apiBaseUrl, listLimit).catch((error) =>
      handleFetchFailure('requirement spotlight', error),
    ),
  ])

  // 三份都取不到，说明构建期的 API 不可用。此时生成的入口页会是「一句话 + 菜单」的空快照，
  // 正是本次要修的问题，宁可让构建失败，也不要悄悄把空页面发上线。
  if (resources.length === 0 && posts.length === 0 && requirements.length === 0) {
    throw new Error(
      `[seo] ${apiBaseUrl} 上的公开接口全部取不到数据，拒绝生成空列表快照；请确认 API 可用后重新构建`,
    )
  }

  // 公开主页：候选名单与 sitemap 脚本共用同一条口径（见 `collectPublicProfiles`）。
  const profiles = await collectPublicProfiles(apiBaseUrl, resources, posts).catch((error) =>
    handleFetchFailure('public profiles', error),
  )

  return { resources, posts, requirements, profiles }
}

// 为已发布的资源、社区帖子与开发者公开主页生成带真实内容的静态快照页，
// 避免 sitemap 列出的详情 URL 只能返回无内容的 SPA 空壳。
async function generateDetailPages(template, templatePath, dataset) {
  const selectedResources = dataset.resources.slice(0, maxDetailPages)
  const selectedPosts = dataset.posts.slice(0, Math.max(maxDetailPages - selectedResources.length, 0))
  const postsWithContent = await fetchPostContents(selectedPosts)
  const selectedProfiles = dataset.profiles.slice(0, maxDetailPages)

  const pages = [
    ...selectedResources.map((resource) => renderResourceDetailPage(resource, dataset)),
    ...postsWithContent.map((post) => renderPostDetailPage(post, dataset)),
    ...selectedProfiles.map((profile) => renderProfileDetailPage(profile, dataset)),
  ]

  for (const page of pages) {
    await writePageOutputs(page.path, renderDetailHtml(template, page), templatePath)
  }

  console.log(
    `[seo] generated ${pages.length} detail pages (${selectedResources.length} resources, ` +
      `${postsWithContent.length} posts, ${selectedProfiles.length} profiles) -> ${distRoot}`,
  )

  const planned = selectedResources.length + selectedPosts.length + selectedProfiles.length
  const skipped = planned - pages.length
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

function handleFetchFailure(label, error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[seo] failed to fetch ${label}: ${message}`)
  return []
}

async function writePageOutputs(pagePath, html, templatePath) {
  for (const outputPath of outputPathsForPage(pagePath, templatePath)) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html, 'utf8')
  }
}

// ===== 入口页 =====

// 法务与平台说明页的正文：privacy / payment-refund / about 读共享 JSON，
// terms 与 SPA 一致走接口（协议正文由后端下发，前端也是现取的）。
// 接口取不到时只警告、不中断构建：这几页仍会带上 lead 与站内导航，但要在输出里显眼地提示出来，
// 免得又发出一个「只有一句话」的静态页却没人发现。
async function loadDocuments() {
  const legal = JSON.parse(readFileSync(legalContentPath, 'utf8'))
  const documents = {
    about: aboutDocument(legal.about),
    privacy: normalizeLegalDocument(legal.privacy),
    'payment-refund': normalizeLegalDocument(legal.paymentRefund),
    terms: null,
  }

  try {
    const agreement = await fetchUserServiceAgreement(apiBaseUrl)
    documents.terms = agreementDocument(agreement)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[seo] !! 用户服务协议正文取不到，/terms 静态页将只有一句话：${message}`)
  }

  return documents
}

// JSON 里的文档结构与视图共用；这里统一补上 heading / 生效日期，并做一次深拷贝（下面会排序、拼接文本）。
function normalizeLegalDocument(doc) {
  const blocks = []
  let effectiveAt = ''

  for (const block of doc.blocks ?? []) {
    if (block.type === 'effective') {
      effectiveAt = block.text
      continue
    }

    blocks.push(block)
  }

  return { heading: doc.heading, effectiveAt, blocks }
}

// 用户服务协议接口返回的是纯文本（`\r\n` 分行），按 SPA 视图同一套规则切段落与章节标题。
function agreementDocument(agreement) {
  return {
    heading: cleanText(agreement?.title) || '用户服务协议',
    effectiveAt: formatDateText(agreement?.effective_at),
    blocks: splitAgreementLines(agreement?.content),
  }
}

function splitAgreementLines(content) {
  return String(content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      // 与 src/views/TermsView.vue 的 splitLines 一致：中文序号开头算章节标题。
      /^第?[一二三四五六七八九十百]+[、.．]/.test(line)
        ? { type: 'heading', text: line }
        : { type: 'paragraph', text: line },
    )
}

// 「关于我们」的文案是结构化字段（卡片 / 数据 / 段落），这里压成一篇可读的文档交给渲染器。
function aboutDocument(about) {
  const cards = (items) => items.map((item) => ({ type: 'paragraph', text: `${item.title}：${item.text}` }))
  const facts = about.facts.items.map((item) => `${item.big}（${item.small}）`).join('；')

  return {
    heading: about.heroLines.join(''),
    effectiveAt: '',
    blocks: [
      { type: 'paragraph', text: about.hint },
      { type: 'heading', text: about.highlights.heading },
      ...cards(about.highlights.items),
      { type: 'heading', text: '平台现状' },
      { type: 'paragraph', text: facts },
      { type: 'heading', text: about.forCreators.heading },
      ...cards(about.forCreators.items),
      { type: 'heading', text: about.forClients.heading },
      ...cards(about.forClients.items),
      { type: 'heading', text: about.story.heading },
      { type: 'paragraph', text: about.story.paragraphs.join('') },
      { type: 'paragraph', text: about.story.note },
      { type: 'heading', text: about.join.heading },
      { type: 'paragraph', text: about.join.text },
    ],
  }
}

function formatDateText(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim())
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : cleanText(value)
}

function renderPageHtml(template, page, dataset, doc) {
  const url = canonicalPageUrl(page.path)
  const jsonLd = renderEntryJsonLd(page, dataset)

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
      `<!-- SEO_FALLBACK_START -->\n${renderFallback(page, dataset, doc)}\n      <!-- SEO_FALLBACK_END -->`,
    )
    .replace('</head>', `    <!-- SEO_JSONLD_START -->\n    <script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>\n    <!-- SEO_JSONLD_END -->\n  </head>`)
}

// 同一份 dist 上重复生成时（例如构建完又单独重跑脚本），先清掉上一次注入的结构化数据，
// 否则每跑一次都会多出一份 <script type="application/ld+json">。
// 第二个 replace 兼容没有标记的历史注入：只删带本站 Organization `@id` 的那种，
// index.html 里手写的结构化数据不会被误删。
function stripInjectedSeoJsonLd(html) {
  return html
    .replace(/[ \t]*<!-- SEO_JSONLD_START -->[\s\S]*?<!-- SEO_JSONLD_END -->\n?/g, '')
    .replace(/[ \t]*<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*?<\/script>\n?/g, (block) =>
      block.includes(`${siteUrl}/#organization`) ? '' : block,
    )
}

function renderFallback(page, dataset, doc) {
  return `      <main class="seo-fallback" aria-label="柒叁信息" itemscope itemtype="https://schema.org/WebPage">
        <p class="seo-fallback__eyebrow">73INFO · 柒叁信息</p>
        <h1 itemprop="name">${escapeHtml(page.heading)}</h1>
        <p class="seo-fallback__lead" itemprop="description">${escapeHtml(page.lead)}</p>
${renderEntrySections(page, dataset, doc)}        <nav class="seo-fallback__links" aria-label="站点核心入口" itemscope itemtype="https://schema.org/SiteNavigationElement">
${navigationLinks.map(renderNavigationLink).join('\n')}
        </nav>
      </main>`
}

function renderEntrySections(page, dataset, doc) {
  if (page.kind === 'doc') {
    return renderDocSection(doc)
  }

  if (page.kind === 'resources') {
    const listed = listingResources(dataset, page.sale)
    const items = listed.slice(0, listLimit).map(resourceListItem)
    const title = page.sale === 'paid' ? '付费资源列表' : '免费资源列表'
    const emptyHint =
      page.sale === 'paid'
        ? '当前还没有现金定价的付费资源，开发者上架后会出现在这里。'
        : '当前还没有已发布的免费资源，新资源通过审核后会出现在这里。'

    return items.length > 0
      ? renderItemListSection(title, `共 ${listed.length} 份已发布资源，按最近更新排序。`, items)
      : [
          renderItemListSection(title, emptyHint, []),
          ...fallbackSections(dataset, 'resources'),
        ].join('\n')
  }

  if (page.kind === 'requirements') {
    const items = dataset.requirements.slice(0, listLimit).map(requirementListItem)

    return items.length > 0
      ? renderItemListSection(
          '公开需求',
          `共 ${dataset.requirements.length} 条公开需求，按最近更新排序；点进「需求大厅」可查看详情并接单。`,
          items,
        )
      : [
          renderItemListSection(
            '公开需求',
            '需求大厅当前没有正在招募的公开需求；新需求通过审核后会出现在这里。',
            [],
          ),
          ...fallbackSections(dataset, 'requirements'),
        ].join('\n')
  }

  if (page.kind === 'posts') {
    const items = dataset.posts.slice(0, listLimit).map(postListItem)

    return items.length > 0
      ? renderItemListSection(
          '社区帖子',
          `共 ${dataset.posts.length} 篇已发布帖子，按最近发布排序。`,
          items,
        )
      : [
          renderItemListSection(
            '社区帖子',
            '社区还没有公开发布的帖子，平台公告与经验分享会先出现在这里。',
            [],
          ),
          ...fallbackSections(dataset, 'posts'),
        ].join('\n')
  }

  if (page.kind === 'home') {
    return [
      renderItemListSection(
        '最新公开资源',
        '网站开发与小工具方向的公开资源。',
        dataset.resources.slice(0, 12).map(resourceListItem),
      ),
      renderItemListSection(
        '公开需求',
        '需求大厅里正在进行中的公开合作机会。',
        dataset.requirements.slice(0, 6).map(requirementListItem),
      ),
      renderItemListSection(
        '最新社区帖子',
        '平台公告、经验分享与用户讨论。',
        dataset.posts.slice(0, 8).map(postListItem),
      ),
    ]
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

// 一个列表区块就是一段可抓取的正文 + 一组站内链接：
// 列表页因此既是内容页，也是通往详情页的内链枢纽（否则整站只有 sitemap 一条发现路径）。
function renderItemListSection(title, hint, items) {
  // 列表为空但带说明的区块照样渲染：空列表的入口页只剩「一句定位 + 菜单」，就又退化成模板页；
  // 说明段落至少让爬虫读到这页是什么、现在有什么、还能去哪看。
  if (items.length === 0 && !hint) {
    return ''
  }

  const rows = items
    .map((item) => {
      const name = item.href
        ? `<a href="${escapeAttribute(sitePath(item.href))}">${escapeHtml(item.title)}</a>`
        : `<strong>${escapeHtml(item.title)}</strong>`
      const meta = item.meta ? `\n              <small>${escapeHtml(item.meta)}</small>` : ''
      const description = item.description
        ? `\n              <em>${escapeHtml(item.description)}</em>`
        : ''

      return `            <li>
              ${name}${meta}${description}
            </li>`
    })
    .join('\n')

  const list =
    items.length > 0
      ? `
          <ul class="seo-fallback__list">
${rows}
          </ul>`
      : ''

  return `        <section class="seo-fallback__section">
          <h2 class="seo-fallback__section-title">${escapeHtml(title)}</h2>
          ${hint ? `<p class="seo-fallback__section-hint">${escapeHtml(hint)}</p>` : ''}${list}
        </section>
`
}

// 某一类公开内容为空时的兜底：挂上其它公开列表，页面仍有实质文字与可爬的内链。
function fallbackSections(dataset, only) {
  return [
    {
      key: 'resources',
      title: '最新公开资源',
      hint: '网站开发与小工具方向的公开资源。',
      items: dataset.resources.slice(0, 12).map(resourceListItem),
    },
    {
      key: 'posts',
      title: '最新社区帖子',
      hint: '平台公告、经验分享与用户讨论。',
      items: dataset.posts.slice(0, 8).map(postListItem),
    },
    {
      key: 'requirements',
      title: '公开需求',
      hint: '需求大厅里正在进行中的公开合作机会。',
      items: dataset.requirements.slice(0, 6).map(requirementListItem),
    },
  ]
    .filter((section) => section.key !== only && section.items.length > 0)
    .slice(0, 2)
    .map((section) => renderItemListSection(section.title, section.hint, section.items))
}

// 法务 / 平台说明页的整篇正文。文档取不到时返回空串，页面还留着 lead 与站内导航。
function renderDocSection(doc) {
  if (!doc || doc.blocks.length === 0) {
    return ''
  }

  const effective = doc.effectiveAt
    ? `
          <p class="seo-fallback__section-hint">生效日期：${escapeHtml(doc.effectiveAt)}</p>`
    : ''

  return `        <section class="seo-fallback__section">
          <h2 class="seo-fallback__section-title">${escapeHtml(doc.heading)}</h2>${effective}
          <div class="seo-fallback__body">
${doc.blocks.map(renderDocBlock).join('\n')}
          </div>
        </section>
`
}

function renderDocBlock(block) {
  if (block.type === 'heading') {
    return `            <h3>${escapeHtml(block.text)}</h3>`
  }

  if (block.type === 'list') {
    const items = block.items.map((item) => `              <li>${escapeHtml(item)}</li>`).join('\n')
    return `            <ul>\n${items}\n            </ul>`
  }

  if (block.type === 'paragraph-link') {
    const link = `<a href="${escapeAttribute(sitePath(block.to))}">${escapeHtml(block.linkText)}</a>`
    return `            <p>${escapeHtml(block.before)}${link}${escapeHtml(block.after)}</p>`
  }

  return `            <p>${escapeHtml(block.text)}</p>`
}

// 门户厅的取数口径与前端免费/付费厅一致（见 `isCashPaidListingResource`）：
// 免费厅收 `price_fen <= 0`，付费厅收现金定价的资源。
function listingResources(dataset, sale) {
  return sale === 'paid'
    ? dataset.resources.filter(isCashPaidListingResource)
    : dataset.resources.filter(isFreeListingResource)
}

function resourceListItem(resource) {
  const title = cleanText(resource.title) || '资源详情'
  const meta = [cleanText(resource.creator || resource.author), cleanText(resource.platform)]
    .filter(Boolean)
    .join(' · ')

  return {
    href: `/resources/${resourceDetailSlug(resource)}`,
    title,
    meta,
    description: truncateText(stripHtml(resource.description), 90),
  }
}

// 需求没有独立的公开详情页（大厅用 `?requirement_id=` 打开弹窗），所以只渲染文字不给链接，
// 免得制造一批只有查询参数不同的重复 URL。
function requirementListItem(requirement) {
  const meta = [
    formatBudget(requirement.budget),
    requirementStatusText(requirement.status, requirement.payment_mode),
    requirementPaymentModeText(requirement.payment_mode),
    formatDateTimeText(requirement.created_at),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    title: cleanText(requirement.title) || '公开需求',
    meta,
    description: truncateText(stripHtml(requirement.description), 120),
  }
}

function postListItem(post) {
  const tags = postTagNames(post)
  const meta = [cleanText(post.author), formatDateTimeText(post.published_at), tags.join('、')]
    .filter(Boolean)
    .join(' · ')

  return {
    href: `/community/posts/${Number(post.id)}`,
    title: cleanText(post.title) || '社区帖子',
    meta,
    description: truncateText(stripHtml(post.content_html), 90),
  }
}

// ===== 入口页结构化数据 =====

function renderEntryJsonLd(page, dataset) {
  const url = canonicalPageUrl(page.path)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: page.title,
        description: page.description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${siteUrl}/#website` },
      },
      ...(page.path === '/' ? [] : [breadcrumbNode(page.heading, page.path)]),
      ...entryItemLists(page, dataset),
    ],
  }
}

function entryItemLists(page, dataset) {
  const lists = []

  const push = (name, items) => {
    const listItems = items
      .filter((item) => item.href)
      .map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        url: absoluteUrl(item.href),
      }))

    if (listItems.length > 0) {
      lists.push({ '@type': 'ItemList', name, numberOfItems: listItems.length, itemListElement: listItems })
    }
  }

  if (page.kind === 'resources') {
    push(
      page.sale === 'paid' ? '付费资源列表' : '免费资源列表',
      listingResources(dataset, page.sale).slice(0, listLimit).map(resourceListItem),
    )
  }

  if (page.kind === 'posts') {
    push('社区帖子', dataset.posts.slice(0, listLimit).map(postListItem))
  }

  if (page.kind === 'home') {
    push('最新公开资源', dataset.resources.slice(0, 12).map(resourceListItem))
    push('最新社区帖子', dataset.posts.slice(0, 8).map(postListItem))
  }

  return lists
}

// ===== 详情页 =====

function renderResourceDetailPage(resource, dataset) {
  const title = cleanText(resource.title) || '资源详情'
  const uploader = cleanText(resource.creator || resource.author)
  const author = cleanText(resource.author) || uploader
  const platform = cleanText(resource.platform)
  const tags = resourceTagNames(resource)
  const rawDescription = stripHtml(resource.description)
  // 分类必须按售价算：写死「免费资源」会让付费资源在搜索结果里被标成免费。
  const listingLabel = resourceListingLabel(resource)
  const listingPath = resourceListingPath(resource)
  const priceText = resourcePriceText(resource)
  const isPaid = isCashPaidListingResource(resource)
  const description =
    truncateText(rawDescription, 150) ||
    truncateText(
      `在 73Info ${listingLabel}区浏览「${title}」${platform ? `（${platform}）` : ''}：查看资源介绍、标签、作者与下载入口。`,
      150,
    )
  const path = `/resources/${resourceDetailSlug(resource)}`
  const image = absoluteAssetUrl(resource.cover_url)
  const created = toDateTimeIso(resource.created_at)
  const updated = toDateTimeIso(resource.updated_at) || created
  const related = relatedResources(resource, dataset.resources)
  const uploaderProfilePath = uploader ? publicProfilePath(uploader) : ''

  return {
    path,
    ogType: 'article',
    title: `${title} - ${listingLabel} - 73Info 柒叁信息`,
    description,
    eyebrow: `73INFO · ${listingLabel}`,
    heading: title,
    // 正文完整写进 HTML：原先只放 150 字摘要，正文全靠 JS 渲染，爬虫拿不到内容。
    lead: truncateText(rawDescription, 800) || description,
    itemType: 'https://schema.org/CreativeWork',
    image,
    breadcrumb: [{ name: listingLabel, path: listingPath }, { name: title, path }],
    meta: [
      { label: '发布者', value: uploader },
      { label: '作者', value: author === uploader ? '' : author },
      { label: '价格', value: priceText },
      { label: '平台', value: platform },
      { label: '标签', value: tags.join('、') },
      { label: '浏览', value: formatCount(resource.view_count) },
      { label: '下载', value: formatCount(resource.download_count) },
      { label: '点赞', value: formatCount(resource.like_count) },
    ],
    sections: [
      {
        title: '同标签资源',
        hint: '标签相同或相近的其它公开资源。',
        items: related.sameTag.map(resourceListItem),
      },
      {
        title: '该作者的其它资源',
        hint: uploader ? `作者 ${uploader} 发布的其它公开资源。` : '',
        items: related.sameAuthor.map(resourceListItem),
      },
    ],
    links: [
      // 发布者主页是这批页面的关键内链：否则整站只有 sitemap 一条通往主页的发现路径。
      ...(uploaderProfilePath
        ? [
            {
              href: uploaderProfilePath,
              title: `${uploader} 的公开主页`,
              description: '查看该发布者在 73Info 的公开资源与平台动态。',
            },
          ]
        : []),
      { href: listingPath, title: listingLabel, description: '浏览更多同类公开资源。' },
      { href: '/requirement-hall', title: '需求大厅', description: '发布需求、查看合作机会、对接开发者。' },
      { href: '/community', title: '社区交流', description: '查看平台公告、经验分享和用户讨论。' },
      { href: '/', title: '返回首页', description: '回到 73Info 柒叁信息首页。' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationNode(),
        websiteNode(),
        breadcrumbNode(title, path, [{ name: listingLabel, path: listingPath }]),
        {
      '@type': 'CreativeWork',
          '@id': canonicalPageUrl(path),
      name: title,
      description,
      url: canonicalPageUrl(path),
          ...(uploader ? { author: { '@type': 'Person', name: uploader } } : {}),
          ...(uploaderProfilePath ? { creator: { '@type': 'Person', name: uploader, url: canonicalPageUrl(uploaderProfilePath) } } : {}),
      ...(created ? { datePublished: created } : {}),
      ...(updated ? { dateModified: updated } : {}),
      ...(image ? { image } : {}),
      ...(tags.length > 0 ? { keywords: tags.join(',') } : {}),
          ...(isPaid
            ? {
                offers: {
                  '@type': 'Offer',
                  price: (Number(resource.price_fen) / 100).toFixed(2),
                  priceCurrency: 'CNY',
                  availability: 'https://schema.org/InStock',
                  url: canonicalPageUrl(path),
                },
              }
            : { isAccessibleForFree: true }),
        },
      ],
    },
  }
}

function renderPostDetailPage(post, dataset) {
  const title = cleanText(post.title) || '社区帖子'
  const author = cleanText(post.author)
  const tags = postTagNames(post)
  const plain = stripHtml(post.content_html)
  const description =
    truncateText(plain, 150) ||
    truncateText(`73Info 社区帖子「${title}」${tags.length > 0 ? `，标签：${tags.join('、')}` : ''}。`, 150)
  const path = `/community/posts/${Number(post.id)}`
  const published = toDateTimeIso(post.published_at || post.created_at)
  const updated = toDateTimeIso(post.updated_at) || published
  const bodyParagraphs = stripHtmlParagraphs(post.content_html, bodyLimit)
  const related = dataset.posts.filter((item) => Number(item.id) !== Number(post.id)).slice(0, relatedLimit)

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
    breadcrumb: [{ name: '社区交流', path: '/community' }, { name: title, path }],
    bodyParagraphs,
    meta: [
      { label: '作者', value: author },
      { label: '发布时间', value: formatDateTimeText(published) },
      { label: '标签', value: tags.join('、') },
      { label: '回复', value: formatCount(post.comment_count) },
      { label: '点赞', value: formatCount(post.like_count) },
    ],
    sections: [
      {
        title: '更多社区帖子',
        hint: '社区里的其它公开讨论。',
        items: related.map(postListItem),
      },
    ],
    links: [
      { href: '/community', title: '社区交流', description: '查看平台公告、经验分享和用户讨论。' },
      { href: '/requirement-hall', title: '需求大厅', description: '发布需求、查看合作机会、对接开发者。' },
      { href: '/free-resources', title: '免费资源', description: '浏览网站开发与小工具等公开资源。' },
      { href: '/', title: '返回首页', description: '回到 73Info 柒叁信息首页。' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationNode(),
        websiteNode(),
        breadcrumbNode(title, path, [{ name: '社区交流', path: '/community' }]),
        {
      '@type': 'DiscussionForumPosting',
          '@id': canonicalPageUrl(path),
      headline: title,
      url: canonicalPageUrl(path),
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      ...(published ? { datePublished: published } : {}),
      ...(updated ? { dateModified: updated } : {}),
      ...(plain ? { articleBody: truncateText(plain, 500) } : {}),
      ...(tags.length > 0 ? { keywords: tags.join(',') } : {}),
        },
      ],
    },
  }
}

// 开发者公开主页（前端路由 `/user/:username/profile`）。
// 这批页面原先既不在 sitemap 里、也没有静态快照，爬虫拿到的是一份首页副本；
// 现在按「本人公开资源 + 本人公开帖子 + 主页简介」生成带内链的快照。
function renderProfileDetailPage(profile, dataset) {
  const username = cleanText(profile.username) || '开发者'
  const path = publicProfilePath(profile.username)
  const ownResources = profile.resources
  const ownPosts = profile.posts
  const description =
    truncateText(profile.description, 150) ||
    `查看开发者 ${username} 在 73Info 柒叁信息发布的公开资源、社区动态与协作入口。`
  const image = absoluteAssetUrl(profile.profile?.avatar_url)
  const updated = latestDateTime([
    ...ownResources.map((item) => item.updated_at || item.created_at),
    ...ownPosts.map((item) => item.updated_at || item.published_at),
  ])
  const othersResources = dataset.resources.filter((item) => item.creator !== profile.username)

  return {
    path,
    ogType: 'profile',
    title: `${username} - 开发者主页 - 73Info 柒叁信息`,
    description,
    eyebrow: '73INFO · 开发者主页',
    heading: `${username} 的公开主页`,
    lead: profile.description || description,
    itemType: 'https://schema.org/ProfilePage',
    image,
    breadcrumb: [{ name: '开发者主页', path }],
    meta: [
      { label: '公开资源', value: formatCount(ownResources.length) },
      { label: '公开帖子', value: formatCount(ownPosts.length) },
      { label: '最近更新', value: formatDateTimeText(updated) },
    ],
    sections: [
      {
        title: '公开资源',
        hint: ownResources.length > 0 ? `${username} 发布或收录的公开资源。` : '',
        items: ownResources.slice(0, listLimit).map(resourceListItem),
      },
      {
        title: '公开帖子',
        hint: ownPosts.length > 0 ? `${username} 在社区发布的公开讨论。` : '',
        items: ownPosts.slice(0, listLimit).map(postListItem),
      },
      {
        title: '更多公开资源',
        hint: '平台上的其它公开资源。',
        items: othersResources.slice(0, 8).map(resourceListItem),
      },
    ],
    links: [
      { href: '/free-resources', title: '免费资源', description: '浏览网站开发与小工具等公开资源。' },
      { href: '/paid-resources', title: '付费资源', description: '浏览现金定价的付费资源。' },
      { href: '/requirement-hall', title: '需求大厅', description: '发布需求、查看合作机会、对接开发者。' },
      { href: '/community', title: '社区交流', description: '查看平台公告、经验分享和用户讨论。' },
      { href: '/', title: '返回首页', description: '回到 73Info 柒叁信息首页。' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationNode(),
        websiteNode(),
        breadcrumbNode(`${username} 的公开主页`, path),
        {
          '@type': 'ProfilePage',
          '@id': canonicalPageUrl(path),
          url: canonicalPageUrl(path),
          name: `${username} 的公开主页`,
          description,
          inLanguage: 'zh-CN',
          isPartOf: { '@id': `${siteUrl}/#website` },
          ...(updated ? { dateModified: updated } : {}),
          mainEntity: {
            '@type': 'Person',
            name: username,
            url: canonicalPageUrl(path),
            ...(profile.description ? { description: truncateText(profile.description, 200) } : {}),
            ...(image ? { image } : {}),
          },
        },
        ...(ownResources.length > 0
          ? [
              {
                '@type': 'ItemList',
                name: `${username} 的公开资源`,
                numberOfItems: ownResources.length,
                itemListElement: ownResources.slice(0, listLimit).map((resource, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  name: cleanText(resource.title) || '资源详情',
                  url: absoluteUrl(`/resources/${resourceDetailSlug(resource)}`),
                })),
              },
            ]
          : []),
      ],
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

  const bodyBlock = (page.bodyParagraphs ?? []).length
    ? `        <div class="seo-fallback__body" itemprop="articleBody">\n${page.bodyParagraphs
        .map((paragraph) => `          <p>${escapeHtml(paragraph)}</p>`)
        .join('\n')}\n        </div>\n`
    : ''

  const sections = (page.sections ?? [])
    .map((section) => renderItemListSection(section.title, section.hint, section.items))
    .join('')

  return `      <main class="seo-fallback" aria-label="${escapeAttribute(page.heading)}" itemscope itemtype="${escapeAttribute(page.itemType)}">
        <p class="seo-fallback__eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1 itemprop="name">${escapeHtml(page.heading)}</h1>
        <p class="seo-fallback__lead" itemprop="description">${escapeHtml(page.lead)}</p>
${metaBlock}${bodyBlock}${sections}        <nav class="seo-fallback__links" aria-label="站点核心入口" itemscope itemtype="https://schema.org/SiteNavigationElement">
${page.links.map(renderNavigationLink).join('\n')}
        </nav>
      </main>`
}

// ===== 结构化数据公共节点 =====

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: '73Info 柒叁信息',
    legalName: '彝良柒叁信息有限责任公司',
    url: `${siteUrl}/`,
    email: 'fanbo@73info.cn',
    logo: `${siteUrl}/favicon.svg`,
  }
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: '73Info 柒叁信息',
    alternateName: '柒叁信息',
    description: pages[0].description,
    inLanguage: 'zh-CN',
    publisher: { '@id': `${siteUrl}/#organization` },
  }
}

// `parents` 是「首页 → …」，最后一段由参数给出，拼成爬虫能读懂的层级。
function breadcrumbNode(name, path, parents = []) {
  const items = [{ name: '首页', path: '/' }, ...parents, { name, path }]

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalPageUrl(item.path),
    })),
  }
}

// ===== 内容关联 =====

// 详情页之间原先没有任何链接，爬虫只能靠 sitemap 一条条进来、也读不到「主题相近的还有哪些」。
// 这里按「共同标签数 × 2 + 是否同一作者」打分，挑出最相关的资源。
function relatedResources(resource, allResources) {
  const ownTags = new Set(resourceTagNames(resource))
  const ownAuthor = normalizeResourceOwnerSlug(resource.creator || resource.author || '')
  const others = allResources.filter((item) => Number(item.id) !== Number(resource.id))
  const scored = others
    .map((item) => ({
      item,
      sharedTags: resourceTagNames(item).filter((tag) => ownTags.has(tag)).length,
      sameAuthor: ownAuthor !== 'resource' && normalizeResourceOwnerSlug(item.creator || item.author || '') === ownAuthor,
    }))
    .filter((entry) => entry.sharedTags > 0 || entry.sameAuthor)

  const byTags = scored
    .filter((entry) => entry.sharedTags > 0)
    .sort((a, b) => b.sharedTags - a.sharedTags)
    .slice(0, relatedLimit)
    .map((entry) => entry.item)

  const sameAuthor = scored
    .filter((entry) => entry.sameAuthor)
    .slice(0, relatedLimit)
    .map((entry) => entry.item)

  return { sameTag: byTags, sameAuthor }
}

function postTagNames(post) {
  const names = []

  for (const tag of Array.isArray(post.tags) ? post.tags : []) {
    const cleaned = cleanText(tag?.name)
    if (cleaned && !names.includes(cleaned)) {
      names.push(cleaned)
    }
  }

  return names.slice(0, 8)
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

// ===== 文案与格式 =====

// 与 src/shared/requirementStatus.ts、src/shared/requirementDisplay.ts 保持一致，改那边要同步这里。
const REQUIREMENT_STATUS_LABELS = {
  pending_review: '待审核',
  rejected: '已拒绝',
  pending_deposit: '待付定金',
  in_development: '开发中',
  pending_final: '待付尾款',
  pending_settlement: '待分账',
  completed: '已完成',
  cancelled: '已取消',
}

const DEPOSIT_PAID_LABELS = {
  platform_guarantee: '已付定金',
  self_managed: '待开发',
}

function requirementStatusText(status, paymentMode) {
  if (status === 'deposit_paid') {
    return DEPOSIT_PAID_LABELS[paymentMode] || '已付定金 / 待开发'
  }

  return REQUIREMENT_STATUS_LABELS[status] || cleanText(status)
}

function requirementPaymentModeText(paymentMode) {
  return paymentMode === 'self_managed' ? '无电签约定' : '电签担保'
}

function formatBudget(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return `预算 ¥${amount.toLocaleString('zh-CN')}`
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

// 帖子正文按段落拆开：先把块级标签换成换行，再去标签，行尾拼成一屏能读的段落。
// `limit` 是进入 HTML 的总字数上限（超出部分丢弃，避免单页几万字）。
function stripHtmlParagraphs(value, limit) {
  const text = String(value ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const paragraphs = []
  let used = 0

  for (const raw of text.split(/\n+/)) {
    if (used >= limit) {
      break
    }

    const paragraph = stripHtml(raw)
    if (!paragraph) {
      continue
    }

    const remaining = limit - used
    paragraphs.push(paragraph.length > remaining ? `${paragraph.slice(0, remaining)}…` : paragraph)
    used += paragraph.length
  }

  return paragraphs
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

// 一组时间戳里最新的那个（同格式下字典序等于时间序），转成 JSON-LD 用的 ISO 时间。
function latestDateTime(values) {
  const list = values.map((value) => String(value ?? '').trim()).filter(Boolean).sort()
  return list.length > 0 ? toDateTimeIso(list.at(-1)) : ''
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

// 线上页面以目录形式提供（/xxx/），无斜杠 URL 会 301，站内链接与 canonical 统一输出最终形态。
function sitePath(path) {
  if (path === '/') {
    return '/'
  }

  return `${String(path).replace(/\/+$/, '')}/`
}

function canonicalPageUrl(path) {
  return `${siteUrl}${sitePath(path)}`
}

function absoluteUrl(path) {
  return canonicalPageUrl(path)
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
