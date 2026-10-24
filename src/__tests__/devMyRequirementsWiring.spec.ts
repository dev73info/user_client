import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import type { InvoiceRecord } from '@/api/invoices'
import DevMyRequirementCard from '@/components/dev/DevMyRequirementCard.vue'
import RequirementReceiptDialog from '@/components/dev/RequirementReceiptDialog.vue'
import DevMyRequirementsView from '@/views/DevMyRequirementsView.vue'

/**
 * 「我的接单」页的两处**页面级接线**（R047 收尾轮补的网）。
 *
 * 这两件事都有组件级覆盖，缺的恰恰是页面这一层把它们接起来的那根线：
 *
 * 1. 「哪张票能传」：页面把 `listMyInvoices` 的结果按 `uploadableInvoicesFor` 筛过再传给卡片
 *    （红票、别人的票不该漏到按钮上），点上传去的还是页面里那**一个**隐藏 file input；
 * 2. 「查看回款详情」：页面存的是行标识，弹窗那一组事实（合计 / 笔数 / 逐笔流水号）由页面算好
 *    传下去，点开要真的渲染出来（`TDialog` 默认 teleport 到 body，只在打开时挂载）。
 *
 * 单独一个文件是因为 `devMyRequirementsView.spec.ts` 已经贴着 `.ts` ≤ 300 行的结构预算
 * （那边钉的是读数条、卡片渲染、关键词筛选与解除合作弹窗四条，断言一个都没动）。
 * 每个 api 模块都 `importOriginal` 再覆盖单个函数：子组件也在导入这些模块，整模块替换会把
 * 它们需要的导出抹掉。
 */
