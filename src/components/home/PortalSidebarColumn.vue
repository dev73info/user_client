<script setup lang="ts">
import type { CheckinStatus } from '@/api/points'
import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import type { PortalNotice } from '@/shared/home/portalDisplay'
import type { DeveloperRank, TeamRank } from '@/shared/home/portalRanks'

/**
 * 门户首页右侧栏（R047 从 `views/HomeView.vue` 拆出）：内测卡片、平台公告、两张榜单。
 *
 * 纯展示组件：四张卡只吃 props、只回抛事件。公告条由视图用
 * `shared/home/portalDisplay.ts` 的纯函数算好后传进来，「活跃团队」在无团队时整卡不渲染。
 * 样式仍全部在各卡片自己的全局样式（`styles/home.css`），本组件不带 `<style>`。
 */
withDefaults(
  defineProps<{
    notices: PortalNotice[]
    developerRanks: DeveloperRank[]
    totalContribResources: number
    teamRanks: TeamRank[]
    checkinStatus?: CheckinStatus | null
    checkinSaving?: boolean
    checkinError?: string
  }>(),
  {
    notices: () => [],
    developerRanks: () => [],
    totalContribResources: 0,
    teamRanks: () => [],
    checkinStatus: null,
    checkinSaving: false,
    checkinError: '',
  },
)

const emit = defineEmits<{
  (e: 'open-group'): void
  (e: 'open-notice', notice: PortalNotice): void
  (e: 'open-developer', username: string): void
  (e: 'open-team', teamId: number): void
  (e: 'checkin'): void
  (e: 'checkin-reload'): void
}>()
</script>

<template>
  <aside class="portal-sidebar">
    <PortalBetaCard
      :status="checkinStatus"
      :saving="checkinSaving"
      :error="checkinError"
      @open-group="emit('open-group')"
      @checkin="emit('checkin')"
      @reload="emit('checkin-reload')"
    />

    <PortalNoticeCard :notices="notices" @open-notice="emit('open-notice', $event)" />

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
