<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, TButton, TIcon, TMessage } from 'ui_73info'

import { listAvailableCoupons } from '@/api/coupons'
import type { RequirementItem } from '@/api/requirements'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRequirementConversations } from '@/composables/useRequirementConversations'
import { formatRequirementTime, useRequirementOverview } from '@/composables/useRequirementOverview'
import { isActiveRequirement, requirementStatusLabel } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const {
  requirementLoading,
  requirementStats,
  sortedRequirements,
  actionableRequirements,
  loadMyRequirements,
} = useRequirementOverview()
const { availableConversationCount, loadRequirementConversations } = useRequirementConversations({
  requirements: sortedRequirements,
})

const couponCount = ref(0)
const refreshing = ref(false)

const recentRequirements = computed(() => sortedRequirements.value.slice(0, 5))
const loading = computed(() => requirementLoading.value || refreshing.value)
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '上午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const displayName = computed(() => auth.username || '朋友')
const avatarText = computed(() => Array.from(displayName.value)[0]?.toUpperCase() || '我')

function formatBudget(item: RequirementItem) {
  if (item.budget == null) {
    return '预算待定'
  }
  return `预算 ¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(item.budget)}`
}

function statusTone(status: string) {
  if (status === 'completed') return 'is-success'
  if (status === 'rejected' || status === 'cancelled') return 'is-muted'
  return isActiveRequirement(status) ? 'is-active' : 'is-pending'
}

async function loadCoupons() {
  if (!auth.token.trim()) {
    couponCount.value = 0
    return
  }
  try {
    couponCount.value = (await listAvailableCoupons(auth.token)).length
  } catch (error) {
    couponCount.value = 0
    TMessage.error(error instanceof Error ? error.message : '加载优惠券失败')
  }
}

async function refreshOverview() {
  refreshing.value = true
  try {
    await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadCoupons()])
  } finally {
    refreshing.value = false
  }
}

function go(name: string) {
  void router.push({ name })
}

function goPublish() {
  void router.push({ name: 'home', query: { modal: 'publish' } })
}

function goProfile() {
  const username = auth.username.trim()
  if (!username) return
  void router.push({ name: 'dev-profile', params: { username } })
}

function handleWelcomeKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  goProfile()
}

onMounted(() => {
  auth.hydrate()
  void refreshOverview()
})
</script>

