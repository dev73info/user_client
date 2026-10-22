import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AuthModal from '@/components/AuthModal.vue'
import {
  findLegalSectionTitle,
  legalDocumentToBlocks,
  legalSectionAnchor,
  legalSectionHeadings,
  parseLegalText,
} from '@/components/legal/legalText'
import {
  LEGAL_NOTICE_VERSION,
  clearLegalNoticeConfirmedAt,
  readLegalNoticeConfirmedAt,
  rememberLegalNoticeConfirmedAt,
} from '@/components/legal/legalNotice'

describe('协议正文纯文本解析', () => {
  it('中文序号开头的是章节标题，数字序号带句号的是正文条目', () => {
    const blocks = parseLegalText(
      [
        '一、协议主体与适用范围',
        '1. 本协议由平台与用户共同订立。',
        '2. 本协议适用于用户在平台进行账号注册等行为。',
      ].join('\n'),
    )
    expect(blocks).toHaveLength(3)
    const [heading, item, item2] = blocks
    expect(heading?.type).toBe('heading')
    expect(item?.type).toBe('paragraph')
    expect(item2?.type).toBe('paragraph')
  })

  it('配套附件的数字序号标题（不以句号结尾）识别为章节标题', () => {
    const blocks = parseLegalText(
      ['1. 适用范围', '本政策适用于您访问、注册、登录平台时涉及的个人信息处理活动。'].join('\n'),
    )
    const [heading, paragraph] = blocks
    expect(heading?.type).toBe('heading')
    expect(heading?.type === 'heading' ? heading.text : '').toBe('1. 适用范围')
    expect(paragraph?.type).toBe('paragraph')
  })

  it('短横线开头的行归成列表项', () => {
    const blocks = parseLegalText(['- 第一条', '- 第二条'].join('\n'))
    expect(blocks).toHaveLength(1)
    const [list] = blocks
    expect(list?.type).toBe('list')
    expect(list?.type === 'list' ? list.items : []).toEqual(['第一条', '第二条'])
  })

  it('章节 id 由标题文本生成，锚点按中文编码', () => {
    const blocks = parseLegalText('九、责任边界与责任限制\n正文一段。')
    const headings = legalSectionHeadings(blocks)
    expect(headings).toHaveLength(1)
    expect(headings[0]?.id).toBe('九、责任边界与责任限制')
    expect(legalSectionAnchor('九、责任边界与责任限制')).toBe(
      `#${encodeURIComponent('九、责任边界与责任限制')}`,
    )
    expect(legalSectionAnchor('九、责任边界与责任限制')).not.toBe('#九、责任边界与责任限制')
  })

  it('按关键词在章节标题里定位', () => {
    const headings = legalSectionHeadings(
      parseLegalText(
        ['五、费用、支付与退款', '九、责任边界与责任限制', '十一、争议解决'].join('\n'),
      ),
    )
    expect(findLegalSectionTitle('责任', headings)).toBe('九、责任边界与责任限制')
    expect(findLegalSectionTitle('争议', headings)).toBe('十一、争议解决')
    expect(findLegalSectionTitle('不存在的章节', headings)).toBeNull()
  })

  it('前端 JSON 兜底快照能转成同构区块（链接退化成文字）', () => {
    const blocks = legalDocumentToBlocks({
      blocks: [
        { type: 'effective', label: '生效日期', text: '2026年5月13日' },
        { type: 'heading', text: '1. 适用范围' },
        { type: 'paragraph', text: '本政策适用于您访问平台。' },
        { type: 'list', items: ['一条', '两条'] },
        {
          type: 'paragraph-link',
          before: '可前往',
          linkText: '工单中心',
          to: '/tickets',
          after: '提交申请。',
        },
      ],
    })
    expect(blocks[0]).toEqual({ type: 'paragraph', text: '生效日期：2026年5月13日' })
    expect(blocks[1]?.type).toBe('heading')
    expect(blocks[3]?.type).toBe('list')
    const last = blocks[4]
    expect(last?.type === 'paragraph' ? last.text : '').toContain('/tickets')
  })
})

describe('重要条款提示的留痕辅助', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('提示版本号是带日期的版本串', () => {
    expect(LEGAL_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/)
  })

  it('确认时间只存在本次会话，读得到也清得掉', () => {
    expect(readLegalNoticeConfirmedAt()).toBe('')
    rememberLegalNoticeConfirmedAt('2026-10-21T05:00:00.000Z')
    expect(readLegalNoticeConfirmedAt()).toBe('2026-10-21T05:00:00.000Z')
    clearLegalNoticeConfirmedAt()
    expect(readLegalNoticeConfirmedAt()).toBe('')
  })
})

describe('登录弹窗的二次确认（R043 任务-03）', () => {
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
        ...overrides,
      },
      global: {
        plugins: [router, pinia],
      },
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('只勾协议时提交按钮仍禁用，两个都勾上才可提交', async () => {
    const wrapper = await mountAuthModal({ acceptTerms: false })
    const submit = wrapper.find('.auth-modal-actions .auth-btn.solid')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ acceptTerms: true })
    expect(wrapper.find('.auth-modal-actions .auth-btn.solid').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="legal-notice-check"]').setValue(true)
    expect(
      wrapper.find('.auth-modal-actions .auth-btn.solid').attributes('disabled'),
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('三种登录入口都受二次确认约束', async () => {
    const wrapper = await mountAuthModal({
      acceptTerms: true,
      githubLoginAvailable: true,
      wechatLoginAvailable: true,
      qqLoginAvailable: true,
      giteeLoginAvailable: true,
    })
    // 第三方登录四个按钮（GitHub / 微信 / QQ / Gitee）都必须禁用
    const buttons = wrapper.findAll('.auth-login-methods .auth-btn')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    wrapper.unmount()
  })

  it('勾选提示后把确认时间记进本次会话', async () => {
    const wrapper = await mountAuthModal({ acceptTerms: true })
    await wrapper.find('[data-testid="legal-notice-check"]').setValue(true)
    expect(readLegalNoticeConfirmedAt()).not.toBe('')
    wrapper.unmount()
  })

  it('勾选状态不跨会话：重新打开弹窗要重新勾', async () => {
    const wrapper = await mountAuthModal({ acceptTerms: true })
    await wrapper.find('[data-testid="legal-notice-check"]').setValue(true)
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(wrapper.find('.auth-modal-actions .auth-btn.solid').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
