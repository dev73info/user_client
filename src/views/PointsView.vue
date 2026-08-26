<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { listMyCommentWarnings, type CommentWarning } from '@/api/community'
import { getMyPoints, setPerkEquipped, type UserPerk, type UserPointsLog } from '@/api/points'
import { HttpError } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const pointsBalance = ref(0)
const logs = ref<UserPointsLog[]>([])
const loading = ref(false)
const error = ref('')
const perks = ref<UserPerk[]>([])
const perkSaving = ref('')
const commentWarnings = ref<CommentWarning[]>([])

const couponLoading = ref(false)
const coupons = ref<CouponItem[]>([])
const { showToast } = useToast()

const logPage = ref(1)
const logPageSize = 10
const pagedLogs = computed(() => {
  const start = (logPage.value - 1) * logPageSize
  return logs.value.slice(start, start + logPageSize)
})
const logTotal = computed(() => logs.value.length)

const amountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'amount'),
)
const discountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'percent'),
)

function deltaTagType(delta: number) {
  return delta > 0 ? 'success' : 'danger'
}

async function loadPoints() {
  loading.value = true
  error.value = ''
  try {
    const data = await getMyPoints(auth.token)
    pointsBalance.value = data.points_balance
    logs.value = data.logs
    perks.value = data.perks ?? []
    initUsernameAppearance()
  } catch (err) {
    error.value = err instanceof HttpError ? err.message : '加载积分失败'
  } finally {
    loading.value = false
  }
}

async function loadCommentWarnings() {
  try {
    commentWarnings.value = await listMyCommentWarnings(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载评论警告失败', 'error')
  }
}

function perkTitle(code: string) {
  if (code === 'username_gradient') return '用户名渐变'
  if (code.startsWith('username_color')) {
    const hex = code.split(':')[1] ?? ''
    return hex ? `用户名特定颜色 #${hex}` : '用户名特定颜色'
  }
  if (code === 'home_background_static') return '主页静态背景自定义'
  if (code === 'home_background_dynamic') return '主页动态背景自定义'
  return code
}

function perkExpireText(perk: UserPerk) {
  if (!perk.expires_at) return '永久有效'
  return `有效期至 ${perk.expires_at}`
}

// 用户名颜色设置：渐变/特定颜色由统一面板管理，权益列表不再散落展示。
const colorPerks = computed(() =>
  perks.value.filter((p) => p.perk_code.startsWith('username_color:') && p.owned),
)
const gradientPerk = computed(() =>
  perks.value.find((p) => p.perk_code === 'username_gradient' && p.owned),
)
const hasUsernameAppearance = computed(() => !!gradientPerk.value || colorPerks.value.length > 0)
const displayedPerks = computed(() =>
  perks.value.filter(
    (p) => p.perk_code !== 'username_gradient' && !p.perk_code.startsWith('username_color'),
  ),
)
const appearanceSaving = ref(false)
const appearanceMode = ref<'gradient' | 'color'>('gradient')
const selectedColor = ref('')

function perkCodeHex(code: string): string {
  const hex = code.split(':')[1] ?? ''
  return hex ? `#${hex}` : ''
}
function initUsernameAppearance() {
  const equippedColor = perks.value.find(
    (p) => p.perk_code.startsWith('username_color:') && p.equipped,
  )
  if (equippedColor) {
    appearanceMode.value = 'color'
    selectedColor.value = equippedColor.perk_code
  } else {
    appearanceMode.value = 'gradient'
  }
}
async function saveAppearance() {
  if (!auth.token || appearanceSaving.value) return
  appearanceSaving.value = true
  try {
    if (appearanceMode.value === 'gradient') {
      await setPerkEquipped(auth.token, 'username_gradient', true)
    } else {
      if (!selectedColor.value) {
        showToast('请选择颜色', 'warning')
        return
      }
      await setPerkEquipped(auth.token, selectedColor.value, true)
    }
    showToast('用户名颜色设置已更新', 'success')
    await loadPoints()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '设置用户名颜色失败', 'error')
  } finally {
    appearanceSaving.value = false
  }
}

