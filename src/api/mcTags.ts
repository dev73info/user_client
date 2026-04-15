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

export type McTagFilterGroup = {
  key: string
  name: string
  label: string
  depth: number
  items: string[]
}

const PLATFORM_ROOT_NAMES = ['Java 版', '基岩版'] as const

export function filterPlatformTagRoots(groups: McTagGroup[]): McTagGroup[] {
  return groups.filter((group) =>
    PLATFORM_ROOT_NAMES.includes(group.name as (typeof PLATFORM_ROOT_NAMES)[number]),
  )
}

export async function getPublicMcTagTree(): Promise<McTagGroup[]> {
  const groups = await requestJson<McTagGroup[]>(
    '/mc-resources/tags',
    {
      method: 'GET',
    },
    '加载标签失败',
  )

  return filterPlatformTagRoots(groups)
}

export function findTagGroupByName(groups: McTagGroup[], name: string): McTagGroup | null {
  for (const group of groups) {
    if (group.name === name) {
      return group
    }

    const found = findTagGroupByName(group.child_groups, name)
    if (found) {
      return found
    }
  }

  return null
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

  const group = root.child_groups.find((entry) => entry.name === groupName)
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

function buildFilterGroupLabel(path: string[]): string {
  if (path.length <= 1) {
    return path[0] ?? ''
  }

  return path.join(' / ')
}

function collectFilterGroups(
  groups: McTagGroup[],
  parentPath: string[] = [],
  depth = 0,
): McTagFilterGroup[] {
  const result: McTagFilterGroup[] = []

  for (const group of groups) {
    const path = [...parentPath, group.name]
    const items = group.items
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
      .map((item) => item.name)

    if (items.length > 0) {
      result.push({
        key: path.join('::'),
        name: group.name,
        label: buildFilterGroupLabel(path),
        depth,
        items,
      })
    }

    result.push(...collectFilterGroups(group.child_groups, path, depth + 1))
  }

  return result
}

export function getPlatformFilterGroups(
  groups: McTagGroup[],
  rootName: string,
): McTagFilterGroup[] {
  const root = findTagGroupByName(groups, rootName)
  if (!root) {
    return []
  }

  return collectFilterGroups(root.child_groups)
}
