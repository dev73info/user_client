import { requestJson } from '@/api/http'

export type McTagItem = {
  id: number
  group_id: number
  name: string
  sort_order: number
}

export type McTagGroup = {
  id: number
  parent_group_id: number | null
  name: string
  sort_order: number
  child_groups: McTagGroup[]
  items: McTagItem[]
}

export type McPlatformTagFilters = {
  sides: string[]
  versions: string[]
  loaders: string[]
  categories: string[]
}

export type McTagFilterSection = {
  id: number
  label: string
  queryKey: string
  tags: string[]
}

export type McPlatformSlug = 'java' | 'bedrock'

export type McPluginPlatformEntry = {
  slug: string
  platform: McPlatformSlug | null
  label: string
  groupName: string
  pathLabel: string
  icon: string
}

const PLATFORM_ROOT_NAMES = ['Java 版', '基岩版'] as const
const MC_PLUGIN_ROOT_NAME = 'MC 插件与模组'
const TAG_TREE_CACHE_KEY = 'mc_tag_tree_cache_v1'
const TAG_TREE_CACHE_TTL_MS = 5 * 60 * 1000

type CachedTagTreePayload = {
  cachedAt: number
  groups: McTagGroup[]
}

type TagTreeIndex = {
  groupByNormalizedName: Map<string, McTagGroup>
}

let tagTreeCache: CachedTagTreePayload | null = null
let tagTreeRequest: Promise<McTagGroup[]> | null = null
const tagTreeIndexes = new WeakMap<McTagGroup[], TagTreeIndex>()

export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

function isTagTreeCacheValid(
  payload: CachedTagTreePayload | null,
): payload is CachedTagTreePayload {
  return !!payload && Date.now() - payload.cachedAt < TAG_TREE_CACHE_TTL_MS
}

function readSessionTagTreeCache(): CachedTagTreePayload | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(TAG_TREE_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedTagTreePayload
    return isTagTreeCacheValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeSessionTagTreeCache(payload: CachedTagTreePayload) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(TAG_TREE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略浏览器存储异常，回退到内存缓存
  }
}

function buildTagTreeIndex(groups: McTagGroup[]): TagTreeIndex {
  const groupByNormalizedName = new Map<string, McTagGroup>()
  const stack = [...groups]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    groupByNormalizedName.set(normalizeTagName(current.name), current)
    if (current.child_groups.length > 0) {
      stack.push(...current.child_groups)
    }
  }

  return { groupByNormalizedName }
}

function getTagTreeIndex(groups: McTagGroup[]): TagTreeIndex {
  const cached = tagTreeIndexes.get(groups)
  if (cached) {
    return cached
  }

  const created = buildTagTreeIndex(groups)
  tagTreeIndexes.set(groups, created)
  return created
}

function collectPlatformTagRoots(groups: McTagGroup[], result: McTagGroup[] = []): McTagGroup[] {
  for (const group of groups) {
    const normalizedName = normalizeTagName(group.name)
    if (PLATFORM_ROOT_NAMES.includes(normalizedName as (typeof PLATFORM_ROOT_NAMES)[number])) {
      result.push(group)
      continue
    }

    if (group.child_groups.length > 0) {
      collectPlatformTagRoots(group.child_groups, result)
    }
  }

  return result
}

export function filterPlatformTagRoots(groups: McTagGroup[]): McTagGroup[] {
  return collectPlatformTagRoots(groups)
}

export async function getPublicMcTagTree(): Promise<McTagGroup[]> {
  const groups = await getAllPublicMcTagTree()

  return filterPlatformTagRoots(groups)
}

export async function getAllPublicMcTagTree(): Promise<McTagGroup[]> {
  if (isTagTreeCacheValid(tagTreeCache)) {
    return tagTreeCache.groups
  }

  const sessionCache = readSessionTagTreeCache()
  if (sessionCache) {
    tagTreeCache = sessionCache
    return sessionCache.groups
  }

  if (tagTreeRequest) {
    return tagTreeRequest
  }

  tagTreeRequest = requestJson<McTagGroup[]>(
    '/mc-resources/tags',
    {
      method: 'GET',
    },
    '加载标签失败',
  )
    .then((groups) => {
      const payload = {
        cachedAt: Date.now(),
        groups,
      }
      tagTreeCache = payload
      writeSessionTagTreeCache(payload)
      return groups
    })
    .finally(() => {
      tagTreeRequest = null
    })

  return tagTreeRequest
}

