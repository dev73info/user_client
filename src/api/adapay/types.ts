export type AdapayMilestone = 'deposit' | 'final'
export type AdapayClientPlatform = 'mobile' | 'pc'
export type AdapayBusinessPayChannel = 'alipay' | 'wechat' | 'union'

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
  /** 提交时绑定资源的最新交付版本号；存量留档可能为空。 */
  resourceVersion?: string | null
  createdAt: string
}

/** 解除合作案件责任方：`customer` 客户（需求方）/ `developer` 开发者。 */
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

export type AdapayAvailability = {
  paymentReady: boolean
  /** 是否开启「仅测试角色可用电签担保」灰度 */
  escrowBetaOnly?: boolean
  /** 当前用户是否可用电签担保（已综合测试角色判断） */
  escrowAllowed?: boolean
}
