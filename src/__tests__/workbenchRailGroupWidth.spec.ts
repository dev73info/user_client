import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkbenchPaneWidth } from '@/composables/useWorkbenchPaneWidth'
import { useAuthStore } from '@/stores/auth'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'

vi.mock('@/api/realname', () => ({
  getMyRealnameVerification: vi.fn().mockResolvedValue({ status: 'approved' }),
}))
vi.mock('@/api/conversations', () => ({
  listRequirementConversations: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/devRequirements', () => ({
  listMyRequirements: vi.fn().mockResolvedValue([]),
}))

const routes = [
  { name: 'home', path: '/', component: { template: '<div />' } },
  {
    name: 'workbench-invoices',
    path: '/workbench/invoices',
    component: { template: '<div />' },
    meta: { workbenchShell: true, title: '我的发票' },
  },
]

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
})

describe('工作台分组菜单宽度', () => {
  it('与消息中心共用 --uw-pane-width', async () => {
    const { persistPaneWidth } = useWorkbenchPaneWidth()
    persistPaneWidth(318)

    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push({ name: 'workbench-invoices' })
    const wrapper = mount(UserWorkbenchView, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
          RouterLink: { props: ['to'], template: '<a><slot /></a>' },
        },
      },
    })
    await flushPromises()

    const main = wrapper.get('.user-workbench__main--rail-group')
    expect(main.attributes('style')).toContain('--uw-pane-width: 318px')
    wrapper.unmount()
  })
})
