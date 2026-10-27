import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'

vi.mock('@/components/SupportChatWidget.vue', () => ({
  default: { template: '<div data-test="support-chat" />' },
}))
vi.mock('@/components/app/useAppShellAuth', () => ({ useAppShellAuth: () => {} }))
vi.mock('ui_73info', () => ({
  TScrollbar: { template: '<div><slot /></div>' },
}))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ matched: [], name: 'home' }),
}))

describe('门户外壳在线客服入口', () => {
  it('全局挂载在线客服浮窗', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          PortalTopNav: true,
          PortalMobileDock: true,
          MockIdentitySwitcher: true,
          AppDownloadCard: true,
          AppSiteFooter: true,
        },
      },
    })

    expect(wrapper.find('[data-test="support-chat"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
