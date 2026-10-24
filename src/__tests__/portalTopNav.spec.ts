import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PortalTopNav from '@/components/PortalTopNav.vue'
import { useAuthStore } from '@/stores/auth'

// 顶栏此前零覆盖。拆分（1786 行 → 骨架 + 三个子组件 + 四个 composable）前先织一张最小网，
// 只钉四条出口：导航链接渲染、用户胶囊菜单开合、搜索提交后的路由、
// 以及两条跨文件契约里可测的那条 —— `--portal-header-footprint` 有没有被写到 documentElement 上。
// 色值与断点档不在这里测（脚本层面另有核对），这里只看行为。
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfileSubscriptions: vi.fn(),
}))

vi.mock('@/api/settings', () => ({
  getProfile: mocks.getProfile,
  updateProfileSubscriptions: mocks.updateProfileSubscriptions,
}))

/** jsdom 没有 ResizeObserver：给个能手动触发回调的替身，用来验顶栏高度的回写 */
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []

  callback: () => void

  constructor(callback: () => void) {
    this.callback = callback
    ResizeObserverStub.instances.push(this)
  }

  observed: unknown[] = []

  observe(target?: unknown) {
    this.observed.push(target)
  }

  unobserve() {}

  disconnect() {}

  trigger() {
    this.callback()
  }
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'home', path: '/', component: { template: '<div />' } },
      { name: 'search', path: '/search', component: { template: '<div />' } },
      { name: 'resources', path: '/resources', component: { template: '<div />' } },
      { name: 'resource-catalog', path: '/resource-catalog', component: { template: '<div />' } },
      { name: 'requirement-hall', path: '/requirements', component: { template: '<div />' } },
      { name: 'workbench', path: '/workbench', component: { template: '<div />' } },
    ],
  })
}

async function render(options: { authed?: boolean } = {}) {
  const router = createTestRouter()
  await router.push({ name: 'home' })
  const auth = useAuthStore()
  if (options.authed) {
    auth.token = 'test-token'
    auth.username = 'alice'
  }
  const wrapper = mount(PortalTopNav, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, auth }
}

function navLabels(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  return wrapper.findAll('.portal-nav__link').map((link) => link.text())
}

