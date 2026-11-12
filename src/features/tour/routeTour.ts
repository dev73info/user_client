/** 路由名 → 引导 id；没有页面引导的页面回落到 basic。 */
const ROUTE_TOURS: Record<string, string> = {
  'workbench-requirements': 'my-requirements',
  'workbench-requirement-hall': 'requirement-hall',
  'workbench-signatures': 'signatures',
  'workbench-account': 'account',
}

/** 引导只关心路由名；未命名路由的 `name` 可能是 null。 */
export function tourForRoute(route: { name?: string | symbol | null }): string {
  const name = typeof route.name === 'string' ? route.name : ''
  return ROUTE_TOURS[name] ?? 'basic'
}
