import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DevMyRequirementCard from '@/components/dev/DevMyRequirementCard.vue'
import DevRequirementBriefField from '@/components/dev/DevRequirementBriefField.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import type { InvoiceRecord } from '@/api/invoices'
import type { ContractSigningStatus } from '@/shared/contracts'
import { displayStatusLabel } from '@/shared/devMyRequirementCard'
import type { DevMyOrderRow } from '@/shared/devDelivery'

/**
 * 卡片本体与需求说明组件的单测（R047 拆卡片时补的覆盖）。
 *
 * 页面级的四件事已经在 `devMyRequirementsView.spec.ts` 里钉住（读数条、卡片渲染、筛选、
 * 解除合作弹窗拿到本页那份签约状态）；这里补的是**拆出来的组件自己**的口径，
 * 正是上一轮反证时发现没有网的四条中的三条：
 *
 * 1. `:contract-status` 注入——卡片要把页面那一份签约状态原样交给进度条，并据此出徽标；
 * 2. 需求说明的「展开 / 收起」——`BRIEF_FIELD_BODY_SELECTOR` 是硬编码类名字符串，
 *    跟着 DOM 搬进组件后一旦写错，量不到正文就永远不出「展开」，用户再也打不开长描述；
 * 3. 行上的两个出口接线——「查看回款详情」与「上传发票」都要从卡片 emit 出去，
 *    页面接回去才打得开弹窗、选得到文件。
 *
 * jsdom 没有布局：正文的 `scrollHeight` / `clientHeight` 一律 0，量不出溢出，
 * 所以第一个用例临时把这两个读数钉死（见 `stubBodies`），跑完再还原。
 */

const contractStatus: ContractSigningStatus = {
  has_contract: true,
  status: 2,
  party_a_signed: true,
  party_b_signed: true,
}

/** 一行需求单（担保 + 开发中），要哪条口径就在用例里覆盖。 */
function makeRow(overrides: Partial<DevMyOrderRow> = {}): DevMyOrderRow {
  return {
    key: 'requirement:REQ-1',
    requirementId: 'REQ-1',
    delivery: null,
    receipts: [],
    title: null,
    customer: null,
    item: {
      id: 1,
      requirement_id: 'REQ-1',
      subscribe_status_change: false,
      bound_resource_id: 11,
      created_time: '2026-09-01 09:00:00',
      creator: 'alice',
      title: '数据清洗插件定制',
      budget: 3000,
      description: '把客服工单表按天清洗成宽表',
      payment_mode: 'platform_guarantee',
      status: 'in_development',
    },
    ...overrides,
  }
}

/** 卡片的必填 props：判定要读的「签约状态」与售后角标都在这里，其余是纯展示。 */
function cardProps(row: DevMyOrderRow, extra: Record<string, unknown> = {}) {
  return {
    row,
    contractStatus: null,
    afterSalesBadge: '',
    afterSalesPendingCount: 0,
    boundResourceTitle: null,
    conversationLabel: '打开后创建会话',
    conversationLoading: false,
    contractCreating: false,
    uploadableInvoices: [],
    uploadingInvoiceId: null,
    ...extra,
  }
}

describe('需求说明：展开 / 收起', () => {
  const originals = new Map<string, PropertyDescriptor | undefined>()

  /** jsdom 量不出高度：把两段正文的读数钉成「内容比可见高度长」。 */
  function stubBodies() {
    for (const key of ['scrollHeight', 'clientHeight']) {
      originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key))
    }
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 100,
    })
  }

  afterEach(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, key, descriptor)
      }
    }
    originals.clear()
  })

  it('正文被截断时出「展开」，点开换成「收起」并放掉折叠类', async () => {
    stubBodies()
    const wrapper = mount(DevRequirementBriefField, {
      props: {
        description: '需求描述正文',
        acceptanceCriteria: '验收标准正文',
      },
      attachTo: document.body,
    })
    await flushPromises()

    // 两段正文各挂一个 __field-body：类的字符串写错就一段也量不到，「展开」不出现
    expect(wrapper.findAll('.dev-requirement-card__field-body')).toHaveLength(2)
    const brief = wrapper.find('.dev-requirement-card__brief')
    expect(brief.classes()).toContain('is-collapsed')

    const toggle = wrapper.find('.dev-requirement-card__description-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toBe('展开')

    await toggle.trigger('click')
    expect(wrapper.find('.dev-requirement-card__brief').classes()).not.toContain('is-collapsed')
    expect(wrapper.find('.dev-requirement-card__description-toggle').text()).toBe('收起')

    // 收起来之后按钮还在（只置位、不翻回 false），否则用户再也打不开
    await wrapper.find('.dev-requirement-card__description-toggle').trigger('click')
    expect(wrapper.find('.dev-requirement-card__brief').classes()).toContain('is-collapsed')
    expect(wrapper.find('.dev-requirement-card__description-toggle').text()).toBe('展开')
    wrapper.unmount()
  })

  it('字段为空时给占位，正文走富文本净化', async () => {
    const wrapper = mount(DevRequirementBriefField, {
      props: { description: '<p>照做</p><script>alert(1)</script>', acceptanceCriteria: '' },
    })

    expect(wrapper.text()).toContain('照做')
    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.text()).toContain('当前需求暂未补充验收标准。')
    wrapper.unmount()
  })
})

