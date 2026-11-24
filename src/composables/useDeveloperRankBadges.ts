import { onScopeDispose, ref, watch, type Ref } from 'vue'

import { getUserBadges, type UserBadge } from '@/api/invite'
import type { DeveloperRank } from '@/shared/home/portalRanks'

/** 名称下方最多展示两枚已佩戴徽章，再多会把侧栏行撑散。 */
const MAX_VISIBLE_BADGES = 2

/**
 * 开发者贡献榜的佩戴徽章：按用户名读取公开徽章，只保留已佩戴项。
 *
 * 榜单本身仍由资源聚合得出；这里只补展示资料。请求失败按「没有徽章」处理，
 * 不阻断榜单，也不把错误抛到首页。
 */
export function useDeveloperRankBadges(ranks: Ref<readonly DeveloperRank[]>) {
  const badgesByUsername = ref<Record<string, UserBadge[]>>({})
  const cache = new Map<string, UserBadge[]>()
  const inflight = new Map<string, Promise<UserBadge[]>>()
  let disposed = false

  async function loadBadges(username: string): Promise<UserBadge[]> {
    const cached = cache.get(username)
    if (cached) return cached

    const pending = inflight.get(username)
    if (pending) return pending

    const task = getUserBadges(username)
      .then((response) =>
        response.badges.filter((badge) => badge.equipped).slice(0, MAX_VISIBLE_BADGES),
      )
      .catch(() => [])
      .then((badges) => {
        cache.set(username, badges)
        inflight.delete(username)
        return badges
      })

    inflight.set(username, task)
    return task
  }

  watch(
    () =>
      ranks.value
        .map((rank) => rank.username)
        .filter(Boolean)
        .join('\u0000'),
    async () => {
      const usernames = [...new Set(ranks.value.map((rank) => rank.username).filter(Boolean))]
      if (usernames.length === 0) {
        badgesByUsername.value = {}
        return
      }

      const entries = await Promise.all(
        usernames.map(async (username) => [username, await loadBadges(username)] as const),
      )
      if (!disposed) {
        badgesByUsername.value = Object.fromEntries(entries)
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    disposed = true
  })

  return { badgesByUsername }
}
