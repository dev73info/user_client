import { describe, expect, it } from 'vitest'

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { RequirementItem } from '@/api/devRequirements'
import type { DevWalletIncomeItem } from '@/api/devWallet'
import {
  buildDevOrderRows,
  deliveryVersionLine,
  devRowKey,
  latestReceiptAt,
  receiptTotal,
  timeValue,
} from '@/shared/devDelivery'

/* 「我的接单」把交付与到账并到需求单这一行上，归并口径全在 shared/devDelivery.ts：
   这里只喂进三类原始数据（需求单、资源与资源版本、钱包入账回执），断言归并后的行。 */

function requirement(
  part: Partial<RequirementItem> & Pick<RequirementItem, 'requirement_id'>,
): RequirementItem {
  return {
    id: 1,
    created_time: '2026-09-01 10:00:00',
    creator: 'alice',
    title: '需求单',
    payment_mode: 'platform_guarantee',
    status: 'in_development',
    updated_at: '2026-09-10 10:00:00',
    ...part,
  }
}

function resource(
  part: Partial<McResourcePayload> & Pick<McResourcePayload, 'id'>,
): McResourcePayload {
  return {
    creator: 'dev_flow',
    ownership_type: 'individual',
    requirement_id: null,
    platform: 'vscode',
    title: '插件',
    author: 'dev_flow',
    description: '',
    tag_selections: [],
    file_name: 'plugin.zip',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    created_at: '2026-09-01 10:00:00',
    updated_at: '2026-09-10 10:00:00',
    ...part,
  }
}

function version(
  resourceId: number,
  part: Partial<McResourceVersionPayload> & Pick<McResourceVersionPayload, 'id' | 'version'>,
): McResourceVersionPayload {
  return {
    resource_id: resourceId,
    resource: '插件',
    note: null,
    creator: 'dev_flow',
    created_at: '2026-09-05 10:00:00',
    ...part,
  }
}

function income(
  part: Partial<DevWalletIncomeItem> & Pick<DevWalletIncomeItem, 'payment_id' | 'requirement_id'>,
): DevWalletIncomeItem {
  return {
    title: '需求单',
    customer: 'alice',
    gross_amount_cny: 100,
    refund_developer_cny: 0,
    amount_cny: 100,
    paid_at: '2026-09-10 12:00:00',
    requirement_status: 'completed',
    refunded_at: null,
    requirement_refund_cny: 0,
    ...part,
  }
}

