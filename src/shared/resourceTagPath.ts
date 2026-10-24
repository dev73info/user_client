import type { McTagCatalogRoot } from '@/api/resourceTags'

/**
 * 「资源主页编辑」页的标签归类定位（纯函数）。
 *
 * 从视图里抽出来的原因：这段逻辑有两轮回退（先按资源自己的 `tag_selections`，
 * 再按历史上的 `platform` 口径），还有一处「定位不到就只做展示回落」的分支。
 * 它不碰接口、不碰响应式，输入标签树与资源字段就够，放在 shared 里可以直接被用例盯住。
 */

/** 归类名的比较口径：去首尾空白、去掉名字里的所有空白（`Java 版` 与 `Java版` 视为同一个）。 */
export function normalizeTagPathSegment(value?: string | null): string {
  return value?.trim().replace(/\s+/g, '') ?? ''
}

export interface TagPathSource {
  /** 资源的平台字段（历史口径，通常是二级节点名，偶尔是根节点名）。 */
  platform?: string | null
  /** 资源已保存的标签归类，`group_path` 是 `[根节点, 二级节点, 标签组]`。 */
  tagSelections?: { group_path: string[] }[] | null
}

export interface TagPathKeys {
  rootKey: string
  entryKey: string
}

/**
 * 按资源自身的归类定位「根节点 / 二级节点」（只定位，不改勾选）。
 *
 * 优先级：标签选择的 `group_path` 前两段（美术 / 手绘，就是资源实际归属，最可靠）
 * → 资源的 `platform` 匹配二级节点名（历史资源的平台字段口径）。
 * 两轮都定位不到就返回 null，由调用方记住「当前只是回落展示」。
 */
export function resolveTagPath(
  source: TagPathSource,
  roots: McTagCatalogRoot[],
): TagPathKeys | null {
  for (const selection of source.tagSelections ?? []) {
    const rootLabel = normalizeTagPathSegment(selection.group_path[0])
    const entryLabel = normalizeTagPathSegment(selection.group_path[1])
    if (!rootLabel || !entryLabel) continue
    const root = roots.find(
      (item) =>
        normalizeTagPathSegment(item.label) === rootLabel ||
        normalizeTagPathSegment(item.key) === rootLabel,
    )
    // 二级节点的名字在各棵树里既有 `group_name` 也有 `platform`，两个都比一次：
    // 只比 group_name 时，`group_path` 里存的是平台名的资源会定位不到。
    const entry = root?.entries.find(
      (item) =>
        normalizeTagPathSegment(item.group_name) === entryLabel ||
        normalizeTagPathSegment(item.platform) === entryLabel,
    )
    if (!root || !entry) continue
    return { rootKey: root.key, entryKey: entry.key }
  }

  const platform = normalizeTagPathSegment(source.platform)
  if (!platform) {
    return null
  }

  const root = roots.find((item) =>
    item.entries.some((entry) => normalizeTagPathSegment(entry.platform) === platform),
  )
  const entry = root?.entries.find((item) => normalizeTagPathSegment(item.platform) === platform)
  if (!root || !entry) {
    return null
  }

  return { rootKey: root.key, entryKey: entry.key }
}

/**
 * 归类定位不到时的展示回落：下拉停在标签树的根节点 / 其首个二级节点上。
 *
 * 只算下拉的展示值：空值会让两个下拉都显示占位符，和旁边「当前：<回落项>」的读数自相矛盾。
 * 它**不改**“是否已定位到”这层语义——那由调用方记着，保存时据此换回资源原有归类。
 */
export function resolveDisplayTagPath(
  roots: McTagCatalogRoot[],
  current: TagPathKeys,
): TagPathKeys {
  const root = roots.find((item) => item.key === current.rootKey) ?? roots[0] ?? null
  const entries = root?.entries ?? []
  const entry = entries.find((item) => item.key === current.entryKey) ?? entries[0] ?? null
  return { rootKey: root?.key ?? '', entryKey: entry?.key ?? '' }
}

export interface TagPathLabelSource extends TagPathSource {
  /** 当前下拉选中的根节点 / 二级节点的展示名。 */
  rootLabel?: string | null
  entryLabel?: string | null
}

/**
 * 归类路径第 `index` 段的展示名：0 = 当前根节点，1 = 当前二级节点，更深的段落取资源已保存的归类。
 *
 * 预览卡与保存前的读数都用它，口径必须一致，所以只写一份。
 */
export function tagPathSegment(index: number, source: TagPathLabelSource): string {
  if (index === 0 && source.rootLabel) {
    return source.rootLabel
  }

  if (index === 1 && source.entryLabel) {
    return source.entryLabel
  }

  return savedTagPathSegment(index, source.tagSelections)
}

/** 资源已保存归类里第 `index` 段的原文（不看当前下拉）。 */
export function savedTagPathSegment(
  index: number,
  tagSelections?: { group_path: string[] }[] | null,
): string {
  return tagSelections?.find((item) => item.group_path[index])?.group_path[index] ?? ''
}
