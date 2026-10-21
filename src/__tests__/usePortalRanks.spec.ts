import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { effectScope, nextTick, ref, type Ref } from 'vue'

import type { PortalRankResource } from '@/shared/home/portalRanks'

/**
 * `usePortalRanks` 的响应式与徽章取数（R047 从 `views/HomeView.vue` 抽出）。
 *
 * 两条约定必须钉住：
 * 1. 资源由调用方传入，composable 只聚合、不请求资源（`@/api/resources` 根本没被 mock，
 *    一旦有人在这里补一次资源请求，用例会因为没有对应实现直接炸）；
 * 2. 徽章按「入榜用户名指纹」触发——点赞/刷新导致资源数组换新但人没变时，不能再拉一遍。
 */

const mocks = vi.hoisted(() => ({ getUserBadges: vi.fn() }))

vi.mock('@/api/invite', () => ({ getUserBadges: mocks.getUserBadges }))
vi.mock('@/api/http', () => ({ apiUrl: (path: string) => `https://api.test${path}` }))

import { usePortalRanks } from '@/composables/usePortalRanks'

function resource(overrides: Partial<PortalRankResource> = {}): PortalRankResource {
  return {
    creator: 'alice',
    author: '',
    creator_avatar_url: null,
    creator_credit_score: null,
    creator_username_gradient: false,
    creator_username_color: null,
    updated_at: new Date(2026, 2, 1, 10, 0).toISOString(),
    team_id: null,
    team_name: null,
    team_avatar_url: null,
    ...overrides,
  }
}

function badge(code: string, equipped = true) {
  return { code, name: code, description: '说明', icon: '🏅', equipped }
}

/** 等 watch 回调与徽章请求都落地（watch 在微任务队列，请求还有几跳）。 */
async function settle() {
  await nextTick()
  await flushPromises()
}

/** 在独立的 effectScope 里跑 composable，`watch` 才会随 scope 一起销毁。 */
function setup(resources: Ref<PortalRankResource[]>) {
  const scope = effectScope()
  const api = scope.run(() => usePortalRanks(resources))
  if (!api) throw new Error('usePortalRanks 没有返回')
  return { api, scope }
}

describe('usePortalRanks', () => {
  it('按传入的资源聚合榜单与合计，头像统一过 apiUrl', async () => {
    mocks.getUserBadges.mockResolvedValue({ badges: [] })
    const { api, scope } = setup(
      ref([
        resource({ creator: 'alice', creator_avatar_url: '/uploads/a.png' }),
        resource({ creator: 'bob', creator_avatar_url: '/uploads/b.png' }),
        resource({ creator: 'bob', team_id: 2, team_name: '柒叁小队' }),
      ]),
    )
    await settle()

    expect(api.developerRanks.value.map((rank) => [rank.username, rank.resourceCount])).toEqual([
      ['bob', 2],
      ['alice', 1],
    ])
    expect(api.developerRanks.value[1]?.avatarUrl).toBe('https://api.test/uploads/a.png')
    expect(api.totalContribResources.value).toBe(3)
    expect(api.teamRanks.value).toEqual([
      { teamId: 2, teamName: '柒叁小队', avatarUrl: '', resourceCount: 1 },
    ])

    scope.stop()
  })

  it('入榜用户没变时不重复拉徽章（点赞、刷新换新数组也不拉）', async () => {
    mocks.getUserBadges.mockReset()
    mocks.getUserBadges.mockResolvedValue({ badges: [badge('b1')] })
    const resources = ref([resource({ creator: 'alice' })])
    const { api, scope } = setup(resources)
    await settle()

    expect(mocks.getUserBadges).toHaveBeenCalledTimes(1)
    expect(api.developerBadges.value.alice).toEqual([badge('b1')])

    // 同一批人、新的资源数组（模拟点赞把 publicResources 整体换新）
    resources.value = [resource({ creator: 'alice', creator_credit_score: 90 })]
    await settle()

    expect(mocks.getUserBadges).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('入榜用户变化时重新拉，且只保留已装备的徽章', async () => {
    mocks.getUserBadges.mockReset()
    mocks.getUserBadges.mockImplementation(async (username: string) => ({
      badges: [badge(`${username}-on`), badge(`${username}-off`, false)],
    }))
    const resources = ref([resource({ creator: 'alice' })])
    const { api, scope } = setup(resources)
    await settle()

    expect(Object.keys(api.developerBadges.value)).toEqual(['alice'])
    expect(api.developerBadges.value.alice?.map((item) => item.code)).toEqual(['alice-on'])

    resources.value = [resource({ creator: 'alice' }), resource({ creator: 'bob' })]
    await settle()
    await settle()

    expect(mocks.getUserBadges).toHaveBeenCalledTimes(3)
    expect(Object.keys(api.developerBadges.value).sort()).toEqual(['alice', 'bob'])

    scope.stop()
  })

  it('单个用户的徽章取不到时按「没有徽章」处理，不影响其它人', async () => {
    mocks.getUserBadges.mockReset()
    mocks.getUserBadges.mockImplementation(async (username: string) => {
      if (username === 'alice') throw new Error('500')
      return { badges: [badge(`${username}-on`)] }
    })
    const { api, scope } = setup(
      ref([resource({ creator: 'alice' }), resource({ creator: 'bob' })]),
    )
    await settle()

    expect(api.developerBadges.value.alice).toEqual([])
    expect(api.developerBadges.value.bob?.map((item) => item.code)).toEqual(['bob-on'])

    scope.stop()
  })

  it('匿名资源（用户名空）不参与拉徽章，资源清空后徽章也一起清空', async () => {
    mocks.getUserBadges.mockReset()
    mocks.getUserBadges.mockResolvedValue({ badges: [badge('b1')] })
    const resources = ref<PortalRankResource[]>([resource({ creator: 'alice' })])
    const { api, scope } = setup(resources)
    await settle()
    expect(mocks.getUserBadges).toHaveBeenCalledTimes(1)

    resources.value = [resource({ creator: '', author: '无名氏' })]
    await settle()
    await settle()

    // 匿名不拉（新指纹是空串），旧徽章随之清掉
    expect(mocks.getUserBadges).toHaveBeenCalledTimes(1)
    expect(api.developerRanks.value[0]?.username).toBe('')
    expect(api.developerBadges.value).toEqual({})

    scope.stop()
  })
})
