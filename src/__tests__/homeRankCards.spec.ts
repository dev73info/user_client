import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import type { DeveloperRank, TeamRank } from '@/shared/home/portalRanks'

/**
 * 侧栏两张榜单卡片的渲染与交互（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 这里钉住三件容易在搬迁中静默坏掉的事：
 * 1. 动态拼接的名次 class（`portal-contrib-item--rank-N`）必须仍挂在行上，否则 CSS 失配；
 * 2. 点行只回抛一次事件——原来行内是 `@click` 直接 push 路由，拆出来后若父级再挂一层会跳两次；
 * 3. 头像加载失败回落到首字母（失败集合跟着组件走，不在视图里）。
 */

function developerRank(overrides: Partial<DeveloperRank> = {}): DeveloperRank {
  return {
    name: '阿离',
    username: 'ali',
    avatarUrl: '',
    creditScore: null,
    resourceCount: 1,
    ...overrides,
  }
}

function teamRank(overrides: Partial<TeamRank> = {}): TeamRank {
  return {
    teamId: 1,
    teamName: '柒叁小队',
    avatarUrl: '',
    resourceCount: 2,
    ...overrides,
  }
}

describe('DeveloperRankCard', () => {
  it('名次修饰类与 --rank-index 都挂在行上，父容器没有额外条件 class', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [developerRank(), developerRank({ username: 'bo', name: '博' })],
        totalResources: 2,
      },
    })

    const items = wrapper.findAll('.portal-contrib-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.classes()).toContain('portal-contrib-item--rank-1')
    expect(items[1]?.classes()).toContain('portal-contrib-item--rank-2')
    expect(items[0]?.attributes('style')).toContain('--rank-index: 0')
    expect(items[1]?.attributes('style')).toContain('--rank-index: 1')
    expect(wrapper.find('.portal-contrib-item__rank').exists()).toBe(false)
  })

  it('点行只回抛一次 open-developer（不会连点两次跳两次）', async () => {
    const wrapper = mount(DeveloperRankCard, {
      props: { ranks: [developerRank({ username: 'ali' })], totalResources: 1 },
    })

    await wrapper.find('.portal-contrib-item').trigger('click')

    const emitted = wrapper.emitted('open-developer')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]).toEqual(['ali'])
  })

  it('头像加载失败后回落名字首字', async () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [developerRank({ avatarUrl: 'https://api.test/uploads/a.png' })],
        totalResources: 1,
      },
    })

    expect(wrapper.find('.portal-contrib-item__avatar img').exists()).toBe(true)
    await wrapper.find('.portal-contrib-item__avatar img').trigger('error')

    expect(wrapper.find('.portal-contrib-item__avatar img').exists()).toBe(false)
    expect(wrapper.find('.portal-contrib-item__avatar').text()).toBe('阿')
  })

  it('渐变与自定义用户名色：有自定义色时不再加渐变类', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [
          developerRank({ username: 'gradient', name: '渐变', gradient: true }),
          developerRank({ username: 'colored', name: '有色', gradient: true, userColor: 'blue' }),
        ],
        totalResources: 2,
      },
    })

    const names = wrapper.findAll('.portal-contrib-item__meta strong')
    expect(names[0]?.classes()).toContain('username-gradient')
    expect(names[1]?.classes()).not.toContain('username-gradient')
    expect(names[1]?.attributes('style')).toContain('color: blue')
  })

  it('信用分展示并按档位着色，页脚仍用传入的合计', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [developerRank({ resourceCount: 3, creditScore: 100 })],
        totalResources: 3,
      },
    })

    const count = wrapper.find('.portal-contrib-item__count')
    expect(count.text()).toBe('信用：100')
    expect(count.classes()).toContain('is-good')
    expect(wrapper.find('.portal-contrib-footer').text().replace(/\s+/g, '')).toBe(
      '本周3个资源·1位开发者',
    )
  })

  it('名称下方展示已佩戴徽章，贡献数仍保留在名称行', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [developerRank({ username: 'ali', resourceCount: 3 })],
        totalResources: 3,
        badgesByUsername: {
          ali: [
            {
              code: 'early_bird',
              name: '早期用户',
              description: '平台上线首月注册',
              icon: '🕊️',
              tier: 1,
              category: '特殊徽章',
              awarded_at: '2026-10-01 10:00:00',
              equipped: true,
            },
          ],
        },
      },
    })

    expect(wrapper.find('.portal-contrib-item__badge').text()).toBe('贡献 3')
    const badge = wrapper.find('.portal-contrib-item__user-badge')
    expect(badge.attributes('title')).toBeUndefined()
    expect(badge.attributes('aria-label')).toBe('早期用户：平台上线首月注册')
    expect(badge.attributes('tabindex')).toBe('0')
    expect(badge.find('.portal-contrib-item__user-badge-icon').text()).toBe('🕊️')
    expect(badge.find('.portal-contrib-item__user-badge-tooltip strong').text()).toBe('早期用户')
    expect(badge.find('.portal-contrib-item__user-badge-tooltip span').text()).toBe(
      '平台上线首月注册',
    )
  })

  it('展示贡献资源徽章，前三名头像佩戴奖牌', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [
          developerRank({ username: 'a', name: '甲', resourceCount: 5 }),
          developerRank({ username: 'b', name: '乙', resourceCount: 3 }),
          developerRank({ username: 'c', name: '丙', resourceCount: 2 }),
          developerRank({ username: 'd', name: '丁', resourceCount: 1 }),
        ],
        totalResources: 11,
      },
    })

    expect(wrapper.findAll('.portal-contrib-item__badge').map((item) => item.text())).toEqual([
      '贡献 5',
      '贡献 3',
      '贡献 2',
      '贡献 1',
    ])
    expect(wrapper.findAll('.portal-contrib-item__medal')).toHaveLength(3)
    expect(
      wrapper.findAll('.portal-contrib-item')[0]?.find('.portal-contrib-item__medal').classes(),
    ).toContain('is-rank-1')
  })

  it('信用分低于 100 走警示色，缺值显示占位', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: {
        ranks: [
          developerRank({ creditScore: 96 }),
          developerRank({ username: 'b', name: '乙', creditScore: null }),
        ],
        totalResources: 2,
      },
    })

    const counts = wrapper.findAll('.portal-contrib-item__count')
    expect(counts[0]?.text()).toBe('信用：96')
    expect(counts[0]?.classes()).toContain('is-warning')
    expect(counts[1]?.text()).toBe('信用：—')
  })

  it('空榜显示空状态且不渲染页脚', () => {
    const wrapper = mount(DeveloperRankCard, {
      props: { ranks: [], totalResources: 0 },
    })

    expect(wrapper.find('.portal-contrib-list').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无公开开发者')
    expect(wrapper.find('.portal-contrib-footer').exists()).toBe(false)
  })
})

