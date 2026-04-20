import { requestJson } from '@/api/http'
import init, { process_tags } from 'tags-wasm'

let wasmReady: Promise<unknown> | null = null

function ensureWasm(): Promise<unknown> {
  if (!wasmReady) {
    wasmReady = init()
  }
  return wasmReady!
}

// ── WASM 输出类型 ──

export type McTagOption = {
  id: number
  name: string
}

export type McPublishTagGroup = {
  key: string
  group_id: number
  group_name: string
  group_path: string[]
  label: string
  depth: number
  items: McTagOption[]
}

export type McTagCatalogEntry = {
  key: string
  platform: string
  label: string
  group_name: string
  path_label: string
  icon: string
  publish_groups: McPublishTagGroup[]
}

export type McTagCatalogRoot = {
  key: string
  label: string
  first_entry_key: string | null
  entries: McTagCatalogEntry[]
}

export type McProcessedTagTree = {
  roots: McTagCatalogRoot[]
}

// ── 兼容旧类型 ──

export type McPluginPlatformEntry = {
  slug: string
  platform: string
  label: string
  groupName: string
  pathLabel: string
  icon: string
}

export type McTagFilterSection = {
  id: number
  label: string
  queryKey: string
  tags: string[]
}

export type McPlatformTagFilters = {
  sides: string[]
  versions: string[]
  loaders: string[]
  categories: string[]
}

// ── 缓存 ──

const CACHE_KEY = 'user_processed_tag_tree_cache_v1'
const CACHE_TTL_MS = 60 * 1000

type CachedPayload = {
  cachedAt: number
  data: McProcessedTagTree
}

let memoryCache: CachedPayload | null = null
let inflight: Promise<McProcessedTagTree> | null = null

function isCacheValid(payload: CachedPayload | null): payload is CachedPayload {
  return !!payload && Date.now() - payload.cachedAt < CACHE_TTL_MS
}

function readSessionCache(): CachedPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPayload
    return isCacheValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeSessionCache(payload: CachedPayload) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export async function getProcessedTagTree(): Promise<McProcessedTagTree> {
  if (isCacheValid(memoryCache)) {
    return memoryCache.data
  }

  const sessionCache = readSessionCache()
  if (sessionCache) {
    memoryCache = sessionCache
    return sessionCache.data
  }

  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    await ensureWasm()
    const rawGroups = await requestJson<unknown[]>(
      '/resources/tags',
      { method: 'GET' },
      '加载标签失败',
    )
    const data = process_tags(rawGroups) as McProcessedTagTree
    const payload: CachedPayload = { cachedAt: Date.now(), data }
    memoryCache = payload
    writeSessionCache(payload)
    return data
  })()

  inflight
    .catch(() => {})
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function invalidateTagTreeCache(): void {
  memoryCache = null
  inflight = null
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
  }
}

// ── 工具函数 ──

export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export function getTagRouteSlug(name: string): string {
  return normalizeTagName(name)
}

export function getPlatformSlug(rootName: string): string {
  return normalizeTagName(rootName)
}

export function getResourceDetailSlug(id: number, title: string): string {
  return `${normalizeTagName(title)}--${id}`
}

export function parseResourceIdFromSlug(slug: string): number | null {
  const match = slug.match(/--(\d+)$/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

export function getPlatformLabel(platform: string): string {
  return platform
}

// ── 从预处理树派生数据 ──

export function findRoot(tree: McProcessedTagTree, rootKey: string): McTagCatalogRoot | null {
  return tree.roots.find((r) => r.key === rootKey) ?? null
}

export function findEntry(
  tree: McProcessedTagTree,
  rootKey: string,
  entryKey: string,
): McTagCatalogEntry | null {
  const root = findRoot(tree, rootKey)
  return root?.entries.find((e) => e.key === entryKey) ?? null
}

export function getMcPluginPlatformEntries(
  tree: McProcessedTagTree,
  rootKey: string,
): McPluginPlatformEntry[] {
  const root = findRoot(tree, rootKey)
  if (!root) return []

  return root.entries.map((entry) => ({
    slug: entry.key,
    platform: entry.platform,
    label: entry.label,
    groupName: entry.group_name,
    pathLabel: entry.path_label,
    icon: entry.icon,
  }))
}

export function getTagFilterSections(
  tree: McProcessedTagTree,
  rootKey: string,
  entryKey: string,
): McTagFilterSection[] {
  const entry = findEntry(tree, rootKey, entryKey)
  if (!entry) return []

  return entry.publish_groups
    .filter((g) => g.depth === 0)
    .map((g) => ({
      id: g.group_id,
      label: g.group_name,
      queryKey: `group_${g.group_id}`,
      tags: g.items.map((item) => item.name),
    }))
    .filter((section) => section.tags.length > 0)
}
