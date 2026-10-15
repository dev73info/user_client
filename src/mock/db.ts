/**
 * mock 的内存数据集。
 *
 * 三条约定，写 handler 时照着用：
 *
 * 1. **一份数据、两侧视角**。需求单、合同、支付单、资源都只有一份，
 *    客户侧（`/requirement/mine`）与开发者侧（`/dev/requirements/mine`、需求大厅）
 *    只是同一批数据的不同过滤方式，所以两侧看到的状态永远对得上。
 * 2. **用户名取自身份档案**，不写字面量。`.env.local` 里的自动登录账号可能与本机默认值不同，
 *    数据里的 creator / developer 跟着身份档案走，「我的需求」才不会过滤成空列表。
 * 3. **状态自洽**。需求的 `status` 决定合同签到哪一步、定金尾款各付了多少，
 *    见 `REQUIREMENT_SEEDS` 里的注释；状态与金额对不上会让页面同时显示互相矛盾的文案。
 *
 * 数据只在内存里，刷新页面即回到初始状态（不做持久化，避免脏数据在各个页面之间累积）。
 */

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { ContractDetail } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'
import type { RequirementItem, RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import type { DevWalletOverview, DevWithdrawalRecord } from '@/api/devWallet'
import type { DevOrderDepositStatus } from '@/api/devOrderDeposit'

import { MOCK_IDENTITY_PROFILES } from './identity'

export const CLIENT_USERNAME = MOCK_IDENTITY_PROFILES.client.username
export const DEV_USERNAME = MOCK_IDENTITY_PROFILES.dev.username

export const CLIENT_NICKNAME = MOCK_IDENTITY_PROFILES.client.nickname
export const DEV_NICKNAME = MOCK_IDENTITY_PROFILES.dev.nickname

/* ------------------------------------------------------------------ 时间工具 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date, separator: string): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join(separator)
}

function shiftDate(days: number, hour: number, minute: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date
}

/** 后端时间口径：`YYYY-MM-DD HH:mm:ss`（东八区本地时间）。 */
export function datetime(days = 0, hour = 10, minute = 0): string {
  const date = shiftDate(days, hour, minute)
  return `${formatDate(date, '-')} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

/** 资源时间口径：ISO 风格 `YYYY-MM-DDTHH:mm:00`。 */
export function iso(days = 0, hour = 10, minute = 0): string {
  const date = shiftDate(days, hour, minute)
  return `${formatDate(date, '-')}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

/* ------------------------------------------------------------------ 需求单 */

type RequirementSeed = {
  id: number
  code: string
  title: string
  description: string
  acceptance: string
  budget: number
  mode: RequirementPaymentMode
  status: RequirementStatus
  /** 接单开发者；未接单时为空，这类需求会出现在开发者需求大厅 */
  developer: string | null
  /** 绑定的资源 id（接单后才有） */
  resourceId: number | null
  /** 创建于几天前 */
  createdDaysAgo: number
  /** 最近更新于几天前 */
  updatedDaysAgo: number
  /** 定金 / 尾款是否已付，用于生成支付单与钱包收入 */
  depositPaid: boolean
  finalPaid: boolean
  /** 平台审核意见（被驳回时填） */
  reviewNote?: string | null
  /** 开发者申请删除的版本（演示「需求方审核资源」这条待办） */
  pendingVersionDelete?: { versionId: number; version: string; daysAgo: number }
}

/**
 * 需求单种子数据。状态刻意铺开，让两个身份都能看到「有下一步动作」的条目：
 *
 * - `pending_review`：刚发布，平台审核中（客户侧可见，开发者大厅看不到）
 * - `pending_deposit` + 未接单：在需求大厅可被开发者接取
 * - `pending_deposit` + 已接单未签完：客户待签合同、待付定金
 * - `deposit_paid`：定金已付，开发者开发中
 * - `in_development`：开发者已提交交付版本，客户待验收
 * - `pending_final`：待客户付尾款
 * - `pending_settlement`：尾款已付，等渠道分账
 * - `completed` / `cancelled`：终态
 */
const REQUIREMENT_SEEDS: RequirementSeed[] = [
  {
    id: 1,
    code: 'REQ-20260907-0051',
    title: '跨境电商订单同步插件定制',
    description: '多平台订单聚合与库存同步，需要支持 Amazon、Shopify、TikTok Shop 三个渠道。',
    acceptance: '三平台订单 5 分钟内同步完成，库存差异可一键重算。',
    budget: 12800,
    mode: 'platform_guarantee',
    status: 'in_development',
    developer: DEV_USERNAME,
    resourceId: 9001,
    createdDaysAgo: 12,
    updatedDaysAgo: 0,
    depositPaid: true,
    finalPaid: false,
    // 让需求方侧有一条「审核资源」的待办，演示入口：卡片右侧「审核资源」按钮
    pendingVersionDelete: { versionId: 3, version: 'v1.2.0', daysAgo: 1 },
  },
  {
    id: 2,
    code: 'REQ-20260828-0042',
    title: '企业微信审批流连接器开发',
    description: '对接企业微信审批回调，把审批结果推送到内部工单系统。',
    acceptance: '审批通过后自动触发下游任务，失败可重试并记录日志。',
    budget: 8600,
    mode: 'platform_guarantee',
    status: 'pending_final',
    developer: DEV_USERNAME,
    resourceId: 9002,
    createdDaysAgo: 16,
    updatedDaysAgo: 1,
    depositPaid: true,
    finalPaid: false,
  },
  {
    id: 3,
    code: 'REQ-20260826-0038',
    title: '经营数据看板前端开发',
    description: '门店经营看板，含日报、周报与导出。',
    acceptance: '看板支持按门店筛选并导出 Excel。',
    budget: 24000,
    mode: 'platform_guarantee',
    status: 'deposit_paid',
    developer: DEV_USERNAME,
    resourceId: null,
    createdDaysAgo: 18,
    updatedDaysAgo: 3,
    depositPaid: true,
    finalPaid: false,
  },
  {
    id: 4,
    code: 'REQ-20260814-0029',
    title: '小程序订单提醒机器人',
    description: '订单状态变更推送到企业微信，支持免打扰时段。',
    acceptance: '新订单 1 分钟内送达提醒。',
    budget: 4200,
    mode: 'platform_guarantee',
    status: 'completed',
    developer: DEV_USERNAME,
    resourceId: 9003,
    createdDaysAgo: 34,
    updatedDaysAgo: 6,
    depositPaid: true,
    finalPaid: true,
  },
  {
    id: 5,
    code: 'REQ-20260805-0017',
    title: '私有化部署脚本与交付文档整理',
    description: '无担保模式：只做部署脚本与文档，不走合同与资金担保。',
    acceptance: '客户内网一键部署成功。',
    budget: 3000,
    mode: 'self_managed',
    status: 'completed',
    developer: DEV_USERNAME,
    resourceId: null,
    createdDaysAgo: 42,
    updatedDaysAgo: 9,
    depositPaid: false,
    finalPaid: false,
  },
  {
    id: 6,
    code: 'REQ-20260912-0063',
    title: '仓储 WMS 对接接口开发',
    description: '对接第三方 WMS，实现出入库单双向同步。',
    acceptance: '出入库单 30 秒内同步，异常可人工补偿。',
    budget: 15600,
    mode: 'platform_guarantee',
    status: 'pending_deposit',
    developer: DEV_USERNAME,
    resourceId: null,
    createdDaysAgo: 8,
    updatedDaysAgo: 2,
    depositPaid: false,
    finalPaid: false,
  },
  {
    id: 7,
    code: 'REQ-20260918-0071',
    title: '内部知识库全文检索改造',
    description: '刚提交，等平台审核。改造现有检索，支持中文分词与高亮。',
    acceptance: '万级文档检索响应 1 秒内。',
    budget: 9800,
    mode: 'self_managed',
    status: 'pending_review',
    developer: null,
    resourceId: null,
    createdDaysAgo: 2,
    updatedDaysAgo: 2,
    depositPaid: false,
    finalPaid: false,
  },
  {
    id: 8,
    code: 'REQ-20260910-0058',
    title: '多租户 SaaS 计费模块开发',
    description: '按用量计费 + 套餐订阅，需要出账单与对账。',
    acceptance: '账单金额与用量明细一致，支持导出。',
    budget: 22000,
    mode: 'platform_guarantee',
    status: 'pending_deposit',
    developer: null,
    resourceId: null,
    createdDaysAgo: 6,
    updatedDaysAgo: 1,
    depositPaid: false,
    finalPaid: false,
  },
  {
    id: 9,
    code: 'REQ-20260916-0069',
    title: '企业微信侧边栏客服工作台',
    description: '在企微侧边栏展示客户画像与快捷回复。',
    acceptance: '侧边栏 1 秒内加载，快捷回复可配置。',
    budget: 12000,
    mode: 'platform_guarantee',
    status: 'pending_deposit',
    developer: null,
    resourceId: null,
    createdDaysAgo: 4,
    updatedDaysAgo: 1,
    depositPaid: false,
    finalPaid: false,
  },
  {
    id: 10,
    code: 'REQ-20260822-0035',
    title: '老系统数据迁移脚本',
    description: '客户已取消：预算与工期没谈拢。',
    acceptance: '迁移后数据校验一致。',
    budget: 5000,
    mode: 'self_managed',
    status: 'cancelled',
    developer: null,
    resourceId: null,
    createdDaysAgo: 26,
    updatedDaysAgo: 20,
    depositPaid: false,
    finalPaid: false,
  },
]

function buildRequirement(seed: RequirementSeed): RequirementItem {
  return {
    id: seed.id,
    requirement_id: seed.code,
    subscribe_status_change: false,
    bound_resource_id: seed.resourceId,
    bound_resource_version_count: seed.resourceId ? 3 : null,
    resource_visibility: seed.resourceId ? 'public' : null,
    created_time: datetime(-seed.createdDaysAgo, 10, 0),
    creator: CLIENT_USERNAME,
    title: seed.title,
    description: seed.description,
    acceptance_criteria: seed.acceptance,
    review_note: seed.reviewNote ?? null,
    status: seed.status,
    budget: seed.budget,
    payment_mode: seed.mode,
    updated_at: datetime(-seed.updatedDaysAgo, 15, 30),
    developer: seed.developer,
    pending_resource_version_delete_requests: seed.pendingVersionDelete
      ? [
        {
          version_id: seed.pendingVersionDelete.versionId,
          version: seed.pendingVersionDelete.version,
          requested_at: datetime(-seed.pendingVersionDelete.daysAgo, 10, 30),
        },
      ]
      : null,
    resource_version_delete_request_status: seed.pendingVersionDelete ? 'pending' : null,
    settlement_available_at:
      seed.status === 'pending_settlement' ? datetime(7, 12, 0) : null,
  }
}

export const requirements: RequirementItem[] = REQUIREMENT_SEEDS.map(buildRequirement)

function seedOf(code: string): RequirementSeed | undefined {
  return REQUIREMENT_SEEDS.find((item) => item.code === code)
}

export function findRequirement(code: string): RequirementItem | undefined {
  return requirements.find((item) => item.requirement_id === code)
}

export function seedOfRequirement(code: string): RequirementSeed | undefined {
  return seedOf(code)
}

/** 平台分成比例（默认 20%，与后端一致），定金 = 总价 × 该比例。 */
export const PLATFORM_DEPOSIT_PERCENT = 20

export function depositAmountOf(requirement: RequirementItem): number {
  return Math.round(((requirement.budget ?? 0) * PLATFORM_DEPOSIT_PERCENT) / 100)
}

export function finalAmountOf(requirement: RequirementItem): number {
  return Math.max((requirement.budget ?? 0) - depositAmountOf(requirement), 0)
}

/* ------------------------------------------------------------------ 合同 */

function buildContract(
  seed: RequirementSeed,
  status: number,
  partyASigned: boolean,
  partyBSigned: boolean,
): ContractDetail {
  const deposit = Math.round((seed.budget * PLATFORM_DEPOSIT_PERCENT) / 100)
  const created = datetime(-seed.createdDaysAgo + 1, 11, 0)

  return {
    id: 100 + seed.id,
    template_name: 'requirement_development_contract',
    requirement_id: seed.code,
    contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
    title: `需求开发合同 · ${seed.title}`,
    content: [
      `（演示合同）甲方委托乙方开发「${seed.title}」。`,
      '',
      `合同总价：${seed.budget.toFixed(2)} 元`,
      `定金（${PLATFORM_DEPOSIT_PERCENT}%）：${deposit.toFixed(2)} 元，合同签署后支付`,
      `尾款：${(seed.budget - deposit).toFixed(2)} 元，验收通过后支付`,
      `验收标准：${seed.acceptance}`,
      '',
      '关闭 mock 即可看到真实合同内容。',
    ].join('\n'),
    content_sha256: 'mock-content-sha256',
    status,
    party_a_name: CLIENT_NICKNAME,
    party_a_username: CLIENT_USERNAME,
    party_a_account_email: MOCK_IDENTITY_PROFILES.client.email,
    party_a_real_name: CLIENT_NICKNAME,
    party_a_id_card_no_masked: '3306**********1234',
    party_a_signature_sha256: partyASigned ? 'mock-signature-a' : null,
    party_a_signed_at: partyASigned ? datetime(-seed.createdDaysAgo + 1, 12, 0) : null,
    party_b_name: DEV_NICKNAME,
    party_b_username: DEV_USERNAME,
    party_b_account_email: MOCK_IDENTITY_PROFILES.dev.email,
    party_b_real_name: DEV_NICKNAME,
    party_b_id_card_no_masked: '1101**********5678',
    party_b_signature_sha256: partyBSigned ? 'mock-signature-b' : null,
    party_b_signed_at: partyBSigned ? datetime(-seed.createdDaysAgo + 1, 11, 30) : null,
    created_by: CLIENT_USERNAME,
    created_at: created,
    updated_at: datetime(-seed.updatedDaysAgo, 15, 30),
    signing_logs: [
      {
        id: 1,
        contract_id: 100 + seed.id,
        contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
        contract_title: `需求开发合同 · ${seed.title}`,
        action: 'create',
        from_status: null,
        to_status: CONTRACT_STATUS.awaiting,
        operator: CLIENT_USERNAME,
        signer_party: null,
        signer_real_name: null,
        signer_id_card_no_masked: null,
        signer_username: null,
        signer_email: null,
        handwritten_signature: null,
        signature_sha256: null,
        note: '发起合同',
        created_at: created,
      },
      ...(partyBSigned
        ? [
          {
            id: 2,
            contract_id: 100 + seed.id,
            contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
            contract_title: `需求开发合同 · ${seed.title}`,
            action: 'sign',
            // 两个「待某方签署」已合并为「签约中 1」：乙方先签，前后状态同码，
            // 轮到谁签改由 party_a_signed_at / party_b_signed_at 推导。
            from_status: CONTRACT_STATUS.signing,
            to_status: CONTRACT_STATUS.signing,
            operator: DEV_USERNAME,
            signer_party: 'party_b',
            signer_real_name: DEV_NICKNAME,
            signer_id_card_no_masked: '1101**********5678',
            signer_username: DEV_USERNAME,
            signer_email: MOCK_IDENTITY_PROFILES.dev.email,
            handwritten_signature: 'mock-handwriting',
            signature_sha256: 'mock-signature-b',
            note: null,
            created_at: datetime(-seed.createdDaysAgo + 1, 11, 30),
          },
        ]
        : []),
      ...(partyASigned
        ? [
          {
            id: 3,
            contract_id: 100 + seed.id,
            contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
            contract_title: `需求开发合同 · ${seed.title}`,
            action: 'sign',
            from_status: CONTRACT_STATUS.signing,
            to_status: CONTRACT_STATUS.signed,
            operator: CLIENT_USERNAME,
            signer_party: 'party_a',
            signer_real_name: CLIENT_NICKNAME,
            signer_id_card_no_masked: '3306**********1234',
            signer_username: CLIENT_USERNAME,
            signer_email: MOCK_IDENTITY_PROFILES.client.email,
            handwritten_signature: 'mock-handwriting',
            signature_sha256: 'mock-signature-a',
            note: null,
            created_at: datetime(-seed.createdDaysAgo + 1, 12, 0),
          },
        ]
        : []),
    ],
  }
}

/**
 * 有合同的担保需求，以及合同签到哪一步。
 * 需求单状态与合同状态必须对得上：待付定金 = 合同已签完；开发中及以后 = 合同已签完。
 */
export const contracts: ContractDetail[] = [
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 1)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 2)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 3)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 4)!, CONTRACT_STATUS.signed, true, true),
  // 待付定金：乙方（开发者）已签，等甲方（需求方）签（签约中 1）
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 6)!, CONTRACT_STATUS.signing, false, true),
]

