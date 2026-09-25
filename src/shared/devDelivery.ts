import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { RequirementItem } from '@/api/devRequirements'
import type { DevWalletIncomeItem } from '@/api/devWallet'

/**
 * 交付与到账的归并行：开发者工作台「我的接单」一页要把两件事显示在同一行上——
 * 交付侧来自「资源项目」（资源 + 资源版本），到账侧来自「收益钱包」的入账回执
 * （与钱包「收入记录」同一个接口，不另算一份）。
 *
 * 两批数据的粒度不同：回执是一笔分账一行（托管模式下定金与尾款各分账一次，一个需求通常两笔），
 * 交付是一个资源版本一行，而需求与资源版本又是一对多——直接按版本拼，同一个需求有多个版本时
 * 同一笔钱会在多行重复出现。所以这里统一归到**需求单**这一层：交付取最新版本加版本总数，
 * 到账取合计与笔数，逐笔明细摊在回款详情弹窗里。
 *
 * 行的来源是需求单：已关联的需求单**全部**成行（哪怕还没有交付、还没有到账，
 * 待签合同与待缴定金的需求单也在列表里），交付与到账再贴上去。
 *
 * 有资源版本、但没有任何需求单绑定的资源**不成行**：它不是订单，交付物与版本在
 * 「资源项目 → 版本管理」里维护，混进接单列表只会把真订单挤下去。
 * 唯一的补充行是「到账归属的需求已解绑」，免得钱凭空消失。
 *
 * 判定与文案只写在这一处，合并后的视图与它的单测共用。
 */

/** 一笔到账。托管模式下定金与尾款各分账一次，所以行上只放合计与笔数。 */
export type DevReceipt = {
  paymentId: string
  amount: number
  paidAt: string
}

/** 一个需求的交付汇总：绑定资源的信息 + 最新版本与版本总数。 */
export type DevDelivery = {
  resourceId: number
  resourceTitle: string
  platform: McResourcePayload['platform'] | null
  visibility: McResourcePayload['visibility'] | null
  latestVersion: string | null
  latestVersionAt: string | null
  versionCount: number
}

/**
 * 列表里的一行。`requirementId` 一定有值：需求单行来自需求单，补充行来自到账回执带的需求编号。
 */
export type DevOrderRow = {
  key: string
  requirementId: string
  delivery: DevDelivery | null
  receipts: DevReceipt[]
  /** 需求已解绑的补充行：抬头与委托方取自钱包回执，需求单列表里已经找不到它了 */
  title: string | null
  customer: string | null
}

/** 行标识：一份需求一行，不重复。 */
export function devRowKey(requirementId: string): string {
  return `requirement:${requirementId}`
}

/* 时间串有 `YYYY-MM-DD HH:mm:ss` 与资源版本接口两种格式，解析不出来时按 0 处理：
   排序退到末尾，而不是把整份列表打乱。 */
