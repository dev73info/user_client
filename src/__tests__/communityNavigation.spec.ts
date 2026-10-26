import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import PortalMobileDock from '@/components/PortalMobileDock.vue'

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/community', name: 'community', component: { template: '<div />' } },
      { path: '/resources', name: 'resources', component: { template: '<div />' } },
      { path: '/messages', name: 'messages', component: { template: '<div />' } },
      { path: '/workbench', name: 'workbench', component: { template: '<div />' } },
    ],
  })
}

beforeEach(() => setActivePinia(createPinia()))

describe('社区移动导航', () => {
  it('移动 dock 有真实社区入口并可导航', async () => {
    const router = testRouter()
    await router.push('/')
    const wrapper = mount(PortalMobileDock, { global: { plugins: [router] } })
    const community = wrapper.findAll('button').find((item) => item.text().includes('社区'))
    expect(community).toBeDefined()
    await community?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('community')
    expect(community?.classes()).toContain('active')
    wrapper.unmount()
  })
})