async function togglePerk(code: string, value: boolean | string | number) {
  const equipped = Boolean(value)
  perkSaving.value = code
  try {
    const res = await setPerkEquipped(auth.token, code, equipped)
    const idx = perks.value.findIndex((p) => p.perk_code === code)
    if (idx >= 0) perks.value.splice(idx, 1, res)
    else perks.value.push(res)
    showToast(equipped ? `已佩戴「${perkTitle(code)}」` : `已卸下「${perkTitle(code)}」`, 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新权益佩戴状态失败', 'error')
  } finally {
    perkSaving.value = ''
  }
}



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
    coupons.value = []
    return
  }

  couponLoading.value = true
  try {
    coupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载券包失败', 'error')
  } finally {
    couponLoading.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  if (!auth.isAuthed) {
    router.replace('/')
    return
  }
  await Promise.all([loadPoints(), loadCoupons(), loadCommentWarnings()])
})
</script>

<template>
  <div class="points-page profile-page">
    <div class="points-hero">
      <div>
        <h2>我的背包</h2>
        <p>通过发布资源、发布需求以及资源的互动获得积分</p>
      </div>
      <div class="points-hero__balance">
        <span>当前积分</span>
        <strong>{{ pointsBalance }}</strong>
      </div>
    </div>

    <p v-if="error" class="points-error">{{ error }}</p>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3>我的权益</h3>
          <small class="requirement-note">管理已解锁的积分商城权益。</small>
        </div>
      </div>
      <div v-if="displayedPerks.length" class="perk-list">
        <div v-for="perk in displayedPerks" :key="perk.perk_code" class="perk-item">
          <div class="perk-item__info">
            <strong>{{ perkTitle(perk.perk_code) }}</strong>
            <small class="requirement-note">{{ perkExpireText(perk) }}</small>
          </div>
          <el-switch :model-value="perk.equipped" :disabled="perkSaving === perk.perk_code"
            :loading="perkSaving === perk.perk_code" @change="togglePerk(perk.perk_code, $event)" />
        </div>
      </div>
      <p v-if="!displayedPerks.length && !hasUsernameAppearance" class="empty">尚未解锁，可在积分商城兑换相应权益后开启。</p>

      <div v-if="hasUsernameAppearance" class="appearance-panel">
        <strong>用户名颜色设置</strong>
        <small class="requirement-note">渐变与特定颜色为两个独立权益，二者只能使用一种。</small>
        <el-radio-group v-model="appearanceMode">
          <el-radio value="gradient" :disabled="!gradientPerk">渐变</el-radio>
          <el-radio value="color" :disabled="colorPerks.length === 0">特定颜色</el-radio>
        </el-radio-group>
        <div v-if="appearanceMode === 'color'" class="appearance-color-row">
          <el-select v-model="selectedColor" placeholder="选择颜色" style="min-width: 200px">
            <el-option v-for="p in colorPerks" :key="p.perk_code" :value="p.perk_code">
              <span class="perk-color" :style="{ background: perkCodeHex(p.perk_code) }"></span>
              {{ perkTitle(p.perk_code) }}
            </el-option>
          </el-select>
        </div>
        <el-button type="primary" :loading="appearanceSaving" @click="saveAppearance">保存</el-button>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3>满减优惠券</h3>
          <small class="requirement-note">点击券卡复制券码。</small>
        </div>
        <button class="ghost small" type="button" :disabled="couponLoading" @click="loadCoupons">
          {{ couponLoading ? '刷新中...' : '刷新券包' }}
        </button>
      </div>
      <div v-if="amountCoupons.length === 0" class="empty">暂无满减优惠券</div>
      <div v-else class="coupon-items account-coupon-grid">
        <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
          @click="copyCouponCode(item.code)">
          <div class="coupon-head">
            <strong>{{ item.code }}</strong>
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">
            门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}
          </p>
        </button>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3>折扣优惠券</h3>
          <small class="requirement-note">点击券卡复制券码。</small>
        </div>
        <button class="ghost small" type="button" :disabled="couponLoading" @click="loadCoupons">
          {{ couponLoading ? '刷新中...' : '刷新券包' }}
        </button>
      </div>
      <div v-if="discountCoupons.length === 0" class="empty">暂无折扣优惠券</div>
      <div v-else class="coupon-items account-coupon-grid">
        <button v-for="item in discountCoupons" :key="item.code" type="button" class="coupon-item"
          @click="copyCouponCode(item.code)">
          <div class="coupon-head">
            <strong>{{ item.code }}</strong>
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">
            门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}
          </p>
        </button>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3>评论警告</h3>
          <small class="requirement-note">管理员不会修改原评论，违规内容会保留记录并说明原因。</small>
        </div>
      </div>
      <div v-if="commentWarnings.length" class="warning-list">
        <article v-for="warning in commentWarnings" :key="warning.id" class="warning-item">
          <small>{{ warning.created_at }} · {{ warning.operator }}</small>
          <p>原评论：{{ warning.comment_snapshot }}</p>
          <strong>警告原因：{{ warning.reason }}</strong>
        </article>
      </div>
      <p v-else class="empty">暂无评论警告</p>
    </section>

    <div class="points-log">
      <div class="points-log__head">
        <h3>积分明细</h3>
        <el-button :loading="loading" size="small" plain @click="loadPoints">刷新</el-button>
      </div>

      <el-table v-if="logs.length" :data="pagedLogs" stripe max-height="420">
        <el-table-column label="时间" prop="created_at" width="180" />
        <el-table-column label="变动" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="deltaTagType(row.delta)" size="small">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动后" prop="balance_after" width="120" align="center" />
        <el-table-column label="原因" prop="reason" min-width="200" show-overflow-tooltip />
      </el-table>

      <el-pagination
        v-if="logs.length"
        v-model:current-page="logPage"
        :page-size="logPageSize"
        :total="logTotal"
        layout="prev, pager, next, total"
        background
        class="points-log__pagination"
      />

      <el-empty v-else-if="!loading" description="暂无积分明细" />
    </div>
  </div>
