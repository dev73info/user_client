import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type Ref } from 'vue'

import type { PortalRankResource } from '@/shared/home/portalRanks'

/**
 * `usePortalRanks` 的响应式（R047 从 `views/HomeView.vue` 抽出）。
 *
 * 一条约定必须钉住：资源由调用方传入，composable 只聚合、不请求资源
 * （`@/api/resources` 根本没被 mock，一旦有人在这里补一次资源请求，用例会因为没有对应实现直接炸）。
 */

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

/** 在独立的 effectScope 里跑 composable，派生值随 scope 一起销毁。 */
function setup(resources: Ref<PortalRankResource[]>) {
  const scope = effectScope()
  const api = scope.run(() => usePortalRanks(resources))
  if (!api) throw new Error('usePortalRanks 没有返回')
  return { api, scope }
}

describe('usePortalRanks', () => {
  it('按传入的资源聚合榜单与合计，头像统一过 apiUrl', () => {
    const { api, scope } = setup(
      ref([
        resource({ creator: 'alice', creator_avatar_url: '/uploads/a.png' }),
        resource({ creator: 'bob', creator_avatar_url: '/uploads/b.png' }),
        resource({ creator: 'bob', team_id: 2, team_name: '柒叁小队' }),
      ]),
    )

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

  it('资源换新数组后榜单跟着重算（点赞回写不会留下旧榜单）', () => {
    const resources = ref([resource({ creator: 'alice' })])
    const { api, scope } = setup(resources)

    expect(api.developerRanks.value.map((rank) => rank.username)).toEqual(['alice'])

    resources.value = [resource({ creator: 'alice' }), resource({ creator: 'bob' })]
    expect(api.developerRanks.value.map((rank) => rank.username).sort()).toEqual(['alice', 'bob'])

    scope.stop()
  })
})
