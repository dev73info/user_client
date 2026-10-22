import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AuthModal from '@/components/AuthModal.vue'

async function mountAuthModal(overrides: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/terms', component: { template: '<div />' } },
      { path: '/privacy', component: { template: '<div />' } },
      { path: '/payment-refund', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  return mount(AuthModal, {
    props: {
      visible: true,
      authMode: 'login',
      authTitle: '登录账号',
      wechatLoginAvailable: true,
      qqLoginAvailable: true,
      githubLoginAvailable: true,
      giteeLoginAvailable: false,
      ...overrides,
    },
    global: {
      plugins: [router, pinia],
    },
  })
}

/** 勾选"我已阅读并理解上述重要条款提示"（R043 任务-03 的二次确认）。 */
async function checkNoticeAccepted(wrapper: Awaited<ReturnType<typeof mountAuthModal>>) {
  const checkbox = wrapper.find('[data-testid="legal-notice-check"]')
  await checkbox.setValue(true)
}

describe('AuthModal 端内一键登录布局', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('普通浏览器仍是表单在上、其他方式登录在下', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    )
    const wrapper = await mountAuthModal()
    expect(wrapper.find('.auth-inapp-login').exists()).toBe(false)
    expect(wrapper.find('.auth-inapp-panel-switch').exists()).toBe(false)
    expect(wrapper.find('.auth-login-methods').text()).toContain('其他方式登录')
    expect(wrapper.text()).toContain('微信快捷登录')
    expect(wrapper.text()).toContain('QQ快捷登录')
    wrapper.unmount()
  })

  it('微信内默认只展示一键登录，标题旁可切到账号密码', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.40',
    )
    const wrapper = await mountAuthModal()
    expect(wrapper.find('.auth-modal--inapp-oauth').exists()).toBe(true)
    expect(wrapper.find('h3').text()).toBe('欢迎登录')
    expect(wrapper.find('.auth-mode-switch').exists()).toBe(false)
    expect(wrapper.find('.auth-inapp-panel-switch').text()).toBe('账号登录')
    expect(wrapper.find('.auth-inapp-login').text()).toContain('微信一键登录')
    expect(wrapper.text()).not.toContain('用户名或邮箱')
    expect(wrapper.find('.auth-login-methods').exists()).toBe(false)

    await wrapper.find('.auth-inapp-panel-switch').trigger('click')
    expect(wrapper.find('.auth-inapp-login').exists()).toBe(false)
    expect(wrapper.find('.auth-inapp-panel-switch').text()).toBe('一键登录')
    expect(wrapper.text()).toContain('用户名或邮箱')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).toContain('注册')
    expect(wrapper.text()).toContain('同意')
    expect(wrapper.text()).toContain('支付说明')
    expect(wrapper.find('.auth-modal-actions .auth-btn.solid').text()).toBe('登录')

    await wrapper.find('.auth-inapp-panel-switch').trigger('click')
    expect(wrapper.find('.auth-inapp-login').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('用户名或邮箱')
    wrapper.unmount()
  })

  it('QQ 内优先展示 QQ 一键登录', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 MQQBrowser/13.0 QQ/9.0.0',
    )
    const wrapper = await mountAuthModal({ wechatLoginAvailable: false })
    expect(wrapper.find('.auth-inapp-login').text()).toContain('QQ一键登录')
    expect(wrapper.find('.auth-mode-switch').exists()).toBe(false)
    expect(wrapper.find('.auth-inapp-panel-switch').text()).toBe('账号登录')
    expect(wrapper.find('.auth-login-methods').exists()).toBe(false)

    await wrapper.find('.auth-inapp-panel-switch').trigger('click')
    expect(wrapper.find('.auth-inapp-panel-switch').text()).toBe('QQ登录')
    wrapper.unmount()
  })

  it('微信内未勾选协议时一键登录按钮禁用', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MicroMessenger/8.0.40')
    const wrapper = await mountAuthModal({ acceptTerms: false })
    const btn = wrapper.find('.auth-inapp-login__btn')
    expect(btn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('微信内只勾协议、未确认重要条款提示时一键登录按钮仍禁用', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MicroMessenger/8.0.40')
    const wrapper = await mountAuthModal({ acceptTerms: true })
    const btn = wrapper.find('.auth-inapp-login__btn')
    expect(btn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('微信内勾选协议后可触发 loginWithWechat', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MicroMessenger/8.0.40')
    const wrapper = await mountAuthModal({ acceptTerms: true })
    await checkNoticeAccepted(wrapper)
    await wrapper.find('.auth-inapp-login__btn').trigger('click')
    expect(wrapper.emitted('loginWithWechat')).toHaveLength(1)
    wrapper.unmount()
  })
})
