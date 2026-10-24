<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { TButton, TIcon, Refresh, TMessage } from 'ui_73info'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { formatCouponDiscount, formatCouponRange } from '@/shared/couponDisplay'
import { formatFenAsCny } from '@/shared/money'
import { useAuthStore } from '@/stores/auth'

/* 「我的背包 → 优惠券中心」：券包按满减 / 折扣分两组，点券卡复制券码。

   字段按契约 `CouponResponse` 读：金额是整数分（`amount_off_fen` / `min_amount_fen` /
   `max_discount_fen`，展示走 `@/shared/money`），优惠百分比是整数基点 `discount_bps`
   （2000 = 优惠 20%），时间是东八区墙钟串（走 `@/shared/datetime`）。

   **不提供「去使用」**：2.0 的支付链路（定金 / 尾款 / 资源购买 / 打赏）都不接优惠券，
   后端也没有「用券抵扣」的下单入口，所以这一页只做查看与复制券码。 */

const router = useRouter()
const auth = useAuthStore()

const coupons = ref<CouponItem[]>([])
const loading = ref(false)

const amountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'amount'),
)
const discountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'percent'),
)
/** 读数条口径：可用券不含已核销的，与账户页「可用券」的说法一致。 */
const usableCoupons = computed(() => coupons.value.filter((item) => item.status !== 'used'))

async function copyCouponCode(code: string) {
  const value = code.trim()
  if (!value) {
    TMessage.error('券码为空，无法复制')
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    TMessage.success('券码已复制')
  } catch {
    TMessage.error('复制失败，请手动复制')
  }
}

async function loadCoupons() {
  auth.hydrate()
  if (!auth.isAuthed) {
    coupons.value = []
    return
  }

  loading.value = true
  try {
    coupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '加载券包失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  if (!auth.isAuthed) {
    router.replace('/')
    return
  }
  void loadCoupons()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page coupons-page" :aria-busy="loading">
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="优惠券概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">可用优惠券</span>
          <span class="wb-strip__value">{{ loading ? '—' : usableCoupons.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">满减券</span>
          <span class="wb-strip__value">{{ loading ? '—' : amountCoupons.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">折扣券</span>
          <span class="wb-strip__value">{{ loading ? '—' : discountCoupons.length }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新券包" @click="loadCoupons">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">优惠券</h3>
        </div>
      </div>

      <p class="coupon-hint" role="note">
        券码可复制留存。当前的支付链路（定金、尾款、资源购买、打赏）都不支持优惠券抵扣，
        页面不提供「去使用」入口。
      </p>

      <p v-if="loading" class="wb-empty" role="status">正在加载券包…</p>
      <p v-else-if="!coupons.length" class="wb-empty" role="status">
        <span class="wb-empty__title">暂无优惠券</span>
      </p>
      <div v-else class="coupon-groups">
        <div class="wb-panel coupon-group">
          <div class="wb-panel__head">
            <strong class="wb-subhead">满减优惠券</strong>
            <span class="wb-badge">{{ amountCoupons.length }}</span>
          </div>
          <p v-if="amountCoupons.length === 0" class="wb-empty" role="status">暂无满减优惠券</p>
          <div v-else class="coupon-items">
            <button
              v-for="item in amountCoupons"
              :key="item.code"
              type="button"
              class="coupon-item"
              @click="copyCouponCode(item.code)"
            >
              <div class="coupon-item__head">
                <strong>{{ item.code }}</strong>
                <span class="wb-badge" :class="{ 'wb-badge--success': item.status !== 'used' }">
                  {{ item.status === 'used' ? '已使用' : '可用' }}
                </span>
              </div>
              <small>{{ item.name }}</small>
              <p>{{ formatCouponDiscount(item) }}</p>
              <p class="coupon-item__meta">
                门槛 ¥{{ formatFenAsCny(item.min_amount_fen) }} · {{ formatCouponRange(item) }}
              </p>
            </button>
          </div>
        </div>

        <div class="wb-panel coupon-group">
          <div class="wb-panel__head">
            <strong class="wb-subhead">折扣优惠券</strong>
            <span class="wb-badge">{{ discountCoupons.length }}</span>
          </div>
          <p v-if="discountCoupons.length === 0" class="wb-empty" role="status">暂无折扣优惠券</p>
          <div v-else class="coupon-items">
            <button
              v-for="item in discountCoupons"
              :key="item.code"
              type="button"
              class="coupon-item"
              @click="copyCouponCode(item.code)"
            >
              <div class="coupon-item__head">
                <strong>{{ item.code }}</strong>
                <span class="wb-badge" :class="{ 'wb-badge--success': item.status !== 'used' }">
                  {{ item.status === 'used' ? '已使用' : '可用' }}
                </span>
              </div>
              <small>{{ item.name }}</small>
              <p>{{ formatCouponDiscount(item) }}</p>
              <p class="coupon-item__meta">
                门槛 ¥{{ formatFenAsCny(item.min_amount_fen) }} · {{ formatCouponRange(item) }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-empty / .wb-badge / .wb-panel / .wb-subhead），
   本页只留「券卡网格」这一块统一层没有提供的布局：
   券卡是「点一下就复制券码」的整块可点区，不是列表行，所以保留网格；
   描边、圆角、悬停与状态标签都取统一层那一套。
   分组块（.coupon-group）与组名走统一层的 .wb-panel / .wb-subhead：
   它原先自带一份 12px 内边距 + 12px 圆角 + 13px 组名，与权益页的面板一格之差，两页各写一份。 */

.coupon-hint {
  margin: 0 0 12px;
  color: var(--profile-text-sub);
  font-size: 12px;
  line-height: 1.6;
}

.coupon-groups {
  display: grid;
  gap: 12px;
}

.coupon-items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.coupon-item {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--wb-line);
  border-radius: var(--wb-radius-item);
  background: var(--profile-card-bg-strong);
  color: var(--profile-text-sub);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.coupon-item:hover,
.coupon-item:focus-visible {
  border-color: var(--wb-accent-line);
  box-shadow: var(--wb-shadow);
}

.coupon-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.coupon-item__head strong {
  color: var(--profile-text-main);
  font-size: 14px;
}

.coupon-item p {
  margin: 0;
  color: var(--profile-text-main);
  font-size: 13px;
  font-weight: 700;
}

.coupon-item__meta {
  color: var(--profile-text-sub) !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 1.6;
}
</style>
