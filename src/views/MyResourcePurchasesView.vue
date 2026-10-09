<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'

import {
  listMyResourcePurchases,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import { getResourceDetailSlug } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  formatPurchaseAmountLabel,
  resourcePurchaseStatusLabel,
} from '@/shared/resourceSale'

import {
  TButton,
  TIcon,
  Refresh,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const orders = ref<ResourcePurchaseOrder[]>([])

const paidCount = computed(() => orders.value.filter((item) => item.status === 'paid').length)
const refundingCount = computed(() => orders.value.filter((item) => item.status === 'refunding').length)
const refundedCount = computed(() => orders.value.filter((item) => item.status === 'refunded').length)

async function loadOrders() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }
  loading.value = true
  try {
    orders.value = await listMyResourcePurchases(auth.token, { limit: 100 })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载已购资源失败', 'error')
  } finally {
    loading.value = false
  }
}

function openResource(order: ResourcePurchaseOrder) {
  void router.push({
    name: 'resource-detail-direct',
    params: {
      resourceSlug: getResourceDetailSlug(order.resource_id, order.seller || 'resource'),
    },
  })
}

onMounted(() => {
  void loadOrders()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page" :aria-busy="loading">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="已购资源概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">订单数</span>
          <span class="wb-strip__value">{{ loading ? '—' : orders.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">有效已购</span>
          <span class="wb-strip__value">{{ loading ? '—' : paidCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">退款中</span>
          <span class="wb-strip__value">{{ loading ? '—' : refundingCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已退款</span>
          <span class="wb-strip__value">{{ loading ? '—' : refundedCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新已购列表" @click="loadOrders">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的已购资源</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="outline" @click="router.push({ name: 'free-resources' })">
            浏览资源
          </TButton>
        </div>
      </div>

      <p v-if="loading && !orders.length" class="wb-empty" role="status">正在加载已购资源…</p>
      <div v-else-if="!orders.length" class="wb-empty">
        <span class="wb-empty__title">还没有购买记录</span>
        在资源详情页购买付费资源后，订单会出现在这里。退款由卖家或平台发起，如需退款请联系卖家或客服。
      </div>
      <ul v-else class="wb-list" aria-label="已购资源订单">
        <li v-for="order in orders" :key="order.order_no" class="wb-item">
          <div class="wb-item__main">
            <button type="button" class="wb-item__title purchases__title" @click="openResource(order)">
              {{ order.resource_title || `资源 #${order.resource_id}` }}
            </button>
            <span class="wb-item__meta">
              订单 {{ order.order_no }} · {{ resourcePurchaseStatusLabel(order.status) }} ·
              {{ formatPurchaseAmountLabel(order) }}
            </span>
            <span class="wb-item__meta">
              卖家 {{ order.seller }}
              <template v-if="order.first_downloaded_at"> · 已下载</template>
              <template v-else-if="order.status === 'paid'"> · 未下载</template>
              <template v-if="order.entitlement_revoked"> · 下载权已被退款收回</template>
            </span>
            <span v-if="order.status === 'paid'" class="wb-item__meta">
              退款由卖家或平台发起，如需退款请联系卖家或客服。
            </span>
          </div>
          <div class="wb-item__actions">
            <TButton variant="outline" @click="openResource(order)">查看资源</TButton>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.purchases__title {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.wb-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
