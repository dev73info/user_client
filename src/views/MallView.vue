<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import {
  listMallProducts,
  listMyRedeemOrders,
  redeemMallProduct,
  type PointsProduct,
  type PointsRedeemOrder,
} from '@/api/points'
import { getMyPoints } from '@/api/points'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const balance = ref(0)
const products = ref<PointsProduct[]>([])
const orders = ref<PointsRedeemOrder[]>([])
const loading = ref(false)
const redeemingId = ref<number | null>(null)

function kindLabel(kind: string) {
  if (kind === 'permission') return '权限'
  if (kind === 'badge') return '徽章'
  return '商品'
}
function durationLabel(days: number) {
  return days == null || days < 0 ? '永久' : `${days} 天`
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
    const [me, prods, ords] = await Promise.all([
      getMyPoints(auth.token),
      listMallProducts(auth.token),
      listMyRedeemOrders(auth.token),
    ])
    balance.value = me.points_balance
    products.value = prods
    orders.value = ords
  } catch (err) {
    ElMessage.error(err instanceof HttpError ? err.message : '加载积分商城失败')
  } finally {
    loading.value = false
  }
}

async function redeem(product: PointsProduct) {
  if (!window.confirm(`确认用 ${product.points_cost} 积分兑换“${product.name}”吗？`)) {
    return
  }
  redeemingId.value = product.id
  try {
    await redeemMallProduct(auth.token, product.id)
    ElMessage.success('兑换成功')
    await loadAll()
  } catch (err) {
    ElMessage.error(err instanceof HttpError ? err.message : '兑换失败')
  } finally {
    redeemingId.value = null
  }
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
          <div v-if="product.image_url" class="mall-card__img">
            <img :src="product.image_url" :alt="product.name" />
          </div>
          <div class="mall-card__body">
            <div class="mall-card__head">
              <span class="mall-card__kind">{{ product.category || '其他' }} · {{ kindLabel(product.kind) }}</span>
              <span class="mall-card__cost">{{ product.points_cost }} 积分</span>
            </div>
            <h4>{{ product.name }}</h4>
            <p class="mall-card__duration">有效期：{{ durationLabel(product.duration_days) }} · 库存：{{ product.stock }}</p>
            <p v-if="product.description" class="mall-card__desc">{{ product.description }}</p>
            <el-button type="primary" :disabled="balance < product.points_cost || product.stock <= 0"
              :loading="redeemingId === product.id" style="width: 100%" @click="redeem(product)">
              {{ product.stock <= 0 ? '已售罄' : balance < product.points_cost ? '积分不足' : '立即兑换' }}
            </el-button>
          </div>
        </div>
      </div>
      <el-empty v-else-if="!loading" description="商城暂无可兑换内容" />
    </div>

    <div class="mall-orders">
      <h3>我的兑换</h3>
      <el-table v-if="orders.length" :data="orders" stripe>
        <el-table-column prop="product_name" label="商品" min-width="180" show-overflow-tooltip />
        <el-table-column prop="points_cost" label="积分" width="90" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="orderStatusTagType(row.status)" size="small">{{ orderStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="handle_note" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="180" />
      </el-table>
      <el-empty v-else-if="!loading" description="暂无兑换记录" />
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
.mall-card__img {
  height: 120px;
  background: #eef4ff;
}
.mall-card__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
.mall-card__desc {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  min-height: 18px;
}
.mall-card__duration {
  margin: 0 0 8px;
  color: #1e40af;
  font-size: 12px;
}
</style>
