import { isApiResourceKind } from '@/shared/resourceApi'

export type ResourcePresentationInput = {
  platform: string
  visibility: 'draft' | 'review' | 'published' | 'rejected'
  requirement_id?: string | null
  cover_url?: string | null
  tag_selections: Array<{ tag_names: string[] }>
  /** R014：资源所属需求已进入超期锁定 / 已清除（锁定期内只能下载历史版本，不能编辑 / 发版 / 删除）。 */
  requirement_archive_locked?: boolean | null
  /** 资源类别：normal / api；缺省按 normal 处理（判定见 shared/resourceApi.ts 的 isApiResourceKind）。 */
  resource_kind?: string | null
}

export function resourcePlatformLabel(value: string): string {
  return value || '未知平台'
}

export function resourceVisibilityLabel(value: ResourcePresentationInput['visibility']): string {
  if (value === 'published') return '公开'
  if (value === 'review') return '审核中'
  if (value === 'rejected') return '已驳回'
  return '私有'
}

export function resourceVisibilityTagType(
  value: ResourcePresentationInput['visibility'],
): 'success' | 'warning' | 'info' | 'danger' {
  if (value === 'published') return 'success'
  if (value === 'review') return 'warning'
  if (value === 'rejected') return 'danger'
  return 'info'
}

export function resourceTagSummary(resource: ResourcePresentationInput): string {
  return resource.tag_selections.flatMap((group) => group.tag_names).join(' / ')
}

/**
 * 资源列表「标签」列的展示值。
 * 接口资源不选标签归类、不属于任何根节点 / 二级节点，一律按「接口」展示；
 * 普通资源仍按标签名拼接，一个标签都没选时回落为「未附带标签」。
 */
export function resourceTagColumnLabel(resource: ResourcePresentationInput): string {
  if (isApiResourceKind(resource.resource_kind)) {
    return '接口'
  }

  return resourceTagSummary(resource) || '未附带标签'
}

export function resourceCoverUrl(
  resource: ResourcePresentationInput,
  resolveUrl: (path: string) => string,
): string {
  return resolveUrl(resource.cover_url || '')
}

export function canDeleteResource(resource: ResourcePresentationInput): boolean {
  return !resource.requirement_id
}

/**
 * R014：资源所属需求是否已进入「超期锁定 / 已清除」阶段。
 *
 * 真值来自后端的 `requirement_archive_*` 标记（锁定 / 清除都是后端按访问触发的终态），
 * 前端只做展示判定：为真时置灰「编辑主页 / 发新版 / 删除」，保留历史版本下载。
 */
export function isResourceArchiveLocked(resource: ResourcePresentationInput): boolean {
  return resource.requirement_archive_locked === true
}

/** 锁定期内写操作被拒的统一中文提示（与后端 409 的口径一致）。 */
export const RESOURCE_ARCHIVE_LOCKED_MESSAGE =
  '该资源所属需求合同有效期已届满，已进入资料保留期：锁定期内只能下载历史版本文件，不能编辑主页 / 发新版 / 删除'

/** 锁定资源横幅标题（与 {@link RESOURCE_ARCHIVE_LOCKED_MESSAGE} 配套，各资源页共用同一口径）。 */
export const RESOURCE_ARCHIVE_LOCKED_TITLE = '资源已锁定'
