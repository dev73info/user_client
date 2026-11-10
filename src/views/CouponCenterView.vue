<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { TButton, TIcon, Refresh, TMessage } from 'ui_73info'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { formatCouponDiscount, formatCouponRange } from '@/shared/couponDisplay'
import { formatFenAsCny } from '@/shared/money'
import { useAuthStore } from '@/stores/auth'

/* 「我的背包 → 优惠券中心」：券包按满减 / 折扣分两组，点券行复制券码。

   字段按契约 `CouponResponse` 读：金额是整数分（`amount_off_fen` / `min_amount_fen` /
   `max_discount_fen`，展示走 `@/shared/money`），优惠百分比是整数基点 `discount_bps`
   （2000 = 优惠 20%），时间是东八区墙钟串（走 `@/shared/datetime`）。

   **不提供「去使用」**：2.0 的支付链路（定金 / 尾款 / 资源购买 / 打赏）都不接优惠券，
   后端也没有「用券抵扣」的下单入口，所以这一页只做查看与复制券码。 */

const router = useRouter()
const auth = useAuthStore()

const coupons = ref<CouponItem[]>([])
const loading = ref(false)
const couponFilter = ref<'all' | 'usable' | 'amount' | 'percent'>('all')

const amountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'amount'),
)
const discountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'percent'),
)
/** 读数条口径：可用券不含已核销的，与账户页「可用券」的说法一致。 */
const usableCoupons = computed(() => coupons.value.filter((item) => item.status !== 'used'))

/** 两组券包共用同一份行模板；顺序固定满减在前。分组计数徽标报本组总数，不随筛选变化。 */
const couponGroups = computed(() => {
  const groups = [
    { key: 'amount', title: '满减优惠券', empty: '暂无满减优惠券', all: amountCoupons.value },
    { key: 'percent', title: '折扣优惠券', empty: '暂无折扣优惠券', all: discountCoupons.value },
  ].filter(
    (group) =>
      couponFilter.value === 'all' ||
      couponFilter.value === 'usable' ||
      group.key === couponFilter.value,
  )
  return groups.map((group) => ({
    key: group.key,
    title: group.title,
    empty: group.empty,
    count: group.all.length,
    items:
      couponFilter.value === 'usable'
        ? group.all.filter((item) => item.status !== 'used')
        : group.all,
  }))
})
const visibleCouponCount = computed(() =>
  couponGroups.value.reduce((total, group) => total + group.items.length, 0),
)

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
  <main
    class="page-shell custom-page-shell profile-page coupons-page wb-sheet"
    :aria-busy="loading"
  >
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="优惠券概览">
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': couponFilter === 'all' }"
          type="button"
          :aria-pressed="couponFilter === 'all'"
          @click="couponFilter = 'all'"
        >
          <span class="wb-strip__label">全部</span>
          <span class="wb-strip__value">{{ loading ? '—' : coupons.length }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': couponFilter === 'usable' }"
          type="button"
          :aria-pressed="couponFilter === 'usable'"
          @click="couponFilter = 'usable'"
        >
          <span class="wb-strip__label">可用优惠券</span>
          <span class="wb-strip__value">{{ loading ? '—' : usableCoupons.length }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': couponFilter === 'amount' }"
          type="button"
          :aria-pressed="couponFilter === 'amount'"
          @click="couponFilter = 'amount'"
        >
          <span class="wb-strip__label">满减券</span>
          <span class="wb-strip__value">{{ loading ? '—' : amountCoupons.length }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': couponFilter === 'percent' }"
          type="button"
          :aria-pressed="couponFilter === 'percent'"
          @click="couponFilter = 'percent'"
        >
          <span class="wb-strip__label">折扣券</span>
          <span class="wb-strip__value">{{ loading ? '—' : discountCoupons.length }}</span>
        </button>
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

      <p v-if="loading && !coupons.length" class="wb-empty" role="status">正在加载券包…</p>
      <p v-else-if="!coupons.length" class="wb-empty" role="status">
        <span class="wb-empty__title">暂无优惠券</span>
      </p>
      <div v-else-if="!visibleCouponCount" class="wb-empty" role="status">
        <span class="wb-empty__title">没有符合条件的优惠券</span>
        <div class="wb-empty__actions">
          <TButton variant="outline" @click="couponFilter = 'all'">清除筛选</TButton>
        </div>
      </div>
      <div v-else class="coupon-groups">
        <section
          v-for="group in couponGroups"
          :key="group.key"
          class="coupon-group"
          :aria-label="group.title"
        >
          <div class="coupon-group__head">
            <strong class="wb-subhead">{{ group.title }}</strong>
            <span class="wb-badge">{{ group.count }}</span>
          </div>
          <p v-if="!group.items.length" class="wb-empty" role="status">{{ group.empty }}</p>
          <ul v-else class="wb-list" :aria-label="`${group.title}列表`">
            <li
              v-for="item in group.items"
              :key="item.code"
              class="wb-item wb-item--clickable"
              tabindex="0"
              @click="copyCouponCode(item.code)"
              @keydown.enter.prevent="copyCouponCode(item.code)"
              @keydown.space.prevent="copyCouponCode(item.code)"
            >
              <div class="wb-item__main">
                <div class="wb-item__title-row">
                  <span class="wb-item__title">{{ item.code }}</span>
                  <span class="wb-badge" :class="{ 'wb-badge--success': item.status !== 'used' }">
                    {{ item.status === 'used' ? '已使用' : '可用' }}
                  </span>
                </div>
                <span class="wb-item__meta">{{ item.name }}</span>
                <span class="wb-item__meta">{{ formatCouponDiscount(item) }}</span>
                <span class="wb-item__meta">
                  门槛 ¥{{ formatFenAsCny(item.min_amount_fen) }} · {{ formatCouponRange(item) }}
                </span>
              </div>
              <div class="wb-item__side">
                <TButton variant="outline" @click.stop="copyCouponCode(item.code)" @keydown.stop>
                  复制券码
                </TButton>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-list / .wb-item / .wb-empty / .wb-badge），
   本页只留「两组券包」的纵向排布。 */
.coupon-groups,
.coupon-group {
  display: grid;
  gap: 12px;
}

.coupon-group {
  gap: 10px;
}

.coupon-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
