import { authHeader, requestJson } from '@/api/http'

export type AdapayMilestone = 'deposit' | 'final'
export type AdapayClientPlatform = 'mobile' | 'pc'
export type AdapayBusinessPayChannel = 'alipay' | 'wechat' | 'union'

export function getAdapayClientPlatform(): AdapayClientPlatform {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
    ? 'mobile'
    : 'pc'
}

export type AdapayPaymentResponse = {
  paymentId: string
  contractId: number
  requirementId: string
  milestone: AdapayMilestone
  payChannel: string
  payMode: 'delay' | 'realtime'
  amountFen: number
  amountCny: string
  status: string
  providerPaymentId?: string | null
  providerConfirmId?: string | null
  providerStatus?: string | null
  payUrl?: string | null
}

export type AdapayDeveloperDepositPaymentResponse = {
  paymentId: string
  amountCny: string
  payChannel: string
  payMode: 'delay'
  status: string
  providerPaymentId?: string | null
  providerStatus?: string | null
  payUrl?: string | null
}

export type AdapayAcceptanceResult = 'passed' | 'rejected'

export type AdapayAcceptanceResponse = {
  /** 本次提交的验收留档 ID；验收可重复提交，历史记录按时间倒序展示。 */
  recordId: number
  requirementId: string
  /** 无担保模式没有合同，此时为空。 */
  contractId: number | null
  /** 本次提交的验收结论。 */
  status: AdapayAcceptanceResult
  note: string
  acceptedAt: string
  depositSplitStatus: string
}

/** 一条验收留档。 */
export type AdapayAcceptanceRecord = {
  id: number
  result: AdapayAcceptanceResult
  submittedBy: string
  note: string
  createdAt: string
}

/** 违约案件责任方：`customer` 客户（需求方）/ `developer` 开发者。 */
export type AdapayBreachLiableParty = 'customer' | 'developer'
/** 最终认定结论：责任方之外多一个 `mutual`（双方协商一致、无责退出），只能由客服人工认定。 */
export type AdapayBreachVerdictParty = AdapayBreachLiableParty | 'mutual'
/** 合同双方对 AI 判定的表态。 */
export type AdapayBreachDecisionValue = 'accepted' | 'rejected'
/** 最终判定来源：`ai` 双方接受 AI 判定 / `support` 客服人工判定 / `mutual` 双方自行协商一致（未经客服）。 */
export type AdapayBreachVerdictSource = 'ai' | 'support' | 'mutual'

export type AdapayBreachCase = {
  id: number
  caseNo: string
  requirementId: string
  paymentId: string
  reportedBy: string
  /** 最终认定的责任方；AI 判定完成前为空。`mutual` 表示双方协商一致、无责退出。 */
  liableParty?: AdapayBreachVerdictParty | null
  reason: string
  status: string
  depositAmountFen: number
  depositAmountCny: string
  refundAmountFen: number
  refundAmountCny: string
  compensationAmountFen: number
  compensationAmountCny: string
  /** 开发者额外赔偿金额（分 / 元字符串）。 */
  extraCompensationFen: number
  extraCompensationCny: string
  providerRefundId?: string | null
  /** 渠道回调里的真实转账号（只读展示，不是人工填写的字段）。 */
  providerTransferId?: string | null
  resolutionNote?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
  /** AI 判定责任方；AI 无法判定时后端不写该字段，直接转客服人工判定。 */
  aiLiableParty?: AdapayBreachLiableParty | null
  aiReasoning?: string | null
  aiJudgedAt?: string | null
  /** 双方表态截止时间；超时未全部接受会由后端转客服人工判定。 */
  decisionDeadlineAt?: string | null
  customerDecision?: AdapayBreachDecisionValue | null
  customerDecidedAt?: string | null
  developerDecision?: AdapayBreachDecisionValue | null
  developerDecidedAt?: string | null
  verdictSource?: AdapayBreachVerdictSource | null
  /** 协商阶段：对方**同意**解除合作的时刻，非空即表示双方协商一致（无责退出）。 */
  mutualAgreedAt?: string | null
  /** 协商阶段：对方**不同意**的时刻，非空即表示协商不一致（可申请平台介入）。 */
  mutualRejectedAt?: string | null
  /** 协商阶段的表态人。 */
  mutualRespondedBy?: string | null
}

