<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { devDashboardWsUrl, getDevDashboard, type DevDashboardSnapshot } from '@/api/devDashboard'
import { useDevDashboardSocket } from '@/composables/useDevDashboardSocket'
import { describeBackendError } from '@/shared/backendErrorText'
import { formatFenAsCny } from '@/shared/money'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'
import { TButton } from 'ui_73info'

const auth = useAuthStore()
const loading = ref(false)
const loadError = ref('')
const restSnapshot = ref<DevDashboardSnapshot | null>(null)
const socket = useDevDashboardSocket({
  url: () => (auth.token ? devDashboardWsUrl(auth.token) : null),
})

const snapshot = computed(() => socket.snapshot.value ?? restSnapshot.value)
const statusLabel = computed(
  () =>
    ({
      connecting: '正在连接实时通道',
      open: '实时连接正常',
      reconnecting: '连接中断，正在重连',
      closed: '实时连接已关闭',
    })[socket.status.value],
)
const pipeline = computed(() => {
  const value = snapshot.value?.pipeline
  if (!value) return []
  return [
    { key: 'pending_deposit', label: '待付定金', value: value.pending_deposit },
    { key: 'deposit_paid', label: '已付定金', value: value.deposit_paid },
    { key: 'in_development', label: '开发中', value: value.in_development },
    { key: 'pending_final', label: '待付尾款', value: value.pending_final },
    { key: 'pending_settlement', label: '待结算', value: value.pending_settlement },
    { key: 'completed_this_month', label: '本月完成', value: value.completed_this_month },
  ]
})
const overdueCount = computed(
  () =>
    snapshot.value?.projects.filter(
      (project) =>
        project.deadlines.delivery_overdue ||
        project.deadlines.acceptance_overdue ||
        project.deadlines.remediation_overdue ||
        project.deadlines.final_pay_overdue,
    ).length ?? 0,
)

/**
 * 动态条目的类型名。
 *
 * 契约里 `kind` 是 `income` / `delivery` / `status` / `withdrawal` / `deposit` 这样的英文枚举，
 * 直接印在页面上等于把接口字段露给用户看；这里翻成人话，认不出来的取值原样显示（不吞掉）。
 */
const FEED_KIND_LABELS: Record<string, string> = {
  income: '到账',
  delivery: '交付',
  status: '状态变更',
  withdrawal: '提现',
  deposit: '保证金',
}

function feedKindLabel(kind: string): string {
  return FEED_KIND_LABELS[kind] ?? kind
}

function money(value: number | null | undefined) {
  return `¥${formatFenAsCny(value)}`
}

async function loadSnapshot() {
  loading.value = true
  loadError.value = ''
  try {
    restSnapshot.value = await getDevDashboard(auth.token)
  } catch (error) {
    loadError.value = describeBackendError(error, '加载实时看板失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  if (!auth.token) {
    loadError.value = '请先登录后查看实时看板'
    return
  }
  void loadSnapshot()
  socket.connect()
})
</script>

