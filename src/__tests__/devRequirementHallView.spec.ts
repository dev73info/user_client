import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import DevRequirementHallView from '@/views/DevRequirementHallView.vue'

/**
 * 开发者需求大厅的最小挂载烟测（这页原先零覆盖）。拆分 `DevRequirementHallView` 之前补的一层网，
 * 只钉四件事：取数与请求实参（列表 / 保证金 / 信用 / 协议）、顶条读数、关键词筛选的请求口径、
 * 以及「接单」按钮的两条跳转（已签协议进详情、未签先签协议）。
 *
 * 每个 api 模块都 `importOriginal` 再覆盖单个函数：composable 也在导入这些模块，
 * 整模块替换会把它们需要的导出抹掉。
 */
const mocks = vi.hoisted(() => ({
  listHall: vi.fn(),
  depositStatus: vi.fn(),
  creditSelf: vi.fn(),
  accessStatus: vi.fn(),
}))

vi.mock('@/api/devRequirements', async (orig) => ({
  ...(await orig<typeof import('@/api/devRequirements')>()),
  listRequirementHall: mocks.listHall,
}))
vi.mock('@/api/devOrderDeposit', async (orig) => ({
  ...(await orig<typeof import('@/api/devOrderDeposit')>()),
  getDevOrderDepositStatus: mocks.depositStatus,
}))
vi.mock('@/api/devCredit', async (orig) => ({
  ...(await orig<typeof import('@/api/devCredit')>()),
  getDevCreditSelf: mocks.creditSelf,
}))
vi.mock('@/api/auth', async (orig) => ({
  ...(await orig<typeof import('@/api/auth')>()),
  getDevAccessStatus: mocks.accessStatus,
}))

/** 一条担保需求（预算 3000，可用保证金 5000 够得起）+ 一条自管需求。 */
const hallItems = [
  {
    id: 1,
    requirement_id: 'REQ-1',
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: '数据清洗插件定制',
    budget: 3000,
    description: '把客服工单表按天清洗成宽表',
    acceptance_criteria: '按验收模板逐条自测',
    payment_mode: 'platform_guarantee',
    status: 'pending_deposit',
    updated_at: '2026-09-12 10:00:00',
  },
  {
    id: 2,
    requirement_id: 'REQ-2',
    created_time: '2026-09-02 09:00:00',
    creator: 'bob',
    title: '爬虫小工具',
    budget: 500,
    description: null,
    acceptance_criteria: null,
    payment_mode: 'self_managed',
    status: 'pending_deposit',
    updated_at: '2026-09-11 10:00:00',
  },
]

