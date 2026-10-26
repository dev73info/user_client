<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  getMyPoints,
  listMallProducts,
  listMyPromoCards,
  listMyRedeemOrders,
  promoCardLabel,
  redeemMallProduct,
  type PointsProduct,
  type PointsRedeemOrder,
  type PromoCard,
  type UserPerk,
} from '@/api/points'
import MallProductCard from '@/components/points/MallProductCard.vue'
import { describeBackendError } from '@/shared/backendErrorText'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'
import { TButton, TEmpty, TMessage, TMessageBox, TTable, TTableColumn, TTag } from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()
const balance = ref(0)
const products = ref<PointsProduct[]>([])
const orders = ref<PointsRedeemOrder[]>([])
const promoCards = ref<PromoCard[]>([])
const loading = ref(false)
const loadError = ref('')
const redeemingId = ref<number | null>(null)
const ownedPerks = ref<Set<string>>(new Set())

function permissionPerkCode(product: PointsProduct) {
  if (product.kind !== 'permission') return null
  if (product.perk_code?.trim()) return product.perk_code
  if (product.name.includes('动态背景')) return 'home_background_dynamic'
  if (product.name.includes('静态背景')) return 'home_background_static'
  if (product.name.includes('用户名渐变')) return 'username_gradient'
  if (product.name.includes('特定颜色') || product.name.includes('用户名颜色'))
    return 'username_color'
  return null
}

function ownsPerk(perk: UserPerk) {
  if (!perk.owned) return false
  const expiry = perk.expires_at ? parseBackendDateTime(perk.expires_at) : null
  return !perk.expires_at || (expiry?.getTime() ?? 0) > Date.now()
}

const isOwned = (product: PointsProduct) => {
  const code = permissionPerkCode(product)
  return Boolean(code && ownedPerks.value.has(code))
}

function orderStatusLabel(status: string) {
  if (status === 'pending') return '待处理'
  if (status === 'fulfilled') return '已完成'
  return '已拒绝'
}
function orderStatusTagType(status: string) {
  if (status === 'pending') return 'warning'
  if (status === 'fulfilled') return 'success'
  return 'danger'
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const [me, prods, ords, cards] = await Promise.all([
      getMyPoints(auth.token),
      listMallProducts(auth.token),
      listMyRedeemOrders(auth.token),
      listMyPromoCards(auth.token, 'unused'),
    ])
    balance.value = me.points_balance
    ownedPerks.value = new Set(me.perks.filter(ownsPerk).map((perk) => perk.perk_code))
    products.value = prods
    orders.value = ords
    promoCards.value = cards
  } catch (err) {
    loadError.value = describeBackendError(err, '加载积分商城失败')
  } finally {
    loading.value = false
  }
}

async function redeem(product: PointsProduct) {
  if (redeemingId.value) return
  if (isOwned(product)) {
    TMessage.info('你已永久拥有该权益，无需重复兑换')
    return
  }
  const confirmed = await TMessageBox.confirm({
    title: '兑换商品',
    content: `确认用 ${product.points_cost} 积分兑换“${product.name}”吗？`,
    confirmText: '兑换',
    cancelText: '取消',
  })
  if (!confirmed) return
  redeemingId.value = product.id
  try {
    await redeemMallProduct(auth.token, product.id)
    TMessage.success('兑换成功')
    await loadAll()
  } catch (err) {
    TMessage.error(describeBackendError(err, '兑换失败'))
  } finally {
    redeemingId.value = null
  }
}

function goUsePromoCards() {
  void router.push({ name: 'dev-resource-list' })
}

onMounted(async () => {
  auth.hydrate()
  if (!auth.isAuthed) {
    await router.replace('/')
    return
  }
  await loadAll()
})
</script>

<template>
  <main class="portal-page portal-page--nav mall-page">
    <div class="mall-balance">
      <h2>积分商城</h2>
      <div class="mall-balance__num">
        <span>当前积分</span>
        <strong>{{ balance }}</strong>
      </div>
    </div>
    <p v-if="loading" class="wb-empty" role="status">正在加载商城…</p>
    <div v-else-if="loadError" class="wb-empty" role="alert">
      <span>{{ loadError }}</span>
      <TButton variant="outline" @click="loadAll">重试</TButton>
    </div>
    <template v-else>
      <div class="mall-products">
        <h3>可兑换</h3>
        <div v-if="products.length" class="mall-grid">
          <MallProductCard
            v-for="product in products"
            :key="product.id"
            :product="product"
            :owned="isOwned(product)"
            :insufficient-points="balance < product.points_cost"
            :busy="redeemingId === product.id"
            @redeem="redeem(product)"
          />
        </div>
        <TEmpty v-else description="商城暂无可兑换内容" />
      </div>
      <div class="mall-orders">
        <h3>我的道具卡</h3>
        <TTable v-if="promoCards.length" :data="promoCards" stripe>
          <TTableColumn label="道具" min-width="160">
            <template #default="{ row }">{{ promoCardLabel(row.card_code) }}</template>
          </TTableColumn>
          <TTableColumn label="有效天数" width="100" align="center">
            <template #default="{ row }">{{ row.duration_days }} 天</template>
          </TTableColumn>
          <TTableColumn prop="created_at" label="获得时间" width="180" />
          <TTableColumn label="操作" width="120" align="center">
            <template #default>
              <TButton variant="outline" tone="accent" size="sm" @click="goUsePromoCards">
                去使用
              </TButton>
            </template>
          </TTableColumn>
        </TTable>
        <TEmpty v-else description="背包暂无未使用的道具卡" />
      </div>
      <div class="mall-orders">
        <h3>我的兑换</h3>
        <TTable v-if="orders.length" :data="orders" stripe>
          <TTableColumn prop="product_name" label="商品" min-width="180" show-overflow-tooltip />
          <TTableColumn prop="points_cost" label="积分" width="90" align="center" />
          <TTableColumn label="状态" width="100" align="center">
            <template #default="{ row }">
              <TTag :tone="orderStatusTagType(row.status)" size="sm">
                {{ orderStatusLabel(row.status) }}
              </TTag>
            </template>
          </TTableColumn>
          <TTableColumn prop="handle_note" label="备注" min-width="140" show-overflow-tooltip />
          <TTableColumn prop="created_at" label="时间" width="180" />
        </TTable>
        <TEmpty v-else description="暂无兑换记录" />
      </div>
    </template>
  </main>
</template>

<style scoped>
.mall-page.portal-page {
  margin-top: 0;
}
.mall-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 14px;
  background: var(--73-app-grad-accent-soft-14);
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  color: var(--73-ink);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--73-accent) 8%, transparent);
}
.mall-balance h2 {
  margin: 0;
  font-size: 20px;
}
.mall-balance__num {
  text-align: center;
  flex-shrink: 0;
}
.mall-balance__num span {
  display: block;
  font-size: 12px;
  color: var(--73-ink-muted);
  margin-bottom: 4px;
}
.mall-balance__num strong {
  font-size: 32px;
  line-height: 1;
  color: var(--73-accent);
}
.mall-products h3,
.mall-orders h3 {
  font-size: 17px;
  margin: 0 0 14px;
}
.mall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.mall-products,
.mall-orders {
  margin-top: 24px;
}
</style>
