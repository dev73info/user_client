/**
 * 验收相关的请求已迁到 `src/api/requirements/acceptance.ts`。
 *
 * 2.0 把验收路径从 `/adapay/requirements/{id}/accept` 换成了 `/requirement/{id}/acceptance`
 * （可通过也可打回），旧路径只是 308 重定向。这里只保留记录类型，调用方的 import 不会断。
 */
export type { AdapayAcceptanceRecord, AdapayAcceptanceResult } from './types'
