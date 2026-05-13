import { requestJson } from '@dev/api/http'
import init, { process_tags } from 'tags-wasm'

let wasmReady: Promise<unknown> | null = null

function ensureWasm(): Promise<unknown> {
  if (!wasmReady) {
    wasmReady = init()
  }
  return wasmReady!
}

export type McTagOption = {
  id: number
  name: string
  alias: string
}

export type McPublishTagGroup = {
  key: string
  group_id: number
  group_name: string
  group_alias: string
  group_path: string[]
  group_path_aliases: string[]
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

const CACHE_KEY = 'dev_processed_tag_tree_cache_v1'
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
