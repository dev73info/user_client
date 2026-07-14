import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const sitemapPath = resolve(projectRoot, 'public/sitemap.xml')
const productionEnv = readEnvFile(resolve(projectRoot, '.env.production'))

const siteUrl = normalizeBaseUrl(
  process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || 'https://73info.cn',
)
const apiBaseUrl = normalizeBaseUrl(
  process.env.SITEMAP_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    productionEnv.VITE_API_BASE_URL ||
    'https://api.73info.cn',
)
const resolvedApiBaseUrl = resolveBaseUrl(apiBaseUrl)
const maxCommunityPosts = positiveInteger(process.env.SITEMAP_MAX_COMMUNITY_POSTS, 1000)
const today = new Date().toISOString().slice(0, 10)
let sitemapFetchFailed = false

const staticEntries = [
  { path: '/', lastmod: today, changefreq: 'daily', priority: '1.0' },
  { path: '/free-resources', lastmod: today, changefreq: 'daily', priority: '0.8' },
  { path: '/requirement-hall', lastmod: today, changefreq: 'daily', priority: '0.8' },
  { path: '/community', lastmod: today, changefreq: 'weekly', priority: '0.6' },
  { path: '/terms', lastmod: today, changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy', lastmod: today, changefreq: 'monthly', priority: '0.4' },
  { path: '/payment-refund', lastmod: today, changefreq: 'monthly', priority: '0.4' },
]

async function main() {
  const [resources, posts] = await Promise.all([
    fetchResources().catch((error) => handleFetchFailure('resources', error)),
    fetchCommunityPosts().catch((error) => handleFetchFailure('community posts', error)),
  ])
  const entries = [
    ...staticEntries,
    ...resources.map((resource) => ({
      path: `/resources/${resourceSlug(resource)}`,
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

async function fetchResources() {
  const data = await fetchJson('/resource/resources')
  return Array.isArray(data) ? data.filter((item) => item?.id && item?.visibility === 'published') : []
}

async function fetchCommunityPosts() {
  const posts = []
  const pageSize = 50

  for (let offset = 0; posts.length < maxCommunityPosts; offset += pageSize) {
    const batch = await fetchJson(`/community/posts?limit=${pageSize}&offset=${offset}`)
    if (!Array.isArray(batch) || batch.length === 0) {
      break
    }

    posts.push(...batch.filter((item) => item?.id && item?.status === 'published'))

    if (batch.length < pageSize) {
      break
    }
  }

  return posts.slice(0, maxCommunityPosts)
}

async function fetchJson(path) {
  const url = new URL(`${resolvedApiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`[sitemap] ${url} returned HTTP ${response.status}`)
  }

  return response.json()
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
    <loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc>
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

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=')
          const key = line.slice(0, index).trim()
          const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
          return [key, value]
        }),
    )
  } catch {
    return {}
  }
}

function resolveBaseUrl(value) {
  const base = /^https?:\/\//i.test(value)
    ? value
    : `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`

  if (base.endsWith('/api')) {
    return base
  }

  return `${base}/api`
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resourceSlug(resource) {
  return `${ownerSlug(resource.creator || resource.author || '')}--${Number(resource.id)}`
}

function ownerSlug(value) {
  const slug = String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'resource'
}

function dateOnly(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
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