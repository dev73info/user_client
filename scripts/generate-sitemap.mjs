import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectPublicProfiles,
  dateOnly,
  fetchPublishedPosts,
  fetchPublishedResources,
  fetchPublicRequirementSpotlights,
  isCashPaidListingResource,
  isFreeListingResource,
  positiveInteger,
  publicProfilePath,
  resourceDetailSlug,
  resolveApiBaseUrl,
  resolveSiteUrl,
} from './lib/seo-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const sitemapPath = resolve(projectRoot, 'public/sitemap.xml')

const siteUrl = resolveSiteUrl()
const apiBaseUrl = resolveApiBaseUrl(projectRoot)
const maxCommunityPosts = positiveInteger(process.env.SITEMAP_MAX_COMMUNITY_POSTS, 1000)
const today = new Date().toISOString().slice(0, 10)
let sitemapFetchFailed = false

// 静态入口页的 lastmod 不用「构建当天」：那样每次发布都会宣称全部入口页刚更新过，
// 爬虫发现这个字段不可信之后会整体忽略它。列表页取该列表里最新的内容时间，
// 关于/协议/隐私/支付退款这几页没有可推断的改动时间，索性不写 lastmod（写错比不写更糟）。
function buildStaticEntries({ resources, posts, requirements, profiles }) {
  const resourceDates = resources.map((item) => dateOnly(item.updated_at || item.created_at)).filter(Boolean)
  const freeResourceDates = resources
    .filter(isFreeListingResource)
    .map((item) => dateOnly(item.updated_at || item.created_at))
    .filter(Boolean)
  const paidResourceDates = resources
    .filter(isCashPaidListingResource)
    .map((item) => dateOnly(item.updated_at || item.created_at))
    .filter(Boolean)
  const postDates = posts.map((item) => dateOnly(item.updated_at || item.published_at)).filter(Boolean)
  const requirementDates = requirements
    .map((item) => dateOnly(item.updated_at || item.created_at))
    .filter(Boolean)
  const overall = latestOf(resourceDates, postDates, requirementDates) || today

  return [
    { path: '/', lastmod: overall, changefreq: 'daily', priority: '1.0' },
    { path: '/free-resources', lastmod: latestOf(freeResourceDates) || today, changefreq: 'daily', priority: '0.8' },
    // 付费厅与免费厅是两个入口页：原先只列了免费厅，付费资源在站内没有任何可爬入口。
    { path: '/paid-resources', lastmod: latestOf(paidResourceDates) || today, changefreq: 'daily', priority: '0.7' },
    {
      path: '/requirement-hall',
      lastmod: latestOf(requirementDates) || today,
      changefreq: 'daily',
      priority: '0.8',
    },
    { path: '/community', lastmod: latestOf(postDates) || today, changefreq: 'weekly', priority: '0.6' },
    { path: '/about', changefreq: 'monthly', priority: '0.5' },
    { path: '/terms', changefreq: 'monthly', priority: '0.4' },
    { path: '/privacy', changefreq: 'monthly', priority: '0.4' },
    { path: '/payment-refund', changefreq: 'monthly', priority: '0.4' },
  ]
}

// 取多组 `YYYY-MM-DD` 里的最大日期；字符串比较即可，同格式下字典序等于时间序。
function latestOf(...groups) {
  const dates = groups.flat().filter(Boolean)
  return dates.length > 0 ? [...dates].sort().at(-1) : ''
}

async function main() {
  const [resources, posts, requirements] = await Promise.all([
    fetchPublishedResources(apiBaseUrl).catch((error) => handleFetchFailure('resources', error)),
    fetchPublishedPosts(apiBaseUrl, maxCommunityPosts).catch((error) =>
      handleFetchFailure('community posts', error),
    ),
    fetchPublicRequirementSpotlights(apiBaseUrl).catch((error) =>
      handleFetchFailure('requirement spotlight', error),
    ),
  ])

  // 公开主页与快照脚本用同一份名单：只有「自己有公开资源 / 公开帖子，或填了主页简介」的人才会进 sitemap，
  // 否则 sitemap 会列出一批只有用户名的空页。
  const profiles = await collectPublicProfiles(apiBaseUrl, resources, posts).catch((error) => {
    sitemapFetchFailed = true
    console.warn(`[sitemap] failed to fetch public profiles: ${error instanceof Error ? error.message : error}`)
    return []
  })

  const entries = [
    ...buildStaticEntries({ resources, posts, requirements }),
    ...resources.map((resource) => ({
      path: `/resources/${resourceDetailSlug(resource)}`,
      lastmod: dateOnly(resource.updated_at || resource.created_at) || today,
      changefreq: 'weekly',
      priority: '0.7',
    })),
    ...posts.map((post) => ({
      path: `/community/posts/${post.id}`,
      lastmod: dateOnly(post.updated_at || post.published_at) || today,
      changefreq: 'weekly',
      priority: '0.6',
    })),
    ...profiles.map((profile) => ({
      path: publicProfilePath(profile.username),
      lastmod:
        latestOf(
          profile.resources.map((item) => dateOnly(item.updated_at || item.created_at)),
          profile.posts.map((item) => dateOnly(item.updated_at || item.published_at)),
        ) || today,
      changefreq: 'weekly',
      priority: '0.5',
    })),
  ]

  if (sitemapFetchFailed && hasExistingSitemap()) {
    console.warn(`[sitemap] keeping existing sitemap because dynamic API data is unavailable -> ${sitemapPath}`)
    return
  }

  await mkdir(dirname(sitemapPath), { recursive: true })
  await writeFile(sitemapPath, renderSitemap(dedupeEntries(entries)), 'utf8')

  console.log(
    `[sitemap] generated ${entries.length} urls (${resources.length} resources, ${posts.length} posts, ${profiles.length} profiles) -> ${sitemapPath}`,
  )
}

function handleFetchFailure(label, error) {
  sitemapFetchFailed = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[sitemap] failed to fetch ${label}: ${message}`)
  return []
}

function hasExistingSitemap() {
  try {
    return readFileSync(sitemapPath, 'utf8').trim().length > 0
  } catch {
    return false
  }
}

function renderSitemap(entries) {
  const urls = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(sitemapUrl(entry.path))}</loc>`]

      // 没有可靠改动时间的页面不写 lastmod：字段不准会让爬虫忽略整站的 lastmod。
      if (entry.lastmod) {
        lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
      }

      lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`)
      lines.push(`    <priority>${escapeXml(entry.priority)}</priority>`)

      return `  <url>\n${lines.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

// 线上页面以目录形式提供（/xxx/），无斜杠 URL 会 301，sitemap 直接列出最终形态。
function sitemapUrl(path) {
  if (path === '/') {
    return `${siteUrl}/`
  }

  return `${siteUrl}${String(path).replace(/\/+$/, '')}/`
}

function dedupeEntries(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    if (seen.has(entry.path)) {
      return false
    }
    seen.add(entry.path)
    return true
  })
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})