describe('交付与到账的归并行', () => {
  it('一个需求一行：交付取最新版本与版本总数，定金与尾款两笔到账归到同一行', () => {
    const rows = buildDevOrderRows(
      [requirement({ requirement_id: 'REQ-1', title: '数据清洗插件定制', bound_resource_id: 7 })],
      [resource({ id: 7, title: '清洗插件' })],
      new Map([
        [
          7,
          [
            version(7, { id: 1, version: 'v1.0.0', created_at: '2026-09-05 10:00:00' }),
            version(7, { id: 2, version: 'v1.2.0', created_at: '2026-09-08 10:00:00' }),
          ],
        ],
      ]),
      [
        income({ payment_id: 'p1', requirement_id: 'REQ-1', amount_cny: 8 }),
        income({ payment_id: 'p2', requirement_id: 'REQ-1', amount_cny: 32 }),
      ],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.requirementId).toBe('REQ-1')
    // 多版本只留最新那个，版本总数记在旁边，不再一行一个版本
    expect(rows[0]?.delivery?.latestVersion).toBe('v1.2.0')
    expect(rows[0]?.delivery?.versionCount).toBe(2)
    // 定金与尾款各分账一次，两笔都留在同一行上，行上显示的是合计
    expect(rows[0]?.receipts.map((receipt) => receipt.paymentId)).toEqual(['p1', 'p2'])
    expect(receiptTotal(rows[0]!.receipts)).toBe(40)
    expect(latestReceiptAt(rows[0]!.receipts)).toBe('2026-09-10 12:00:00')
    expect(deliveryVersionLine(rows[0]!.delivery!)).toBe('vscode · v1.2.0 · 共 2 个版本 · 已公开')
  })

  it('版本时间解析不出来时排到末尾，不打乱整份版本的顺序', () => {
    const rows = buildDevOrderRows(
      [requirement({ requirement_id: 'REQ-1', bound_resource_id: 7 })],
      [resource({ id: 7 })],
      new Map([
        [
          7,
          [
            version(7, { id: 1, version: 'v-broken', created_at: '不是时间' }),
            version(7, { id: 2, version: 'v1.0.0', created_at: '2026-09-05 10:00:00' }),
          ],
        ],
      ]),
      [],
    )

    expect(timeValue('不是时间')).toBe(0)
    expect(rows[0]?.delivery?.latestVersion).toBe('v1.0.0')
    expect(rows[0]?.delivery?.versionCount).toBe(2)
  })

  it('绑定资源一个版本都没有时不算交付，需求单这一行仍然留着', () => {
    const rows = buildDevOrderRows(
      [requirement({ requirement_id: 'REQ-2', bound_resource_id: 9 })],
      [resource({ id: 9 })],
      new Map([[9, []]]),
      [],
    )

    // 待签合同、待缴定金的需求单本来就没有交付物，也要在列表里，所以行不因 delivery 为空而消失
    expect(rows).toHaveLength(1)
    expect(rows[0]?.requirementId).toBe('REQ-2')
    expect(rows[0]?.delivery).toBeNull()
    expect(rows[0]?.receipts).toEqual([])
  })

  it('没被任何需求单绑定的资源交付不成行', () => {
    const rows = buildDevOrderRows(
      [requirement({ requirement_id: 'REQ-1', bound_resource_id: 7 })],
      [resource({ id: 7, title: '被绑定的插件' }), resource({ id: 11, title: '独立插件' })],
      new Map([
        [7, [version(7, { id: 1, version: 'v1.0.0' })]],
        [11, [version(11, { id: 2, version: 'v0.1.0' })]],
      ]),
      [],
    )

    // 没绑定过需求单的资源不是订单，不进接单列表；它的交付物在「资源项目 → 版本管理」里
    expect(rows.map((row) => row.key)).toEqual([devRowKey('REQ-1')])
    expect(rows.some((row) => row.delivery?.resourceTitle === '独立插件')).toBe(false)
    expect(rows.filter((row) => row.delivery?.resourceTitle === '被绑定的插件')).toHaveLength(1)
  })

  it('需求已解绑的到账单独成行，抬头与委托方取自钱包回执', () => {
    const rows = buildDevOrderRows(
      [],
      [],
      new Map(),
      [income({ payment_id: 'p9', requirement_id: 'REQ-9', title: '已解绑需求', customer: 'bob' })],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.key).toBe(devRowKey('REQ-9'))
    expect(rows[0]?.requirementId).toBe('REQ-9')
    expect(rows[0]?.delivery).toBeNull()
    expect(rows[0]?.title).toBe('已解绑需求')
    expect(rows[0]?.customer).toBe('bob')
    expect(receiptTotal(rows[0]!.receipts)).toBe(100)
  })

  it('需求单按接口给的顺序在前，未关联的补充行排在其后', () => {
    const rows = buildDevOrderRows(
      [
        requirement({ requirement_id: 'REQ-B', updated_at: '2026-09-10 10:00:00' }),
        requirement({ requirement_id: 'REQ-A', updated_at: '2026-09-09 10:00:00' }),
      ],
      [resource({ id: 11 })],
      new Map([[11, [version(11, { id: 1, version: 'v0.1.0' })]]]),
      [income({ payment_id: 'p9', requirement_id: 'REQ-9' })],
    )

    // 需求单接口给的就是更新时间倒序，这里不再重排；补充行（已解绑的到账）跟在后头。
    // 这份数据里资源 11 有版本却没被任何需求单绑定，按新口径不成行，列表里只剩两条需求单加一条到账。
    expect(rows.map((row) => row.requirementId)).toEqual(['REQ-B', 'REQ-A', 'REQ-9'])
  })
})
