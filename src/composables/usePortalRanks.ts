import { computed, ref, watch, type Ref } from 'vue'

import { apiUrl } from '@/api/http'
import { getUserBadges } from '@/api/invite'
import {
  buildDeveloperRanks,
  buildTeamRanks,
  countContribResources,
  type PortalDeveloperBadge,
  type PortalRankResource,
} from '@/shared/home/portalRanks'

/**
 * 首页侧栏两张榜单的数据：开发者贡献榜、活跃团队、页脚合计，以及入榜开发者的徽章。
 *
 * **资源由调用方传进来**（视图里的 `publicResources` 是 7 个消费方共用的一份状态），
 * 这里只做聚合，不再请求资源——否则会出现第二份数据源，资源列表与榜单可能对不上。
 * 聚合本身在 `shared/home/portalRanks.ts` 的纯函数里，本文件只管响应式与徽章取数。
 *
 * 徽章按「入榜用户名指纹」触发：只有榜单成员变了才重新拉，点赞、翻页、定时刷新都不额外请求。
 */
export function usePortalRanks(publicResources: Ref<readonly PortalRankResource[]>) {
  /** 头像相对路径统一过 `apiUrl`；空值给空串，让模板回落首字母。 */
  const resolveAvatarUrl = (raw?: string | null) => (raw ? apiUrl(raw) : '')

  const developerRanks = computed(() =>
    buildDeveloperRanks(publicResources.value, { resolveAvatarUrl }),
  )
  const teamRanks = computed(() => buildTeamRanks(publicResources.value, { resolveAvatarUrl }))
  const totalContribResources = computed(() => countContribResources(developerRanks.value))

  const developerBadges = ref<Record<string, PortalDeveloperBadge[]>>({})

  /** 入榜用户名（去重排序），空用户名（匿名资源）不参与拉徽章。 */
  const rankedUsernames = computed(() =>
    [
      ...new Set(developerRanks.value.map((rank) => rank.username).filter((name) => name !== '')),
    ].sort(),
  )
  /** 指纹用 `\u0000` 拼接：用户名校验只允许字母数字，不会和分隔符撞车。 */
  const rankedUsernameKey = computed(() => rankedUsernames.value.join('\u0000'))

  async function loadDeveloperBadges() {
    const key = rankedUsernameKey.value
    const usernames = rankedUsernames.value
    if (usernames.length === 0) {
      developerBadges.value = {}
      return
    }

    const entries = await Promise.all(
      usernames.map(async (username): Promise<[string, PortalDeveloperBadge[]]> => {
        try {
          const response = await getUserBadges(username)
          return [username, response.badges.filter((badge) => badge.equipped)]
        } catch {
          // 单个用户的徽章拿不到不影响榜单，按「没有徽章」处理
          return [username, []]
        }
      }),
    )

    // 期间榜单成员又变了：丢弃这次结果，等新的请求回来
    if (rankedUsernameKey.value !== key) {
      return
    }
    developerBadges.value = Object.fromEntries(entries)
  }

  watch(rankedUsernameKey, () => void loadDeveloperBadges(), { immediate: true })

  return { developerRanks, teamRanks, totalContribResources, developerBadges }
}
