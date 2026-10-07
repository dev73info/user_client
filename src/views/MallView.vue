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
} from '@/api/points'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'


import { TButton, TEmpty, TMessage, TTable, TTableColumn, TTag } from 'ui_73info'
const router = useRouter()
const auth = useAuthStore()

const balance = ref(0)
const products = ref<PointsProduct[]>([])
const orders = ref<PointsRedeemOrder[]>([])
const promoCards = ref<PromoCard[]>([])
const loading = ref(false)
const redeemingId = ref<number | null>(null)
const ownedPerks = ref<Set<string>>(new Set())

function permissionPerkCode(product: PointsProduct) {
  if (product.kind !== 'permission') return null
  // 正式关联：优先使用商品绑定的 perk_code；兼容老数据按名称兜底。
  if (product.perk_code?.trim()) return product.perk_code
  if (product.name.includes('动态背景')) return 'home_background_dynamic'
  if (product.name.includes('静态背景')) return 'home_background_static'
  if (product.name.includes('用户名渐变')) return 'username_gradient'
  if (product.name.includes('特定颜色') || product.name.includes('用户名颜色')) return 'username_color'
  return null
}

const isOwned = (product: PointsProduct) =>
  Boolean(permissionPerkCode(product) && ownedPerks.value.has(permissionPerkCode(product)!))

function kindLabel(kind: string) {
  if (kind === 'permission') return '权限'
  if (kind === 'badge') return '徽章'
  if (kind === 'consumable') return '消耗卡'
  return '商品'
}
function durationLabel(days: number) {
  return days == null || days < 0 ? '永久' : `${days} 天`
}
function consumableHint(product: PointsProduct) {
  if (product.kind !== 'consumable') return ''
  if (product.perk_code === 'resource_featured_card') return '资源精选卡 · 使用后进入首页精选'
  if (product.perk_code === 'resource_pin_card') return '资源置顶卡 · 提升曝光，无精选角标'
  return '兑换后放入背包，请到我的资源使用'
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
  try {
    const [me, prods, ords, cards] = await Promise.all([
      getMyPoints(auth.token),
      listMallProducts(auth.token),
      listMyRedeemOrders(auth.token),
      listMyPromoCards(auth.token, 'unused'),
    ])
    balance.value = me.points_balance
    ownedPerks.value = new Set(
      (me.perks ?? [])
        .filter((perk) => perk.owned && !perk.expires_at)
        .map((perk) => perk.perk_code),
    )
    products.value = prods
    orders.value = ords
    promoCards.value = cards
  } catch (err) {
    TMessage.error(err instanceof HttpError ? err.message : '加载积分商城失败')
  } finally {
    loading.value = false
  }
}

async function redeem(product: PointsProduct) {
  if (isOwned(product)) {
    TMessage.info('你已永久拥有该权益，无需重复兑换')
    return
  }

  if (!window.confirm(`确认用 ${product.points_cost} 积分兑换“${product.name}”吗？`)) {
    return
  }
  redeemingId.value = product.id
  try {
    await redeemMallProduct(auth.token, product.id)
    if (product.kind === 'consumable') {
      TMessage.success('已放入背包，请到我的资源使用')
    } else {
      TMessage.success('兑换成功')
    }
    await loadAll()
  } catch (err) {
    const message = err instanceof HttpError ? err.message : ''
    TMessage.error(message === 'you already own this perk' ? '你已永久拥有该权益，无需重复兑换' : message || '兑换失败')
  } finally {
    redeemingId.value = null
  }
}

function goUsePromoCards() {
  router.push({ name: 'dev-resource-list' }).catch(() => {
    router.push('/workbench/developer/resources/list')
  })
}

onMounted(async () => {
  auth.hydrate()
  if (!auth.isAuthed) {
    router.replace('/')
    return
  }
  await loadAll()
})
</script>

