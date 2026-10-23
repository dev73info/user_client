/**
 * 开发者工作台总览的演示数据，用于在没有真实接单记录时预览布局。
 *
 * 只有 `pnpm dev`（mode = development）下才可能生效，且需要二选一打开：
 * `.env.local` 里写 `VITE_DEV_HOME_MOCK=true`，或地址上带 `?mock=1`（`routeMock`）。
 * `pnpm build` 走 production、单测走 test，两个模式都拿不到这份数据，
 * 所以演示数字不会进线上包，也不会影响现有单测的断言。
 */
export function devHomeMockEnabled(routeMock = false): boolean {
  if (import.meta.env.MODE !== 'development') {
    return false
  }

  return import.meta.env.VITE_DEV_HOME_MOCK === 'true' || routeMock
}
