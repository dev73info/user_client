import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'

import { DEV_USERNAME } from './shared'

/* ------------------------------------------------------------------ 需求单 */

export type RequirementSeed = {
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
export const REQUIREMENT_SEEDS: RequirementSeed[] = [
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
