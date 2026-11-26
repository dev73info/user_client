import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import type { DeveloperRank } from '@/shared/home/portalRanks'

const mocks = vi.hoisted(() => ({ getUserBadges: vi.fn() }))

vi.mock('@/api/invite', () => ({ getUserBadges: mocks.getUserBadges }))

import { useDeveloperRankBadges } from '@/composables/useDeveloperRankBadges'

function rank(username: string): DeveloperRank {
  return {
    name: username,
    username,
    avatarUrl: '',
    creditScore: 100,
    resourceCount: 1,
  }
}

function badge(code: string, equipped: boolean) {
  return {
    code,
    name: code,
    description: `${code} 描述`,
    icon: '★',
    tier: 1,
    category: '成就徽章',
    awarded_at: '2026-10-01 10:00:00',
    equipped,
  }
}

describe('useDeveloperRankBadges', () => {
  it('只保留已佩戴徽章，最多两枚，并按用户名归位', async () => {
    mocks.getUserBadges.mockResolvedValue({
      badges: [badge('a', true), badge('b', false), badge('c', true), badge('d', true)],
    })

    const scope = effectScope()
    const api = scope.run(() => useDeveloperRankBadges(ref([rank('alice')])))
    if (!api) throw new Error('useDeveloperRankBadges 没有返回')

    await flushPromises()

    expect(api.badgesByUsername.value.alice?.map((item) => item.code)).toEqual(['a', 'c'])
    expect(mocks.getUserBadges).toHaveBeenCalledWith('alice')

    scope.stop()
  })

  it('单个用户加载失败按没有徽章处理，不影响其他行', async () => {
    mocks.getUserBadges.mockImplementation((username: string) =>
      username === 'broken'
        ? Promise.reject(new Error('network'))
        : Promise.resolve({ badges: [badge('ok', true)] }),
    )

    const scope = effectScope()
    const api = scope.run(() => useDeveloperRankBadges(ref([rank('broken'), rank('alice')])))
    if (!api) throw new Error('useDeveloperRankBadges 没有返回')

    await flushPromises()

    expect(api.badgesByUsername.value.broken).toEqual([])
    expect(api.badgesByUsername.value.alice?.map((item) => item.code)).toEqual(['ok'])

    scope.stop()
  })
})