describe('接单卡：签约状态注入与行内出口', () => {
  it('把页面那份签约状态原样交给进度条，并据此出合同徽标', async () => {
    const row = makeRow()
    const wrapper = mount(DevMyRequirementCard, {
      props: cardProps(row, { contractStatus }),
    })

    // 「待签合同」这类中间态要读签约状态：进度条拿到的是同一份对象，不是再查一遍的空值
    const guide = wrapper.findComponent(RequirementProgressGuide)
    expect(guide.exists()).toBe(true)
    expect(guide.props('contractStatus')).toEqual(contractStatus)
    expect(wrapper.find('.signing-status-badge').text()).toBe('已签约')
    // 双方都签过 → 合同按钮是「查看合同」
    const contractButton = wrapper.findAll('button').find((item) => item.text() === '查看合同')
    expect(contractButton).toBeTruthy()
    wrapper.unmount()
  })

  it('补充行（需求已解绑）不出签署与操作栏，只留一句说明', async () => {
    const row = makeRow({ item: null, title: '一笔无主到账', customer: 'alice' })
    const wrapper = mount(DevMyRequirementCard, {
      props: cardProps(row, { contractStatus }),
    })

    expect(wrapper.find('.dev-requirement-hall__title').text()).toBe('一笔无主到账')
    expect(wrapper.text()).toContain('这条到账所属的需求已解除绑定')
    expect(wrapper.find('.dev-requirement-card__actions').exists()).toBe(false)
    expect(wrapper.find('.signing-status-badge').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点「查看回款详情」把行交回页面（弹窗由页面开）', async () => {
    const row = makeRow({
      receipts: [{ paymentId: 'pay_1', amount: 600, paidAt: '2026-09-12 12:00:00' }],
    })
    const wrapper = mount(DevMyRequirementCard, { props: cardProps(row) })

    expect(wrapper.text()).toContain('¥600.00')
    await wrapper.find('.dev-requirement-card__receipt-toggle').trigger('click')
    expect(wrapper.emitted('openReceipt')).toHaveLength(1)
    wrapper.unmount()
  })

  it('可上传的发票透传到操作栏，点一下把票 id emit 回页面', async () => {
    const invoice = { id: 7, requirement_id: 'REQ-1' } as unknown as InvoiceRecord
    const wrapper = mount(DevMyRequirementCard, {
      props: cardProps(makeRow(), {
        uploadableInvoices: [invoice],
        afterSalesBadge: '3',
      }),
    })

    const upload = wrapper.findAll('button').find((item) => item.text().includes('上传发票'))
    expect(upload).toBeTruthy()
    await upload!.trigger('click')
    expect(wrapper.emitted('pickInvoice')).toEqual([[7]])
    // 售后角标读数是算好传下来的，卡片只是摆上去
    expect(wrapper.text()).toContain('3')
    wrapper.unmount()
  })

  it('两行评价各自按评分出星，纯数字评语不当作正文', async () => {
    const row = makeRow()
    row.item!.comment_rating = 4.5
    row.item!.comment_text = '5'
    row.item!.developer_comment_rating = 5
    row.item!.developer_comment_text = '交付很顺利'
    const wrapper = mount(DevMyRequirementCard, { props: cardProps(row) })

    const rows = wrapper.findAll('.dev-rating-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.findAll('.dev-rating-star.is-full')).toHaveLength(4)
    expect(rows[0]!.findAll('.dev-rating-star.is-half')).toHaveLength(1)
    // 「5」是评分脏数据，不出评语；第二行的正常评语照出
    expect(rows[0]!.find('.dev-rating-row__text').exists()).toBe(false)
    expect(rows[1]!.find('.dev-rating-row__text').text()).toBe('交付很顺利')
    wrapper.unmount()
  })
})

describe('接单卡：判定口径', () => {
  it('待签合同的需求出「签署合同」与发起提示，不出申报违约以外的入口', async () => {
    const row = makeRow()
    row.item!.status = 'pending_deposit'
    const wrapper = mount(DevMyRequirementCard, {
      props: cardProps(row, {
        contractStatus: {
          has_contract: true,
          status: 1,
          party_a_signed: false,
          party_b_signed: false,
        },
      }),
    })

    expect(wrapper.find('.signing-status-badge').text()).toBe('签约中')
    expect(wrapper.text()).toContain('请完成开发者签署')
    const labels = wrapper.findAll('button').map((item) => item.text())
    expect(labels).toContain('签署合同')
    // 有合同就不再出「发起合同」
    expect(labels).not.toContain('发起合同')
    wrapper.unmount()
  })

  it('本页状态筛选用的「待签合同」中间态与卡片口径一致', () => {
    const row = makeRow()
    row.item!.status = 'deposit_paid'
    const waiting = { has_contract: true, status: 1, party_a_signed: true, party_b_signed: false }

    expect(displayStatusLabel(row.item!, waiting)).toBe('待签合同')
    expect(displayStatusLabel(row.item!, { ...waiting, party_b_signed: true })).toBe('已付定金')
    expect(displayStatusLabel({ ...row.item!, payment_mode: 'self_managed' }, null)).toBe('待开发')
  })
})