export function contractOfRequirement(code: string): ContractDetail | undefined {
  return contracts.find((item) => item.requirement_id === code)
}

/* ------------------------------------------------------------------ 支付单 */

export type MockPayment = {
  payment_id: string
  requirement_id: string
  kind: 'deposit' | 'final'
  channel: 'alipay' | 'wechat'
  amount_cny: number
  /** 后端支付单状态：待支付 / 已支付 */
  status: 'pending' | 'paid' | 'closed'
  description: string
  created_at: string
  paid_at: string | null
}

function buildPayments(): MockPayment[] {
  const list: MockPayment[] = []

  for (const seed of REQUIREMENT_SEEDS) {
    if (seed.mode !== 'platform_guarantee' || seed.status === 'rejected') {
      continue
    }

    const requirement = findRequirement(seed.code)
    if (!requirement) {
      continue
    }

    const deposit = depositAmountOf(requirement)
    const final = finalAmountOf(requirement)

    list.push({
      payment_id: `PAY-${seed.code}-DEPOSIT`,
      requirement_id: seed.code,
      kind: 'deposit',
      channel: 'alipay',
      amount_cny: deposit,
      status: seed.depositPaid ? 'paid' : 'pending',
      description: `${seed.title} · 定金（${PLATFORM_DEPOSIT_PERCENT}%）`,
      created_at: datetime(-seed.createdDaysAgo + 1, 12, 10),
      paid_at: seed.depositPaid ? datetime(-seed.createdDaysAgo + 1, 12, 20) : null,
    })

    if (seed.depositPaid) {
      list.push({
        payment_id: `PAY-${seed.code}-FINAL`,
        requirement_id: seed.code,
        kind: 'final',
        channel: 'wechat',
        amount_cny: final,
        status: seed.finalPaid ? 'paid' : 'pending',
        description: `${seed.title} · 尾款`,
        created_at: datetime(-seed.updatedDaysAgo, 16, 0),
        paid_at: seed.finalPaid ? datetime(-seed.updatedDaysAgo, 16, 10) : null,
      })
    }
  }

  return list
}

