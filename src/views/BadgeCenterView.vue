<script setup lang="ts">
import { ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

import BadgeWall from '@/components/BadgeWall.vue'
import InvitePanel from '@/components/InvitePanel.vue'

/* 「我的背包 → 勋章与邀请」，由「我的徽章墙」与「我的邀请」两页合并而来。
   徽章墙组件本身在个人主页、他人徽章页也在用（BadgeWall.vue 支持 username / publicOnly）；
   邀请那一块直接用邀请组件（InvitePanel.vue），页面这边只负责把两块内容与顶部读数条摆好。
   两块读数（已获得 / 已佩戴 / 已成功邀请）各有各的来源，都由子组件加载完上报，页面不重复打接口；
   刷新按钮只有一个，点一次两块一起重载。 */

/* 本页是 ui_73info 的**第一个迁移页**（原 el-button + el-icon 已换成 TButton + TIcon）。
   记两处刻意的收敛，免得以后被当成漏改：

   1. 那颗刷新按钮原先的规格来自 `.wb-strip__action .wb-toolbar__icon-btn.el-button`
      （portal-workbench.css），它是一串 `--el-button-*` 变量赋值——只对 el-button 生效。
      现在形状由 `icon-only` 属性给（正方形 36px、触屏 44px），颜色由 TButton 的描边档给，
      于是那段宿主 CSS 不再参与本页。**图标颜色比原来略深一点**：原来取 `--profile-text-sub`
      （#64748b），现在取门户主题的 `--73-ink-soft`（#52627a），同属弱化墨色、同一色相。
   2. 原来悬停时图标会变成主色；现在悬停是浅底 + 一层淡投影，图标保持弱化色。
      两套主题下的主色都是 #1f4ad1（`--wb-accent` 与门户 `--73-accent` 同值），所以这里
      只是「要不要在悬停时上色」的取舍，不是取错色。

   本页原先外层还套着 ElConfigProvider（给子组件注入中文语言包）。按 ui_73info 的
   口径去掉：本库的固定文案是中文硬编码，没有 locale 层；BadgeWall 里也已没有
   Element 组件，留着它只会让 element-plus 这个依赖在本页继续挂着一个引用。 */

const badgeWallRef = ref<InstanceType<typeof BadgeWall> | null>(null)
const badgeStats = ref<{ acquired: number; total: number; equipped: number } | null>(null)
/* 邀请那一块的读数（已成功邀请）：与徽章读数同一条读数条，来源见 InvitePanel 的 stats 上报。 */
const invitePanelRef = ref<InstanceType<typeof InvitePanel> | null>(null)
const invitedCount = ref<number | null>(null)
const refreshing = ref(false)

function applyBadgeStats(acquired: number, total: number, equipped: number) {
  badgeStats.value = { acquired, total, equipped }
}

function applyInviteStats(invited: number) {
  invitedCount.value = invited
}

async function reload() {
  refreshing.value = true
  try {
    // 徽章与邀请一起重载：这一页只有一颗刷新按钮，两块内容都得跟着走。
    await Promise.all([badgeWallRef.value?.reload(), invitePanelRef.value?.reload()])
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
    <main class="page-shell custom-page-shell profile-page badges-center-page">
      <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
      <WorkbenchBarSlot>
        <div class="wb-strip" aria-label="勋章与邀请概览">
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
          <div class="wb-strip__divider" />
          <div class="wb-strip__item">
            <span class="wb-strip__label">已成功邀请</span>
            <span class="wb-strip__value">{{ invitedCount == null ? '—' : invitedCount }}</span>
          </div>
          <div class="wb-strip__item wb-strip__action">
            <TButton
              icon-only
              :loading="refreshing"
              aria-label="刷新勋章与邀请"
              @click="reload"
            >
              <TIcon><Refresh /></TIcon>
            </TButton>
          </div>
        </div>
      </WorkbenchBarSlot>

      <section class="wallet-section">
        <BadgeWall ref="badgeWallRef" @stats="applyBadgeStats" />
      </section>

      <!-- 邀请块：合并进来的第二块内容，复用同一套 .wallet-section 卡片几何。 -->
      <section class="wallet-section">
        <InvitePanel ref="invitePanelRef" @stats="applyInviteStats" />
      </section>
    </main>
</template>