describe('TeamRankCard', () => {
  it('点行回抛数字团队 id', async () => {
    const wrapper = mount(TeamRankCard, { props: { ranks: [teamRank({ teamId: 42 })] } })

    await wrapper.find('.portal-rank-item').trigger('click')

    expect(wrapper.emitted('open-team')).toEqual([[42]])
  })

  it('头像加载失败后回落团队名首字', async () => {
    const wrapper = mount(TeamRankCard, {
      props: { ranks: [teamRank({ avatarUrl: 'https://api.test/uploads/team.png' })] },
    })

    await wrapper.find('.portal-rank-item__avatar img').trigger('error')

    expect(wrapper.find('.portal-rank-item__avatar img').exists()).toBe(false)
    expect(wrapper.find('.portal-rank-item__avatar').text()).toBe('柒')
  })

  it('资源数不再显示文字，改为带名次的团队徽章', () => {
    const wrapper = mount(TeamRankCard, {
      props: { ranks: [teamRank({ resourceCount: 7 })] },
    })

    const badge = wrapper.find('.portal-rank-item__badge')
    expect(wrapper.text()).not.toContain('7 个资源')
    expect(badge.classes()).toContain('is-rank-1')
    expect(badge.attributes('title')).toBe('活跃团队第 1 名 · 7 个公开资源')
    expect(badge.text()).toBe('1')
  })
})