export const payments: MockPayment[] = buildPayments()

export function paymentOf(code: string, kind: 'deposit' | 'final'): MockPayment | undefined {
  return payments.find((item) => item.requirement_id === code && item.kind === kind)
}

/** 已结单产生的分账收入，钱包「最近收入」与开发者的交付回执都用它。 */
export const settledIncome = REQUIREMENT_SEEDS.filter((seed) => seed.finalPaid).map((seed) => {
  const requirement = findRequirement(seed.code)
  const amount = requirement ? finalAmountOf(requirement) : 0

  return {
    payment_id: `PAY-${seed.code}-FINAL`,
    requirement_id: seed.code,
    title: seed.title,
    customer: CLIENT_USERNAME,
    gross_amount_cny: amount,
    refund_developer_cny: 0,
    amount_cny: amount,
    paid_at: datetime(-seed.updatedDaysAgo, 16, 10),
    requirement_status: seed.status,
    refunded_at: null,
    requirement_refund_cny: 0,
  }
})

/* ------------------------------------------------------------------ 资源与版本 */

function buildResource(
  id: number,
  platform: string,
  title: string,
  description: string,
  visibility: McResourcePayload['visibility'],
  updatedDaysAgo: number,
  requirementCode: string | null = null,
): McResourcePayload {
  return {
    id,
    creator: DEV_USERNAME,
    ownership_type: 'individual',
    team_id: null,
    requirement_id: requirementCode,
    platform,
    title,
    author: DEV_NICKNAME,
    description,
    tag_selections: [],
    file_name: `${title}.zip`,
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility,
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(-40, 9, 0),
    updated_at: iso(-updatedDaysAgo, 15, 20),
    promo_share_bps: 0,
  }
}

