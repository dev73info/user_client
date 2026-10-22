import { createMemoryHistory, createRouter } from 'vue-router'
import type { DevCreditSelf } from '@/api/devCredit'
import type { DevOrderDepositStatus } from '@/api/devOrderDeposit'
import type { RequirementItem } from '@/api/devRequirements'
import type { McResourcePayload } from '@/api/mcResources'
import type { McProcessedTagTree } from '@/api/resourceTags'

/**
 * 开发者「需求详情 / 接取需求」页的测试夹具。
 *
 * 放在 `__tests__/fixtures/` 而不是某个 spec 里：这条页面的用例按「渲染 / 资格闸门」与
 * 「两条接单路径」拆成了两个 spec，两边都要同一批需求单、保证金、资源与标签树数据。
 */

export function requirementItem(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: 'REQ-1',
    created_time: '2026-10-01 10:00:00',
    creator: 'alice',
    title: '数据清洗插件定制',
    budget: 500,
    description: '<p>需要把日志清洗成结构化表格</p>',
    acceptance_criteria: '<ul><li>支持 CSV 导出</li></ul>',
    payment_mode: 'platform_guarantee',
    status: 'pending_deposit',
    updated_at: '2026-10-20 10:00:00',
    development_cycle_days: 14,
    archive_locked_at: null,
    archive_lock_expires_at: null,
    archive_cleared_at: null,
    archive_can_claim_resource: false,
    ...patch,
  } as RequirementItem
}

/** 保证金余额 1000 元、够接 500 元的需求。 */
export function depositStatus(patch: Partial<DevOrderDepositStatus> = {}): DevOrderDepositStatus {
  return {
    username: 'bob',
    role: 'dev',
    has_paid_deposit: true,
    can_bind_requirement: true,
    total_paid_cny: 1000,
    frozen_cny: 0,
    available_cny: 1000,
    pending_refund_cny: 0,
    pending_withdraw_cny: 0,
    paid_withdraw_cny: 0,
    ...patch,
  }
}

/** 未开启订单额度限制：信用不拦预算。 */
export function creditSelf(patch: Partial<DevCreditSelf> = {}): DevCreditSelf {
  return {
    username: 'bob',
    credit_score: 100,
    cny_per_credit: 10,
    max_deposit_cny: 5000,
    max_order_amount_cny: 0,
    remaining_deposit_cap_cny: 5000,
    enforce_deposit_limit: false,
    enforce_order_limit: false,
    ...patch,
  }
}

/** 一个「私有草稿且未绑定」的资源：唯一能直接关联的那种。 */
export function draftResource(patch: Partial<McResourcePayload> = {}): McResourcePayload {
  return {
    id: 5,
    creator: 'bob',
    ownership_type: 'individual',
    requirement_id: null,
    platform: 'minecraft',
    title: '数据清洗资源包',
    author: 'bob',
    description: '',
    tag_selections: [],
    file_name: 'cleaning.package',
    source_url: 'pending://resource/minecraft/mc-plugins/cleaning',
    cover_url: null,
    docs_url: null,
    visibility: 'draft',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    promo_share_bps: 0,
    ...patch,
  } as McResourcePayload
}

/** 一棵最小标签树：一个根节点、一个二级节点、一组两个标签。 */
export const TAG_TREE: McProcessedTagTree = {
  roots: [
    {
      key: 'mc',
      label: 'Minecraft',
      first_entry_key: 'mc-plugins',
      entries: [
        {
          key: 'mc-plugins',
          platform: 'minecraft',
          label: '插件',
          group_name: '插件',
          path_label: 'Minecraft / 插件',
          icon: '',
          publish_groups: [
            {
              key: 'g-1',
              group_id: 1,
              group_name: '玩法',
              group_alias: 'gameplay',
              group_path: ['Minecraft', '插件', '玩法'],
              group_path_aliases: ['mc', 'plugins', 'gameplay'],
              label: 'Minecraft / 插件 / 玩法',
              depth: 2,
              items: [
                { id: 11, name: '生存', alias: 'survival' },
                { id: 12, name: '冒险', alias: 'adventure' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/** 详情页要用到的四条路由（其余落点用空组件接住）。 */
export function createDetailRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        name: 'dev-requirement-detail',
        path: '/developer/requirements/hall/:requirementId',
        component: { template: '<div />' },
      },
      {
        name: 'dev-requirement-hall',
        path: '/developer/requirements/hall',
        component: { template: '<div />' },
      },
      {
        name: 'dev-my-requirements',
        path: '/developer/requirements/my',
        component: { template: '<div />' },
      },
      { name: 'contract-sign', path: '/contract-sign', component: { template: '<div />' } },
      {
        name: 'dev-order-deposit',
        path: '/dev/wallet/order-deposit',
        component: { template: '<div />' },
      },
    ],
  })
}
