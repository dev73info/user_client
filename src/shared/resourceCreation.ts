export type ResourceCreationType = 'normal' | 'api'
export type ResourcePaidMode = 'buyout' | 'version'

export const RESOURCE_CREATION_TYPE_OPTIONS: ReadonlyArray<{
  value: ResourceCreationType
  label: string
}> = [
  { value: 'normal', label: '普通资源' },
  { value: 'api', label: '接口资源' },
]

export const RESOURCE_PAID_MODE_OPTIONS: ReadonlyArray<{
  value: ResourcePaidMode
  label: string
}> = [
  { value: 'buyout', label: '买断' },
  { value: 'version', label: '单版本' },
]

function firstQueryValue(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

export function parseResourceCreationType(raw: unknown): ResourceCreationType | null {
  const value = firstQueryValue(raw)
  if (value === 'api') {
    return 'api'
  }
  return value === 'normal' || value === 'free' || value === 'paid' ? 'normal' : null
}

export function resolveResourceCreationType(
  raw: unknown,
  legacyKind?: unknown,
): ResourceCreationType {
  const parsed = parseResourceCreationType(raw)
  if (parsed) {
    return parsed
  }
  return firstQueryValue(legacyKind) === 'api' ? 'api' : 'normal'
}

export function resolveResourcePaidMode(raw: unknown): ResourcePaidMode {
  return firstQueryValue(raw) === 'version' ? 'version' : 'buyout'
}

export function resourceCreationRouteQuery(
  type: ResourceCreationType,
  paidMode: ResourcePaidMode,
): Record<string, string> {
  return type === 'api' ? { type } : { type, mode: paidMode }
}
