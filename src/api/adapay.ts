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

export type AdapayDeliveryVersion = {
  id: number
  requirementId: string
  contractId: number
  developer: string
  versionNo: number
  title: string
  description: string
  artifactUrl: string
  submittedAt: string
}

export type AdapayDeliveryArtifactUploadResponse = {
  artifactUrl: string
}

export type AdapayAcceptanceResponse = {
  requirementId: string
  contractId: number
  status: string
  note: string
  acceptedAt: string
  depositSplitStatus: string
}

export type AdapayBreachCase = {
  id: number
  caseNo: string
  requirementId: string
  paymentId: string
  reportedBy: string
  liableParty: 'customer' | 'developer' | 'platform'
  reason: string
  status: string
  depositAmountFen: number
  depositAmountCny: string
  refundAmountFen: number
  refundAmountCny: string
  compensationAmountFen: number
  compensationAmountCny: string
  providerRefundId?: string | null
  providerTransferId?: string | null
  resolutionNote?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
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

export async function listAdapayDeliveryVersions(
  token: string,
  requirementId: string,
): Promise<AdapayDeliveryVersion[]> {
  return requestJson<AdapayDeliveryVersion[]>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/delivery-versions`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载交付版本失败',
  )
}

export async function submitAdapayDeliveryVersion(
  token: string,
  requirementId: string,
  payload: { title?: string; description: string; artifact_url?: string },
): Promise<AdapayDeliveryVersion> {
  return requestJson<AdapayDeliveryVersion>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/delivery-versions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '提交交付版本失败',
  )
}

export async function uploadAdapayDeliveryArtifact(
  token: string,
  requirementId: string,
  file: File,
): Promise<AdapayDeliveryArtifactUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<AdapayDeliveryArtifactUploadResponse>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/delivery-file`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传交付物失败',
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

export async function reportAdapayBreach(
  token: string,
  requirementId: string,
  liableParty: AdapayBreachCase['liableParty'],
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
      body: JSON.stringify({ liable_party: liableParty, reason }),
    },
    '提交违约申报失败',
  )
}