export async function createAdapayPayment(
  token: string,
  requirementId: string,
  milestone: AdapayMilestone,
  payChannel: AdapayBusinessPayChannel,
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
  /**
   * 优惠券码（P6 / BUG-025）：只有定金接券——折扣由**平台服务费**承担，开发者净额按合同快照不变，
   * 折扣上限 = 该笔定金的平台服务费（超出会被后端拒）。尾款传了也会被后端忽略。
   */
  couponCode?: string | null,
): Promise<AdapayPaymentResponse> {
  const path = milestone === 'deposit'
    ? `/adapay/requirements/${encodeURIComponent(requirementId)}/deposit`
    : `/adapay/requirements/${encodeURIComponent(requirementId)}/final`
  const normalizedCoupon = couponCode?.trim()

  return requestJson<AdapayPaymentResponse>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        pay_channel: payChannel === 'wechat' ? 'wx_pub' : payChannel === 'union' ? 'union' : 'alipay',
        client_platform: clientPlatform,
        ...(normalizedCoupon && milestone === 'deposit' ? { coupon_code: normalizedCoupon } : {}),
      }),
    },
    `创建 Adapay${milestone === 'deposit' ? '定金' : '尾款'}订单失败`,
  )
}

export async function getAdapayPayment(
  token: string,
  paymentId: string,
): Promise<AdapayPaymentResponse> {
  return requestJson<AdapayPaymentResponse>(
    `/adapay/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '查询 Adapay 支付状态失败',
  )
}

export async function createAdapayDeveloperDepositPayment(
  token: string,
  amountCny: number,
  payChannel: 'alipay' | 'wechat',
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
): Promise<AdapayDeveloperDepositPaymentResponse> {
  return requestJson<AdapayDeveloperDepositPaymentResponse>(
    '/adapay/developer-deposits',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        amount_cny: amountCny,
        pay_channel: payChannel,
        client_platform: clientPlatform,
      }),
    },
    '创建 Adapay 保证金充值订单失败',
  )
}

export async function getAdapayDeveloperDepositPayment(
  token: string,
  paymentId: string,
): Promise<AdapayDeveloperDepositPaymentResponse> {
  return requestJson<AdapayDeveloperDepositPaymentResponse>(
    `/adapay/developer-deposits/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '查询 Adapay 保证金充值状态失败',
  )
}

export async function acceptAdapayDelivery(
  token: string,
  requirementId: string,
  result: AdapayAcceptanceResult = 'passed',
  note = '',
): Promise<AdapayAcceptanceResponse> {
  return requestJson<AdapayAcceptanceResponse>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/accept`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ result, note }),
    },
    '提交验收结果失败',
  )
}

/** 查询需求的验收留档（验收可重复提交，按时间倒序）。 */
export async function listAdapayAcceptances(
  token: string,
  requirementId: string,
): Promise<AdapayAcceptanceRecord[]> {
  return requestJson<AdapayAcceptanceRecord[]>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/acceptances`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载验收记录失败',
  )
}

/**
 * 发起「解除合作」：一个入口、不预设走向。
 *
 * 案件先进入协商阶段（`submitted`），由对方的回应决定去哪：
 * 对方同意即按协商一致处理（无责退出），对方不同意或超时未回应才由任一方「申请平台介入」
 * 转入责任判定。因此这里没有「协商还是追责」的选项，也没有金额。
 */
export async function reportAdapayTermination(
  token: string,
  requirementId: string,
  reason: string,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/requirements/${encodeURIComponent(requirementId)}/termination`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ reason }),
    },
    '提交解除合作申请失败',
  )
}

/** 查询当前需求上的解除合作案件（无案件时返回 null）。 */
export async function getAdapayBreachCase(
  token: string,
  requirementId: string,
): Promise<AdapayBreachCase | null> {
  return requestJson<AdapayBreachCase | null>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/breach-case`,
    { headers: authHeader(token) },
    '加载解除合作案件失败',
  )
}