export function findTagGroupByName(groups: McTagGroup[], name: string): McTagGroup | null {
  return getTagTreeIndex(groups).groupByNormalizedName.get(normalizeTagName(name)) ?? null
}

export function findMcPluginRoot(groups: McTagGroup[]): McTagGroup | null {
  return findTagGroupByName(groups, MC_PLUGIN_ROOT_NAME)
}

export function getChildTagNames(
  groups: McTagGroup[],
  rootName: string,
  groupName: string,
): string[] {
  const root = findTagGroupByName(groups, rootName)
  if (!root) {
    return []
  }

  const normalizedGroupName = normalizeTagName(groupName)
  const group = root.child_groups.find(
    (entry) => normalizeTagName(entry.name) === normalizedGroupName,
  )
  if (!group) {
    return []
  }

  return group.items
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    .map((item) => item.name)
}

export function getPlatformTagFilters(
  groups: McTagGroup[],
  rootName: string,
): McPlatformTagFilters {
  return {
    sides: getChildTagNames(groups, rootName, '适用端'),
    versions: getChildTagNames(groups, rootName, '版本'),
    loaders: getChildTagNames(groups, rootName, '加载器'),
    categories: getChildTagNames(groups, rootName, '类别'),
  }
}

export function getTagFilterSections(
  groups: McTagGroup[],
  groupName: string,
): McTagFilterSection[] {
  const group = findTagGroupByName(groups, groupName)
  if (!group) {
    return []
  }

  return group.child_groups
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    .map((child) => ({
      id: child.id,
      label: normalizeTagName(child.name),
      queryKey: `group_${child.id}`,
      tags: child.items
        .slice()
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
        .map((item) => normalizeTagName(item.name))
        .filter(Boolean),
    }))
    .filter((section) => section.tags.length > 0)
}

export function getPlatformSlug(rootName: string): McPlatformSlug | null {
  const normalizedRootName = normalizeTagName(rootName)

  if (normalizedRootName === 'Java 版') {
    return 'java'
  }

  if (normalizedRootName === '基岩版') {
    return 'bedrock'
  }

  return null
}

export function getPlatformLabel(platform: McPlatformSlug): string {
  return platform === 'bedrock' ? '基岩版' : 'Java 版'
}

export function findGroupPlatform(group: McTagGroup): McPlatformSlug | null {
  const directPlatform = getPlatformSlug(group.name)
  if (directPlatform) {
    return directPlatform
  }

  for (const child of group.child_groups) {
    const childPlatform = findGroupPlatform(child)
    if (childPlatform) {
      return childPlatform
    }
  }

  return null
}

export function getTagRouteSlug(name: string): string {
  return normalizeTagName(name)
}

export function getMcPluginPlatformEntries(
  groups: McTagGroup[],
  rootName?: string,
): McPluginPlatformEntry[] {
  const pluginRoot = rootName ? findTagGroupByName(groups, rootName) : findMcPluginRoot(groups)
  const sourceGroups = pluginRoot?.child_groups ?? filterPlatformTagRoots(groups)

  return sourceGroups
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    .map((group): McPluginPlatformEntry => {
      const platform = findGroupPlatform(group)
      const label = normalizeTagName(group.name)

      return {
        slug: getTagRouteSlug(group.name),
        platform,
        label,
        groupName: normalizeTagName(group.name),
        pathLabel: `${normalizeTagName(pluginRoot?.name ?? MC_PLUGIN_ROOT_NAME)} / ${label}`,
        icon: platform === 'bedrock' ? '🧱' : platform === 'java' ? '☕' : '📁',
      }
    })
}
