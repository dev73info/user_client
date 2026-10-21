import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import DevMyRequirementsView from '@/views/DevMyRequirementsView.vue'

/**
 * 「我的接单」页最小挂载烟测（这页原先零覆盖）。拆「解除合作案件」弹窗时先补一层网，只钉四件事：
 * 读数条四格、卡片渲染、关键词筛选，以及点「解除合作」后弹窗拿到的是**本页那份**签约状态。
 * 细分口径在 `shared/devDelivery`、`shared/requirementBreach` 的纯函数测试里。
 *
 * 每个 api 模块都 `importOriginal` 再覆盖单个函数：子组件也在导入这些模块，整模块替换会把它们
 * 需要的导出抹掉。不用 `stubs: { teleport: true }`：胶在本页的 TSelect 就地渲染会互相触发重渲染。
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
  breachCase: vi.fn(),
}))
vi.mock('@/api/adapay', async (orig) => ({
  ...(await orig<typeof import('@/api/adapay')>()),
  getAdapayBreachCase: mocks.breachCase,
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

/** 两条需求单：担保 + 开发中（出合同徽标），无担保 + 已完成。 */
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

/** 一条「协商中、由对方发起」的解除合作案件：开发者这侧只等回应，案件还能再发起一轮。 */
const baseBreachCase = {
  id: 21,
  caseNo: 'BREACH_21',
  requirementId: 'REQ-1',
  paymentId: 'pay_1',
  reportedBy: 'alice',
  reason: '交付进度落后',
  status: 'submitted' as const,
  depositAmountFen: 200000,
  depositAmountCny: '2000.00',
  refundAmountFen: 0,
  refundAmountCny: '0.00',
  compensationAmountFen: 0,
  compensationAmountCny: '0.00',
  extraCompensationFen: 0,
  extraCompensationCny: '0.00',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
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
  // 到账口径与「收益钱包 → 收入记录」同源：一笔分账一条回执
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
  mocks.breachCase.mockResolvedValue(baseBreachCase)
})

