/**
 * 后端接口辅助：所有断言与兜底调用都走这里，浏览器只负责「人在操作」的那一层。
 *
 * 这些端点的响应结构都是对着本机后端实测出来的（见各自注释里的路径与字段），
 * 不是照文档抄的。路径一律写后端真实路径（`/api/requirement/...`），
 * 不要写前端会被 `src/shared/api/url.ts` 重写的路径（`/requirements/...`）。
 */
import { expect, type APIRequestContext } from '@playwright/test'

import {
  BACKEND_BASE,
  CLIENT_ACCOUNT,
  DEVELOPER_ACCOUNT,
  HANDWRITTEN_SIGNATURE_DATA_URL,
  REQUEST_TIMEOUT_MS,
  SETTLEMENT_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from './config'

/** 需求列表 / 详情里本用例关心的字段（`GET /api/requirement/mine`、`GET /api/requirement/{id}`）。 */
export type RequirementDetail = {
  requirement_id: string
  title: string
  status: string
  budget?: number | null
  payment_mode?: string | null
  developer?: string | null
  bound_resource_id?: number | null
  bound_resource_title?: string | null
  /** 后端按本机时区（东八区）返回的字符串，形如 `2026-09-23 20:04:31`。 */
  created_at?: string | null
}

/** 合同签署状态（`GET /api/contract/signing-status/{requirement_id}`）。 */
export type SigningStatus = {
  has_contract?: boolean
  party_a_signed?: boolean
  party_b_signed?: boolean
  party_c_signed?: boolean
  status?: string | null
}

/** 需求下的合同（`GET /api/contract/requirement/{requirement_id}/my-contract`）。 */
export type RequirementContract = {
  id: number
  contract_no: string
  title: string
  status: string
  requirement_id?: string | null
  party_a_signed_at?: string | null
  party_b_signed_at?: string | null
  asign_contract_no?: string | null
}

/** 管理端分账列表里的一行（`GET /api/admin/adapay/settlements`）。 */
export type SettlementRow = {
  paymentId: string
  contractId?: number | null
  requirementId: string
  milestone: 'deposit' | 'final' | string
  amountCny: string
  platformFeeCny?: string
  developerNetAmountCny?: string
  status: string
  availableAt?: string | null
}

/** 开发者资格（`GET /api/auth/dev-access-status`）。 */
export type DevAccessStatus = {
  is_dev: boolean
  is_super_admin: boolean
  realname_approved: boolean
  is_adult: boolean
  developer_agreement_signed: boolean
}

/** 当前用户自己的实名记录（`GET /api/realname/me`）。 */
export type RealnameMe = {
  username: string
  auth_type: 'IDENTITY_CARD' | 'ENTERPRISE' | 'SOLE_PROPRIETOR' | string
  status: string
  real_name?: string | null
  company_name?: string | null
  mobile_masked?: string | null
}

/**
 * 开发者的资源项目（`GET /api/resources/resources`）。
 *
 * 前端的 `/dev/resources/resources` 会被 `src/shared/api/url.ts` 重写成 `/resources/resources`，
 * 这里直接写后端真实路径。接单只认 `visibility === 'draft'` 且未绑定需求的条目。
 */
export type McResource = {
  id: number
  title: string
  author: string
  visibility: string
  requirement_id?: string | null
  platform?: string | null
}

/** 开发者保证金账户（`GET /api/payment/developer-order-deposit`）。 */
export type DevOrderDeposit = {
  username: string
  role: string
  has_paid_deposit: boolean
  can_bind_requirement: boolean
  available_cny: number
  frozen_cny: number
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** 删掉响应体里可能出现的换行，方便塞进断言消息。 */
async function describe(response: { status: () => number; text: () => Promise<string> }) {
  const body = await response.text().catch(() => '')
  return `${response.status()}：${body.slice(0, 300)}`
}

async function postJson<T>(
  request: APIRequestContext,
  path: string,
  data: unknown,
  token?: string,
): Promise<T> {
  const response = await request.post(`${BACKEND_BASE}${path}`, {
    data,
    headers: token ? authHeader(token) : {},
    timeout: REQUEST_TIMEOUT_MS,
  })
  expect(response.ok(), `POST ${path} 返回 ${await describe(response)}`).toBeTruthy()
  return (await response.json()) as T
}

async function getJson<T>(request: APIRequestContext, path: string, token: string): Promise<T> {
  const response = await request.get(`${BACKEND_BASE}${path}`, {
    headers: authHeader(token),
    timeout: REQUEST_TIMEOUT_MS,
  })
  expect(response.ok(), `GET ${path} 返回 ${await describe(response)}`).toBeTruthy()
  return (await response.json()) as T
}

/** 用账号口令换用户令牌（写接口 15 次/分限流，只在开头换一次，令牌复用到底）。 */
export async function loginToken(
  request: APIRequestContext,
  account: { username: string; password: string },
): Promise<string> {
  const payload = await postJson<{ token?: string }>(request, '/api/auth/login', account)
  expect(payload.token, `${account.username} 登录没有返回 token`).toBeTruthy()
  return payload.token as string
}

export const clientToken = (request: APIRequestContext) => loginToken(request, CLIENT_ACCOUNT)
export const developerToken = (request: APIRequestContext) => loginToken(request, DEVELOPER_ACCOUNT)

/**
 * 取超管令牌。
 *
 * `POST /api/auth/admin-auto-login` 只在「debug 构建 + 配置开启 dev_auto_login + 回环地址」
 * 三条同时成立时可用，本地 `cargo run` 全满足；换成 release 产物会 404。
 */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${BACKEND_BASE}/api/auth/admin-auto-login`, {
    data: {},
    timeout: REQUEST_TIMEOUT_MS,
  })
  expect(
    response.ok(),
    `管理端自动登录失败（${await describe(response)}）。需要后端是 cargo run 的 debug 构建，`
      + '且 backend_73info/config/local.toml 里 dev_auto_login = true。',
  ).toBeTruthy()
  const payload = (await response.json()) as { token?: string }
  expect(payload.token, '管理端自动登录没有返回 token').toBeTruthy()
  return payload.token as string
}

/** 探前端 dev server 是否在跑（任意 HTML 响应都算在跑，404 也算，只有连不上才失败）。 */
export async function expectFrontendUp(request: APIRequestContext, origin: string): Promise<void> {
  const response = await request.get(origin, { timeout: REQUEST_TIMEOUT_MS }).catch((error) => {
    throw new Error(`${origin} 连不上：${String(error).slice(0, 200)}`)
  })
  expect(
    response.status() < 500,
    `${origin} 返回 ${response.status()}，dev server 起来了但页面报错`,
  ).toBeTruthy()
}

// ---------------------------------------------------------------- 需求

/** 发布需求（`POST /api/requirement/`），返回新需求详情。 */
export function publishRequirement(
  request: APIRequestContext,
  token: string,
  payload: {
    title: string
    description: string
    budget: number
    acceptance_criteria: string
    payment_mode: string
  },
): Promise<RequirementDetail> {
  return postJson<RequirementDetail>(request, '/api/requirement/', payload, token)
}

/** 我的需求列表（`GET /api/requirement/mine`）。 */
export function listMyRequirements(
  request: APIRequestContext,
  token: string,
): Promise<RequirementDetail[]> {
  return getJson<RequirementDetail[]>(request, '/api/requirement/mine', token)
}

/** 按标题找需求（用例用带时间戳的标题，能把本次运行的那条挑出来）。 */
export async function findRequirementByTitle(
  request: APIRequestContext,
  token: string,
  title: string,
  timeoutMs = 30_000,
): Promise<RequirementDetail> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = (await listMyRequirements(request, token)).find((item) => item.title === title)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`我的需求里没找到标题为「${title}」的需求`)
}

/**
 * 发布冷却：同一发布人 5 分钟内只能发布 1 条需求。
 *
 * 这是后端的硬约束，不是限流桶——`has_recent_requirement_create` 直接查
 * `requirement.created_at > now() - interval '5 minutes'`，命中就返回
 * `CreateTooFrequent`（文案「5 分钟内只能发布 1 条需求」，见 `models/requirement.rs`）。
 * 所以这条用例**最快也要 5 分钟才能跑一次**，连续重跑会在发布那一步才炸。
 *
 * 提前用最近一条需求的 `created_at` 算出来，好在打开浏览器之前就说清楚还要等多久。
 */
export const PUBLISH_COOLDOWN_MS = 5 * 60 * 1000

export async function ensurePublishCooldownClear(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const mine = await listMyRequirements(request, token)
  let latest = 0
  for (const item of mine) {
    const stamp = item.created_at ? Date.parse(item.created_at) : Number.NaN
    if (Number.isFinite(stamp) && stamp > latest) latest = stamp
  }
  if (!latest) return
  const remaining = latest + PUBLISH_COOLDOWN_MS - Date.now()
  if (remaining > 0) {
    throw new Error(
      `距需求方上次发布需求不足 5 分钟（后端 has_recent_requirement_create 的硬约束），`
        + `还要等约 ${Math.ceil(remaining / 1000)} 秒才能再跑这条用例。`,
    )
  }
}

/** 需求详情（`GET /api/requirement/{id}`）。 */
export function getRequirement(
  request: APIRequestContext,
  token: string,
  requirementId: string,
): Promise<RequirementDetail> {
  return getJson<RequirementDetail>(
    request,
    `/api/requirement/${encodeURIComponent(requirementId)}`,
    token,
  )
}

/** 平台审核（`POST /api/requirement/{id}/review`，action = approve | reject）。 */
export function reviewRequirement(
  request: APIRequestContext,
  admin: string,
  requirementId: string,
  action: 'approve' | 'reject',
  note?: string,
): Promise<unknown> {
  return postJson(
    request,
    `/api/requirement/${encodeURIComponent(requirementId)}/review`,
    { action, note: note ?? null },
    admin,
  )
}

/** 开发者接单（`POST /api/requirement/{id}/bind-project`）。 */
export function bindRequirement(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  resourceId: number,
): Promise<unknown> {
  return postJson(
    request,
    `/api/requirement/${encodeURIComponent(requirementId)}/bind-project`,
    { resource_id: resourceId },
    token,
  )
}

/** 开发者交付（`POST /api/requirement/{id}/request-final-payment`）：in_development → pending_final。 */
export function requestFinalPayment(
  request: APIRequestContext,
  token: string,
  requirementId: string,
): Promise<unknown> {
  return postJson(
    request,
    `/api/requirement/${encodeURIComponent(requirementId)}/request-final-payment`,
    {},
    token,
  )
}

/**
 * 开发者已绑定的需求（`GET /api/requirement/dev/mine`，见 `api/devRequirements.ts`）。
 *
 * 交付就是「给绑定资源项目发一个新版本」，落库表现是 `bound_resource_version_count` 加一。
 */
export type DevBoundRequirement = {
  id: number
  requirement_id: string
  title: string
  status: string
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
}

/** 开发者已绑定需求列表（`GET /api/requirement/dev/mine`）。 */
export function listDevBoundRequirements(
  request: APIRequestContext,
  token: string,
): Promise<DevBoundRequirement[]> {
  return getJson<DevBoundRequirement[]>(request, '/api/requirement/dev/mine', token)
}

/**
 * 等交付版本真的落库。
 *
 * 为什么不只等 UI 的 toast：toast 是前端拿到接口成功响应就弹的，弹完还会刷新列表，
 * 断言在这里再核一次库，「验收那一步能拿到交付版本」才有可靠前提。
 */
export async function waitForDeliveryVersion(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  minVersions = 1,
  timeoutMs = STEP_TIMEOUT_MS,
  intervalMs = 2000,
): Promise<DevBoundRequirement> {
  const deadline = Date.now() + timeoutMs
  let latest: DevBoundRequirement | null = null
  while (Date.now() < deadline) {
    const rows = await listDevBoundRequirements(request, token)
    latest = rows.find((row) => row.requirement_id === requirementId) ?? null
    if (latest && (latest.bound_resource_version_count ?? 0) >= minVersions) return latest
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `需求 ${requirementId} 在 ${timeoutMs}ms 内没有落下交付版本：`
      + `bound_resource_id=${latest?.bound_resource_id ?? '未知'} `
      + `bound_resource_version_count=${latest?.bound_resource_version_count ?? '未知'}`,
  )
}

/** 轮询到需求落到目标状态为止。 */
export async function waitForRequirementStatus(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  expected: string | string[],
  timeoutMs = SETTLEMENT_TIMEOUT_MS,
  intervalMs = 3000,
): Promise<RequirementDetail> {
  const wanted = Array.isArray(expected) ? expected : [expected]
  const deadline = Date.now() + timeoutMs
  let latest: RequirementDetail | null = null
  while (Date.now() < deadline) {
    latest = await getRequirement(request, token, requirementId)
    if (wanted.includes(latest.status)) {
      return latest
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `需求 ${requirementId} 在 ${timeoutMs}ms 内没有进入 ${wanted.join(' / ')}，当前是 ${latest?.status}`,
  )
}

// ---------------------------------------------------------------- 合同

/** 合同签署状态（按需求查）。 */
export function getSigningStatus(
  request: APIRequestContext,
  token: string,
  requirementId: string,
): Promise<SigningStatus> {
  return getJson<SigningStatus>(
    request,
    `/api/contract/signing-status/${encodeURIComponent(requirementId)}`,
    token,
  )
}

/**
 * 需求下的合同（`GET /api/contract/requirement/{requirement_id}/my-contract`）。
 *
 * 注意：`signing-status` 只回三个布尔位，没有合同 id；要拿合同 id（签爱签、
 * 查签署链接都要用）必须走这个端点。
 */
export function getRequirementContract(
  request: APIRequestContext,
  token: string,
  requirementId: string,
): Promise<RequirementContract> {
  return getJson<RequirementContract>(
    request,
    `/api/contract/requirement/${encodeURIComponent(requirementId)}/my-contract`,
    token,
  )
}

/** 需求方/开发者主动发起《需求开发合同》（`POST /api/contract/requirement/{id}`）。 */
export function createRequirementContract(
  request: APIRequestContext,
  token: string,
  requirementId: string,
): Promise<RequirementContract> {
  return postJson(
    request,
    `/api/contract/requirement/${encodeURIComponent(requirementId)}`,
    {},
    token,
  )
}

/** 等合同双方签完（爱签回跳后前端会主动 asign-sync，这里只做状态轮询）。 */
export async function waitForContractSigned(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 3000,
): Promise<SigningStatus> {
  const deadline = Date.now() + timeoutMs
  let latest: SigningStatus | null = null
  while (Date.now() < deadline) {
    latest = await getSigningStatus(request, token, requirementId)
    if (latest.has_contract && latest.party_a_signed && latest.party_b_signed) {
      return latest
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `合同在 ${timeoutMs}ms 内没有双方签完，当前：${JSON.stringify(latest)}`,
  )
}

/** 发起爱签签署（`POST /api/contract/{id}/asign-sign`），返回签署链接。 */
export function initiateAsignSign(
  request: APIRequestContext,
  token: string,
  contractId: number,
  notice = false,
): Promise<{ contract_id: number; contract_no: string; sign_url?: string | null; status: string }> {
  return postJson(
    request,
    `/api/contract/${contractId}/asign-sign`,
    { notice },
    token,
  )
}

/**
 * 主动同步爱签签署状态（`POST /api/contract/{id}/asign-sync`）。
 *
 * 爱签回调地址指向生产域名，本地收不到回调，只能靠前端回跳后主动同步；接口限流已单独放宽。
 */
export function syncAsignStatus(
  request: APIRequestContext,
  token: string,
  contractId: number,
): Promise<unknown> {
  return postJson(request, `/api/contract/${contractId}/asign-sync`, {}, token)
}

/**
 * 走平台自带的在线签署（`POST /api/contract/{id}/sign`）。
 *
 * 这条路径不经爱签，落库的仍是同一张合同、同两个签署字段。
 * 只在 `E2E_DEV_SIGN=local` 时用于开发者一侧（见 `config.ts` 里的说明）。
 */
export function signContractLocally(
  request: APIRequestContext,
  token: string,
  contractId: number,
): Promise<unknown> {
  return postJson(
    request,
    `/api/contract/${contractId}/sign`,
    { handwritten_signature: HANDWRITTEN_SIGNATURE_DATA_URL },
    token,
  )
}

/** 当前用户的开发者入驻协议（`GET /api/contract/developer-agreement`，不存在会自动创建待签）。 */
export async function getDeveloperAgreement(
  request: APIRequestContext,
  token: string,
): Promise<{ id: number; status: string; contract_no: string }> {
  return getJson(request, '/api/contract/developer-agreement', token)
}

/** 开发者资格（`GET /api/auth/dev-access-status`）。 */
export function getDevAccessStatus(
  request: APIRequestContext,
  token: string,
): Promise<DevAccessStatus> {
  return getJson<DevAccessStatus>(request, '/api/auth/dev-access-status', token)
}

/** 当前用户自己的实名记录（`GET /api/realname/me`）。 */
export function getRealnameMe(request: APIRequestContext, token: string): Promise<RealnameMe> {
  return getJson<RealnameMe>(request, '/api/realname/me', token)
}

/** 开发者的资源项目列表（`GET /api/resources/resources`）。 */
export function listDevResources(
  request: APIRequestContext,
  token: string,
): Promise<McResource[]> {
  return getJson<McResource[]>(request, '/api/resources/resources', token)
}

/** 接单弹窗只列「私有（draft）且未绑定需求」的资源项目（见 `DevRequirementHallView`）。 */
export function isBindableResource(resource: McResource): boolean {
  return resource.visibility === 'draft' && (resource.requirement_id ?? null) === null
}

/** 当前用户的合同列表（`GET /api/contract/mine`），用于跟踪《开发者入驻协议》的签署状态。 */
export function listMyContracts(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: number; title: string; status: string; contract_no: string }>> {
  return getJson(request, '/api/contract/mine', token)
}

/** 等《开发者入驻协议》之类的合同落到目标状态。 */
export async function waitForContractStatus(
  request: APIRequestContext,
  token: string,
  contractId: number,
  expected: string,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 4000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let latest = ''
  while (Date.now() < deadline) {
    const found = (await listMyContracts(request, token)).find((row) => row.id === contractId)
    latest = found?.status ?? '未找到'
    if (latest === expected) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`合同 ${contractId} 在 ${timeoutMs}ms 内没有进入 ${expected}，当前是 ${latest}`)
}

// ---------------------------------------------------------------- 支付与分账

/** 开发者保证金账户（`GET /api/payment/developer-order-deposit`）。 */
export function getDevOrderDeposit(
  request: APIRequestContext,
  token: string,
): Promise<DevOrderDeposit> {
  return getJson<DevOrderDeposit>(request, '/api/payment/developer-order-deposit', token)
}

/** 某个需求下的分账记录（管理端列表按需求过滤）。 */
export async function listSettlements(
  request: APIRequestContext,
  admin: string,
  requirementId: string,
): Promise<SettlementRow[]> {
  const rows = await getJson<SettlementRow[]>(request, '/api/admin/adapay/settlements', admin)
  return rows.filter((row) => row.requirementId === requirementId)
}

/** 等定金 / 尾款两条分账都结单。 */
export async function waitForSettlementSucceeded(
  request: APIRequestContext,
  admin: string,
  requirementId: string,
  timeoutMs = SETTLEMENT_TIMEOUT_MS,
  intervalMs = 5000,
): Promise<SettlementRow[]> {
  const deadline = Date.now() + timeoutMs
  let latest: SettlementRow[] = []
  while (Date.now() < deadline) {
    latest = await listSettlements(request, admin, requirementId)
    const milestones = new Set(latest.map((row) => row.milestone))
    const allSucceeded = latest.length > 0 && latest.every((row) => row.status === 'succeeded')
    if (allSucceeded && milestones.has('deposit') && milestones.has('final')) {
      return latest
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `分账在 ${timeoutMs}ms 内没有结单，当前：${JSON.stringify(latest.map((row) => ({ m: row.milestone, s: row.status })))}`,
  )
}

/** 等需求满足任意条件（接单、验收这类不改状态的推进就只能这么等）。 */
export async function waitForRequirement(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  predicate: (requirement: RequirementDetail) => boolean,
  describeWait: string,
  timeoutMs = REQUEST_TIMEOUT_MS * 3,
  intervalMs = 2000,
): Promise<RequirementDetail> {
  const deadline = Date.now() + timeoutMs
  let latest: RequirementDetail | null = null
  while (Date.now() < deadline) {
    latest = await getRequirement(request, token, requirementId)
    if (predicate(latest)) return latest
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`需求 ${requirementId} 在 ${timeoutMs}ms 内没有${describeWait}，当前：${JSON.stringify(latest)}`)
}

// ---------------------------------------------------------------- 渠道会员

/**
 * 当前用户的 Adapay 会员账户（`GET /api/adapay/me`）。
 *
 * 这个端点的字段是 camelCase（后端 `AdaPayMemberAccountResponse` 带
 * `#[serde(rename_all = "camelCase")]`），与需求/合同那几个 snake_case 端点不同。
 */
export type AdapayMemberAccount = {
  username: string
  memberType: string
  memberId: string
  settleAccountId?: string | null
  onboardingStatus: string
  settlementReady: boolean
}

export function getAdapayMember(
  request: APIRequestContext,
  token: string,
): Promise<AdapayMemberAccount> {
  return getJson<AdapayMemberAccount>(request, '/api/adapay/me', token)
}
