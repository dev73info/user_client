<script setup lang="ts">
import { ref } from 'vue'
import { ElConfigProvider } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'

import BadgeWall from '@/components/BadgeWall.vue'

/* 「我的背包 → 我的徽章墙」。
   徽章墙组件本身在个人主页、他人徽章页也在用（BadgeWall.vue 支持 username / publicOnly），
   这里只补上菜单页该有的顶部读数条与页面级刷新——读数由组件加载完上报，页面不重复打接口。
   徽章墙原先挂在「我的邀请」页底部，与邀请记录是两件事，现在各归各的菜单。 */

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
  <ElConfigProvider :locale="zhCn">
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
          <el-button class="wb-toolbar__icon-btn" :loading="refreshing" aria-label="刷新徽章" @click="reload">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </div>

      <section class="wallet-section">
        <BadgeWall ref="badgeWallRef" @stats="applyBadgeStats" />
      </section>
    </main>
  </ElConfigProvider>
</template>

<style scoped>
/* 版式走统一层（.wb-strip 与 .wallet-section），徽章格子由 BadgeWall 自己管。 */
.badges-center-page {
  align-content: start;
}
</style>