</template>

<style scoped>
.points-page {
  max-width: 100%;
  min-height: calc(100vh - 185px);
}
.points-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 26px 28px;
  border-radius: 18px;
  background: linear-gradient(135deg, #eef4ff 0%, #f7faff 55%, #ffffff 100%);
  border: 1px solid rgba(224, 232, 255, 0.96);
  color: #0f172a;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}
.points-hero::before,
.points-hero::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(79, 140, 255, 0.08);
  pointer-events: none;
}
.points-hero::before {
  width: 180px;
  height: 180px;
  right: -50px;
  top: -80px;
}
.points-hero::after {
  width: 130px;
  height: 130px;
  right: 110px;
  bottom: -70px;
  background: rgba(79, 140, 255, 0.05);
}
.points-hero > * {
  position: relative;
  z-index: 1;
}
.points-hero h2 {
  margin: 0 0 6px;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #0f172a;
}
.points-hero p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}
.points-hero__balance {
  text-align: center;
  flex-shrink: 0;
}
.points-hero__balance span {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
  letter-spacing: 1px;
}
.points-hero__balance strong {
  font-size: 44px;
  line-height: 1;
  font-weight: 800;
  color: #4f8cff;
}
.points-error {
  color: #f56c6c;
  margin-bottom: 16px;
}
.points-log {
  margin-top: 16px;
  padding: 18px 18px 6px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
  overflow: hidden;
}
.points-log__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.points-log__head h3 {
  position: relative;
  margin: 0;
  padding-left: 12px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.points-log__head h3::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: linear-gradient(180deg, #3a7afe, #6d5dfc);
}
.points-log :deep(.el-table th.el-table__cell) {
  background: #f5f7fa;
  color: #334155;
  font-weight: 700;
}
.points-log :deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
.points-log__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
  padding-bottom: 12px;
}

.points-page .wallet-section {
  margin-top: 16px;
}

.account-coupon-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.perk-list {
  display: grid;
  gap: 10px;
}
.perk-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--profile-card-border);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.8);
}
.perk-item__info {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.perk-item__info strong {
  color: var(--profile-text-main);
  font-size: 14px;
}
.perk-color {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.appearance-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid var(--profile-card-border);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.8);
}
.appearance-color-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
</style>