<template>
  <main class="dev-page dev-realtime" :aria-busy="loading">
    <header class="dev-realtime__head">
      <div>
        <h2>实时看板</h2>
        <p :class="`dev-realtime__status dev-realtime__status--${socket.status.value}`">
          {{ statusLabel }}
          <template v-if="snapshot"> · 更新于 {{ snapshot.generated_at }}</template>
        </p>
      </div>
      <TButton variant="outline" :loading="loading" @click="loadSnapshot">刷新快照</TButton>
    </header>

    <div v-if="loadError" class="dev-empty-state" role="alert">
      <strong>看板加载失败</strong>
      <span>{{ loadError }}</span>
      <TButton variant="outline" @click="loadSnapshot">重试</TButton>
    </div>
    <p v-else-if="loading && !snapshot" class="dev-empty-state">正在加载实时看板…</p>
    <template v-else-if="snapshot">
      <section class="dev-realtime__money" aria-label="资金读数">
        <div>
          <span>今日收益</span><strong>{{ money(snapshot.wallet.today_income_fen) }}</strong>
        </div>
        <div>
          <span>本月收益</span><strong>{{ money(snapshot.month_income_fen) }}</strong>
        </div>
        <div>
          <span>可提现</span><strong>{{ money(snapshot.wallet.withdrawable_balance_fen) }}</strong>
        </div>
        <div>
          <span>收益池冻结</span><strong>{{ money(snapshot.wallet.frozen_deposit_fen) }}</strong>
        </div>
        <div>
          <span>预付余额</span><strong>{{ money(snapshot.deposit.available_fen) }}</strong>
        </div>
        <div>
          <span>预付可提</span><strong>{{ money(snapshot.deposit.withdrawable_fen) }}</strong>
        </div>
      </section>

      <section class="dev-surface-card dev-realtime__panel" aria-label="接单漏斗">
        <h3 class="dev-section-title">接单漏斗</h3>
        <div class="dev-realtime__pipeline">
          <div v-for="cell in pipeline" :key="cell.key">
            <span>{{ cell.label }}</span
            ><strong>{{ cell.value }}</strong
            ><small>单</small>
          </div>
        </div>
        <p v-if="overdueCount" class="dev-realtime__warning" role="alert">
          有 {{ overdueCount }} 个项目存在逾期期限，请到「我的接单」处理。
        </p>
      </section>

      <div class="dev-realtime__columns">
        <section class="dev-surface-card dev-realtime__panel">
          <h3 class="dev-section-title">进行中的项目</h3>
          <p v-if="!snapshot.projects.length" class="dev-empty-state">暂无进行中的项目</p>
          <ul v-else class="dev-realtime__list">
            <li v-for="project in snapshot.projects" :key="project.requirement_id">
              <div>
                <strong>{{ project.title }}</strong>
                <span
                  >{{ project.requirement_id }} ·
                  {{ requirementStatusLabel(project.status, project.payment_mode) }} ·
                  {{ money(project.budget_fen) }}</span
                >
              </div>
              <span v-if="project.deadlines.delivery_overdue" class="dev-realtime__warning"
                >交付逾期</span
              >
            </li>
          </ul>
        </section>

        <section class="dev-surface-card dev-realtime__panel">
          <h3 class="dev-section-title">资源概况</h3>
          <div class="dev-realtime__resources">
            <div>
              <span>资源数</span><strong>{{ snapshot.resources.resource_count }}</strong>
            </div>
            <div>
              <span>浏览量</span><strong>{{ snapshot.resources.total_views }}</strong>
            </div>
            <div>
              <span>下载量</span><strong>{{ snapshot.resources.total_downloads }}</strong>
            </div>
          </div>
          <h3 class="dev-section-title">最近交付</h3>
          <p v-if="!snapshot.deliveries.length" class="dev-empty-state">暂无交付记录</p>
          <ul v-else class="dev-realtime__list">
            <li
              v-for="delivery in snapshot.deliveries"
              :key="`${delivery.requirement_id}-${delivery.resource_id}`"
            >
              <div>
                <strong>{{ delivery.resource_title }}</strong>
                <span>{{ delivery.requirement_title }} · {{ delivery.version_count }} 个版本</span>
              </div>
              <span v-if="delivery.last_delivered_at">{{ delivery.last_delivered_at }}</span>
            </li>
          </ul>
        </section>

        <section class="dev-surface-card dev-realtime__panel">
          <h3 class="dev-section-title">实时动态</h3>
          <p v-if="!snapshot.feed.length" class="dev-empty-state">暂无动态</p>
          <ul v-else class="dev-realtime__list">
            <li v-for="(item, index) in snapshot.feed" :key="`${item.kind}-${item.at}-${index}`">
              <div>
                <strong>{{ item.title }}</strong>
                <span
                  >{{ feedKindLabel(item.kind)
                  }}<template v-if="item.requirement_id">
                    · {{ item.requirement_id }}</template
                  ></span
                >
              </div>
              <span>{{ item.amount_fen == null ? item.at : money(item.amount_fen) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped src="@/styles/dev-realtime-dashboard.css"></style>
