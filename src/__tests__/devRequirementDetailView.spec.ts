import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDetailRouter,
  draftResource,
  requirementItem,
} from '@/__tests__/fixtures/devRequirementDetail'
import { useAuthStore } from '@/stores/auth'
import DevRequirementDetailView from '@/views/DevRequirementDetailView.vue'

/**
 * 开发者「需求详情 / 接取需求」页：渲染与资格闸门（拆分前这页零覆盖）。
 *
 * 只钉三件事：
 * 1. 需求字段真的渲染出来了（编号 / 状态 / 结算方式 / 预算 / 开发周期 / 富文本描述与验收标准），
 *    取的接口实参是路由里的需求号 + token；
 * 2. R014 归档锁定横幅随需求单出现；
 * 3. 没签《开发者入驻协议》时给提示条与「去签署协议」，接单按钮置灰。
 *
 * 两条接单路径的接口实参在 `devRequirementBindingFlow.spec.ts`；展示口径（状态文案、预算、
 * 闸门文案）在 `shared/devRequirementDetail` / `shared/devRequirementBinding` 的纯函数里，
 * 这里不重复钉文案。
 */
const mocks = vi.hoisted(() => ({
  hallItem: vi.fn(),
  bindProject: vi.fn(),
  listResources: vi.fn(),
  createResource: vi.fn(),
  accessStatus: vi.fn(),
  tagTree: vi.fn(),
}))

vi.mock('@/api/devRequirements', async (orig) => ({
  ...(await orig<typeof import('@/api/devRequirements')>()),
  getRequirementHallItem: mocks.hallItem,
  bindRequirementProject: mocks.bindProject,
}))
vi.mock('@/api/mcResources', async (orig) => ({
  ...(await orig<typeof import('@/api/mcResources')>()),
  listMcResources: mocks.listResources,
  createMcResource: mocks.createResource,
}))
vi.mock('@/api/auth', async (orig) => ({
  ...(await orig<typeof import('@/api/auth')>()),
  getDevAccessStatus: mocks.accessStatus,
}))
vi.mock('@/api/resourceTags', async (orig) => ({
  ...(await orig<typeof import('@/api/resourceTags')>()),
  getProcessedTagTree: mocks.tagTree,
}))
vi.mock('ui_73info', async (orig) => {
  const actual = await orig<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  // 不用真 token：hydrate 会从 localStorage 读回空串，把这里设的身份冲掉
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  auth.token = 'test-token'
  auth.username = 'bob'

  mocks.hallItem.mockResolvedValue(requirementItem())
  mocks.bindProject.mockResolvedValue(requirementItem({ status: 'in_development' }))
  mocks.listResources.mockResolvedValue([draftResource()])
  mocks.createResource.mockResolvedValue(draftResource({ id: 99, title: '清洗能力包' }))
  mocks.accessStatus.mockResolvedValue({
    is_dev: true,
    is_super_admin: false,
    realname_approved: true,
    is_adult: true,
    developer_agreement_signed: true,
    api_usage_agreement_signed: false,
  })
})

async function render() {
  const router = createDetailRouter()
  await router.push({ name: 'dev-requirement-detail', params: { requirementId: 'REQ-1' } })
  const wrapper = mount(DevRequirementDetailView, {
    global: {
      plugins: [router],
      stubs: {
        // 本用例不验下拉面板：TSelect 只要能把 modelValue 传出去就够了
        TSelect: {
          name: 'TSelect',
          props: ['modelValue', 'multiple'],
          emits: ['update:modelValue', 'change'],
          template: '<div class="stub-select" />',
        },
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

/** 文案里带某段字的按钮。 */
function buttonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

describe('开发者需求详情页：渲染与资格闸门', () => {
  it('按路由里的需求号取需求单，并渲染编号 / 状态 / 预算 / 开发周期 / 富文本', async () => {
    const { wrapper } = await render()

    expect(mocks.hallItem).toHaveBeenCalledWith('test-token', 'REQ-1')
    // 接取侧的两次取数也都在进页时打过一遍（资源清单 / 接单准入）
    expect(mocks.listResources).toHaveBeenCalledWith('test-token')
    expect(mocks.accessStatus).toHaveBeenCalledWith('test-token')

    const values = wrapper.findAll('.dev-meta-strip__value').map((cell) => cell.text())
    expect(values).toEqual(['REQ-1', '待接单/签约', '电签担保'])

    const left = wrapper.find('.dev-requirement-detail__requirement-card')
    expect(left.text()).toContain('数据清洗插件定制')
    expect(left.text()).toContain('¥500')
    expect(left.text()).toContain('alice')
    // R014：担保需求填了开发周期才渲染这一格
    expect(left.find('[data-testid="dev-requirement-development-cycle"]').text()).toContain('14 天')

    // 描述与验收标准是清洗后的富文本
    const rich = left.findAll('.dev-requirement-detail__rich')
    expect(rich).toHaveLength(2)
    expect(rich[0]!.html()).toContain('需要把日志清洗成结构化表格')
    expect(rich[1]!.html()).toContain('支持 CSV 导出')

    wrapper.unmount()
  })

  it('归档锁定态渲染 R014 横幅，正常态不渲染', async () => {
    mocks.hallItem.mockResolvedValue(
      requirementItem({
        archive_locked_at: '2026-10-01 00:00:00',
        archive_lock_expires_at: '2026-10-31 00:00:00',
      }),
    )
    const { wrapper } = await render()

    const banner = wrapper.find('[data-testid="dev-requirement-archive-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.classes()).toContain('dev-archive-banner--locked')
    expect(banner.text()).toContain('已进入超期锁定')

    // 横幅的配色样式留在视图的 scoped 块里：父级 scoped 属性必须落在子组件根元素上，
    // 否则 `.dev-archive-banner` 这几条规则会静默失效（视觉退化但用例照过）
    const scopeAttrs = (element: { attributes: () => Record<string, string> }) =>
      Object.keys(element.attributes()).filter((name) => name.startsWith('data-v-'))
    const rootScopes = scopeAttrs(wrapper.find('.dev-requirement-detail'))
    expect(rootScopes.length).toBeGreaterThan(0)
    expect(scopeAttrs(banner).some((name) => rootScopes.includes(name))).toBe(true)

    wrapper.unmount()
  })

  it('没签入驻协议：提示条给「去签署协议」，接单按钮置灰', async () => {
    mocks.accessStatus.mockResolvedValue({
      is_dev: true,
      is_super_admin: false,
      realname_approved: true,
      is_adult: true,
      developer_agreement_signed: false,
      api_usage_agreement_signed: false,
    })
    const { wrapper, router } = await render()

    expect(wrapper.find('.dev-notice').text()).toContain('请先签署《开发者入驻协议》')
    // 电签担保需求没签协议：先别让人点确认关联
    expect(buttonByText(wrapper, '确认关联')!.attributes('disabled')).toBeDefined()

    await buttonByText(wrapper, '去签署协议')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('contract-sign')
    expect(router.currentRoute.value.query.agreement).toBe('developer')

    wrapper.unmount()
  })
})
