/**
 * 账户页挂载时「要不要回查一次实名结果」的口径。
 *
 * `POST /api/realname/asign/result` 是一次**回查**，本意是「爱签扫码回跳后问一次结果」。
 * 但它历史上不是纯读操作：结果为「通过」时会无条件重放整套通过后的副作用，其中
 * `auto_sync_adapay_after_approve` 会向支付渠道**重新发起企业开户**。
 *
 * 账户页每次打开都静默回查一次，于是企业主体每次进页面就往渠道多送一次开户申请：
 * 渠道控制台里同一个 `member_id` 攒下多条申请记录、审核状态在「审核拒绝 / 待审核」之间
 * 来回跳（BUG-014 实测）。后端后来加了幂等短路，但**前端这一侧也不该再无条件问**——
 * 已通过 / 已驳回时这次回查根本没有信息量，只是白跑一趟渠道。
 *
 * 所以只有「还在处理中」或「还不知道状态」时才回查。
 */

/** 实名认证状态（与后端 `user_realname_verification.status` 一致）。 */
export type RealnameStatus = 'pending' | 'approved' | 'rejected' | (string & {})

/**
 * 当前状态下是否需要回查一次实名结果。
 *
 * - `pending`（处理中）：要问，渠道那边可能已经出结果了。
 * - 状态未知（`undefined` / `null`）：要问，账户页可能根本没加载到记录。
 * - `approved` / `rejected`（已定论）：**不问**。回查不会改变什么，只是白跑一趟。
 */
export function shouldRecheckRealnameResult(status: RealnameStatus | null | undefined): boolean {
  if (!status) return true
  return status === 'pending'
}
