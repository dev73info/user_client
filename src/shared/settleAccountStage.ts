/**
 * 收款账户（结算账户）的阶段口径。
 *
 * 事实源是契约端点 `GET /api/payment/settlement-account`（`SettlementAccountResponse`）：
 * - `status` ∈ `pending` / `active` / `under_review` / `failed` / `closed`（后端 `SettlementAccountStatus`）
 * - `accepts_settlement`：**能不能收分账款**的最终判定（状态可用且号码齐备）
 *
 * 两者要合成用户看得懂的阶段，口径写错一次就把用户引到错误的动作上：
 *
 * - 渠道把开户申请**驳回**（`failed`）若被当成「已开通」，用户端会显示「收款账户：待绑卡」，
 *   引导他去绑一张根本绑不上的卡，还看不到「渠道已拒绝」这个事实。
 * - 渠道**审核已通过**、只差结算账户没建（`active` 但没有可用号码）若被当成「还在审核」，
 *   账户页会永久停在「渠道审核中」，条目被锁住，连「绑定对公账户」都点不开。
 *
 * 所以这几档必须一一分开，每档各有各的下一步：
 * `none` 还没到渠道那一步 · `reviewing` 渠道在审（等）· `failed` 渠道已否定（去整改）·
 * `ready` 渠道已过、差用户绑卡这一步 · `bound` 已绑好（能收钱）。
 */

/** 收款账户在渠道侧与用户侧的阶段。 */
export type SettleAccountStage = 'none' | 'reviewing' | 'failed' | 'ready' | 'bound'

/** 结算账户状态取值（与后端 `SettlementAccountStatus` 一致）。 */
export type SettlementAccountStatus =
  | 'pending'
  | 'under_review'
  | 'active'
  | 'failed'
  | 'closed'
  | (string & {})

/** 收款账户是否已经能收分账款：只看契约那个布尔，不再拿卡号尾数当账户号用。 */
export function isSettleBound(acceptsSettlement: boolean | null | undefined): boolean {
  return acceptsSettlement === true
}

/**
 * 收款账户当前处于哪一阶段。
 *
 * `bound` 优先于其它状态：已经能收钱了，渠道那边是什么状态都不改变「已绑好」这个事实。
 */
export function settleAccountStage(
  status: SettlementAccountStatus | null | undefined,
  acceptsSettlement: boolean | null | undefined,
): SettleAccountStage {
  if (isSettleBound(acceptsSettlement)) return 'bound'
  if (status === 'pending' || status === 'under_review') return 'reviewing'
  if (status === 'active') return 'ready'
  // 渠道已经给了否定结论：必须单独成一态。并进 `none` 会显示成「待认证」，
  // 用户以为等着就行，而实际要回去核对资料重新提交。
  if (status === 'failed') return 'failed'
  return 'none'
}

/**
 * 渠道是否还在审核中（企业开户要走渠道人工审核，这期间绑不了对公账户）。
 *
 * 这期间**实名认证早已通过**、但结算账户绑不上，所以界面如实写「审核中」——
 * 写成「未设置」会让用户以为要自己再点一次绑定，而实际是渠道还没放行。
 */
export function isSettleUnderReview(status: SettlementAccountStatus | null | undefined): boolean {
  return status === 'under_review' || status === 'pending'
}

/** 渠道已明确拒绝开通收款账户。`failed` 是唯一表示「渠道给了否定结论」的取值。 */
export function isSettleRejected(status: SettlementAccountStatus | null | undefined): boolean {
  return status === 'failed'
}

/**
 * 渠道侧最近一次拒绝的原话。
 *
 * 只报状态（「未开通 / 开通失败」）时，用户不知道该改什么；渠道原话
 * （如「prov_code 不能为空」）是唯一能对上号的线索，所以在弹窗里原样给出来。
 *
 * 已经开通且账户可用时不再提旧伤——那是一次翻篇的失败；换卡失败导致账户被解绑时
 * 状态仍停在 `active`，这时候原因必须留着，否则用户看到的是「已认证 + 未设置」而无从下手。
 */
export function settleProviderErrorText(
  status: SettlementAccountStatus | null | undefined,
  providerError: string | null | undefined,
  acceptsSettlement: boolean | null | undefined,
): string {
  const error = (providerError ?? '').trim()
  if (!error) return ''
  return status === 'active' && acceptsSettlement === true ? '' : error
}