async function render(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map((n) => ({ name: n, path: `/${n}`, component: { template: '<div/>' } })),
  })
  await router.push({ name: 'dev-my-requirements', query })
  const wrapper = mount(DevMyRequirementsView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

/** 顶部读数条：整格取 text（标签 + 数字），末格是刷新按钮所在的 __action 槽，不是读数。 */
const statCells = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-meta-strip__item:not(.dev-meta-strip__action)').map((cell) => cell.text())
const cards = (wrapper: Wrapper) => wrapper.findAll('.dev-requirement-card')
/** 工具栏里的关键词搜索框（状态筛选是个 TSelect，这里按 placeholder 只找 input）。 */
const searchInput = (w: Wrapper) => w.find('input[placeholder*="搜索需求编号"]')

describe('我的接单：最小挂载烟测', () => {
  it('读数条四格取需求单、已关联资源、开发中与累计到账', async () => {
    const { wrapper } = await render()

    // 接口按登录 token 取，拼行的三份补充数据（资源 / 钱包 / 签约状态）各自打到
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')
    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.signingStatus).toHaveBeenCalledWith('test-token', 'REQ-1')
    // onMounted 串行顺序：需求单先 await 回来，解除合作待办（角标）再补——顺序倒了角标口径就变
    expect(mocks.requirements.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.afterSales.mock.invocationCallOrder[0]!,
    )

    const cells = statCells(wrapper)
    expect(cells).toHaveLength(4)
    // 总需求单 = 需求单条数（补充行不算）；已关联资源 = 绑定过资源的条数；开发中 = in_development 条数
    expect(cells[0]).toContain('总需求单')
    expect(cells[0]).toContain('2')
    expect(cells[1]).toContain('已关联资源')
    expect(cells[1]).toContain('1')
    expect(cells[2]).toContain('开发中')
    expect(cells[2]).toContain('1')
    // 累计到账 = 到账合计（两位小数，与收益钱包同一口径）
    expect(cells[3]).toContain('累计到账')
    expect(cells[3]).toContain('¥600.00')
    wrapper.unmount()
  })

  it('需求列表按行渲染，卡片标题、编号与合同状态徽标对得上', async () => {
    const { wrapper } = await render()

    const rows = cards(wrapper)
    expect(rows).toHaveLength(2)

    const first = rows[0]!
    expect(first.find('.dev-requirement-hall__title').text()).toBe('数据清洗插件定制')
    expect(first.find('.dev-requirement-hall__requirement-id').text()).toBe('REQ-1')
    // 担保需求出签约状态条，徽标取后端 status 码的文案；交付物取绑定资源 + 最新版本，到账取回执合计
    expect(first.find('.signing-status-badge').text()).toBe('已签约')
    expect(first.text()).toContain('数据清洗插件')
    expect(first.text()).toContain('¥600.00')

    const second = rows[1]!
    expect(second.find('.dev-requirement-hall__title').text()).toBe('爬虫小工具')
    expect(second.find('.dev-requirement-hall__requirement-id').text()).toBe('REQ-2')
    // 无担保模式没有合同，整条签约状态栏都不渲染
    expect(second.find('.signing-status-badge').exists()).toBe(false)
    // 这一单没有回执：给占位符，不写 ¥0.00（与「一笔都没到」区分开）
    expect(second.text()).toContain('暂无到账')
    wrapper.unmount()
  })

  it('关键词筛选在前端切片：灌词后只剩一条，清空回到两条', async () => {
    const { wrapper } = await render()
    expect(cards(wrapper)).toHaveLength(2)

    const input = searchInput(wrapper)
    expect(input.exists()).toBe(true)
    await input.setValue('爬虫')
    await flushPromises()
    expect(cards(wrapper)).toHaveLength(1)
    expect(cards(wrapper)[0]!.find('.dev-requirement-hall__title').text()).toBe('爬虫小工具')
    // 工具栏给出「筛出几条 / 共几条」的说明
    expect(wrapper.find('.dev-toolbar__hint').text()).toContain('1 / 2')

    await input.setValue('')
    await flushPromises()
    expect(cards(wrapper)).toHaveLength(2)
    wrapper.unmount()
  })

  it('点「解除合作」把本页的签约状态与登录身份注入弹窗', async () => {
    /** 打开第一张卡片上的解除合作弹窗，返回弹窗实例。 */
    async function openBreachDialog() {
      const { wrapper } = await render()
      const button = cards(wrapper)[0]!
        .findAll('button')
        .find((item) => item.text() === '解除合作')
      expect(button).toBeTruthy()
      await button!.trigger('click')
      await flushPromises()
      return { wrapper, dialog: wrapper.findComponent(RequirementBreachDialog) }
    }

    const first = await openBreachDialog()
    expect(mocks.breachCase).toHaveBeenCalledWith('test-token', 'REQ-1')
    expect(first.dialog.props('visible')).toBe(true)
    expect(first.dialog.props('breachCase')?.caseNo).toBe('BREACH_21')
    // 有生效合同（列表一次取回的 signingStatusMap）才能再发起一轮：由页面注入，弹窗不自己查第二次
    expect(first.dialog.props('canStartNewRound')).toBe(true)
    // 案件由对方发起 → 我是非发起人、能表态；不是申请人所以不能撤回
    expect(first.dialog.props('canRespond')).toBe(true)
    expect(first.dialog.props('canWithdraw')).toBe(false)
    // 还没出 AI 判定：这段表态区不出现
    expect(first.dialog.props('canDecide')).toBe(false)
    first.wrapper.unmount()

    // 反过来：案件是我发起的 → 我能撤回，但不能替自己表态（两枚布尔各自独立）
    mocks.breachCase.mockResolvedValue({ ...baseBreachCase, reportedBy: 'dev_flow' })
    const mine = await openBreachDialog()
    expect(mine.dialog.props('canWithdraw')).toBe(true)
    expect(mine.dialog.props('canRespond')).toBe(false)
    mine.wrapper.unmount()

    // 出了 AI 判定、且对方已表态而我方还没表态：本页是开发者视角，仍该给我选接受 / 不接受。
    // 照抄需求方的判据（看 customerDecision）这里就会变成 false——按钮会凭空消失。
    mocks.breachCase.mockResolvedValue({
      ...baseBreachCase,
      status: 'ai_judged',
      customerDecision: 'accepted',
    })
    const judged = await openBreachDialog()
    expect(judged.dialog.props('canDecide')).toBe(true)
    judged.wrapper.unmount()
  })
})
