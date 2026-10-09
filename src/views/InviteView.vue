<script setup lang="ts">
import { ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

import InvitePanel from '@/components/InvitePanel.vue'

/* 顶部读数条与其余菜单页同一条形态（读数在左、页面级刷新在右上角）。
   读数由 InvitePanel 加载后上报，页面这边不重复打接口；
   刷新按钮也挂在读数条上，点它等于让子组件重载一次。

   徽章墙原先挂在本页底部（`#badges` 锚点），现在独立成「我的背包 → 我的徽章墙」一页
   （BadgeCenterView.vue），本页的读数条只留邀请口径，不再报「已获得徽章 / 已佩戴」。 */
const invitePanelRef = ref<InstanceType<typeof InvitePanel> | null>(null)

const invitedCount = ref<number | null>(null)
const refreshing = ref(false)

function applyInviteStats(invited: number) {
  invitedCount.value = invited
}

async function refreshAll() {
  refreshing.value = true
  try {
    await invitePanelRef.value?.reload()
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page invite-view">
    <!-- 顶部读数条：读数在左，页面级刷新固定在右上角 __action 槽 -->
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="邀请概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">已成功邀请</span>
          <span class="wb-strip__value">{{ invitedCount == null ? '—' : invitedCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="refreshing" aria-label="刷新邀请数据" @click="refreshAll">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section invite-view__panel">
      <InvitePanel ref="invitePanelRef" @stats="applyInviteStats" />
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层：外层是工作台各页共用的 .page-shell + .profile-page（宽度与纵向 24px 节奏由外壳给），
   顶部读数条 .wb-strip 与内容卡各占一张 .wallet-section，与相邻菜单页的卡片同一种几何。
   原来这里是自造的一张大卡（1280px 宽、18px 圆角、自己写的描边 rgba(224,232,255,.96) 与阴影），
   比别的菜单页宽出一截，卡片几何也不是同一档；而且整页没有读数条与刷新按钮，
   从别的菜单页切过来会少一层。 */
.invite-view {
    display: grid;
    align-content: start;
}
</style>
