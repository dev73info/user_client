import { computed, type Ref } from 'vue'

import { apiUrl } from '@/api/http'
import {
  buildDeveloperRanks,
  buildTeamRanks,
  countContribResources,
  type PortalRankResource,
} from '@/shared/home/portalRanks'

/**
 * 首页侧栏两张榜单的数据：开发者贡献榜、活跃团队、页脚合计。
 *
 * **资源由调用方传进来**（视图里的 `publicResources` 是 7 个消费方共用的一份状态），
 * 这里只做聚合，不再请求资源——否则会出现第二份数据源，资源列表与榜单可能对不上。
 * 聚合本身在 `shared/home/portalRanks.ts` 的纯函数里，本文件只管响应式。
 */
export function usePortalRanks(publicResources: Ref<readonly PortalRankResource[]>) {
  /** 头像相对路径统一过 `apiUrl`；空值给空串，让模板回落首字母。 */
  const resolveAvatarUrl = (raw?: string | null) => (raw ? apiUrl(raw) : '')

  const developerRanks = computed(() =>
    buildDeveloperRanks(publicResources.value, { resolveAvatarUrl }),
  )
  const teamRanks = computed(() => buildTeamRanks(publicResources.value, { resolveAvatarUrl }))
  const totalContribResources = computed(() => countContribResources(developerRanks.value))

  return { developerRanks, teamRanks, totalContribResources }
}