export const mcResources: McResourcePayload[] = [
  buildResource(
    9001,
    '自研工具',
    '跨境电商订单同步插件',
    '把 Amazon / Shopify / TikTok Shop 的订单聚合到一张表，支持库存对账。',
    'published',
    2,
    'REQ-20260907-0051',
  ),
  buildResource(
    9002,
    '自研工具',
    '企业微信审批流连接器',
    '接收企业微信审批回调并转发到内部系统，内置重试与日志。',
    'published',
    4,
    'REQ-20260828-0042',
  ),
  (() => {
    const paid = buildResource(
      9003,
      '自研工具',
      '小程序订单提醒机器人',
      '订单状态变更推送到企业微信，支持免打扰时段。',
      'published',
      6,
    )
    paid.price_fen = 990
    paid.copyright_declared = true
    paid.copyright_declared_at = iso(-6, 12, 0)
    return paid
  })(),
  buildResource(
    9004,
    '自研工具',
    '经营数据看板模板',
    '通用门店经营看板模板，含日报周报与导出。',
    'review',
    1,
  ),
]

function buildVersion(
  id: number,
  resourceId: number,
  version: string,
  note: string,
  daysAgo: number,
): McResourceVersionPayload {
  return {
    id,
    resource_id: resourceId,
    version,
    resource: `resource-${resourceId}-${version}.zip`,
    note,
    creator: DEV_USERNAME,
    created_at: datetime(-daysAgo, 15, 10),
  }
}

