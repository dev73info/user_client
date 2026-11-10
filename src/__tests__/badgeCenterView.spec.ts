import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { BadgeDefinition, UserBadge } from '@/api/invite'
import BadgeCenterView from '@/views/BadgeCenterView.vue'

const mocks = vi.hoisted(() => ({
  definitions: vi.fn(),
  mine: vi.fn(),
  inviteCode: vi.fn(),
  inviteStats: vi.fn(),
}))
const auth = reactive({ token: 'badge-token', isAuthed: true, hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/invite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/invite')>()),
  getBadges: mocks.definitions,
  getMyBadges: mocks.mine,
  getMyInviteCode: mocks.inviteCode,
  getMyInviteStats: mocks.inviteStats,
}))
vi.mock('@/components/InviteRewardPanel.vue', () => ({
  default: { name: 'InviteRewardPanel', template: '<div class="invite-reward-stub" />' },
}))

const definitions: BadgeDefinition[] = [
  { code: 'first', name: '初来乍到', description: '注册即得', icon: '🎉', category: '成就徽章', tier: 1 },
  {
    code: 'veteran',
    name: '资深开发者',
    description: '完成 10 个需求',
    icon: '🏅',
    category: '成就徽章',
    tier: 2,
  },
  { code: 'helper', name: '热心助人', description: '帮助他人', icon: '🤝', category: '特殊徽章', tier: 1 },
]
const mine: UserBadge[] = [
  { ...definitions[0]!, equipped: true, awarded_at: '2026-10-01 00:00:00' },
  { ...definitions[2]!, equipped: false, awarded_at: '2026-10-02 00:00:00' },
]

let wrapper: VueWrapper | undefined

function stripItem(label: string) {
  const found = wrapper!
    .findAll('.wb-strip__item--filter')
    .find((item) => item.text().startsWith(label))
  expect(found).toBeDefined()
  return found!
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.definitions.mockResolvedValue(definitions)
  mocks.mine.mockResolvedValue({ badges: mine })
  mocks.inviteCode.mockResolvedValue({ code: 'INVITE-CODE', invite_count: 2, invite_url: '' })
  mocks.inviteStats.mockResolvedValue({ invite_code: 'INVITE-CODE', invitees: [], total_invited: 2 })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function render() {
  wrapper = mount(BadgeCenterView, {
    global: {
      stubs: {
        WorkbenchBarSlot: { template: '<div><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('勋章与邀请', () => {
  it('读数格按全部 / 已获得 / 已佩戴筛选徽章墙', async () => {
    await render()

    expect(wrapper!.findAll('.wb-strip__item--filter')).toHaveLength(3)
    expect(stripItem('全部徽章').text()).toContain('3')
    expect(stripItem('已获得徽章').text()).toContain('2 / 3')
    expect(stripItem('已佩戴').text()).toContain('1')
    expect(wrapper!.findAll('.badge-wall__badge')).toHaveLength(3)

    await stripItem('已获得徽章').trigger('click')
    expect(stripItem('已获得徽章').attributes('aria-pressed')).toBe('true')
    expect(wrapper!.findAll('.badge-wall__badge')).toHaveLength(2)
    expect(wrapper!.text()).not.toContain('资深开发者')

    await stripItem('已佩戴').trigger('click')
    expect(stripItem('已佩戴').attributes('aria-pressed')).toBe('true')
    expect(wrapper!.findAll('.badge-wall__badge')).toHaveLength(1)
    expect(wrapper!.text()).toContain('初来乍到')
    expect(wrapper!.text()).not.toContain('热心助人')

    await stripItem('全部徽章').trigger('click')
    expect(wrapper!.findAll('.badge-wall__badge')).toHaveLength(3)
  })

  it('三个 wallet-section 各自带卡头，邀请读数格保持只读', async () => {
    await render()

    const sections = wrapper!.findAll('.wallet-section')
    expect(sections).toHaveLength(3)
    expect(sections[0]!.get('.wb-card-head__title').text()).toBe('我的徽章墙')
    expect(sections[1]!.get('.wb-card-head__title').text()).toBe('我的邀请')

    const invitedItem = wrapper!
      .findAll('.wb-strip__item')
      .find((item) => item.text().startsWith('已成功邀请'))!
    expect(invitedItem.element.tagName).toBe('DIV')
    expect(invitedItem.attributes('aria-pressed')).toBeUndefined()
    expect(invitedItem.text()).toContain('2')
    // 三格可点筛选；邀请计数没有对应筛选项，保持只读。
    expect(wrapper!.findAll('.wb-strip__item--filter')).toHaveLength(3)
  })

  it('全部模式保留空分组标题，筛选模式只展示有命中的分组', async () => {
    mocks.definitions.mockResolvedValue([definitions[0]!])
    await render()

    expect(wrapper!.text()).toContain('成就徽章')
    expect(wrapper!.text()).toContain('特殊徽章')

    await stripItem('已获得徽章').trigger('click')
    expect(wrapper!.text()).not.toContain('特殊徽章')
  })
})