const HALL_PATH = '/workbench/developer/requirements/hall'

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'dev_flow'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.listHall.mockResolvedValue({ total: 2, page: 1, page_size: 10, items: hallItems })
  mocks.depositStatus.mockResolvedValue({
    username: 'dev_flow',
    role: 'dev',
    has_paid_deposit: true,
    can_bind_requirement: true,
    total_paid_cny: 5000,
    frozen_cny: 0,
    available_cny: 5000,
    pending_refund_cny: 0,
    pending_withdraw_cny: 0,
    paid_withdraw_cny: 0,
    latest_order: null,
  })
  mocks.creditSelf.mockResolvedValue({
    username: 'dev_flow',
    credit_score: 100,
    cny_per_credit: 100,
    max_deposit_cny: 10000,
    max_order_amount_cny: 10000,
    remaining_deposit_cap_cny: 10000,
    enforce_deposit_limit: true,
    enforce_order_limit: true,
  })
  mocks.accessStatus.mockResolvedValue({
    developer_agreement_signed: true,
    api_usage_agreement_signed: true,
  })
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'dev-requirement-hall', path: HALL_PATH, component: { template: '<div/>' } },
      {
        name: 'dev-requirement-detail',
        path: '/workbench/developer/requirements/detail/:requirementId',
        component: { template: '<div/>' },
      },
      { name: 'contract-sign', path: '/contract-sign', component: { template: '<div/>' } },
      { path: '/dev/wallet/order-deposit', component: { template: '<div/>' } },
    ],
  })
  await router.push(HALL_PATH)
  const wrapper = mount(DevRequirementHallView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

/** 顶条读数：整格取 text（标签 + 数字），末格是按钮所在的 __action 槽，不是读数。 */
const stripCells = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-meta-strip__item:not(.dev-meta-strip__action)').map((cell) => cell.text())

/** 表格里每行的「接单」按钮（顶条那颗可用保证金读数也是 button，靠选择器排除掉）。 */
const tableActions = (wrapper: Wrapper) => wrapper.findAll('.dev-requirement-hall__table button')

/** 表格里每行「接单」按钮上的字。 */
const actionLabels = (wrapper: Wrapper) => tableActions(wrapper).map((button) => button.text())

describe('开发者需求大厅：最小挂载烟测', () => {
  it('首次加载按登录 token 取列表、保证金、信用与协议状态，请求实参口径不变', async () => {
    const { wrapper } = await render()

    // 列表：第 1 页、每页 10 条、无关键词、按最近更新倒序（服务端分页与排序）
    expect(mocks.listHall).toHaveBeenCalledWith('test-token', {
      page: 1,
      pageSize: 10,
      keyword: '',
      sortBy: 'updated_at',
      sortOrder: 'desc',
    })
    // 接单资格三路：保证金是硬闸门，信用与协议状态各自补一份
    expect(mocks.depositStatus).toHaveBeenCalledWith('test-token')
    expect(mocks.creditSelf).toHaveBeenCalledWith('test-token')
    expect(mocks.accessStatus).toHaveBeenCalledWith('test-token')

    // 顶条四格：总需求单（服务端 total）、当前页无电签 / 电签条数、可用保证金读数
    const cells = stripCells(wrapper)
    expect(cells).toHaveLength(4)
    expect(cells[0]).toContain('需求单')
    expect(cells[0]).toContain('2')
    expect(cells[1]).toContain('无电签')
    expect(cells[1]).toContain('1')
    expect(cells[2]).toContain('电签')
    expect(cells[2]).toContain('1')
    expect(cells[3]).toContain('保证金')
    expect(cells[3]).toContain('¥5000.00')

    // 列表按行渲染：编号、标题、预算与时间口径都对得上
    const titles = wrapper.findAll('.dev-requirement-hall__title').map((cell) => cell.text())
    expect(titles).toEqual(['数据清洗插件定制', '爬虫小工具'])
    expect(wrapper.findAll('.dev-requirement-hall__requirement-id')[0]!.text()).toBe('REQ-1')
    // 没填预算写「待议价」，填了就直接跟一个 ¥（不做千分位）
    expect(wrapper.text()).toContain('¥3000')
    // 描述为空时给占位符，不把整个单元格留空（点表格那一份，窄屏卡片流也各渲染一份）
    const descs = wrapper.findAll('.dev-requirement-hall__desc').map((cell) => cell.text())
    expect(descs[1]).toBe('暂无补充描述')
    // 已签协议 ⇒ 页顶那条签协议提示不出现
    expect(wrapper.find('.dev-requirement-hall__agreement-notice').exists()).toBe(false)

    wrapper.unmount()
  })

  it('关键词输入 300ms 防抖后带 keyword 回到第 1 页重新请求', async () => {
    const { wrapper } = await render()
    expect(mocks.listHall).toHaveBeenCalledTimes(1)

    const input = wrapper.find('input[placeholder*="搜索需求编号"]')
    expect(input.exists()).toBe(true)
    await input.setValue('REQ-2')

    // 防抖没到点：不发请求
    expect(mocks.listHall).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()

    expect(mocks.listHall).toHaveBeenCalledTimes(2)
    expect(mocks.listHall).toHaveBeenLastCalledWith('test-token', {
      page: 1,
      pageSize: 10,
      keyword: 'REQ-2',
      sortBy: 'updated_at',
      sortOrder: 'desc',
    })
    wrapper.unmount()
  })

  it('已签协议且保证金够：点「接单」直接进需求详情，带需求号', async () => {
    const { wrapper, router } = await render()

    expect(actionLabels(wrapper)[0]).toBe('接单')
    const cta = tableActions(wrapper).find((button) => button.text() === '接单')
    expect(cta).toBeTruthy()
    await cta!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dev-requirement-detail')
    expect(router.currentRoute.value.params.requirementId).toBe('REQ-1')
    wrapper.unmount()
  })

  it('保证金不足时按钮改文案；未签协议时点「接单」先去签协议并带上回跳地址', async () => {
    // 可用保证金只剩 100：担保需求（预算 3000）接不了，自管需求不受影响
    mocks.depositStatus.mockResolvedValue({
      username: 'dev_flow',
      role: 'dev',
      has_paid_deposit: false,
      can_bind_requirement: false,
      total_paid_cny: 100,
      frozen_cny: 0,
      available_cny: 100,
      pending_refund_cny: 0,
      pending_withdraw_cny: 0,
      paid_withdraw_cny: 0,
      latest_order: null,
    })
    // 协议未签：页顶出现签协议提示，「接单」也被拦去签协议
    mocks.accessStatus.mockResolvedValue({
      developer_agreement_signed: false,
      api_usage_agreement_signed: false,
    })

    const { wrapper, router } = await render()

    expect(wrapper.find('.dev-requirement-hall__agreement-notice').exists()).toBe(true)
    // 判定顺序：协议先于保证金——没签协议时先说协议
    expect(actionLabels(wrapper)[0]).toBe('需先签署协议')

    const cta = tableActions(wrapper).find((button) => button.text() === '需先签署协议')
    await cta!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('contract-sign')
    expect(router.currentRoute.value.query.agreement).toBe('developer')
    expect(router.currentRoute.value.query.redirect_to).toBe(
      `${HALL_PATH}/${encodeURIComponent('REQ-1')}`,
    )
    wrapper.unmount()
  })

  it('本页不再有「关联需求」弹窗（那条链是不可达的死代码，绑定流程在需求详情页）', async () => {
    const { wrapper } = await render()

    expect(wrapper.find('.dev-dialog').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('初始化新资源项目')
    expect(wrapper.text()).not.toContain('二次确认')
    wrapper.unmount()
  })
})
