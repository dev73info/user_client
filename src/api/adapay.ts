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

export type AdapayAcceptanceResponse = {
  requirementId: string
  contractId: number
  status: string
  note: string
  acceptedAt: string
  depositSplitStatus: string
}

/** 违约案件责任方：`customer` 客户（需求方）/ `developer` 开发者。 */
export type AdapayBreachLiableParty = 'customer' | 'developer'
/** 合同双方对 AI 判定的表态。 */
export type AdapayBreachDecisionValue = 'accepted' | 'rejected'
/** 最终判定来源：`ai` 双方接受 AI 判定 / `support` 客服人工判定。 */
export type AdapayBreachVerdictSource = 'ai' | 'support'

export type AdapayBreachCase = {
  id: number
  caseNo: string
  requirementId: string
  paymentId: string
  reportedBy: string
  /** 最终认定的责任方；AI 判定完成前为空。 */
  liableParty?: AdapayBreachLiableParty | null
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
}

export async function createAdapayPayment(
  token: string,
  requirementId: string,
  milestone: AdapayMilestone,
  payChannel: AdapayBusinessPayChannel,
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
): Promise<AdapayPaymentResponse> {
  const path = milestone === 'deposit'
    ? `/adapay/requirements/${encodeURIComponent(requirementId)}/deposit`
    : `/adapay/requirements/${encodeURIComponent(requirementId)}/final`

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
      body: JSON.stringify({ note }),
    },
    '提交验收结果失败',
  )
}

/** 申报违约：只提交违约事实，责任方由审核智能体依据需求会话判定。 */
export async function reportAdapayBreach(
  token: string,
  requirementId: string,
  reason: string,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/breach`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ reason }),
    },
    '提交违约申报失败',
  )
}

/** 查询当前需求上的违约案件（无案件时返回 null）。 */
export async function getAdapayBreachCase(
  token: string,
  requirementId: string,
): Promise<AdapayBreachCase | null> {
  return requestJson<AdapayBreachCase | null>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/breach-case`,
    { headers: authHeader(token) },
    '加载违约案件失败',
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

/** 协商不成或 AI 未判定时申请平台介入（转客服人工判定）。 */
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

export type AdapayMemberStatus = {
  username: string
  memberType?: string | null
  memberId?: string | null
  settleAccountId?: string | null
  onboardingStatus: string
  providerStatus?: string | null
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
