<script setup lang="ts">
import { ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

import BadgeWall from '@/components/BadgeWall.vue'
import InvitePanel from '@/components/InvitePanel.vue'

/* 顶部读数条与其余菜单页同一条形态（读数在左、页面级刷新在右上角）。
   读数由两个子组件各自加载后上报，页面这边不重复打接口；
   刷新按钮也挂在读数条上，点它等于让两个子组件各重载一次。 */
const invitePanelRef = ref<InstanceType<typeof InvitePanel> | null>(null)
const badgeWallRef = ref<InstanceType<typeof BadgeWall> | null>(null)

const invitedCount = ref<number | null>(null)
const badgeStats = ref<{ acquired: number; total: number; equipped: number } | null>(null)
const refreshing = ref(false)

function applyInviteStats(invited: number) {
  invitedCount.value = invited
}

function applyBadgeStats(acquired: number, total: number, equipped: number) {
  badgeStats.value = { acquired, total, equipped }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([invitePanelRef.value?.reload(), badgeWallRef.value?.reload()])
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page invite-view">
    <!-- 顶部读数条：读数在左，页面级刷新固定在右上角 __action 槽 -->
    <div class="wb-strip" aria-label="邀请概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">已成功邀请</span>
        <span class="wb-strip__value">{{ invitedCount == null ? '—' : invitedCount }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已获得徽章</span>
        <span class="wb-strip__value">
          {{ badgeStats ? `${badgeStats.acquired} / ${badgeStats.total}` : '—' }}
        </span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已佩戴</span>
        <span class="wb-strip__value">{{ badgeStats ? badgeStats.equipped : '—' }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <el-button class="wb-toolbar__icon-btn" :loading="refreshing" aria-label="刷新邀请数据" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <section class="wallet-section invite-view__panel">
      <InvitePanel ref="invitePanelRef" @stats="applyInviteStats" />
    </section>
    <section id="badges" class="wallet-section invite-view__panel">
      <BadgeWall ref="badgeWallRef" @stats="applyBadgeStats" />
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层：外层是工作台各页共用的 .page-shell + .profile-page（宽度与纵向 24px 节奏由外壳给），
   顶部读数条 .wb-strip 与两块内容各占一张 .wallet-section，与相邻菜单页的卡片同一种几何。
   原来这里是自造的一张大卡（1280px 宽、18px 圆角、自己写的描边 rgba(224,232,255,.96) 与阴影），
   比别的菜单页宽出一截，卡片几何也不是同一档；而且整页没有读数条与刷新按钮，
   从别的菜单页切过来会少一层。 */
.invite-view {
    display: grid;
    align-content: start;
}
</style>
