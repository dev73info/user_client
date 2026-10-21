import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import AboutView from '@/views/AboutView.vue'

/**
 * 关于我们页的挂载烟测。
 *
 * R047 把这页从「一个 670 行的 SFC」拆成「129 行的壳 + 6 个区块组件 + 7 个样式文件」，
 * 拆的过程中最容易坏的是三件不报错的事，所以都钉在这里：
 *
 * 1. `data-reveal` 属性必须由各区块组件自己渲染 —— 视图靠 `querySelectorAll('[data-reveal]')`
 *    驱动滚动渐入，属性丢了就是「渐入永远不触发」，编译器不会管；
 * 2. 六个区块都要出现（少一个就是某个组件没接进模板）；
 * 3. 首屏两个 CTA 改成了 emit，路由动作在视图 —— 断了就是「点了没反应」。
 */
const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))
vi.mock('@/utils/seo', () => ({
  setSeoMeta: vi.fn(),
  resetSeoMeta: vi.fn(),
}))

const mountPage = () =>
  mount(AboutView, {
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })

describe('关于我们', () => {
  it('六个区块全部渲染', () => {
    const wrapper = mountPage()
    for (const selector of [
      '.about-hero',
      '.about-highlights',
      '.about-facts',
      '.about-split',
      '.about-section--story',
      '.about-join',
    ]) {
      expect(wrapper.find(selector).exists(), `缺少区块 ${selector}`).toBe(true)
    }
    wrapper.unmount()
  })

  it('渐入锚点由区块组件自己渲染，页面能查到', () => {
    const wrapper = mountPage()
    // 亮点区 1 个标题 + 3 条、数据墙 4 格、双栏 2 列、故事区 2 处
    const revealCount = wrapper.findAll('[data-reveal]').length
    expect(revealCount).toBeGreaterThanOrEqual(10)
    // 数据墙的下标命名也被钉住（父级渐入按 idx 排队）
    expect(wrapper.find('[data-reveal="f0"]').exists()).toBe(true)
    expect(wrapper.find('[data-reveal="h0"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('文案来自 legalContent：数据墙四格内容对得上', () => {
    const wrapper = mountPage()
    const facts = wrapper.findAll('.about-fact')
    expect(facts).toHaveLength(4)
    const firstFact = facts[0]!
    expect(firstFact.find('.about-fact__big').text()).not.toBe('')
    expect(firstFact.find('.about-fact__small').text()).not.toBe('')
    wrapper.unmount()
  })

  it('首屏两个 CTA 各自 emit 到对应路由', async () => {
    push.mockClear()
    const wrapper = mountPage()
    const buttons = wrapper.findAll('.about-hero__btn')
    expect(buttons).toHaveLength(2)
    await buttons[0]!.trigger('click')
    expect(push).toHaveBeenLastCalledWith({ name: 'requirement-hall' })
    await buttons[1]!.trigger('click')
    expect(push).toHaveBeenLastCalledWith({ name: 'home' })
    wrapper.unmount()
  })
})
