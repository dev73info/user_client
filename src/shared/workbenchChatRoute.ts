/**
 * 工作台根页既承载聊天工作台，也保留个人中心入口：
 * `?view=profile` 是图标栏的“我的”，`?modal=publish` 是原有发布需求回跳。
 * 这两种 query 下继续使用原来的工作台外壳，其余情况使用沉浸式聊天布局。
 *
 * 单独放一份轻量判定，避免门户外壳为了隐藏顶栏而连带加载整份工作台菜单与图标。
 */
export function isWorkbenchProfileQuery(
  name: unknown,
  query?: Record<string, unknown> | null,
): boolean {
  return (
    String(name ?? '') === 'workbench' && (query?.view === 'profile' || query?.modal === 'publish')
  )
}

export function isWorkbenchChatPage(
  name: unknown,
  meta?: Record<string, unknown> | null,
  query?: Record<string, unknown> | null,
): boolean {
  if (meta?.workbenchChat !== true) {
    return false
  }

  return !isWorkbenchProfileQuery(name, query)
}