<template>
  <main
    class="page-shell custom-page-shell profile-page user-workbench-overview wb-sheet"
    :aria-busy="loading"
  >
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="工作台概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">我的需求</span>
          <span class="wb-strip__value">{{ requirementStats.total }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">待处理</span>
          <span class="wb-strip__value">{{ actionableRequirements.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">会话</span>
          <span class="wb-strip__value">{{ availableConversationCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">可用券</span>
          <span class="wb-strip__value">{{ couponCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton
            icon-only
            :loading="loading"
            aria-label="刷新工作台总览"
            @click="refreshOverview"
          >
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section
      class="overview-welcome"
      role="link"
      tabindex="0"
      aria-label="进入我的主页"
      @click="goProfile"
      @keydown="handleWelcomeKeydown"
    >
      <div class="overview-welcome__avatar" aria-hidden="true">{{ avatarText }}</div>
      <div class="overview-welcome__copy">
        <span class="overview-welcome__eyebrow">需求方工作台</span>
        <h1 id="workbench-overview-title">{{ greeting }}，{{ displayName }}</h1>
        <p>需求、合同、会话与资产都在这里汇总，今天也把进度往前推一点。</p>
      </div>
      <TButton
        class="overview-welcome__publish"
        variant="solid"
        tone="accent"
        @click.stop="goPublish"
      >
        <span aria-hidden="true">＋</span>
        发布需求
      </TButton>
    </section>

    <div class="overview-grid">
      <section class="overview-panel" aria-labelledby="overview-actionable-title">
        <header class="overview-panel__head">
          <div>
            <h2 id="overview-actionable-title">待处理需求</h2>
            <p>需要你确认、付款或处理的下一步。</p>
          </div>
          <button class="overview-link" type="button" @click="go('workbench-requirements')">
            查看全部
            <span aria-hidden="true">›</span>
          </button>
        </header>

        <div v-if="loading && actionableRequirements.length === 0" class="overview-empty">
          正在加载需求…
        </div>
        <div v-else-if="actionableRequirements.length === 0" class="overview-empty">
          <strong>当前没有待处理事项</strong>
          <span>新需求进入审核或交付节点后，会出现在这里。</span>
        </div>
        <div v-else class="overview-list">
          <button
            v-for="item in actionableRequirements"
            :key="item.requirement_id"
            type="button"
            class="overview-requirement"
            @click="go('workbench-requirements')"
          >
            <span class="overview-requirement__mark" aria-hidden="true">需</span>
            <span class="overview-requirement__main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.requirement_id }} · {{ formatBudget(item) }}</span>
            </span>
            <span class="overview-status" :class="statusTone(item.status)">
              {{ requirementStatusLabel(item.status, item.payment_mode) }}
            </span>
            <span class="overview-requirement__arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section class="overview-panel overview-shortcuts" aria-labelledby="overview-shortcuts-title">
        <header class="overview-panel__head">
          <div>
            <h2 id="overview-shortcuts-title">快捷入口</h2>
            <p>常用功能一步直达。</p>
          </div>
        </header>
        <div class="overview-shortcuts__grid">
          <button type="button" @click="goPublish">
            <span class="overview-shortcut__icon is-accent" aria-hidden="true">＋</span>
            <span><strong>发布需求</strong><small>提交需求并审核</small></span>
          </button>
          <button type="button" @click="go('workbench-requirements')">
            <span class="overview-shortcut__icon" aria-hidden="true">需</span>
            <span><strong>我的需求</strong><small>交付与验收进度</small></span>
          </button>
          <button type="button" @click="go('workbench-messages')">
            <span class="overview-shortcut__icon" aria-hidden="true">聊</span>
            <span><strong>消息中心</strong><small>继续与开发者沟通</small></span>
          </button>
          <button type="button" @click="go('workbench-coupons')">
            <span class="overview-shortcut__icon" aria-hidden="true">券</span>
            <span><strong>优惠券中心</strong><small>查看可用券与券码</small></span>
          </button>
        </div>
      </section>

      <section class="overview-panel overview-recent" aria-labelledby="overview-recent-title">
        <header class="overview-panel__head">
          <div>
            <h2 id="overview-recent-title">最近需求</h2>
            <p>按创建时间展示最近 5 条。</p>
          </div>
          <button class="overview-link" type="button" @click="go('workbench-requirements')">
            全部需求
            <span aria-hidden="true">›</span>
          </button>
        </header>

        <div v-if="loading && recentRequirements.length === 0" class="overview-empty">
          正在加载需求…
        </div>
        <div v-else-if="recentRequirements.length === 0" class="overview-empty">
          <strong>还没有发布过需求</strong>
          <span>点击「发布需求」，把想法整理成一份可交付的需求。</span>
        </div>
        <div v-else class="overview-recent__list">
          <button
            v-for="item in recentRequirements"
            :key="item.requirement_id"
            type="button"
            class="overview-recent__row"
            @click="go('workbench-requirements')"
          >
            <span>
              <strong>{{ item.title }}</strong>
              <small
                >{{ item.requirement_id }} · {{ formatRequirementTime(item.created_time) }}</small
              >
            </span>
            <span class="overview-status" :class="statusTone(item.status)">
              {{ requirementStatusLabel(item.status, item.payment_mode) }}
            </span>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<!-- 列表基础样式先加载，布局与响应式规则后加载，确保窄屏覆盖生效。 -->
<style scoped src="../styles/user-workbench-overview-list.css"></style>
<style scoped src="../styles/user-workbench-overview.css"></style>
