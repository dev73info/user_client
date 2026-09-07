export type ResourcePresentationInput = {
  platform: string
  visibility: 'draft' | 'review' | 'published'
  requirement_id?: string | null
  cover_url?: string | null
  tag_selections: Array<{ tag_names: string[] }>
}

export function resourcePlatformLabel(value: string): string {
  return value || '未知平台'
}

export function resourceVisibilityLabel(value: ResourcePresentationInput['visibility']): string {
  if (value === 'published') return '公开'
  if (value === 'review') return '审核中'
  return '私有'
}

export function resourceVisibilityTagType(
  value: ResourcePresentationInput['visibility'],
): 'success' | 'warning' | 'info' {
  if (value === 'published') return 'success'
  if (value === 'review') return 'warning'
  return 'info'
}

export function resourceTagSummary(resource: ResourcePresentationInput): string {
  return resource.tag_selections.flatMap((group) => group.tag_names).join(' / ')
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
