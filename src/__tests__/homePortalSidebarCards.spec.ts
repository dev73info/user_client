import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalMilestoneCard from '@/components/home/PortalMilestoneCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import { buildMilestoneStats, type PortalNotice } from '@/shared/home/portalDisplay'

/**
 * 侧栏三张卡（内测中 / 平台公告 / 内测里程碑）的渲染与交互（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 重点钉住搬迁中最容易静默坏掉的两处：
 * - 动态拼接的色板 class（`portal-stat-item--tone-N`）与 `--stat-index` 仍跟着卡走；
 * - 卡片只回抛事件、不自己发请求（签到、QQ 群、跳转都由视图/父级处理）。
 */

const routerLinkStub = {
  props: ['to'],
  template: '<a class="router-link-stub"><slot /></a>',
}

describe('PortalBetaCard', () => {
  it('未登录时不渲染邀请区块，QQ 群按钮回抛 open-group', async () => {
    const wrapper = mount(PortalBetaCard, {
      props: { isAuthed: false, checkin: null },
      global: { stubs: { RouterLink: routerLinkStub } },
    })

    expect(wrapper.find('.portal-beta-invite').exists()).toBe(false)
    await wrapper.find('.portal-beta-notice__btn').trigger('click')
    expect(wrapper.emitted('open-group')).toHaveLength(1)
  })

  it('今日未签到：显示签到卡，按钮回抛 checkin 且带上今日可得与连续天数', async () => {
    const wrapper = mount(PortalBetaCard, {
      props: {
        isAuthed: true,
        checkin: { today_checked_in: false, today_potential: 12, streak_count: 3 },
      },
    })

    expect(wrapper.text()).toContain('📅 每日签到')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('3')

    const cta = wrapper.find('.portal-checkin-card__cta')
    expect(cta.text()).toBe('立即签到')
    expect(cta.attributes('disabled')).toBeUndefined()

    await cta.trigger('click')
    expect(wrapper.emitted('checkin')).toHaveLength(1)
  })

  it('签到进行中：按钮置灰并显示「签到中…」', async () => {
    const wrapper = mount(PortalBetaCard, {
      props: {
        isAuthed: true,
        checkin: { today_checked_in: false, today_potential: 12, streak_count: 3 },
        checkinSaving: true,
      },
    })

    const cta = wrapper.find('.portal-checkin-card__cta')
    expect(cta.text()).toBe('签到中…')
    expect(cta.attributes('disabled')).toBeDefined()
  })

  it('已签到或拿不到状态：露出「邀请有礼」', () => {
    const checked = mount(PortalBetaCard, {
      props: {
        isAuthed: true,
        checkin: { today_checked_in: true, today_potential: 0, streak_count: 3 },
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    })
    const unknown = mount(PortalBetaCard, {
      props: { isAuthed: true, checkin: null },
      global: { stubs: { RouterLink: routerLinkStub } },
    })

    for (const wrapper of [checked, unknown]) {
      expect(wrapper.text()).toContain('🎁 邀请有礼')
      expect(wrapper.find('.portal-checkin-card__cta').exists()).toBe(false)
      expect(wrapper.find('.router-link-stub').text()).toBe('立即邀请')
    }
  })
})

describe('PortalNoticeCard', () => {
  const withTarget: PortalNotice = {
    title: '平台公告 A',
    date: '3/5 14:30',
    tag: '公告',
    to: { name: 'community' },
  }
  const withoutTarget: PortalNotice = { title: '最新成交：做个工具', date: '3/5 15:00', tag: 'HOT' }

  it('只有带跳转目标的条目才挂可点击样式与 role', () => {
    const wrapper = mount(PortalNoticeCard, {
      props: { notices: [withTarget, withoutTarget] },
    })

    const items = wrapper.findAll('.portal-notice-item')
    expect(items[0]?.classes()).toContain('portal-notice-item--clickable')
    expect(items[0]?.attributes('role')).toBe('button')
    expect(items[0]?.attributes('style')).toContain('--notice-index: 0')
    expect(items[1]?.classes()).not.toContain('portal-notice-item--clickable')
    expect(items[1]?.attributes('role')).toBeUndefined()
  })

  it('点击与回车都只回抛一次 open-notice，携带整条目标', async () => {
    const wrapper = mount(PortalNoticeCard, {
      props: { notices: [withTarget, withoutTarget] },
    })

    const items = wrapper.findAll('.portal-notice-item')
    await items[0]!.trigger('click')
    await items[1]!.trigger('keydown.enter')

    const emitted = wrapper.emitted('open-notice')
    expect(emitted).toHaveLength(2)
    expect(emitted?.[0]).toEqual([withTarget])
    expect(emitted?.[1]).toEqual([withoutTarget])
  })

  it('「更多」回抛 more 由父级决定去哪', async () => {
    const wrapper = mount(PortalNoticeCard, { props: { notices: [] } })

    await wrapper.find('.portal-link-btn--notice').trigger('click')

    expect(wrapper.emitted('more')).toHaveLength(1)
  })
})

describe('PortalMilestoneCard', () => {
  const stats = buildMilestoneStats({
    developerCount: 14,
    resourceCount: 7,
    completedLabel: '3 单',
  })

  it('四张统计卡的色板类与 --stat-index 由索引拼，仍挂在卡上', () => {
    const wrapper = mount(PortalMilestoneCard, {
      props: { stats, isDeveloperAccount: false },
    })

    const cards = wrapper.findAll('.portal-stat-item')
    expect(cards).toHaveLength(4)
    cards.forEach((card, index) => {
      expect(card.classes()).toContain(`portal-stat-item--tone-${index % 4}`)
      expect(card.attributes('style')).toContain(`--stat-index: ${index}`)
    })
  })

  it('里程碑目标用活动目标文案，进度条宽度走统一百分比口径', () => {
    const wrapper = mount(PortalMilestoneCard, {
      props: { stats, isDeveloperAccount: false },
    })

    const cards = wrapper.findAll('.portal-stat-item')
    expect(cards[0]?.find('.portal-stat-item__target').exists()).toBe(true)
    expect(cards[0]?.find('.portal-stat-item__progress-bar').attributes('style')).toContain(
      'width: 1%',
    )
    expect(cards[1]?.find('.portal-stat-item__progress-bar').attributes('style')).toContain(
      'width: 14%',
    )
    // 后两张没有进度目标，不该画进度条
    expect(cards[2]?.find('.portal-stat-item__progress').exists()).toBe(false)
    expect(cards[3]?.find('.portal-stat-item__progress').exists()).toBe(false)
  })

  it('CTA 文案按账号类型切换，点击回抛 open-resource-init', async () => {
    const normal = mount(PortalMilestoneCard, {
      props: { stats, isDeveloperAccount: false },
    })
    const developer = mount(PortalMilestoneCard, {
      props: { stats, isDeveloperAccount: true },
    })

    expect(normal.find('.portal-milestone__cta').text()).toBe('立即入驻 →')
    expect(developer.find('.portal-milestone__cta').text()).toBe('发布资源 →')

    await normal.find('.portal-milestone__cta').trigger('click')
    expect(normal.emitted('open-resource-init')).toHaveLength(1)
  })

  it('保留 #portal-developers 锚点（外部链接曾经跳这里）', () => {
    const wrapper = mount(PortalMilestoneCard, {
      props: { stats, isDeveloperAccount: false },
    })

    expect(wrapper.attributes('id')).toBe('portal-developers')
  })
})
