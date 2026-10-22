/**
 * 收款账户（结算账户）的阶段口径。
 *
 * 后端 `GET /api/adapay/me` 给的 `onboardingStatus` 是**渠道侧**的入驻状态，
 * `settleAccountId` 才是「卡绑没绑」的事实。两者要合成用户看得懂的阶段，
 * 口径写错一次就把用户引到错误的动作上：
 *
 * - 渠道把开户申请**驳回**（`failed`）若被当成「已开通」，用户端会显示「收款账户：待绑卡」，
 *   引导他去绑一张根本绑不上的卡，还看不到「渠道已拒绝」这个事实（BUG-013）。
 * - 渠道**审核已通过**、只差结算账户没建（后端记成 `active`）若被当成「还在审核」，
 *   账户页会永久停在「渠道审核中」，条目被锁住，连「绑定对公账户」都点不开（BUG-017）。
 *
 * 所以这几档必须一一分开，每档各有各的下一步：
 * `none` 还没到渠道那一步 · `reviewing` 渠道在审（等）· `failed` 渠道已否定（去整改）·
 * `ready` 渠道已过、差用户绑卡这一步 · `bound` 已绑好。
 *
 * 这里只放口径本身，取值来自后端 `adapay_member_account.onboarding_status`。
 */

/** 收款账户在渠道侧与用户侧的阶段。 */
export type SettleAccountStage = 'none' | 'reviewing' | 'failed' | 'ready' | 'bound'

/** 渠道侧的入驻状态取值（与后端 `onboarding_status` 一致）。 */
export type AdapayOnboardingStatus =
  | 'not_onboarded'
  | 'pending'
  | 'under_review'
  | 'active'
  | 'failed'
  | (string & {})

/**
 * 收款账户是否已经绑上（渠道给了结算账户号）。
 *
 * 纯空白不算已绑：渠道不会给空白号，留着它只会让界面以为「绑好了」而少了那一步。
 */
export function isSettleBound(settleAccountId: string | null | undefined): boolean {
  return Boolean(settleAccountId && settleAccountId.trim())
}

/**
 * 收款账户当前处于哪一阶段。
 *
 * `bound` 优先于其它状态：卡已经绑上了，渠道那边是什么状态都不改变「已绑好」这个事实。
 */
export function settleAccountStage(
  onboardingStatus: AdapayOnboardingStatus | null | undefined,
  settleAccountId: string | null | undefined,
): SettleAccountStage {
  if (isSettleBound(settleAccountId)) return 'bound'
  if (onboardingStatus === 'pending' || onboardingStatus === 'under_review') return 'reviewing'
  if (onboardingStatus === 'active') return 'ready'
  // 渠道已经给了否定结论（企业开户审核未通过、或审核通过但开户失败）：必须单独成一态。
  // 并进下面的 `none` 会显示成「待认证」，用户以为等着就行，而实际要回去核对资料重新认证。
  if (onboardingStatus === 'failed') return 'failed'
  return 'none'
}

/**
 * 渠道会员是否还在审核中（企业开户要走渠道人工审核，这期间绑不了对公账户）。
 *
 * 这期间**实名认证早已通过**、但结算账户绑不上，所以界面如实写「审核中」——
 * 写成「未设置」会让用户以为要自己再点一次绑定，而实际是渠道还没放行。
 */
export function isSettleUnderReview(
  onboardingStatus: AdapayOnboardingStatus | null | undefined,
): boolean {
  return onboardingStatus === 'under_review' || onboardingStatus === 'pending'
}

/**
 * 渠道已明确拒绝开通收款账户（企业开户审核未通过 / 审核通过但开户失败）。
 *
 * `onboarding_status = failed` 是唯一表示「渠道给了否定结论」的取值；具体是哪种拒绝、
 * 原因是什么，都在 `providerError` 里（后端把渠道 `audit_state` 翻成中文再落库）。
 */
export function isSettleRejected(
  onboardingStatus: AdapayOnboardingStatus | null | undefined,
): boolean {
  return onboardingStatus === 'failed'
}

/**
 * 渠道侧最近一次拒绝的原话。
 *
 * 只报状态（「未认证 / 未通过」）时，用户不知道该改什么；渠道原话（如
 * 「prov_code 不能为空」）是唯一能对上号的线索，所以在弹窗里原样给出来。
 * 已经开通且卡还在时不再提旧伤——那是一次翻篇的失败；换卡失败导致卡被解绑时
 * 状态仍停在 `active`，这时候原因必须留着，否则用户看到的是「已认证 + 未设置」而无从下手。
 */
export function settleProviderErrorText(
  onboardingStatus: AdapayOnboardingStatus | null | undefined,
  providerError: string | null | undefined,
  settleAccountId: string | null | undefined,
): string {
  const error = (providerError ?? '').trim()
  if (!error) return ''
  return onboardingStatus === 'active' && isSettleBound(settleAccountId) ? '' : error
}
