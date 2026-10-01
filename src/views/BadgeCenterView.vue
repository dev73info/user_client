<script setup lang="ts">
import { ref } from 'vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

import BadgeWall from '@/components/BadgeWall.vue'

/* 「我的背包 → 我的徽章墙」。
   徽章墙组件本身在个人主页、他人徽章页也在用（BadgeWall.vue 支持 username / publicOnly），
   这里只补上菜单页该有的顶部读数条与页面级刷新——读数由组件加载完上报，页面不重复打接口。
   徽章墙原先挂在「我的邀请」页底部，与邀请记录是两件事，现在各归各的菜单。 */

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
const refreshing = ref(false)

function applyBadgeStats(acquired: number, total: number, equipped: number) {
  badgeStats.value = { acquired, total, equipped }
}

async function reload() {
  refreshing.value = true
  try {
    await badgeWallRef.value?.reload()
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
    <main class="page-shell custom-page-shell profile-page badges-center-page">
      <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
      <div class="wb-strip" aria-label="徽章概览">
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
          <TButton
            icon-only
            :loading="refreshing"
            aria-label="刷新徽章"
            @click="reload"
          >
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>

      <section class="wallet-section">
        <BadgeWall ref="badgeWallRef" @stats="applyBadgeStats" />
      </section>
    </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip 与 .wallet-section），徽章格子由 BadgeWall 自己管。 */
.badges-center-page {
  align-content: start;
}
</style>