export const mcResourceVersions: McResourceVersionPayload[] = [
  buildVersion(1, 9001, 'v1.0.0', '首个可用版本：三平台订单拉取与合并。', 20),
  buildVersion(2, 9001, 'v1.1.0', '增加库存对账与差异重算。', 9),
  buildVersion(3, 9001, 'v1.2.0', '订单同步间隔可配置，补充失败重试。', 1),
  buildVersion(4, 9002, 'v1.0.0', '审批回调接收与转发。', 14),
  buildVersion(5, 9002, 'v1.1.0', '支持幂等与死信重投。', 3),
  buildVersion(6, 9003, 'v1.0.0', '订单提醒与免打扰时段。', 30),
]

export function versionsOf(resourceId: number): McResourceVersionPayload[] {
  return mcResourceVersions.filter((item) => item.resource_id === resourceId)
}

/* ------------------------------------------------------------------ 开发者钱包与保证金 */

export const devWallet: DevWalletOverview = {
  total_income_cny: 38600,
  today_income_cny: 1280,
  today_income_change_rate: 12.5,
  total_completed_orders: 8,
  active_requirement_count: 3,
  withdrawable_balance_cny: 18420.5,
  pending_withdraw_cny: 3200,
  paid_withdraw_cny: 16800,
  recent_income: settledIncome,
}

