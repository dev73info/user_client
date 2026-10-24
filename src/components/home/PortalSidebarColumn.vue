<script setup lang="ts">
import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalMilestoneCard from '@/components/home/PortalMilestoneCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import type { PortalMilestoneStat, PortalNotice } from '@/shared/home/portalDisplay'
import type { DeveloperRank, TeamRank } from '@/shared/home/portalRanks'

/**
 * 门户首页右侧栏（R047 从 `views/HomeView.vue` 拆出）：内测卡片、平台公告、内测里程碑、两张榜单。
 *
 * 纯展示组件：五张卡只吃 props、只回抛事件。公告条与里程碑统计由视图用
 * `shared/home/portalDisplay.ts` 的纯函数算好后传进来（本组件不再算第二遍），
 * 「活跃团队」在无团队时整卡不渲染（`v-if` 与原视图一致）。
 * 样式仍全部在各卡片自己的全局样式（`styles/home.css`），本组件不带 `<style>`。
 */
withDefaults(
  defineProps<{
    notices: PortalNotice[]
    stats: PortalMilestoneStat[]
    isDeveloperAccount: boolean
    developerRanks: DeveloperRank[]
    totalContribResources: number
    teamRanks: TeamRank[]
  }>(),
  {
    notices: () => [],
    stats: () => [],
    developerRanks: () => [],
    totalContribResources: 0,
    teamRanks: () => [],
  },
)

const emit = defineEmits<{
  (e: 'open-group'): void
  (e: 'open-notice', notice: PortalNotice): void
  (e: 'open-resource-init'): void
  (e: 'open-developer', username: string): void
  (e: 'open-team', teamId: number): void
}>()
</script>

<template>
  <aside class="portal-sidebar">
    <PortalBetaCard @open-group="emit('open-group')" />

    <PortalNoticeCard :notices="notices" @open-notice="emit('open-notice', $event)" />

    <PortalMilestoneCard
      :stats="stats"
      :is-developer-account="isDeveloperAccount"
      @open-resource-init="emit('open-resource-init')"
    />

    <DeveloperRankCard
      :ranks="developerRanks"
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
