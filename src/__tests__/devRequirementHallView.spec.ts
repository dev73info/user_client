import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import DevRequirementHallView from '@/views/DevRequirementHallView.vue'

/**
 * 开发者需求大厅的最小挂载烟测（这页原先零覆盖）。拆分 `DevRequirementHallView` 之前补的一层网，
 * 只钉三件事：取数与请求实参（列表 / 接单准入）、顶条读数、关键词筛选的请求口径、
 * 以及「接单」按钮的两条跳转（已签协议进详情、未签先签协议）。
 *
 * 每个 api 模块都 `importOriginal` 再覆盖单个函数：composable 也在导入这些模块，
 * 整模块替换会把它们需要的导出抹掉。
 */
const mocks = vi.hoisted(() => ({
  listHall: vi.fn(),
  accessStatus: vi.fn(),
}))

vi.mock('@/api/devRequirements', async (orig) => ({
  ...(await orig<typeof import('@/api/devRequirements')>()),
  listRequirementHall: mocks.listHall,
}))
vi.mock('@/api/auth', async (orig) => ({
  ...(await orig<typeof import('@/api/auth')>()),
  getDevAccessStatus: mocks.accessStatus,
}))

/** 一条担保需求（预算 3000）+ 一条自管需求。 */
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

  mocks.listHall.mockResolvedValue(hallItems)
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

/** 表格里每行的「接单」按钮。 */
const tableActions = (wrapper: Wrapper) => wrapper.findAll('.dev-requirement-hall__table button')

/** 表格里每行「接单」按钮上的字。 */
const actionLabels = (wrapper: Wrapper) => tableActions(wrapper).map((button) => button.text())

describe('开发者需求大厅：最小挂载烟测', () => {
  it('首次加载按登录 token 取列表与接单准入，请求实参口径不变', async () => {
    const { wrapper } = await render()

    // 列表：契约端点不带任何查询参数（一次回全量），分页 / 排序 / 关键词都在本地做
    expect(mocks.listHall).toHaveBeenCalledWith('test-token')
    // 接单准入只剩入驻协议这一项读数（保证金由后端在接单时判）
    expect(mocks.accessStatus).toHaveBeenCalledWith('test-token')

    // 顶条三格：总需求单（服务端 total）、当前页无电签 / 电签条数
    const cells = stripCells(wrapper)
    expect(cells).toHaveLength(3)
    expect(cells[0]).toContain('需求单')
    expect(cells[0]).toContain('2')
    expect(cells[1]).toContain('无电签')
    expect(cells[1]).toContain('1')
    expect(cells[2]).toContain('电签')
    expect(cells[2]).toContain('1')

    // 列表按行渲染，按发布时间倒序（REQ-2 建于 09-02，REQ-1 建于 09-01）
    const titles = wrapper.findAll('.dev-requirement-hall__title').map((cell) => cell.text())
    expect(titles).toEqual(['爬虫小工具', '数据清洗插件定制'])
    expect(wrapper.findAll('.dev-requirement-hall__requirement-id')[0]!.text()).toBe('REQ-2')
    // 没填预算写「待议价」，填了就直接跟一个 ¥（不做千分位）
    expect(wrapper.text()).toContain('¥3000')
    // 描述为空时给占位符，不把整个单元格留空（点表格那一份，窄屏卡片流也各渲染一份）
    const descs = wrapper.findAll('.dev-requirement-hall__desc').map((cell) => cell.text())
    expect(descs[0]).toBe('暂无补充描述')
    // 已签协议 ⇒ 页顶那条签协议提示不出现
    expect(wrapper.find('.dev-requirement-hall__agreement-notice').exists()).toBe(false)

    wrapper.unmount()
  })

  it('关键词输入 300ms 防抖后回到第 1 页重新筛一遍', async () => {
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
    expect(mocks.listHall).toHaveBeenLastCalledWith('test-token')
    // 筛完只剩 REQ-2 那一行
    expect(wrapper.findAll('.dev-requirement-hall__title').map((cell) => cell.text())).toEqual([
      '爬虫小工具',
    ])
    wrapper.unmount()
  })

  it('已签协议：点「接单」直接进需求详情，带需求号', async () => {
    const { wrapper, router } = await render()

    // 两行都是「接单」：第一行是自管需求（REQ-2），第二行是担保需求（REQ-1）
    expect(actionLabels(wrapper)).toEqual(['接单', '接单'])
    await tableActions(wrapper)[1]!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dev-requirement-detail')
    expect(router.currentRoute.value.params.requirementId).toBe('REQ-1')
    wrapper.unmount()
  })

  it('未签协议时按钮改文案；点「接单」先去签协议并带上回跳地址', async () => {
    // 协议未签：页顶出现签协议提示，「接单」也被拦去签协议
    mocks.accessStatus.mockResolvedValue({
      developer_agreement_signed: false,
      api_usage_agreement_signed: false,
    })

    const { wrapper, router } = await render()

    expect(wrapper.find('.dev-requirement-hall__agreement-notice').exists()).toBe(true)
    // 只剩协议这一道闸门：担保需求（REQ-1）写「需先签署协议」，自管需求（REQ-2）不受影响
    expect(actionLabels(wrapper)).toEqual(['接单', '需先签署协议'])

    await tableActions(wrapper)[1]!.trigger('click')
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