/** 近 7 天到账金额（最早 → 今天），最后一位与今日收入自洽。 */
export const devDailyIncome: number[] = [420, 680, 960, 1320, 540, 1138, 1280]

/**
 * 接单保证金。可用额度刻意留在「够接大厅里那两单」的水平：大厅的接单按钮要求
 * 可用保证金 ≥ 需求预算（见 DevRequirementHallView 的「保证金不足」判定），
 * 额度太小的话演示时点不动「接单」。
 */
export const devOrderDeposit: DevOrderDepositStatus = {
  username: DEV_USERNAME,
  role: 'dev',
  has_paid_deposit: true,
  can_bind_requirement: true,
  total_paid_cny: 50000,
  frozen_cny: 4800,
  available_cny: 45200,
  pending_refund_cny: 0,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 0,
  latest_order: {
    payment_id: 'PAY-DEPOSIT-DEMO-1',
    channel: 'adapay',
    amount_cny: 50000,
    status: 'paid',
    expires_at: null,
    created_at: datetime(-30, 10, 0),
    updated_at: datetime(-30, 10, 5),
  },
}

function buildWithdrawal(
  id: number,
  amount: number,
  status: DevWithdrawalRecord['status'],
  daysAgo: number,
): DevWithdrawalRecord {
  const accountNo = '6222020200112233445'

  return {
    withdrawal_id: `WD-DEMO-${id}`,
    creator: DEV_USERNAME,
    amount_cny: amount,
    channel: 'adapay',
    account_name: DEV_NICKNAME,
    account_no: accountNo,
    account_no_masked: `6222********${accountNo.slice(-4)}`,
    status,
    note: null,
    review_note: status === 'rejected' ? '演示数据：收款账户信息不完整' : null,
    reviewed_by: status === 'pending_review' ? null : 'admin_demo',
    reviewed_at: status === 'pending_review' ? null : datetime(-daysAgo + 1, 10, 0),
    paid_reference: status === 'paid' ? `ADAPAY-DEMO-${id}` : null,
    paid_at: status === 'paid' ? datetime(-daysAgo + 1, 14, 0) : null,
    payout_failure_message: status === 'payout_failed' ? '演示数据：收款卡状态异常' : null,
    payout_started_at: status === 'payout_processing' ? datetime(-daysAgo, 9, 0) : null,
    payout_attempts: status === 'pending_review' ? 0 : 1,
    created_at: datetime(-daysAgo, 9, 30),
    updated_at: datetime(-daysAgo + 1, 14, 0),
  }
}

export const devWithdrawals: DevWithdrawalRecord[] = [
  buildWithdrawal(1, 3200, 'pending_review', 1),
  buildWithdrawal(2, 5000, 'paid', 8),
  buildWithdrawal(3, 2800, 'paid', 21),
]

