import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'

const routeState = vi.hoisted(() => ({
  current: {
    matched: [] as Array<{ meta: Record<string, unknown> }>,
    name: 'home',
  },
}))

vi.mock('@/components/SupportChatWidget.vue', () => ({
  default: { template: '<div data-test="support-chat" />' },
}))
vi.mock('@/components/app/useAppShellAuth', () => ({ useAppShellAuth: () => {} }))
vi.mock('ui_73info', () => ({
  TScrollbar: { template: '<div><slot /></div>' },
}))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => routeState.current,
}))

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        RouterView: true,
        PortalTopNav: true,
        PortalMobileDock: { template: '<nav data-test="dock" />' },
        MockIdentitySwitcher: true,
        AppDownloadCard: true,
        AppSiteFooter: true,
      },
    },
  })
}

describe('门户外壳在线客服入口', () => {
  it('全局挂载在线客服浮窗', () => {
    const wrapper = mountApp()

    expect(wrapper.find('[data-test="support-chat"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('工作台移动端保留底部快捷导航', () => {
    routeState.current = {
      matched: [{ meta: { workbenchShell: true } }],
      name: 'workbench',
    }
    const wrapper = mountApp()

    expect(wrapper.find('.app-shell--immersive').exists()).toBe(true)
    expect(wrapper.find('[data-test="dock"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
