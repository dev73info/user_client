import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
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
  it('移动 dock 不再提供社区入口（社区改走首页快捷入口）', async () => {
    const router = testRouter()
    await router.push('/')
    const wrapper = mount(PortalMobileDock, { global: { plugins: [router] } })
    const labels = wrapper.findAll('button').map((item) => item.text())
    expect(labels.some((text) => text.includes('社区'))).toBe(false)
    expect(labels.some((text) => text.includes('资源'))).toBe(true)
    wrapper.unmount()
  })
})
