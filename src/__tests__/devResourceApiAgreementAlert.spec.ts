import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 协议提示的结构用例（R047 移植 106feac）：签署按钮不再与 TAlert 并排，
 * 而是进 `TAlert` 的 `#actions` 插槽——提示框内右侧、竖向居中，窄屏随框换行。
 *
 * 断言打的是**结构**：`.dev-api-agreement-notice` 本身就是 `TAlert` 的根元素
 * （带 `t73-alert` 类），按钮落在 `t73-alert__actions` 里。
 * 旧写法（`<section>` 包一层 + 并排 TButton）下第一、二条断言都会失败。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { params: {} as Record<string, string>, query: {} as Record<string, unknown> },
  create: vi.fn(),
  get: vi.fn(),
  updateHomepage: vi.fn(),
  updateChannel: vi.fn(),
  uploadCover: vi.fn(),
  tagTree: vi.fn(),
  listMyTeams: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, resolve: () => ({ href: '/' }) }),
  useRoute: () => mocks.route,
}))
/** 未签协议：接口资源页才会渲染那段提示。 */
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_flow_03562487',
    apiUsageAgreementSigned: false,
    hydrate: vi.fn(),
  }),
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})
vi.mock('@/api/mcResources', () => ({
  createMcResource: mocks.create,
  getMcResource: mocks.get,
  updateMcResourceHomepage: mocks.updateHomepage,
  updateResourceApiChannel: mocks.updateChannel,
  getResourceApiChannel: vi.fn(),
  uploadMcResourceCover: mocks.uploadCover,
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  invalidateTagTreeCache: vi.fn(),
  getResourceDetailSlug: () => 'slug',
}))
vi.mock('@/api/team', () => ({
  listMyTeams: mocks.listMyTeams,
}))

import DevResourceInitView from '@/views/DevResourceInitView.vue'
import { resourceFixture, tagTreeFixture } from '@/__tests__/devResourceHomepageFixtures'

function mountInit(): VueWrapper {
  mocks.route = { params: {}, query: { type: 'api' } }
  return shallowMount(DevResourceInitView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        // 桩里把默认槽透出来，按钮文案才进得到断言
        TButton: { name: 'TButton', template: '<button><slot name="prefix" /><slot /></button>' },
        // TAlert 按真身渲染：本用例验的就是它内部结构（actions 插槽那一层）
        TAlert: false,
        // 提交条按真身渲染：它的「签署协议」小号入口也一起验
        ResourceInitMetaStrip: false,
        ResourceInitBasicInfoSection: false,
        ResourceApiChannelSection: false,
        ResourceTagCatalogSection: true,
        ResourceInitSubmitBar: false,
        ResourceSecretPlainDialog: true,
      },
    },
  })
}

describe('DevResourceInitView：协议提示走 TAlert 的 #actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route = { params: {}, query: {} }
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
    mocks.create.mockResolvedValue(resourceFixture({ id: 33 }))
  })

  it('未签协议时，提示区根元素是 TAlert，签署按钮落在 actions 插槽里', async () => {
    const wrapper = mountInit()
    await flushPromises()

    const notice = wrapper.find('.dev-api-agreement-notice')
    expect(notice.exists()).toBe(true)
    // TAlert 自己渲染出 t73-alert：说明 class 挂在提示框上，不再是一层 <section> 包壳
    expect(notice.classes()).toContain('t73-alert')
    expect(notice.find('.t73-alert__title').text()).toContain('请先签署《接口使用协议》')

    const actionButton = notice.find('.t73-alert__actions button')
    expect(actionButton.exists()).toBe(true)
    expect(actionButton.text()).toContain('去签署接口使用协议')

    await actionButton.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'contract-sign',
        query: expect.objectContaining({ agreement: 'api' }),
      }),
    )

    wrapper.unmount()
  })

  it('提交条上补了同一个小号「签署协议」入口', async () => {
    const wrapper = mountInit()
    await flushPromises()

    const summary = wrapper.find('.dev-submit-summary')
    const signButton = summary.findAll('button').find((b) => b.text().includes('签署协议'))
    expect(signButton).toBeTruthy()

    await signButton?.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ name: 'contract-sign' }))

    wrapper.unmount()
  })
})
