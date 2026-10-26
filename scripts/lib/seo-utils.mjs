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
          const value = line
            .slice(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, '')
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
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

export function resolveSiteUrl() {
  return normalizeBaseUrl(
    process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL,
  )
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
  return Array.isArray(data)
    ? data.filter((item) => item?.id && item?.visibility === 'published' && !isHiddenResource(item))
    : []
}

// ===== 售价口径 =====

// 必须与前端 src/shared/resourceSale.ts 一致：
// 「免费资源」厅收 price_fen <= 0（积分定价也进免费厅），「付费资源」厅收 price_fen > 0 且不是积分资源。
// 之前这里不看价格，所有资源页的标题都写死「免费资源」，付费资源于是在搜索结果里被标成免费。
export function isCashPaidListingResource(resource) {
  return Number(resource?.price_fen ?? 0) > 0 && Number(resource?.price_points ?? 0) <= 0
}

export function isFreeListingResource(resource) {
  return Number(resource?.price_fen ?? 0) <= 0
}

/** 资源所示的分类名，与 `resourceListingPath` 指向的厅同名。 */
export function resourceListingLabel(resource) {
  return isCashPaidListingResource(resource) ? '付费资源' : '免费资源'
}

/** 该资源所在的门户厅；详情页的面包屑与导流链接都指向它。 */
export function resourceListingPath(resource) {
  return isCashPaidListingResource(resource) ? '/paid-resources' : '/free-resources'
}

/** 价格文案：免费 / ¥10.00 / N 积分。 */
export function resourcePriceText(resource) {
  const points = Number(resource?.price_points ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }

  const fen = Number(resource?.price_fen ?? 0)
  if (!Number.isFinite(fen) || fen <= 0) {
    return '免费'
  }

  return `¥${(fen / 100).toFixed(2)}`
}

// ===== 测试 / 示例数据 =====

// 测试数据既没有检索价值，又会把「测试…」这样的标题带进搜索结果与门户列表。
// 标题像测试数据的直接排除；线上另有漏网的用 SEO_HIDDEN_RESOURCE_IDS=12,34 显式屏蔽。
const HIDDEN_TITLE_PATTERN = /^\s*(测试|自测|test|demo|示例)/i
let cachedHiddenResourceIds = null

