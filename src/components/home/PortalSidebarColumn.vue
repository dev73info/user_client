<script setup lang="ts">
import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalMilestoneCard from '@/components/home/PortalMilestoneCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import type { PortalMilestoneStat, PortalNotice } from '@/shared/home/portalDisplay'
import type { DeveloperRank, PortalDeveloperBadge, TeamRank } from '@/shared/home/portalRanks'

/**
 * 门户首页右侧栏（R047 从 `views/HomeView.vue` 拆出）：内测卡片、平台公告、内测里程碑、两张榜单。
 *
 * 纯展示组件：五张卡只吃 props、只回抛事件。公告条与里程碑统计由视图用
 * `shared/home/portalDisplay.ts` 的纯函数算好后传进来（本组件不再算第二遍），
 * 「活跃团队」在无团队时整卡不渲染（`v-if` 与原视图一致）。
 * 样式仍全部在各卡片自己的全局样式（`styles/home.css`），本组件不带 `<style>`。
 */
/** 签到状态只用到这三个字段，视图那边传 `CheckinStatus` 即可（结构兼容）。 */
type CheckinSummary = {
  today_checked_in: boolean
  today_potential: number
  streak_count: number
}

withDefaults(
  defineProps<{
    isAuthed: boolean
    checkin: CheckinSummary | null
    checkinSaving?: boolean
    notices: PortalNotice[]
    stats: PortalMilestoneStat[]
    isDeveloperAccount: boolean
    developerRanks: DeveloperRank[]
    developerBadges: Record<string, PortalDeveloperBadge[]>
    totalContribResources: number
    teamRanks: TeamRank[]
  }>(),
  {
    checkin: null,
    checkinSaving: false,
    notices: () => [],
    stats: () => [],
    developerRanks: () => [],
    developerBadges: () => ({}),
    totalContribResources: 0,
    teamRanks: () => [],
  },
)

const emit = defineEmits<{
  (e: 'checkin'): void
  (e: 'open-group'): void
  (e: 'open-notice', notice: PortalNotice): void
  (e: 'more-notices'): void
  (e: 'open-resource-init'): void
  (e: 'open-developer', username: string): void
  (e: 'open-team', teamId: number): void
}>()
</script>

<template>
  <aside class="portal-sidebar">
    <PortalBetaCard
      :is-authed="isAuthed"
      :checkin="checkin"
      :checkin-saving="checkinSaving"
      @checkin="emit('checkin')"
      @open-group="emit('open-group')"
    />

    <PortalNoticeCard
      :notices="notices"
      @open-notice="emit('open-notice', $event)"
      @more="emit('more-notices')"
    />

    <PortalMilestoneCard
      :stats="stats"
      :is-developer-account="isDeveloperAccount"
      @open-resource-init="emit('open-resource-init')"
    />

    <DeveloperRankCard
      :ranks="developerRanks"
      :badges="developerBadges"
      :total-resources="totalContribResources"
      @open-developer="emit('open-developer', $event)"
    />
    <TeamRankCard
      v-if="teamRanks.length > 0"
      :ranks="teamRanks"
      @open-team="emit('open-team', $event)"
    />
  </aside>
</template>