<template>
  <div class="mall-page">
    <div class="mall-balance">
      <div>
        <h2>积分商城</h2>
      </div>
      <div class="mall-balance__num">
        <span>当前积分</span>
        <strong>{{ balance }}</strong>
      </div>
    </div>

    <div class="mall-products">
      <h3>可兑换</h3>
      <div v-if="products.length" class="mall-grid">
        <div v-for="product in products" :key="product.id" class="mall-card">
          <div class="mall-card__body">
            <div class="mall-card__head">
              <span class="mall-card__kind">{{ kindLabel(product.kind) }}</span>
              <span class="mall-card__cost">{{ product.points_cost }} 积分</span>
            </div>
            <h4>{{ product.name }}</h4>
            <p class="mall-card__duration">有效期：{{ durationLabel(product.duration_days) }} · 库存：{{ product.stock }}</p>
            <p v-if="consumableHint(product)" class="mall-card__hint">{{ consumableHint(product) }}</p>
            <TButton variant="solid" tone="accent" :disabled="isOwned(product) || balance < product.points_cost || product.stock <= 0"
              :loading="redeemingId === product.id" style="width: 100%" @click="redeem(product)">
              {{ isOwned(product) ? '已拥有' : product.stock <= 0 ? '已售罄' : balance < product.points_cost ? '积分不足' : '立即兑换' }}
            </TButton>
          </div>
        </div>
      </div>
      <TEmpty v-else-if="!loading" description="商城暂无可兑换内容" />
    </div>

    <div class="mall-orders">
      <h3>我的道具卡</h3>
      <p class="mall-promo-tip">未使用的精选卡 / 置顶卡；请到「我的资源」选定资源后使用。</p>
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
            <TButton variant="outline" tone="accent" size="sm" @click="goUsePromoCards">去使用</TButton>
          </template>
        </TTableColumn>
      </TTable>
      <TEmpty v-else-if="!loading" description="背包暂无未使用的道具卡" />
    </div>

    <div class="mall-orders">
      <h3>我的兑换</h3>
      <TTable v-if="orders.length" :data="orders" stripe>
        <TTableColumn prop="product_name" label="商品" min-width="180" show-overflow-tooltip />
        <TTableColumn prop="points_cost" label="积分" width="90" align="center" />
        <TTableColumn label="状态" width="100" align="center">
          <template #default="{ row }">
            <TTag :tone="orderStatusTagType(row.status)" size="sm">{{ orderStatusLabel(row.status) }}</TTag>
          </template>
        </TTableColumn>
        <TTableColumn prop="handle_note" label="备注" min-width="140" show-overflow-tooltip />
        <TTableColumn prop="created_at" label="时间" width="180" />
      </TTable>
      <TEmpty v-else-if="!loading" description="暂无兑换记录" />
    </div>
  </div>
</template>

<style scoped>
.mall-page {
  max-width: 900px;
  margin: 0 auto;
}
.mall-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, #eef4ff 0%, #f7faff 55%, #ffffff 100%);
  border: 1px solid rgba(224, 232, 255, 0.96);
  color: #0f172a;
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
  margin-bottom: 24px;
}
.mall-balance h2 {
  margin: 0 0 6px;
  font-size: 22px;
}
.mall-balance p {
  margin: 0;
  opacity: 0.85;
  font-size: 13px;
}
.mall-balance__num {
  text-align: center;
  flex-shrink: 0;
}
.mall-balance__num span {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.mall-balance__num strong {
  font-size: 40px;
  line-height: 1;
  color: #4f8cff;
}
.mall-products,
.mall-orders {
  margin-bottom: 28px;
}
.mall-products h3,
.mall-orders h3 {
  font-size: 17px;
  margin: 0 0 14px;
}
.mall-card__hint,
.mall-promo-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.mall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.mall-card {
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.mall-card:hover {
  border-color: rgba(147, 197, 253, 0.96);
  box-shadow: 0 14px 28px rgba(76, 103, 172, 0.12);
  transform: translateY(-2px);
}
.mall-card__body {
  padding: 14px;
}
.mall-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.mall-card__kind {
  font-size: 12px;
  color: #164e63;
  background: #cffafe;
  padding: 2px 8px;
  border-radius: 6px;
}
.mall-card__cost {
  font-size: 14px;
  font-weight: 700;
  color: #1d4ed8;
}
.mall-card h4 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #0f172a;
}
.mall-card__duration {
  margin: 0 0 8px;
  color: #1e40af;
  font-size: 12px;
}
</style>
