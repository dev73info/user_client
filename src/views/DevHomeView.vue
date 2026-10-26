<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevFundPanel from '@/components/dev/DevFundPanel.vue'
import DevHomeMetaStrip from '@/components/dev/DevHomeMetaStrip.vue'
import DevProjectList from '@/components/dev/DevProjectList.vue'
import { useDevHomeBoard } from '@/composables/useDevHomeBoard'
import { useDevHomeDashboard } from '@/composables/useDevHomeDashboard'
import { useDevHomeIncomeChart } from '@/composables/useDevHomeIncomeChart'
import { useDevHomeLists } from '@/composables/useDevHomeLists'
import { CHIP_TONES } from '@/shared/devHomeDisplay'

/**
 * 开发者工作台总览：三档读数 + 钱包读数 + 近期到账 + 我的需求 + 我的资源 + 四个跳转入口。
 *
 * 本页三份读数由 `useDevHomeDashboard` 取；订单、资金、交付、漏斗与动态流的实时快照
 * 在独立的「实时看板」页（`/workbench/developer/dashboard`），使用 2.0 看板 REST/WS 契约。
 */

/**
 * 卸载标记：**只在视图这一份**，往下传的是只读 getter（`isMounted: () => isMounted`），
 * composable 不许自持一份 —— 否则视图卸载后谁清谁不清就成了两套说法。
 */
let isMounted = true

/** 数据层不引 `TMessage`：登录失效与三接口失败这两句文案留在视图，出错时交回来弹。 */
const DASHBOARD_TEXTS = {
  loginExpired: '登录状态已失效，请重新登录',
  loadFailed: '加载工作台总览失败',
}

const {
  loading,
  loaded,
  loadError,
  overview,
  requirements,
  resources,
  activeProjectCount,
  pendingDeliveryCount,
  completedProjectCount,
  withdrawable,
  pendingWithdraw,
  paidWithdraw,
  changeRate,
  todayIncome,
  loadPage,
  reloadWallet,
} = useDevHomeDashboard({
  isMounted: () => isMounted,
  texts: DASHBOARD_TEXTS,
  onError: (message) => TMessage.error(message),
})

const router = useRouter()

/** 三格读数的口径在 `useDevHomeBoard`（没读到数据时显示「—」，不显示 0）。 */
const { statCards, incomeRows } = useDevHomeBoard({
  overview,
  loaded,
  activeProjectCount,
  pendingDeliveryCount,
  completedProjectCount,
})

/** 近 7 天到账曲线（按最近到账记录归集）在 `useDevHomeIncomeChart`。 */
const { incomeBuckets, chartDays, chartCaption } = useDevHomeIncomeChart({ overview, loaded })

/** 两张列表卡的行（哪几档算进行中、时间列取哪个契约字段）在 `useDevHomeLists`。 */
const { PROJECT_TABS, activeProjectTab, projectRows, resourceRows } = useDevHomeLists({
  requirements,
  resources,
})

/** 工作台入口：四条都用路由名跳，路径与权限由路由表统一管。 */
const ENTRIES = [
  { name: 'dev-requirement-hall', label: '需求大厅' },
  { name: 'dev-my-requirements', label: '我的需求' },
  { name: 'dev-wallet', label: '钱包' },
  { name: 'dev-resource-list', label: '资源' },
] as const

/** 提现就地开窗：余额、通道状态与提交都在弹窗内完成，成功后只回刷钱包读数。 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)

/** 进页一次取数（本页没有后台轮询：读数不常变，需要时点刷新）。 */
onMounted(() => {
  void loadPage()
})

/** 卸载标记在这里落下：数据层只读它，慢响应回来时不再往回写。 */
onBeforeUnmount(() => {
  isMounted = false
})

/**
 * 总览列表只做汇总，完整明细在「我的接单」页。点进去时带上需求编号：
 * 那页把它灌进搜索框，落地就停在这一单上，不用再自己找。
 */
function openMyOrder(requirementId: string) {
  if (!requirementId) {
    return
  }

  void router.push({ name: 'dev-my-requirements', query: { requirement_id: requirementId } })
}
</script>

<template>
  <div class="dev-page dev-home" :class="{ 'dev-home--loading': loading }">
    <!-- 顶部三格读数：进行中 / 待交付 / 已完成，全部按「我的需求」的 status 现算 -->
    <DevHomeMetaStrip :loading="loading" :cards="statCards" @refresh="loadPage" />

    <!-- 四个跳转入口：读数只报数，明细在各自菜单页 -->
    <nav class="dev-home__entries" aria-label="开发者工作台入口">
      <RouterLink
        v-for="entry in ENTRIES"
        :key="entry.name"
        class="dev-home__entry"
        :to="{ name: entry.name }"
      >
        {{ entry.label }}
      </RouterLink>
    </nav>

    <!-- 加载失败：说清楚是加载失败并给重试，不把失败画成「暂无数据」 -->
    <section v-if="loadError" class="dev-home__error" role="alert">
      <div class="dev-home__error-copy">
        <strong>工作台数据没加载出来</strong>
        <p>{{ loadError }}</p>
      </div>
      <button class="dev-btn dev-btn--ghost" type="button" @click="loadPage()">重新加载</button>
    </section>

    <section class="dev-home__layout">
      <div class="dev-home__main">
        <!-- 我的需求：行仍由本页算（哪几档算进行中、时间列取哪个契约字段），组件只画 -->
        <DevProjectList
          v-model:active-tab="activeProjectTab"
          :rows="projectRows"
          :tabs="PROJECT_TABS"
          :more-to="{ name: 'dev-my-requirements' }"
          @open="openMyOrder"
        />

        <!-- 我的资源：只列标题、平台与可见性，管主页与版本去「资源管理」 -->
        <section class="dev-surface-card dev-home__panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">我的资源</h3>
            </div>
            <div class="dev-card-head__actions">
              <RouterLink class="dev-home__more" :to="{ name: 'dev-resource-list' }">
                查看全部
              </RouterLink>
            </div>
          </div>

          <ul v-if="resourceRows.length" class="dev-home__resources">
            <li v-for="row in resourceRows" :key="row.id" class="dev-home__resource">
              <div class="dev-home__resource-top">
                <strong class="dev-home__resource-title">{{ row.title }}</strong>
                <span class="dev-chip dev-home__chip" :class="CHIP_TONES[row.tone]">
                  {{ row.visibilityLabel }}
                </span>
              </div>
              <p class="dev-home__resource-meta">{{ row.platform }} · 更新于 {{ row.timeText }}</p>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>还没有资源</strong>
          </p>
        </section>
      </div>

      <aside class="dev-home__aside">
        <!-- 资金卡：今日收入与环比、近 7 天曲线、提现口径、近期到账。
             提现仍由本页就地拉起弹窗，成功后才回刷钱包读数。 -->
        <DevFundPanel
          :loaded="loaded"
          :today-income="todayIncome"
          :change-rate="changeRate"
          :chart-days="chartDays"
          :chart-caption="chartCaption"
          :buckets="incomeBuckets"
          :withdrawable="withdrawable"
          :pending-withdraw="pendingWithdraw"
          :paid-withdraw="paidWithdraw"
          :incomes="incomeRows"
          @withdraw="withdrawDialog?.open()"
        />
      </aside>
    </section>

    <!-- 收入提现弹窗：与收益钱包页共用同一个，提交成功后只回刷钱包读数 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="reloadWallet" />
  </div>
</template>

<style scoped src="./../components/dev/dev-home-page.css"></style>

<style scoped src="./../components/dev/dev-home-responsive.css"></style>
