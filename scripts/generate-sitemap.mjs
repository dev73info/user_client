import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  dateOnly,
  fetchPublishedPosts,
  fetchPublishedResources,
  positiveInteger,
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

const staticEntries = [
  { path: '/', lastmod: today, changefreq: 'daily', priority: '1.0' },
  { path: '/free-resources', lastmod: today, changefreq: 'daily', priority: '0.8' },
  { path: '/requirement-hall', lastmod: today, changefreq: 'daily', priority: '0.8' },
  { path: '/community', lastmod: today, changefreq: 'weekly', priority: '0.6' },
  { path: '/about', lastmod: today, changefreq: 'monthly', priority: '0.5' },
  { path: '/terms', lastmod: today, changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy', lastmod: today, changefreq: 'monthly', priority: '0.4' },
  { path: '/payment-refund', lastmod: today, changefreq: 'monthly', priority: '0.4' },
]

async function main() {
  const [resources, posts] = await Promise.all([
    fetchPublishedResources(apiBaseUrl).catch((error) => handleFetchFailure('resources', error)),
    fetchPublishedPosts(apiBaseUrl, maxCommunityPosts).catch((error) =>
      handleFetchFailure('community posts', error),
    ),
  ])
  const entries = [
    ...staticEntries,
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
  ]

  if (sitemapFetchFailed && hasExistingSitemap()) {
    console.warn(`[sitemap] keeping existing sitemap because dynamic API data is unavailable -> ${sitemapPath}`)
    return
  }

  await mkdir(dirname(sitemapPath), { recursive: true })
  await writeFile(sitemapPath, renderSitemap(dedupeEntries(entries)), 'utf8')

  console.log(
    `[sitemap] generated ${entries.length} urls (${resources.length} resources, ${posts.length} posts) -> ${sitemapPath}`,
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
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(sitemapUrl(entry.path))}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${escapeXml(entry.changefreq)}</changefreq>
    <priority>${escapeXml(entry.priority)}</priority>
  </url>`,
    )
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