/** 合同双方对 AI 判定表态：接受即按判定执行，不接受则转客服人工判定。 */
export async function submitAdapayBreachDecision(
  token: string,
  caseId: number,
  decision: AdapayBreachDecisionValue,
  note = '',
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/decision`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ decision, note }),
    },
    '提交违约案件表态失败',
  )
}

/** 协商不成时申请平台介入：案件从「协商中」转入 AI 判定（AI 不可用时直接转客服人工审核）。 */
export async function requestAdapayPlatformReview(
  token: string,
  caseId: number,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/request-platform-review`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '申请平台介入失败',
  )
}

/** 发起人在平台介入进程启动前自行撤回终止合作申请（撤回后同一需求可再次发起）。 */
export async function withdrawAdapayBreach(
  token: string,
  caseId: number,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/withdraw`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '撤回终止合作申请失败',
  )
}

// 双方对案件表态的接口在别处（`respondAdapayBreachDecision` / 会话动作里），这里不再有
// 发起 / 应答协商提议的封装：还价机制已下线，案件上只剩「表态」与「申请平台介入」两条路。

export type AdapayMemberStatus = {
  username: string
  memberType?: string | null
  memberId?: string | null
  settleAccountId?: string | null
  onboardingStatus: string
  providerStatus?: string | null
  /** 最近一次入驻 / 绑卡失败时渠道的原话，用于告诉用户「为什么没开通、接下来该补什么」。 */
  providerError?: string | null
  settlementReady: boolean
}

export async function getMyAdapayMember(token: string): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载 Adapay 认证状态失败',
  )
}

export type MySettlementAccountPayload = {
  card_id: string
  bank_code: string
  prov_code: string
  area_code: string
  bank_acct_type?: string
  bank_name?: string
}

/**
 * 已绑定结算账户的**脱敏**快照，用于「收款银行卡」弹窗回填。
 *
 * 数据由后端从渠道会员对象现取，卡号/证件号/手机号在渠道侧就已经是脱敏形态
 * （如 `621483207******5`）；渠道不可用时只有 `bound` + `settleAccountId`，
 * 其余字段缺省，调用方要按「拿不到明细」处理。
 */
export type MySettlementAccountSnapshot = {
  bound: boolean
  settleAccountId?: string
  cardIdMasked?: string
  cardName?: string
  bankCode?: string
  bankName?: string
  provCode?: string
  areaCode?: string
  bankAcctType?: string
  channel?: string
}

export async function getMySettlementAccountSnapshot(
  token: string,
): Promise<MySettlementAccountSnapshot> {
  return requestJson<MySettlementAccountSnapshot>(
    '/adapay/me/settle-account',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载收款银行卡信息失败',
  )
}

export async function createMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountPayload,
): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '设置 Adapay 结算账户失败',
  )
}

/**
 * 更换已绑定的结算账户（收款银行卡）。
 *
 * 渠道侧不支持直接改卡，后端会先解绑旧卡再用新的银行卡信息重建，
 * 因此这个请求可能失败在「已解绑、未重建」的中间态上；调用方失败后应重新查询
 * `getMyAdapayMember` 确认真实绑定状态。
 */
/**
 * 注销（解绑）已绑定的结算账户。
 *
 * 破坏性动作：注销后合同款与分账都进不来，要收款必须重新绑定银行卡。
 * 后端会先打渠道删除接口，成功后才清空本地绑定；渠道拒绝时本地保持原样并抛错。
 */
export async function closeMyAdapaySettlementAccount(
  token: string,
): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account/close',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '注销结算账户失败',
  )
}

export async function changeMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountPayload,
): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account/change',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更换 Adapay 结算账户失败',
  )
}

export type AdapayAvailability = {
  enabled: boolean
  paymentReady: boolean
  /** 是否开启「仅测试角色可用电签担保」灰度 */
  escrowBetaOnly?: boolean
  /** 当前用户是否可用电签担保（已综合测试角色判断） */
  escrowAllowed?: boolean
}

/**
 * 查询电签担保是否可用（需 Adapay 密钥、回调地址、个税规则等配置齐备）。
 * 公开接口；带上令牌时后端会按当前用户是否拥有「电签担保测试」权限
 * 返回 `escrowAllowed`（线上灰度期间仅对测试角色开放）。
 */
export async function getAdapayAvailability(token?: string): Promise<AdapayAvailability> {
  return requestJson<AdapayAvailability>(
    '/adapay/availability',
    { method: 'GET', headers: token ? authHeader(token) : undefined },
    '查询支付渠道可用性失败',
  )
}
