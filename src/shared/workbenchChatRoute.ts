/** 工作台根页现在是纯聊天布局；保留 name / query 形参，调用方不必区分路由入口。 */
export function isWorkbenchChatPage(
  _name: unknown,
  meta?: Record<string, unknown> | null,
  _query?: Record<string, unknown> | null,
): boolean {
  return meta?.workbenchChat === true
}