export function timeValue(value: string | null | undefined): number {
  if (!value) {
    return 0
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** 版本摘要：最新版本按发布时间取，版本总数留在同一行上，不再一行一个版本。 */
export function versionSummary(versions: McResourceVersionPayload[]): Pick<
  DevDelivery,
  'latestVersion' | 'latestVersionAt' | 'versionCount'
> {
  const sorted = [...versions].sort(
    (left, right) => timeValue(right.created_at) - timeValue(left.created_at),
  )
  const latest = sorted[0] ?? null

  return {
    latestVersion: latest?.version ?? null,
    latestVersionAt: latest?.created_at ?? null,
    versionCount: versions.length,
  }
}

/** 回执按需求归堆：逐笔都留着，行上取合计与笔数，弹窗里摊开。 */
export function groupReceipts(income: DevWalletIncomeItem[]): Map<string, {
  receipts: DevReceipt[]
  title: string
  customer: string
}> {
  const grouped = new Map<string, { receipts: DevReceipt[]; title: string; customer: string }>()

  for (const item of income) {
    const receipt: DevReceipt = {
      paymentId: item.payment_id,
      amount: item.amount_cny,
      paidAt: item.paid_at,
    }
    const current = grouped.get(item.requirement_id)
    if (!current) {
      grouped.set(item.requirement_id, {
        receipts: [receipt],
        title: item.title,
        customer: item.customer,
      })
      continue
    }

    current.receipts.push(receipt)
  }

  return grouped
}

function deliveryOf(
  resource: McResourcePayload,
  versions: McResourceVersionPayload[],
): DevDelivery {
  return {
    resourceId: resource.id,
    resourceTitle: resource.title,
    platform: resource.platform,
    visibility: resource.visibility,
    ...versionSummary(versions),
  }
}

/**
 * 建整份列表：需求单行（按传入顺序，更新时间倒序）在前，已解绑到账的补充行在后。
 *
 * `versionsByResource` 是「资源编号 → 该资源的全部版本」，由调用方一次取回
 * （见 `DevMyRequirementsView` 的交付数据加载）。
 */
export function buildDevOrderRows(
  requirements: RequirementItem[],
  resources: McResourcePayload[],
  versionsByResource: Map<number, McResourceVersionPayload[]>,
  income: DevWalletIncomeItem[],
): DevOrderRow[] {
  const resourceById = new Map(resources.map((item) => [item.id, item]))
  const receiptsByRequirement = groupReceipts(income)
  const rows: DevOrderRow[] = []

  for (const requirement of requirements) {
    const resource = requirement.bound_resource_id != null
      ? resourceById.get(requirement.bound_resource_id)
      : undefined
    const versions = resource ? versionsByResource.get(resource.id) ?? [] : []
    const group = receiptsByRequirement.get(requirement.requirement_id)

    rows.push({
      key: devRowKey(requirement.requirement_id),
      requirementId: requirement.requirement_id,
      // 绑定资源一个版本都没有时不算交付：行上仍由视图写「暂无交付版本」
      delivery: resource && versions.length > 0 ? deliveryOf(resource, versions) : null,
      receipts: group?.receipts ?? [],
      title: null,
      customer: null,
    })
  }

  const listed = new Set(requirements.map((item) => item.requirement_id))
  for (const [requirementId, group] of receiptsByRequirement) {
    if (listed.has(requirementId)) {
      continue
    }

    // 需求已解绑、需求单列表里查不到时，到账仍然单独成行（交付物留空）。
    rows.push({
      key: devRowKey(requirementId),
      requirementId,
      delivery: null,
      receipts: group.receipts,
      title: group.title,
      customer: group.customer,
    })
  }

  return rows
}

/** 到账合计：行上显示的就是它，逐笔明细在回款详情弹窗里。 */
export function receiptTotal(receipts: DevReceipt[]): number {
  return receipts.reduce((total, item) => total + item.amount, 0)
}

/** 最近一笔到账时间：没有到账时返回 `null`。 */
export function latestReceiptAt(receipts: DevReceipt[]): string | null {
  return receipts.reduce<string | null>((latest, item) => {
    if (!latest) {
      return item.paidAt
    }
    return timeValue(item.paidAt) > timeValue(latest) ? item.paidAt : latest
  }, null)
}

export function platformText(value: string | null): string {
  return value || '未知平台'
}

/** 资源状态文案：`listMcResources` 的取值（与需求单上的 `resource_visibility` 不是一套）。 */
export function deliveryVisibilityText(value: McResourcePayload['visibility'] | null): string {
  if (value === 'published') {
    return '已公开'
  }
  if (value === 'review') {
    return '审核中'
  }

  return '私有'
}

/** 交付物那一行：平台 · 最新版本 · 版本总数 · 资源状态；没有版本时由调用方另外说明。 */
export function deliveryVersionLine(delivery: DevDelivery): string {
  const base = `${platformText(delivery.platform)} · ${delivery.latestVersion ?? '暂无版本'}`
  const counted = delivery.versionCount > 1 ? `${base} · 共 ${delivery.versionCount} 个版本` : base

  return `${counted} · ${deliveryVisibilityText(delivery.visibility)}`
}