const mocks = vi.hoisted(() => ({
  requirements: vi.fn(),
  resources: vi.fn(),
  versions: vi.fn(),
  wallet: vi.fn(),
  invoices: vi.fn(),
  signingStatus: vi.fn(),
  afterSales: vi.fn(),
  conversations: vi.fn(),
}))
vi.mock('@/api/devRequirements', async (orig) => ({
  ...(await orig<typeof import('@/api/devRequirements')>()),
  listMyRequirements: mocks.requirements,
}))
vi.mock('@/api/mcResources', async (orig) => ({
  ...(await orig<typeof import('@/api/mcResources')>()),
  listMcResources: mocks.resources,
  listMcResourceVersions: mocks.versions,
}))
vi.mock('@/api/devWallet', async (orig) => ({
  ...(await orig<typeof import('@/api/devWallet')>()),
  getDevWalletOverview: mocks.wallet,
}))
vi.mock('@/api/contracts', async (orig) => ({
  ...(await orig<typeof import('@/api/contracts')>()),
  fetchDevContractSigningStatus: mocks.signingStatus,
}))
vi.mock('@/api/invoices', async (orig) => ({
  ...(await orig<typeof import('@/api/invoices')>()),
  listMyInvoices: mocks.invoices,
}))
vi.mock('@/api/afterSales', async (orig) => ({
  ...(await orig<typeof import('@/api/afterSales')>()),
  listMyAfterSalesCases: mocks.afterSales,
}))
vi.mock('@/api/conversations', async (orig) => ({
  ...(await orig<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
}))

const ROUTES = ['dev-my-requirements', 'dev-home', 'contract-sign', 'dev-resource-list']

/** 两条需求单：REQ-1 担保 + 开发中（有到账），REQ-2 无担保 + 已完成（一笔都没到）。 */
const baseRequirements = [
  {
    id: 1,
    requirement_id: 'REQ-1',
    bound_resource_id: 11,
    bound_resource_version_count: 1,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: '数据清洗插件定制',
    budget: 3000,
    description: '把客服工单表按天清洗成宽表',
    payment_mode: 'platform_guarantee',
    status: 'in_development',
    updated_at: '2026-09-12 10:00:00',
  },
  {
    id: 2,
    requirement_id: 'REQ-2',
    bound_resource_id: null,
    bound_resource_version_count: null,
    created_time: '2026-09-02 09:00:00',
    creator: 'bob',
    title: '爬虫小工具',
    budget: 500,
    payment_mode: 'self_managed',
    status: 'completed',
    updated_at: '2026-09-11 10:00:00',
  },
]

/**
 * 一张开发者收入票。`applyInvoices` 与 `canUploadInvoiceDocument` 只读这几个字段：
 * 开票主体、乙方是不是我、蓝票 / 红票、状态与文件，其余字段与这两处判定无关。
 */
function invoiceOf(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 7,
    requirementId: 'REQ-1',
    invoiceRole: 'developer',
    developerUsername: 'dev_flow',
    documentKind: 'blue',
    status: 'requested',
    documentUrl: null,
    amountCny: '600.00',
    ...overrides,
  } as InvoiceRecord
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'dev_flow'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.requirements.mockResolvedValue(baseRequirements)
  mocks.resources.mockResolvedValue([
    { id: 11, title: '数据清洗插件', platform: 'web', visibility: 'published' },
  ])
  mocks.versions.mockResolvedValue([
    { id: 101, version: 'v1.0.0', created_at: '2026-09-10 10:00:00', visibility: 'published' },
  ])
  mocks.wallet.mockResolvedValue({
    recent_income: [
      {
        payment_id: 'pay_1',
        requirement_id: 'REQ-1',
        title: '数据清洗插件定制',
        customer: 'alice',
        gross_amount_cny: 600,
        refund_developer_cny: 0,
        amount_cny: 600,
        paid_at: '2026-09-12 12:00:00',
        requirement_status: 'in_development',
        refunded_at: null,
      },
    ],
  })
  mocks.invoices.mockResolvedValue([])
  mocks.signingStatus.mockResolvedValue({
    has_contract: true,
    status: 2,
    party_a_signed: true,
    party_b_signed: true,
  })
  mocks.afterSales.mockResolvedValue({ items: [], windowOpen: null, windowClosesAt: null })
  mocks.conversations.mockResolvedValue([])
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map((n) => ({ name: n, path: `/${n}`, component: { template: '<div/>' } })),
  })
  await router.push({ name: 'dev-my-requirements' })
  const wrapper = mount(DevMyRequirementsView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('我的接单：页面级接线', () => {
  it('只有「我作为乙方的蓝票」进卡片：红票与别人的票都不出「上传发票」', async () => {
    mocks.invoices.mockResolvedValue([
      invoiceOf(),
      // 红票（冲销凭证）已经生效：传不上去，也就没有按钮
      invoiceOf({ id: 8, requirementId: 'REQ-2', documentKind: 'red', status: 'approved' }),
      // 别人开的票：连「我作为乙方的开发者收入票」都算不上
      invoiceOf({ id: 9, invoiceRole: 'platform', developerUsername: 'alice' }),
    ])
    const wrapper = await render()

    const rows = wrapper.findAllComponents(DevMyRequirementCard)
    expect(rows[0]!.props('uploadableInvoices').map((invoice) => invoice.id)).toEqual([7])
    expect(rows[1]!.props('uploadableInvoices')).toEqual([])
    // 按钮跟着票走：第一张卡有「上传发票」，第二张卡没有
    expect(rows[0]!.text()).toContain('上传发票')
    expect(rows[1]!.text()).not.toContain('上传发票')

    // 点它去的仍是页面里那**一个**隐藏 file input（一页共用一个，选完即传）
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const upload = rows[0]!.findAll('button').find((item) => item.text() === '上传发票')
    expect(upload).toBeTruthy()
    await upload!.trigger('click')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
    wrapper.unmount()
  })

  it('点「查看回款详情」把这一行摊进弹窗：合计、笔数与逐笔流水号都渲染出来', async () => {
    const wrapper = await render()

    // 只有出了到账的那一行有这枚入口（第二张卡一笔都没到）
    const toggles = wrapper.findAll('button').filter((item) => item.text() === '查看回款详情')
    expect(toggles).toHaveLength(1)

    await toggles[0]!.trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent(RequirementReceiptDialog)
    expect(dialog.props('open')).toBe(true)
    const detail = dialog.props('detail')!
    // 抬头带需求编号；委托方、状态徽标与卡上的到账合计同一份口径
    expect(detail.dialogTitle).toBe('回款详情 · REQ-1')
    expect(detail.title).toBe('数据清洗插件定制')
    expect(detail.customer).toBe('alice')
    expect(detail.totalText).toBe('¥600.00')
    expect(detail.receipts.map((receipt) => receipt.paymentId)).toEqual(['pay_1'])
    // 真的挂上去了（`TDialog` 默认 teleport 到 body）：逐笔那一行的流水号在页面上找得到
    expect(document.body.textContent).toContain('pay_1')
    wrapper.unmount()
  })

  it('回款逐笔按到账时间正序摊开：后到的尾款排在第二笔，合计按两笔相加', async () => {
    // 钱包「最近一笔在最上面」：接口给的是尾款在前，弹窗里要按时间正序读
    mocks.wallet.mockResolvedValue({
      recent_income: [
        {
          payment_id: 'pay_2',
          requirement_id: 'REQ-1',
          title: '数据清洗插件定制',
          customer: 'alice',
          gross_amount_cny: 2400,
          refund_developer_cny: 0,
          amount_cny: 2400,
          paid_at: '2026-09-20 12:00:00',
          requirement_status: 'in_development',
          refunded_at: null,
        },
        {
          payment_id: 'pay_1',
          requirement_id: 'REQ-1',
          title: '数据清洗插件定制',
          customer: 'alice',
          gross_amount_cny: 600,
          refund_developer_cny: 0,
          amount_cny: 600,
          paid_at: '2026-09-12 12:00:00',
          requirement_status: 'in_development',
          refunded_at: null,
        },
      ],
    })
    const wrapper = await render()

    await wrapper
      .findAll('button')
      .find((item) => item.text() === '查看回款详情')!
      .trigger('click')
    await flushPromises()

    const detail = wrapper.findComponent(RequirementReceiptDialog).props('detail')!
    expect(detail.receipts.map((receipt) => receipt.paymentId)).toEqual(['pay_1', 'pay_2'])
    expect(detail.totalText).toBe('¥3000.00')
    wrapper.unmount()
  })

  it('读数条三格口径分得开，且无担保需求一次都不去查签约状态', async () => {
    mocks.requirements.mockResolvedValue([
      baseRequirements[0],
      // 担保 + 已绑定资源，但不在开发中：让「已关联资源 2」与「开发中 1」分得开
      { ...baseRequirements[0]!, id: 3, requirement_id: 'REQ-3', status: 'pending_final' },
      baseRequirements[1],
    ])
    const wrapper = await render()

    const cells = wrapper
      .findAll('.dev-meta-strip__item:not(.dev-meta-strip__action)')
      .map((cell) => cell.text())
    expect(cells[0]).toContain('3')
    expect(cells[1]).toContain('2')
    expect(cells[2]).toContain('1')

    // 无担保（self_managed）没有合同：REQ-2 一次都不该问，问一次就是白打一个请求
    expect(mocks.signingStatus).toHaveBeenCalledWith('test-token', 'REQ-1')
    expect(mocks.signingStatus).not.toHaveBeenCalledWith('test-token', 'REQ-2')
    wrapper.unmount()
  })
})
