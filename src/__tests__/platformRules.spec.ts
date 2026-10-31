import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 规则中心与法务页的接口收敛。
 *
 * 钉住三件事：
 * 1. 规则中心列出的代号与标题来自 `platformRules`，一个不落；
 * 2. `/privacy` 优先渲染后端正文（标题、生效时间都跟着接口走）；
 * 3. 后端取不到时回落到构建期快照，页面不会变空白。
 */
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {} }),
}))

const fetchAgreementContent = vi.fn()
vi.mock('@/api/auth', () => ({
  fetchAgreementContent: (...args: unknown[]) => fetchAgreementContent(...args),
}))

import PlatformRulesView from '@/views/PlatformRulesView.vue'
import PrivacyPolicyView from '@/views/PrivacyPolicyView.vue'
import { platformRuleTitle, platformRules } from '@/shared/platformRules'

const mountWithLinks = (component: Parameters<typeof mount>[0]) =>
  mount(component, {
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })

beforeEach(() => {
  push.mockReset()
  fetchAgreementContent.mockReset()
})

describe('平台规则中心', () => {
  it('列出全部公示文件', () => {
    const wrapper = mountWithLinks(PlatformRulesView)
    const text = wrapper.text()
    for (const rule of platformRules) {
      expect(text).toContain(rule.title)
    }
    expect(wrapper.findAll('.platform-rule-list a')).toHaveLength(platformRules.length)
    wrapper.unmount()
  })

  it('代号与标题一一对应，未知代号没有标题', () => {
    expect(platformRuleTitle('privacy_policy')).toBe('隐私政策')
    expect(platformRuleTitle('dispute_rule')).toBe('争议处理规则')
    expect(platformRuleTitle('not_a_rule')).toBe('')
  })
})

describe('隐私政策页', () => {
  it('优先渲染后端正文与公示时间', async () => {
    fetchAgreementContent.mockResolvedValue({
      code: 'privacy_policy',
      title: '隐私政策',
      content: '一、远程正文标题\n远程正文。',
      version: 2,
      effective_at: '2026-11-01 09:00:00',
      updated_at: '2026-11-01 09:00:00',
    })

    const wrapper = mountWithLinks(PrivacyPolicyView)
    await flushPromises()

    expect(fetchAgreementContent).toHaveBeenCalledWith('privacy_policy')
    expect(wrapper.text()).toContain('远程正文标题')
    expect(wrapper.text()).toContain('生效日期：2026年11月1日')
    wrapper.unmount()
  })

  it('接口不可用时回落构建期快照', async () => {
    fetchAgreementContent.mockRejectedValue(new Error('offline'))

    const wrapper = mountWithLinks(PrivacyPolicyView)
    await flushPromises()

    expect(wrapper.text()).toContain('本政策的适用范围与主体')
    wrapper.unmount()
  })
})
