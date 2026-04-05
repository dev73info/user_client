<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppToast from '@/components/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type CouponItem = {
  code: string
  name: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount_cny: number
  max_discount_cny?: number | null
  active: boolean
  status: 'pending_use' | 'used'
  starts_at?: string | null
  ends_at?: string | null
}

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const amountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'amount'))
const discountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'percent'))

function formatRange(item: CouponItem) {
  if (!item.starts_at && !item.ends_at) {
    return '永久有效'
  }

  const parts: string[] = []
  if (item.starts_at) {
    parts.push(`起始：${item.starts_at.replace('T', ' ')}`)
  }
  if (item.ends_at) {
    parts.push(`截止：${item.ends_at.replace('T', ' ')}`)
  }
  return parts.join('，')
}

function formatDiscount(item: CouponItem) {
  if (item.discount_type === 'amount') {
    return `减免 ¥${item.discount_value.toFixed(2)}`
  }
  return `折扣 ${item.discount_value.toFixed(1)}%${item.max_discount_cny != null ? `，上限 ¥${item.max_discount_cny.toFixed(2)}` : ''}`
}

async function copyCouponCode(code: string) {
  const value = code.trim()
  if (!value) {
    showToast('券码为空，无法复制', 'error')
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    showToast('券码已复制', 'success')
  } catch {
    showToast('复制失败，请手动复制', 'error')
  }
}

async function loadCoupons() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  loading.value = true
  try {
    const resp = await fetch('/payments/coupons/available', {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })

    if (!resp.ok) {
      throw new Error((await resp.text()) || '加载券包失败')
    }

    coupons.value = (await resp.json()) as CouponItem[]
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载券包失败', 'error')
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'home' })
}

onMounted(async () => {
  auth.hydrate()
  await loadCoupons()
})
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <p class="eyebrow">个人中心</p>
          <h2>{{ auth.username || '我的券包' }}</h2>
          <p class="lead">在这里查看你的优惠券和折扣券背包。</p>
        </div>
        <button class="ghost" type="button" :disabled="loading" @click="goBack">返回首页</button>
      </header>

      <div class="wallet-overview">
        <div class="wallet-card summary-card">
          <strong>{{ amountCoupons.length }}</strong>
          <span>优惠卷</span>
        </div>
        <div class="wallet-card summary-card">
          <strong>{{ discountCoupons.length }}</strong>
          <span>折扣券</span>
        </div>
      </div>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>优惠卷背包</h3>
          <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="amountCoupons.length === 0" class="empty">暂无优惠卷</div>
        <div v-else class="coupon-items">
          <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
            @click="copyCouponCode(item.code)">
            <div class="coupon-head">
              <strong>{{ item.code }}</strong>
              <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
            </div>
            <small>{{ item.name }}</small>
            <p>{{ formatDiscount(item) }}</p>
            <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
          </button>
        </div>
      </section>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>折扣券背包</h3>
          <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="discountCoupons.length === 0" class="empty">暂无折扣券</div>
        <div v-else class="coupon-items">
          <button v-for="item in discountCoupons" :key="item.code" type="button" class="coupon-item"
            @click="copyCouponCode(item.code)">
            <div class="coupon-head">
              <strong>{{ item.code }}</strong>
              <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
            </div>
            <small>{{ item.name }}</small>
            <p>{{ formatDiscount(item) }}</p>
            <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
          </button>
        </div>
      </section>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.page-shell {
  width: min(980px, calc(100% - 32px));
  margin: 28px auto;
}

.panel {
  padding: 24px;
  background: rgba(6, 32, 50, 0.42);
  border: 1px solid var(--card-border);
  border-radius: 18px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-sub);
}

h2 {
  margin: 6px 0 8px;
  font-size: 30px;
}

.lead {
  margin: 0;
  color: var(--text-sub);
}

.ghost {
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease,
    background-color 180ms ease;
}

.ghost:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(180, 230, 255, 0.18);
}

.ghost:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  transform: none;
  box-shadow: none;
}

.ghost.small {
  padding: 6px 12px;
  font-size: 12px;
}

.wallet-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.wallet-card {
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.summary-card strong {
  display: block;
  font-size: 32px;
  margin-bottom: 8px;
}

.summary-card span {
  color: var(--text-sub);
}

.wallet-section {
  margin-top: 20px;
}

.wallet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.wallet-header h3 {
  margin: 0;
  font-size: 18px;
}

.coupon-items {
  display: grid;
  gap: 12px;
}

.coupon-item {
  width: 100%;
  text-align: left;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.coupon-item:hover {
  border-color: rgba(149, 213, 178, 0.45);
  background: rgba(149, 213, 178, 0.1);
}

.coupon-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.coupon-status {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
}

.coupon-status.pending_use {
  background: rgba(31, 197, 142, 0.14);
  color: #8ef1bb;
}

.coupon-status.used {
  background: rgba(255, 140, 140, 0.14);
  color: #ffb3b3;
}

.coupon-item small {
  display: block;
  margin-bottom: 8px;
  color: var(--text-sub);
}

.coupon-meta {
  margin: 10px 0 0;
  color: var(--text-sub);
  font-size: 13px;
}

.empty {
  color: var(--text-sub);
  padding: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 16px;
}
</style>
