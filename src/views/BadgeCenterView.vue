<script setup lang="ts">
import { ref } from 'vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import BadgeWall from '@/components/BadgeWall.vue'
import InvitePanel from '@/components/InvitePanel.vue'
import InviteRewardPanel from '@/components/InviteRewardPanel.vue'

const badgeWallRef = ref<InstanceType<typeof BadgeWall> | null>(null)
const invitePanelRef = ref<InstanceType<typeof InvitePanel> | null>(null)
const inviteRewardRef = ref<InstanceType<typeof InviteRewardPanel> | null>(null)
const badgeStats = ref<{ acquired: number; total: number; equipped: number } | null>(null)
const invitedCount = ref<number | null>(null)
const refreshing = ref(false)
const badgeFilter = ref<'all' | 'acquired' | 'equipped'>('all')

function applyBadgeStats(acquired: number, total: number, equipped: number, failed: boolean) {
  badgeStats.value = failed ? null : { acquired, total, equipped }
}

async function reload() {
  refreshing.value = true
  try {
    await Promise.all([
      badgeWallRef.value?.reload(),
      invitePanelRef.value?.reload(),
      inviteRewardRef.value?.reload(),
    ])
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page badges-center-page wb-sheet">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="勋章与邀请概览">
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': badgeFilter === 'all' }"
          type="button"
          :aria-pressed="badgeFilter === 'all'"
          @click="badgeFilter = 'all'"
        >
          <span class="wb-strip__label">全部徽章</span>
          <span class="wb-strip__value">{{ badgeStats?.total ?? '—' }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': badgeFilter === 'acquired' }"
          type="button"
          :aria-pressed="badgeFilter === 'acquired'"
          @click="badgeFilter = 'acquired'"
        >
          <span class="wb-strip__label">已获得徽章</span>
          <span class="wb-strip__value">{{
            badgeStats ? `${badgeStats.acquired} / ${badgeStats.total}` : '—'
          }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': badgeFilter === 'equipped' }"
          type="button"
          :aria-pressed="badgeFilter === 'equipped'"
          @click="badgeFilter = 'equipped'"
        >
          <span class="wb-strip__label">已佩戴</span>
          <span class="wb-strip__value">{{ badgeStats?.equipped ?? '—' }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已成功邀请</span>
          <span class="wb-strip__value">{{ invitedCount ?? '—' }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="refreshing" aria-label="刷新勋章与邀请" @click="reload"
            ><TIcon><Refresh /></TIcon
          ></TButton>
        </div>
      </div>
    </WorkbenchBarSlot>
    <section class="wallet-section">
      <BadgeWall
        ref="badgeWallRef"
        :filter="badgeFilter"
        @stats="applyBadgeStats"
        @clear-filter="badgeFilter = 'all'"
      />
    </section>
    <section class="wallet-section">
      <InvitePanel ref="invitePanelRef" @stats="invitedCount = $event" />
    </section>
    <section class="wallet-section">
      <InviteRewardPanel ref="inviteRewardRef" />
    </section>
  </main>
</template>