export function hiddenResourceIds() {
  if (cachedHiddenResourceIds) {
    return cachedHiddenResourceIds
  }

  cachedHiddenResourceIds = new Set(
    String(process.env.SEO_HIDDEN_RESOURCE_IDS || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
  )

  return cachedHiddenResourceIds
}

export function isHiddenResource(resource) {
  if (hiddenResourceIds().has(Number(resource?.id))) {
    return true
  }

  return HIDDEN_TITLE_PATTERN.test(String(resource?.title ?? '').trim())
}

// ===== 公开主页 =====

/**
 * 用户名能不能直接当快照目录名。
 *
 * 快照在 Windows 上构建、再整体上传（见技能 `deploy-73info`），而 Windows 会把结尾带点或空格的名字
 * 规范化掉：`user/Tequila.` 建出来之后，`user/Tequila./profile` 会被解析成 `user/Tequila/profile`，
 * 于是上传脚本递归列文件时报「系统找不到指定的路径」，整次部署死在半路（实测 2026-10-11）。
 * 这类用户名不生成主页快照、也不进 sitemap：页面照旧能用 SPA 打开，只是没有静态快照供收录。
 */
const UNSAFE_PATH_SEGMENT = /[<>:"/\\|?*\u0000-\u001f]/

export function isSnapshotSafePathSegment(value) {
  const segment = String(value ?? '').trim()
  if (!segment || segment === '.' || segment === '..') {
    return false
  }

  if (/[.\s]$/.test(segment)) {
    return false
  }

  return !UNSAFE_PATH_SEGMENT.test(segment)
}

/** 开发者公开主页的站内路径：与前端 `dev-profile` 路由 `/:username` 参数一致，原样取用户名。 */
export function publicProfilePath(username) {
  return `/user/${encodeURIComponent(String(username ?? '').trim())}/profile`
}

export async function fetchPublicUserProfile(apiBaseUrl, username) {
  return fetchJson(apiBaseUrl, `/user/${encodeURIComponent(String(username ?? '').trim())}`)
}

/**
 * 公开主页快照的候选名单：公开资源的创建者 + 公开帖子的作者。
 *
 * 只有「有实质内容可写」的人才会返回（自己有公开资源、有自己的公开帖子，或填了主页简介），
 * 否则生成的是一张只有用户名的空页——那种页面进 sitemap 就是给收录质量添乱。
 * 用户的公开档案接口取不到（不是本站用户、或改名了）不算错，退回只用资源与帖子来判定。
 * 用户名不能当目录名的（见 `isSnapshotSafePathSegment`）跳过并告警。
 */
export async function collectPublicProfiles(apiBaseUrl, resources, posts) {
  const candidates = new Map()
  const skipped = new Set()

  const addCandidate = (username, kind, item) => {
    if (!username) {
      return
    }

    if (!isSnapshotSafePathSegment(username)) {
      skipped.add(username)
      return
    }

    if (!candidates.has(username)) {
      candidates.set(username, { username, resources: [], posts: [] })
    }

    candidates.get(username)[kind].push(item)
  }

  for (const resource of resources) {
    addCandidate(String(resource?.creator ?? '').trim(), 'resources', resource)
  }

  for (const post of posts) {
    addCandidate(String(post?.author ?? '').trim(), 'posts', post)
  }

  if (skipped.size > 0) {
    console.warn(
      `[seo] skipped ${skipped.size} profile(s) whose username is not usable as a directory name: ${[...skipped].join(', ')}`,
    )
  }

  const profiles = await Promise.all(
    [...candidates.values()].map(async (entry) => {
      let profile = null
      try {
        profile = await fetchPublicUserProfile(apiBaseUrl, entry.username)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[seo] failed to fetch public profile ${entry.username}: ${message}`)
      }

      const description = String(profile?.profile_description ?? '').trim()
      if (entry.resources.length === 0 && entry.posts.length === 0 && !description) {
        return null
      }

      return { ...entry, profile, description }
    }),
  )

  return profiles.filter(Boolean)
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

// 需求大厅的公开列表。需求没有独立的公开详情页（大厅用 `?requirement_id=` 打开弹窗），
// 所以这份数据只用于把「哪些需求正在招人」写进入口页的静态快照。
//
// 路径是后端真实路由 `/api/requirements/public-spotlight`：前端写的
// `/public/requirements/...` 是相对路径，会被 src/shared/api/url.ts 的别名表改写成前者，
// 脚本直连后端，必须自己用改写后的地址。
export async function fetchPublicRequirementSpotlights(apiBaseUrl, maxItems = 200) {
  const items = []
  const pageSize = 50

  for (let page = 1; items.length < maxItems; page += 1) {
    const data = await fetchJson(
      apiBaseUrl,
      `/requirements/public-spotlight?page=${page}&page_size=${pageSize}`,
    )
    const batch = Array.isArray(data?.items) ? data.items : []
    if (batch.length === 0) {
      break
    }

    items.push(...batch.filter((item) => item?.requirement_id && item?.title))

    if (batch.length < pageSize) {
      break
    }
  }

  return items.slice(0, maxItems)
}

// 详情快照统一取详情接口，不依赖列表返回的摘要或正文字段。
export async function fetchCommunityPostDetail(apiBaseUrl, postId) {
  return fetchJson(apiBaseUrl, `/community/posts/${Number(postId)}`)
}

// 用户服务协议正文：与 SPA 的 TermsView 走同一个接口（协议内容由后端下发、可后台改版本），
// 所以静态快照也必须现取，不能在脚本里写死一份。
export async function fetchUserServiceAgreement(apiBaseUrl) {
  return fetchJson(apiBaseUrl, '/auth/user-service-agreement')
}

// 通用协议 / 附件正文（R043 任务-02/03）：《隐私政策》《支付与退款说明》等配套附件
// 入库到后端 `contract_template` 之后，静态快照与 SPA 一样走接口读，避免"页面改了、快照没改"。
export async function fetchAgreementContent(apiBaseUrl, code) {
  return fetchJson(apiBaseUrl, `/auth/agreement-content?code=${encodeURIComponent(code)}`)
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
