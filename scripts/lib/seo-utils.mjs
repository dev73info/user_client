// 构建期 SEO 产物（sitemap / 静态快照页）共用的工具函数。
// 注意：资源详情 slug 规则必须与前端 src/api/resourceTags.ts 的
// getResourceDetailSlug / normalizeResourceOwnerSlug 完全一致。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_SITE_URL = 'https://73info.cn'
const DEFAULT_API_BASE_URL = 'https://api.73info.cn'

let cachedEnv = new Map()

export function readEnvFile(path) {
  const key = String(path)
  if (cachedEnv.has(key)) {
    return cachedEnv.get(key)
  }

  let result = {}
  try {
    result = Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=')
          const name = line.slice(0, index).trim()
          const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
          return [name, value]
        }),
    )
  } catch {
    result = {}
  }

  cachedEnv.set(key, result)
  return result
}

export function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function resolveSiteUrl() {
  return normalizeBaseUrl(process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL)
}

export function resolveApiBaseUrl(projectRoot) {
  const productionEnv = projectRoot ? readEnvFile(resolve(projectRoot, '.env.production')) : {}
  const value = normalizeBaseUrl(
    process.env.SITEMAP_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      productionEnv.VITE_API_BASE_URL ||
      DEFAULT_API_BASE_URL,
  )
  const base = /^https?:\/\//i.test(value)
    ? value
    : `${resolveSiteUrl()}${value.startsWith('/') ? value : `/${value}`}`

  return base.endsWith('/api') ? base : `${base}/api`
}

export function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function dateOnly(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function normalizeResourceOwnerSlug(value) {
  const slug = String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'resource'
}

export function resourceDetailSlug(resource) {
  return `${normalizeResourceOwnerSlug(resource.creator || resource.author || '')}--${Number(resource.id)}`
}

export async function fetchPublishedResources(apiBaseUrl) {
  const data = await fetchJson(apiBaseUrl, '/resource/resources')
  return Array.isArray(data) ? data.filter((item) => item?.id && item?.visibility === 'published') : []
}

export async function fetchPublishedPosts(apiBaseUrl, maxPosts = 1000) {
  const posts = []
  const pageSize = 50

  for (let offset = 0; posts.length < maxPosts; offset += pageSize) {
    const batch = await fetchJson(apiBaseUrl, `/community/posts?limit=${pageSize}&offset=${offset}`)
    if (!Array.isArray(batch) || batch.length === 0) {
      break
    }

    posts.push(...batch.filter((item) => item?.id && item?.status === 'published'))

    if (batch.length < pageSize) {
      break
    }
  }

  return posts.slice(0, maxPosts)
}

// 帖子列表接口不返回正文（content_html 恒为空），需要单独取详情。
export async function fetchCommunityPostDetail(apiBaseUrl, postId) {
  return fetchJson(apiBaseUrl, `/community/posts/${Number(postId)}`)
}

async function fetchJson(apiBaseUrl, path) {
  const url = new URL(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`[seo] ${url} returned HTTP ${response.status}`)
  }

  return response.json()
}
