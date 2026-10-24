import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 开发者公开主页（`/user/:username/profile`）的挂载烟测。R047 把这页从「1,612 行的单文件」
 * 拆成「壳 + 6 个组件 + 6 个 composable」；拆分不报错、断了却最难发现的两件事钉在这里：
 * 一是回填（三个接口的数据要落到头部、读数、打赏与资源卡，背景的裁剪焦点得还原成 `transform`）；
 * 二是保存载荷（简介 `PUT /settings/profile`、背景「先上传拿地址、再带焦点落库」，
 * 参数错了页面不报错但写进后端的数据是错的）。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  route: {
    params: { username: 'dev_alice' } as Record<string, string>,
    fullPath: '/user/dev_alice/profile',
  },
  listResources: vi.fn(),
  userBadges: vi.fn(),
  publicProfile: vi.fn(),
  points: vi.fn(),
  updateProfile: vi.fn(),
  uploadStatic: vi.fn(),
  updateStatic: vi.fn(),
  uploadDynamic: vi.fn(),
  updateDynamic: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => mocks.route,
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ username: 'dev_alice', token: 'test-token', isAuthed: true }),
}))
// `apiUrl` 换成恒等函数：断言里直接比对档案里的原始路径，不用关心 base 前缀
vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  apiUrl: (path: string) => path,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: string) =>
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
vi.mock('@/api/resources', () => ({ listAllPublicMcResources: mocks.listResources }))
vi.mock('@/api/invite', () => ({ getUserBadges: mocks.userBadges }))
vi.mock('@/api/publicProfile', () => ({ getPublicUserProfile: mocks.publicProfile }))
vi.mock('@/api/points', () => ({ getMyPoints: mocks.points }))
vi.mock('@/api/settings', () => ({
  updateProfile: mocks.updateProfile,
  uploadProfileBackground: mocks.uploadStatic,
  updateProfileBackgroundStatic: mocks.updateStatic,
  uploadProfileBackgroundDynamic: mocks.uploadDynamic,
  updateProfileBackgroundDynamic: mocks.updateDynamic,
}))

import type { PublicMcResourceItem } from '@/api/resources'
import DevProfileView from '@/views/DevProfileView.vue'

const profile = {
  username: 'dev_alice',
  profile_description: '做模组的小团队',
  avatar_url: '/uploads/avatar.png',
  home_background_static: '/uploads/bg.png',
  home_background_dynamic: null,
  home_background_static_focus: '{"scale":1.5,"x":-10,"y":5}',
  home_background_dynamic_focus: null,
  username_gradient: true,
  username_color: '',
  tip: {
    enabled: true,
    public_records: true,
    received_cash_fen: 1234,
    received_points: 56,
    recent_messages: [
      { tipper_display: '小明', message: '加油', anonymous: false, created_at: '2026-10-01 10:00' },
    ],
  },
}

const resource = (overrides: Partial<PublicMcResourceItem>): PublicMcResourceItem => ({
  id: 1,
  creator: 'dev_alice',
  requirement_id: null,
  platform: 'java',
  title: '资源',
  author: 'dev_alice',
  description: '简介',
  tag_selections: [],
  file_name: 'a.jar',
  source_url: '',
  cover_url: null,
  docs_url: null,
  visibility: 'published',
  release_note: null,
  created_at: '2026-09-01 10:00',
  updated_at: '2026-09-01 10:00',
  like_count: 0,
  download_count: 0,
  view_count: 0,
  liked_by_me: false,
  ownership_type: 'personal',
  team_id: null,
  team_name: null,
  origin_type: 'original',
  origin_author: null,
  origin_url: null,
  origin_org: null,
  origin_note: null,
  price_fen: 0,
  price_points: 0,
  copyright_declared: true,
  purchased_by_me: false,
  ...overrides,
})

const resources = [
  resource({
    id: 11,
    title: '匠魂增强',
    platform: 'java',
    like_count: 5,
    cover_url: '/uploads/r11.png',
  }),
  resource({ id: 12, title: '基岩版材质包', platform: 'bedrock', like_count: 7 }),
  resource({ id: 13, creator: 'dev_bob', title: '别人的作品', like_count: 99 }),
]

const equippedBadge = {
  code: 'first_resource',
  name: '初次发布',
  description: '发布第一个资源',
  icon: '🌱',
  tier: 1,
  category: '成就徽章',
  awarded_at: '2026-09-02 10:00',
  equipped: true,
}

const staticPerk = {
  perk_code: 'home_background_static',
  owned: true,
  equipped: false,
  expires_at: null,
}

let wrapper: VueWrapper | null = null