beforeEach(() => {
  setActivePinia(createPinia())
  ResizeObserverStub.instances = []
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  document.documentElement.style.removeProperty('--portal-header-footprint')
  mocks.getProfile.mockResolvedValue({
    avatar_url: null,
    subscribe_official_activity: false,
    subscribe_dev_hall_deposit_paid: false,
  })
  mocks.updateProfileSubscriptions.mockResolvedValue({
    subscribe_official_activity: false,
    subscribe_dev_hall_deposit_paid: false,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('门户顶栏最小挂载烟测', () => {
  it('按登录态铺出导航链接，当前路由那条是 active', async () => {
    const { wrapper } = await render()

    expect(navLabels(wrapper)).toEqual(['首页', '资源项目', '需求大厅'])
    expect(wrapper.find('.portal-nav__link.active').text()).toBe('首页')
    // 未登录：只给登录 / 注册两个按钮
    expect(wrapper.find('.portal-text-btn').text()).toBe('登录')
    expect(wrapper.find('.portal-solid-btn').text()).toBe('注册')

    wrapper.unmount()
  })

  it('登录后追加「工作台」入口，并拉一次个人资料', async () => {
    const { wrapper } = await render({ authed: true })

    expect(navLabels(wrapper)).toEqual(['首页', '资源项目', '需求大厅', '工作台'])
    // 头像与两个订阅开关都来自这一次 GET /settings/profile
    expect(mocks.getProfile).toHaveBeenCalledWith('test-token')

    wrapper.unmount()
  })

  it('点用户胶囊展开菜单，再点一次收起；点外面也收起', async () => {
    const { wrapper } = await render({ authed: true })
    const menu = () => wrapper.find('.portal-user__menu')
    // 菜单开合用的是 v-show，直接看行内 display —— jsdom 的 getComputedStyle 会返回旧快照，
    // wrapper.isVisible() 在这里不可靠
    const menuShown = () => (menu().element as HTMLElement).style.display !== 'none'
    // Transition 的进出场要在下一帧才落到 DOM 上，每次点击后都等一轮
    const clickTrigger = async () => {
      await wrapper.find('.portal-user__trigger').trigger('click')
      await flushPromises()
    }

    expect(menuShown()).toBe(false)

    await clickTrigger()
    expect(menuShown()).toBe(true)
    expect(wrapper.find('.portal-user__trigger').attributes('aria-expanded')).toBe('true')

    await clickTrigger()
    expect(menuShown()).toBe(false)

    await clickTrigger()
    expect(menuShown()).toBe(true)
    document.body.click()
    await flushPromises()
    expect(menuShown()).toBe(false)

    wrapper.unmount()
  })

  it('搜索提交走 search 路由；选过范围就把 scope 一起带上', async () => {
    const { wrapper, router } = await render()

    await wrapper.find('.portal-search input').setValue('爬虫')
    await wrapper.find('form.portal-search').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('search')
    expect(router.currentRoute.value.query).toEqual({ keyword: '爬虫' })

    // 范围下拉能打开且不会「一开就被点外部关闭」收掉 —— `@click.stop` 保住的正是这个
    await wrapper.find('.portal-search-scope__trigger').trigger('click')
    expect(wrapper.find('.portal-search-scope__menu').exists()).toBe(true)
    await wrapper.findAll('.portal-search-scope__option')[1]?.trigger('click')
    expect(wrapper.find('.portal-search-scope__menu').exists()).toBe(false)

    await wrapper.find('.portal-search input').setValue('表格组件')
    await wrapper.find('form.portal-search').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ keyword: '表格组件', scope: 'resources' })

    wrapper.unmount()
  })

  it('跨文件契约：挂载后把 --portal-header-footprint 写到 documentElement 上', async () => {
    const { wrapper } = await render()

    // 根元素仍然叫 .portal-header（useCodeBlockCopy 靠它读几何位置）
    expect(wrapper.find('header.portal-header').exists()).toBe(true)
    // jsdom 里 offsetHeight 恒为 0，写进去的是 0px —— 重点是「写了」
    expect(document.documentElement.style.getPropertyValue('--portal-header-footprint')).toBe('0px')

    wrapper.unmount()
  })

  it('跨文件契约：顶栏尺寸变化时按 高度+上下外边距 重算占位高度', async () => {
    const { wrapper } = await render()
    const header = wrapper.find('header.portal-header').element as HTMLElement
    Object.defineProperty(header, 'offsetHeight', { value: 66, configurable: true })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      marginTop: '10px',
      marginBottom: '14px',
    } as CSSStyleDeclaration)

    ResizeObserverStub.instances[0]?.trigger()

    expect(document.documentElement.style.getPropertyValue('--portal-header-footprint')).toBe(
      '90px',
    )

    wrapper.unmount()
  })

  it('顶栏被 display:none 隐藏后再显示，占位高度能补量回来（回归：曾停在 0px）', async () => {
    const { wrapper } = await render()
    const header = wrapper.find('header.portal-header').element as HTMLElement

    // 非首页 ≤900px：顶栏 display:none，没有 box
    Object.defineProperty(header, 'offsetHeight', { value: 0, configurable: true })
    const observer = ResizeObserverStub.instances[0]!
    observer.callback()
    expect(document.documentElement.style.getPropertyValue('--portal-header-footprint')).toBe('0px')

    // 关键：仅观察顶栏自己时，它重新出现不保证补发回调；
    // 修法是同时观察 documentElement，所以这条断言盯的是「观察名单里有根元素」。
    expect(observer.observed).toContain(document.documentElement)

    // 视口拉宽回 >900px → 顶栏重新有 box → 根元素的回调把占位补回来
    Object.defineProperty(header, 'offsetHeight', { value: 66, configurable: true })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      marginTop: '10px',
      marginBottom: '14px',
    } as CSSStyleDeclaration)
    observer.callback()

    expect(document.documentElement.style.getPropertyValue('--portal-header-footprint')).toBe(
      '90px',
    )

    wrapper.unmount()
  })
})