export const devWithdrawalSetting = {
  auto_withdraw_enabled: false,
  auto_withdraw_enabled_at: null as string | null,
  payout_channel_ready: true,
  payout_channel_message: null as string | null,
  payout_schedule_note: '出款按 T+1 到账，遇节假日顺延。',
  payout_account_no: '6222********3445',
}

export const devWithdrawalLimits = {
  min_amount_cny: 1,
  max_amount_cny: 50000,
  alipay_enabled: false,
  wechat_enabled: false,
  account_name_min_len: 2,
  account_name_max_len: 40,
  account_no_min_len: 6,
  account_no_max_len: 80,
  note_max_len: 200,
}

/* ------------------------------------------------------------------ 通用账户数据 */

export const coupons = [
  {
    code: 'MOCK-COUPON-10',
    name: '新需求立减 10 元',
    discount_type: 'amount' as const,
    discount_value: 10,
    min_amount_cny: 100,
    max_discount_cny: null as number | null,
    total_quota: 1000,
    used_count: 12,
    starts_at: datetime(-10, 0, 0),
    ends_at: datetime(20, 23, 59),
    active: true,
    status: 'pending_use' as const,
  },
  {
    code: 'MOCK-COUPON-5P',
    name: '定金支付 95 折',
    discount_type: 'percent' as const,
    discount_value: 5,
    min_amount_cny: 500,
    max_discount_cny: 200,
    total_quota: 500,
    used_count: 40,
    starts_at: datetime(-5, 0, 0),
    ends_at: datetime(25, 23, 59),
    active: true,
    status: 'pending_use' as const,
  },
]

export const points = {
  balance: 1260,
  total_earned: 3200,
  total_spent: 1940,
}

export const communityPosts = [
  {
    id: 1,
    author: DEV_NICKNAME,
    author_avatar_url: null,
    author_username_gradient: false,
    author_username_color: null,
    title: '担保模式接单的一点经验：先看清验收标准',
    status: 'published' as const,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    tags: [] as Array<{ id: number; name: string }>,
    content_html: '<p>演示数据：验收标准写得越具体，后期扯皮越少。</p>',
    like_count: 18,
    comment_count: 3,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: datetime(-3, 9, 0),
    updated_at: datetime(-3, 9, 0),
    origin_type: 'original' as const,
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    bounty_points: 0,
    bounty_status: 'none' as const,
    bounty_accepted_comment_id: null,
    is_featured: false,
    featured_at: null,
    bumped_at: null,
    highlight_until: null,
  },
  {
    id: 2,
    author: CLIENT_NICKNAME,
    author_avatar_url: null,
    author_username_gradient: false,
    author_username_color: null,
    title: '需求方视角：怎么把一句话需求写成可交付的需求',
    status: 'published' as const,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    tags: [],
    content_html: '<p>演示数据：背景、交付物、验收标准，三件套缺一不可。</p>',
    like_count: 26,
    comment_count: 5,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: datetime(-6, 20, 0),
    updated_at: datetime(-6, 20, 0),
    origin_type: 'original' as const,
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    bounty_points: 0,
    bounty_status: 'none' as const,
    bounty_accepted_comment_id: null,
    is_featured: true,
    featured_at: datetime(-5, 10, 0),
    bumped_at: null,
    highlight_until: null,
  },
]

/* ------------------------------------------------------------------ 变更操作 */

let nextRequirementId = 100
let nextResourceId = 9100
let nextVersionId = 100

/** 客户发布需求：直接进入「平台审核中」。 */
export function createRequirementRecord(payload: {
  title: string
  description: string
  budget: number
  acceptance_criteria: string
  payment_mode: RequirementPaymentMode
}): RequirementItem {
  nextRequirementId += 1
  const code = `REQ-MOCK-${nextRequirementId}`

  const item: RequirementItem = {
    id: nextRequirementId,
    requirement_id: code,
    subscribe_status_change: false,
    bound_resource_id: null,
    bound_resource_version_count: null,
    resource_visibility: null,
    created_time: datetime(0, 10, 0),
    creator: CLIENT_USERNAME,
    title: payload.title,
    description: payload.description,
    acceptance_criteria: payload.acceptance_criteria,
    review_note: null,
    status: 'pending_review',
    budget: payload.budget,
    payment_mode: payload.payment_mode,
    updated_at: datetime(0, 10, 0),
    developer: null,
    settlement_available_at: null,
  }

  REQUIREMENT_SEEDS.push({
    id: item.id,
    code,
    title: payload.title,
    description: payload.description,
    acceptance: payload.acceptance_criteria,
    budget: payload.budget,
    mode: payload.payment_mode,
    status: 'pending_review',
    developer: null,
    resourceId: null,
    createdDaysAgo: 0,
    updatedDaysAgo: 0,
    depositPaid: false,
    finalPaid: false,
  })
  requirements.unshift(item)

  return item
}

