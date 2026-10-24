import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDetailRouter,
  creditSelf,
  depositStatus,
  draftResource,
  requirementItem,
  TAG_TREE,
} from '@/__tests__/fixtures/devRequirementDetail'
import { useAuthStore } from '@/stores/auth'
import DevRequirementDetailView from '@/views/DevRequirementDetailView.vue'

/**
 * 开发者「需求详情」页：两条接单路径的**接口实参**。
 *
 * 1. 关联已有私有资源：只发绑定请求（需求号 + 资源 id），不发建资源请求，成功后跳「我的接单」；
 * 2. 初始化新资源：先建一个草稿资源（标签 / 占位文件名 / 占位来源地址 / `visibility: draft`），
 *    再拿**新建出来的 id** 去绑定。
 *
 * 渲染与资格闸门的用例在 `devRequirementDetailView.spec.ts`。
 */
const mocks = vi.hoisted(() => ({
  hallItem: vi.fn(),
  bindProject: vi.fn(),
  listResources: vi.fn(),
  createResource: vi.fn(),
  depositStatus: vi.fn(),
  creditSelf: vi.fn(),
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
  mocks.depositStatus.mockResolvedValue(depositStatus())
  mocks.creditSelf.mockResolvedValue(creditSelf())
  mocks.accessStatus.mockResolvedValue({
    is_dev: true,
    is_super_admin: false,
    realname_approved: true,
    is_adult: true,
    developer_agreement_signed: true,
    api_usage_agreement_signed: false,
  })
  mocks.tagTree.mockResolvedValue(TAG_TREE)
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

/** 勾上某段文案对应的复选框（TCheckbox 底下是原生 input）。 */
async function checkByText(wrapper: VueWrapper, text: string) {
  const label = wrapper.findAll('label').find((item) => item.text().includes(text))
  expect(label, `没找到「${text}」这一项的勾选框`).toBeTruthy()
  await label!.find('input[type="checkbox"]').setValue(true)
}

/** 勾完两次确认（第一次是「已详细阅读需求」，第二次是「确认本次关联无误」）。 */
async function confirmTwice(wrapper: VueWrapper) {
  await checkByText(wrapper, '我已详细阅读需求标题')
  await flushPromises()
  await checkByText(wrapper, '我确认本次关联无误')
  await flushPromises()
}

describe('开发者需求详情页：接单路径', () => {
  it('关联已有私有资源：两次确认后只发绑定请求，实参是需求号 + 资源 id', async () => {
    const { wrapper, router } = await render()

    // 只有一个可绑定资源 → 默认走「关联已有资源项目」，提示条不该出现
    expect(wrapper.find('.dev-notice').exists()).toBe(false)

    const select = wrapper.findComponent({ name: 'TSelect' })
    select.vm.$emit('update:modelValue', 5)
    await flushPromises()

    // 选中资源后才出现二次确认
    expect(wrapper.text()).toContain('二次确认')
    await confirmTwice(wrapper)

    const submit = buttonByText(wrapper, '确认关联')!
    expect(submit.attributes('disabled')).toBeUndefined()
    await submit.trigger('click')
    await flushPromises()

    expect(mocks.createResource).not.toHaveBeenCalled()
    expect(mocks.bindProject).toHaveBeenCalledTimes(1)
    expect(mocks.bindProject).toHaveBeenCalledWith('test-token', 'REQ-1', 5)
    // 绑定成功直接跳「我的接单」（这一页之后没有可做的事）
    expect(router.currentRoute.value.name).toBe('dev-my-requirements')

    wrapper.unmount()
  })

  it('初始化新资源：先建草稿资源（标签 / 占位文件名 / 占位来源地址）再拿新 id 绑定', async () => {
    mocks.listResources.mockResolvedValue([])
    const { wrapper } = await render()

    // 没有可绑定的私有资源 → 直接进「初始化新资源项目」，并取一次标签树
    expect(mocks.tagTree).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.dev-chip').text()).toBe('新资源')

    await wrapper.find('input[placeholder="例如 Better Combat Reloaded"]').setValue('Clean Kit')
    await wrapper.find('input[placeholder="默认使用当前开发者账号"]').setValue('bob')
    await flushPromises()

    // 标签组里勾一个标签（多选的那个 TSelect 只回传这一组的 id 列表）
    const tagSelect = wrapper
      .findAllComponents({ name: 'TSelect' })
      // stub 收的是布尔属性，透传成空串，判「有没有这个属性」而不是真值
      .find((item) => item.props('multiple') !== undefined)!
    tagSelect.vm.$emit('update:modelValue', [11])
    await flushPromises()

    await confirmTwice(wrapper)

    const submit = buttonByText(wrapper, '初始化并关联')!
    expect(submit.attributes('disabled')).toBeUndefined()
    await submit.trigger('click')
    await flushPromises()

    expect(mocks.createResource).toHaveBeenCalledTimes(1)
    expect(mocks.createResource).toHaveBeenCalledWith('test-token', {
      platform: 'minecraft',
      title: 'Clean Kit',
      author: 'bob',
      description: '插件 · minecraft 资源项目，已选 1 个标签。',
      tag_selections: [{ group_id: 1, tag_ids: [11] }],
      file_name: 'clean-kit.package',
      source_url: 'pending://resource/minecraft/mc-plugins/clean-kit',
      cover_url: null,
      docs_url: null,
      visibility: 'draft',
      release_note: null,
      origin_type: 'original',
      origin_author: null,
      origin_url: null,
      origin_org: null,
      origin_note: null,
    })
    // 绑的是刚建出来的那个资源（id 99），不是表单里的空值
    expect(mocks.bindProject).toHaveBeenCalledWith('test-token', 'REQ-1', 99)

    wrapper.unmount()
  })
})
