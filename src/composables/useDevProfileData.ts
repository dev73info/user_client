/**
 * 开发者公开主页的取数与派生读数。
 *
 * 只负责「拿到什么」：公开资源、徽章、公开档案，以及由它们算出的头部读数、
 * 佩戴徽章、打赏块。加载失败不在这里弹提示——由 `useDevProfilePage` 统一处理，
 * 这样编辑 / 背景 / 打赏三处触发的重新加载走同一条错误口径。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { getUserBadges, type UserBadge } from '@/api/invite'
import { getPublicUserProfile, type PublicUserProfile } from '@/api/publicProfile'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { computeResourceStats } from '@/shared/devProfile'
import { tipReceivedCashText, tipReceivedPointsText } from '@/shared/devTip'
import { useAuthStore } from '@/stores/auth'

export function useDevProfileData() {
  const route = useRoute()
  const auth = useAuthStore()

  const username = computed(() => String(route.params.username || '').trim())
  const allResources = ref<PublicMcResourceItem[]>([])
  const userBadges = ref<UserBadge[]>([])
  const publicProfile = ref<PublicUserProfile | null>(null)

  const userResources = computed(() =>
    allResources.value.filter((resource) => resource.creator === username.value),
  )
  const wornBadges = computed(() => userBadges.value.filter((badge) => badge.equipped))
  const isSelf = computed(() => !!auth.username && auth.username === username.value)

  const profileDescription = computed(() => publicProfile.value?.profile_description ?? '')
  const profileGradient = computed(() => publicProfile.value?.username_gradient ?? false)
  const profileColor = computed(() => publicProfile.value?.username_color || '')

  const stats = computed(() => ({
    ...computeResourceStats(userResources.value),
    badgeCount: userBadges.value.length,
  }))

  // ---------------------------------------------------------------------------
  // R010 打赏：公开档案里的打赏块（老后端没有该字段时为 null）
  // ---------------------------------------------------------------------------
  const tipBlock = computed(() => publicProfile.value?.tip ?? null)
  /** 他人 + 开发者开启 → 头部显示「打赏」；本人不显示（不能打赏自己） */
  const canTip = computed(() => !isSelf.value && Boolean(tipBlock.value?.enabled))
  /** 开发者开启公开记录时才显示「收到打赏」区块 */
  const showReceivedTips = computed(() => Boolean(tipBlock.value?.public_records))
  const receivedCashText = computed(() =>
    tipReceivedCashText(tipBlock.value?.received_cash_fen ?? 0),
  )
  const receivedPointsText = computed(() =>
    tipReceivedPointsText(tipBlock.value?.received_points ?? 0),
  )
  const recentTipMessages = computed(() => tipBlock.value?.recent_messages ?? [])

  /** 三个公开接口并行取；失败向上抛，由页面层统一提示。 */
  async function load(): Promise<void> {
    if (!username.value) {
      return
    }
    const [resources, badges, profile] = await Promise.all([
      listAllPublicMcResources(),
      getUserBadges(username.value),
      getPublicUserProfile(username.value),
    ])
    allResources.value = resources
    userBadges.value = badges.badges
    publicProfile.value = profile
  }

  return {
    username,
    allResources,
    userBadges,
    publicProfile,
    userResources,
    wornBadges,
    isSelf,
    profileDescription,
    profileGradient,
    profileColor,
    stats,
    tipBlock,
    canTip,
    showReceivedTips,
    receivedCashText,
    receivedPointsText,
    recentTipMessages,
    load,
  }
}
