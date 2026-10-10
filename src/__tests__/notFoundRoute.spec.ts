import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import router from '@/router'
import NotFoundView from '@/views/NotFoundView.vue'

/**
 * BUG-009：不匹配任何路由的地址原先只渲染出页头页脚、中间空白。
 * 这里盯住两件事——兜底路由确实接住了，且具体路由没有被兜底抢走。
 */
describe('router 兜底路由（BUG-009）', () => {
  it('四段及以上的未知地址落到 not-found', () => {
    // 缺陷卡里的复现地址：四段，既不是目录（一至二段）也不是详情（三段）
    const resolved = router.resolve('/mineral/group/2/dev_flow_03562487-55')
    expect(resolved.name).toBe('not-found')
  })

  it('完全不存在的深层地址也落到 not-found', () => {
    expect(router.resolve('/a/b/c/d/e/f').name).toBe('not-found')
  })

  it('具体路由没有被兜底路由抢走', () => {
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/free-resources').name).toBe('free-resources')
    expect(router.resolve('/resources/dev-flow-03562487--55').name).toBe('resource-detail-direct')
    expect(router.resolve('/minecraft').name).toBe('resource-catalog')
  })

  it('一至三段的未知路径仍由目录 / 详情路由接走，兜底路由只接四段及以上', () => {
    // 修复的边界就在这里：`/:rootSlug/:entrySlug?` 是按段数贪婪匹配的，一至三段先被它接走，
    // 落不到兜底路由（未知根 slug 由 ResourceCatalogView 兜到第一个根并改写 URL）。
    // 因此本次只解决「四段及以上、任何路由都匹配不上」那一类空白页。
    expect(router.resolve('/no-such-root').name).toBe('resource-catalog')
    expect(router.resolve('/no-such-root/no-such-entry').name).toBe('resource-catalog')
    expect(router.resolve('/no/such/resource').name).toBe('resource-detail')
    expect(router.resolve('/no/such/resource/extra').name).toBe('not-found')
  })
})

describe('NotFoundView', () => {
  async function mountNotFound(path: string) {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/requirement-hall', name: 'requirement-hall', component: { template: '<div />' } },
        { path: '/tickets', name: 'tickets', component: { template: '<div />' } },
        { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
      ],
    })
    await testRouter.push(path)
    await testRouter.isReady()
    const wrapper = mount(NotFoundView, { global: { plugins: [testRouter] } })
    return { wrapper, testRouter }
  }

  it('渲染出「页面不存在」与所访问的地址，并给出回首页的入口', async () => {
    const path = '/mineral/group/2/dev_flow_03562487-55'
    const { wrapper, testRouter } = await mountNotFound(path)

    expect(wrapper.text()).toContain('页面不存在')
    expect(wrapper.text()).toContain(path)
    expect(wrapper.find('main').exists()).toBe(true)

    const homeButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('回到首页'))
    expect(homeButton).toBeTruthy()

    await homeButton!.trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.name).toBe('home')

    wrapper.unmount()
  })

  it('404 页写 noindex，避免被搜索引擎收录', async () => {
    const { wrapper } = await mountNotFound('/no/such/page/at/all')

    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    expect(robots?.content).toBe('noindex, follow')

    wrapper.unmount()
  })
})