/** 开发者接单：绑定资源后需求进入待付定金，并自动生成一份待签合同。 */
export function bindRequirementRecord(code: string, resourceId: number): RequirementItem | null {
  const requirement = findRequirement(code)
  if (!requirement) {
    return null
  }

  requirement.developer = DEV_USERNAME
  requirement.bound_resource_id = resourceId
  requirement.bound_resource_version_count = versionsOf(resourceId).length
  requirement.resource_visibility = 'public'
  requirement.updated_at = datetime(0, 12, 0)

  const seed = seedOf(code)
  if (seed) {
    seed.developer = DEV_USERNAME
    seed.resourceId = resourceId
    seed.updatedDaysAgo = 0
  }

  if (!contractOfRequirement(code) && requirement.payment_mode === 'platform_guarantee' && seed) {
    contracts.push(buildContract(seed, CONTRACT_STATUS.signing, false, false))
  }

  return requirement
}

/** 新增资源。 */
export function createResourceRecord(payload: {
  title: string
  author: string
  description: string
  platform: string
  file_name: string
  source_url: string
  requirement_id: string | null
  visibility: McResourcePayload['visibility']
  /** R029：推广分成比例（万分比），不传按 0 */
  promo_share_bps?: number
}): McResourcePayload {
  nextResourceId += 1

  const resource: McResourcePayload = {
    id: nextResourceId,
    creator: DEV_USERNAME,
    ownership_type: 'individual',
    team_id: null,
    requirement_id: payload.requirement_id,
    platform: payload.platform,
    title: payload.title,
    author: payload.author,
    description: payload.description,
    tag_selections: [],
    file_name: payload.file_name,
    source_url: payload.source_url,
    cover_url: null,
    docs_url: null,
    visibility: payload.visibility,
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(0, 10, 0),
    updated_at: iso(0, 10, 0),
    promo_share_bps: Number(payload.promo_share_bps ?? 0),
  }

  mcResources.unshift(resource)
  return resource
}

/** 新增资源版本，同时同步需求单上的版本数。 */
export function createVersionRecord(
  resourceId: number,
  version: string,
  note: string | null,
): McResourceVersionPayload | null {
  const resource = mcResources.find((item) => item.id === resourceId)
  if (!resource) {
    return null
  }

  nextVersionId += 1

  const record: McResourceVersionPayload = {
    id: nextVersionId,
    resource_id: resourceId,
    version,
    resource: `resource-${resourceId}-${version}.zip`,
    note,
    creator: DEV_USERNAME,
    created_at: datetime(0, 11, 0),
  }

  mcResourceVersions.push(record)
  resource.updated_at = iso(0, 11, 0)

  for (const requirement of requirements) {
    if (requirement.bound_resource_id === resourceId) {
      requirement.bound_resource_version_count = versionsOf(resourceId).length
    }
  }

  return record
}

/** 支付成功：推进支付单与需求状态。 */
export function markPaymentPaid(payment: MockPayment): { requirement_status: string } {
  payment.status = 'paid'
  payment.paid_at = datetime(0, 10, 30)

  const requirement = findRequirement(payment.requirement_id)
  const seed = seedOf(payment.requirement_id)

  if (!requirement || !seed) {
    return { requirement_status: requirement?.status ?? '' }
  }

  if (payment.kind === 'deposit') {
    seed.depositPaid = true
    if (requirement.status === 'pending_deposit') {
      requirement.status = 'deposit_paid'
      seed.status = 'deposit_paid'
    }
  } else {
    seed.finalPaid = true
    requirement.status = 'pending_settlement'
    seed.status = 'pending_settlement'
    requirement.settlement_available_at = datetime(7, 12, 0)
  }

  requirement.updated_at = datetime(0, 10, 30)

  return { requirement_status: requirement.status }
}

export function withdrawRecords(): DevWithdrawalRecord[] {
  return devWithdrawals
}