async function mountPage(): Promise<VueWrapper> {
  mocks.listResources.mockResolvedValue(resources)
  mocks.userBadges.mockResolvedValue({ badges: [equippedBadge] })
  mocks.publicProfile.mockResolvedValue(profile)
  mocks.points.mockResolvedValue({ points_balance: 0, perks: [staticPerk] })
  mocks.uploadStatic.mockResolvedValue({ home_background_static: '/uploads/new-bg.png' })
  mocks.updateStatic.mockResolvedValue({})
  mocks.updateProfile.mockResolvedValue({})

  const mounted = mount(DevProfileView)
  await flushPromises()
  await flushPromises()
  return mounted
}

/** 在指定根节点里按可见文案找按钮 */
function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock-bg', configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('开发者公开主页', () => {
  it('公开档案、徽章与资源回填到头部 / 读数 / 打赏 / 资源卡', async () => {
    wrapper = await mountPage()

    // 头部：用户名、简介、头像、背景与裁剪焦点
    expect(wrapper.find('.dev-profile__name').text()).toBe('dev_alice')
    expect(wrapper.find('.dev-profile__description').text()).toBe('做模组的小团队')
    expect(wrapper.find('.dev-profile__avatar').attributes('src')).toBe('/uploads/avatar.png')
    const background = wrapper.find('.dev-profile__head > img.dev-profile__head-media')
    expect(background.attributes('src')).toBe('/uploads/bg.png')
    expect(background.attributes('style')).toContain('transform: translate(-10%, 5%) scale(1.5)')

    // 读数：只算本人的两个资源；徽章数来自 getUserBadges
    const stats = wrapper.findAll('.dev-profile__stat strong').map((item) => item.text())
    expect(stats).toEqual(['2', '1', '12', '2'])

    // 佩戴徽章走 BadgeDisplay
    expect(wrapper.findAll('.badge-display__item')).toHaveLength(1)

    // 收到打赏：累计与最近留言
    expect(wrapper.find('.dev-profile__tips').exists()).toBe(true)
    expect(wrapper.findAll('.dev-profile__tips-stat strong').map((item) => item.text())).toEqual([
      '¥12.34',
      '56 积分',
    ])
    expect(wrapper.find('.dev-profile__tips-name').text()).toBe('小明')
    expect(wrapper.find('.dev-profile__tips-message').text()).toBe('加油')

    // 资源卡：只列本人资源，别的作者被过滤掉
    const titles = wrapper.findAll('.dev-profile__resource-title').map((item) => item.text())
    expect(titles).toEqual(['匠魂增强', '基岩版材质包'])
    expect(wrapper.findAll('.dev-profile__resource-meta')[1]!.text()).toContain('7 赞')
  })

  it('编辑简介：草稿回填当前简介，保存时按 (token, 用户名, 新简介) 提交', async () => {
    wrapper = await mountPage()

    const editButton = buttonByText(wrapper.element, '编辑简介')
    expect(editButton).toBeDefined()
    editButton!.click()
    await flushPromises()

    const textarea = wrapper.find('#profile-description-input')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('做模组的小团队')

    await textarea.setValue('做模组、也做整合包')
    wrapper.find('.dev-profile-modal__button--primary').trigger('click')
    await flushPromises()

    expect(mocks.updateProfile.mock.calls[0]).toEqual([
      'test-token',
      'dev_alice',
      '做模组、也做整合包',
    ])
    expect(mocks.toast).toHaveBeenCalledWith('个人简介已更新', 'success')
    // 保存成功后整页重载（公开档案再取一次）
    expect(mocks.listResources).toHaveBeenCalledTimes(2)
  })

  it('设置静态背景：先上传取地址，再带裁剪焦点落库', async () => {
    wrapper = await mountPage()

    const setButton = buttonByText(wrapper.element, '设置静态背景')
    expect(setButton).toBeDefined()
    setButton!.click()
    await flushPromises()

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const file = new File(['png'], 'bg.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    // 选了新文件 → 焦点复位；滚轮放大一格（+0.12）
    const crop = document.body.querySelector('.dev-profile__crop')
    expect(crop).not.toBeNull()
    crop!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }))
    await flushPromises()

    const saveButton = buttonByText(
      document.body.querySelector('.dev-profile__background-dialog-actions')!,
      '保存',
    )
    expect(saveButton).toBeDefined()
    saveButton!.click()
    await flushPromises()

    // 上传：令牌 + 选中的文件本身
    expect(mocks.uploadStatic.mock.calls[0]).toEqual(['test-token', file])
    // 落库：令牌 + 上传返回的地址 + 焦点 JSON（逐字段）
    expect(mocks.updateStatic.mock.calls[0]![0]).toBe('test-token')
    expect(mocks.updateStatic.mock.calls[0]![1]).toBe('/uploads/new-bg.png')
    const focusJson = mocks.updateStatic.mock.calls[0]![2] as string
    expect(focusJson).toBe('{"scale":1.12,"x":0,"y":0}')
    expect(Object.keys(JSON.parse(focusJson) as Record<string, number>)).toEqual([
      'scale',
      'x',
      'y',
    ])
    expect(mocks.toast).toHaveBeenCalledWith('主页背景已更新', 'success')
  })
})
