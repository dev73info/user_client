<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { listMyCommentWarnings, type CommentWarning } from '@/api/community'
import {
  getMyPoints,
  setPerkEquipped,
  transferPoints,
  listMyTransfers,
  getTransferMeta,
  type UserPerk,
  type UserPointsLog,
  type PointsTransfer,
  type PointsTransferMeta,
} from '@/api/points'
import { HttpError } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const logs = ref<UserPointsLog[]>([])
const loading = ref(false)
const error = ref('')
const perks = ref<UserPerk[]>([])
const perkSaving = ref('')
const commentWarnings = ref<CommentWarning[]>([])

const couponLoading = ref(false)
const coupons = ref<CouponItem[]>([])
const { showToast } = useToast()

// 打赏
const transferMeta = ref<PointsTransferMeta | null>(null)
const transferTo = ref('')
const transferAmount = ref<number | null>(null)
const transferNote = ref('')
const transferSaving = ref(false)
const transfers = ref<PointsTransfer[]>([])

const feeRate = computed(() => transferMeta.value?.fee_rate ?? 0)
const transferFee = computed(() => {
  const amount = transferAmount.value
  if (!amount || amount <= 0) return 0
  return Math.floor((amount * feeRate.value) / 100)
})
const transferReceived = computed(() => {
  const amount = transferAmount.value
  if (!amount || amount <= 0) return 0
  return amount - transferFee.value
})

const logPage = ref(1)
const logPageSize = ref(10)
const logTotal = ref(0)
const serverPagedLogs = ref(true)
const pagedLogs = computed(() => {
  if (serverPagedLogs.value) {
    return logs.value
  }

  const start = (logPage.value - 1) * logPageSize.value
  return logs.value.slice(start, start + logPageSize.value)
})

const amountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'amount'),
)
const discountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'percent'),
)

function deltaTagType(delta: number) {
  return delta > 0 ? 'success' : 'danger'
}

async function loadPoints(page = logPage.value, pageSize = logPageSize.value) {
  loading.value = true
  error.value = ''
  try {
    const data = await getMyPoints(auth.token, { page, page_size: pageSize })
    const responseHasPagination = data.logs_total != null
    const total = data.logs_total ?? data.logs.length
    const lastPage = Math.max(1, Math.ceil(total / pageSize))
    const normalizedPage = Math.min(Math.max(1, page), lastPage)

    if (normalizedPage !== page) {
      logPage.value = normalizedPage
      await loadPoints(normalizedPage, pageSize)
      return
    }

    logs.value = data.logs
    logTotal.value = total
    logPage.value = data.logs_page ?? page
    logPageSize.value = data.logs_page_size ?? pageSize
    serverPagedLogs.value = responseHasPagination
    perks.value = data.perks ?? []
    initUsernameAppearance()
  } catch (err) {
    error.value = err instanceof HttpError ? err.message : '加载积分失败'
  } finally {
    loading.value = false
  }
}

function handleLogPageChange(page: number) {
  void loadPoints(page, logPageSize.value)
}

function handleLogPageSizeChange(pageSize: number) {
  logPage.value = 1
  logPageSize.value = pageSize
  void loadPoints(1, pageSize)
}

async function loadCommentWarnings() {
  try {
    commentWarnings.value = await listMyCommentWarnings(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载评论警告失败', 'error')
  }
}

async function loadTransferMeta() {
  if (!auth.token) return
  try {
    transferMeta.value = await getTransferMeta(auth.token)
  } catch {
    // 忽略，使用默认展示
  }
}

async function loadTransfers() {
  if (!auth.token) return
  try {
    transfers.value = await listMyTransfers(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载打赏记录失败', 'error')
  }
}

async function submitTransfer() {
  if (!auth.token || transferSaving.value) return
  const to = transferTo.value.trim()
  const amount = transferAmount.value
  if (!to) {
    showToast('请输入接收方用户名', 'warning')
    return
  }
  if (!amount || amount <= 0) {
    showToast('请输入打赏金额', 'warning')
    return
  }
  transferSaving.value = true
  try {
    await transferPoints(auth.token, {
      to_username: to,
      amount,
      note: transferNote.value.trim() || undefined,
    })
    showToast('打赏成功', 'success')
    transferTo.value = ''
    transferAmount.value = null
    transferNote.value = ''
    await Promise.all([loadPoints(), loadTransfers()])
  } catch (err) {
    showToast(err instanceof Error ? err.message : '打赏失败', 'error')
  } finally {
    transferSaving.value = false
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
  await Promise.all([
    loadPoints(),
    loadCoupons(),
    loadCommentWarnings(),
    loadTransferMeta(),
    loadTransfers(),
  ])
})
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <div class="points-page profile-page">
    <p v-if="error" class="points-error">{{ error }}</p>

    <div class="points-page__layout">
      <div class="points-page__main-column">
        <section class="wallet-section points-section points-section--transfer">
          <div class="wallet-header">
            <div>
              <h3>积分打赏</h3>
              <small class="requirement-note">向你认可的用户打赏积分，平台按 {{ feeRate }}% 收取手续费（接收方到账 {{ 100 - feeRate }}%）。</small>
            </div>
          </div>
          <div class="transfer-form">
            <el-input v-model="transferTo" placeholder="接收方用户名" clearable />
            <el-input-number v-model="transferAmount" :min="1" :precision="0" placeholder="打赏金额"
              style="width: 100%" />
            <el-input v-model="transferNote" placeholder="附言（可选）" clearable />
            <div v-if="transferAmount && transferAmount > 0" class="transfer-preview">
              接收方到账 <strong>{{ transferReceived }}</strong> 积分 · 手续费 <strong>{{ transferFee }}</strong> 积分
            </div>
            <el-button type="primary" :loading="transferSaving" @click="submitTransfer">打赏</el-button>
          </div>
        </section>

        <section class="wallet-section points-section points-section--transfers">
          <div class="wallet-header">
            <div>
              <h3>打赏记录</h3>
              <small class="requirement-note">最近打赏与收款记录。</small>
            </div>
          </div>
          <div v-if="transfers.length" class="transfer-list">
            <article v-for="t in transfers" :key="t.id" class="transfer-item">
              <div class="transfer-item__main">
                <span>
                  <strong>{{ t.from_username === auth.username ? '我' : t.from_username }}</strong>
                  <span class="requirement-note"> → </span>
                  <strong>{{ t.to_username === auth.username ? '我' : t.to_username }}</strong>
                </span>
                <span
                  :class="['transfer-item__amount', t.to_username === auth.username ? 'transfer-in' : 'transfer-out']">
                  {{ t.to_username === auth.username ? '+' : '-' }}{{ t.to_username === auth.username ? t.received : t.amount }}
                </span>
              </div>
              <small class="requirement-note">
                {{ t.created_at }}{{ t.fee > 0 ? ' · 手续费 ' + t.fee : '' }}{{ t.note ? ' · ' + t.note : '' }}
              </small>
            </article>
          </div>
          <p v-else class="empty">暂无打赏记录</p>
        </section>
      </div>

      <aside class="points-page__side-column">
        <section class="wallet-section points-section points-section--perks">
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

        <section class="wallet-section points-section points-section--coupons">
          <div class="wallet-header">
            <div>
              <h3>优惠券</h3>
              <small class="requirement-note">点击券卡复制券码。</small>
            </div>
            <button class="ghost small" type="button" :disabled="couponLoading" @click="loadCoupons">
              {{ couponLoading ? '刷新中...' : '刷新券包' }}
            </button>
          </div>
          <div class="points-coupon-groups">
            <div class="points-coupon-group">
              <div class="points-subhead"><strong>满减优惠券</strong><span>{{ amountCoupons.length }}</span></div>
              <div v-if="amountCoupons.length === 0" class="empty">暂无</div>
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
            </div>
            <div class="points-coupon-group">
              <div class="points-subhead"><strong>折扣优惠券</strong><span>{{ discountCoupons.length }}</span></div>
              <div v-if="discountCoupons.length === 0" class="empty">暂无</div>
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
            </div>
          </div>
        </section>

        <section class="wallet-section points-section points-section--warnings">
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
      </aside>
    </div>

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
        v-model:page-size="logPageSize"
        :page-sizes="[10, 20, 50]"
        :total="logTotal"
        layout="total, sizes, prev, pager, next"
        background
        class="points-log__pagination"
        @current-change="handleLogPageChange"
        @size-change="handleLogPageSizeChange"
      />

      <el-empty v-else-if="!loading" description="暂无积分明细" />
    </div>
    </div>
  </ElConfigProvider>
</template>

<style scoped>
.points-page.profile-page {
  --profile-card-bg: rgba(255, 255, 253, 0.97);
  --profile-card-bg-strong: #fffefa;
  --profile-card-border: rgba(213, 227, 222, 0.98);
  --profile-card-shadow: 0 16px 34px rgba(35, 72, 69, 0.08);
  --profile-text-main: #203039;
  --profile-text-sub: #627477;
  --profile-text-soft: #94a4a3;
  --profile-accent: #0f766e;
  --profile-accent-soft: rgba(15, 118, 110, 0.12);
  --profile-success-soft: rgba(39, 122, 87, 0.12);
  --profile-success-border: rgba(119, 190, 153, 0.9);
  --profile-success-text: #277a57;
  --profile-warning-soft: rgba(217, 119, 6, 0.13);
  --profile-warning-text: #a76017;
  --profile-danger-soft: rgba(180, 72, 63, 0.12);
  --profile-danger-text: #b4483f;
  --points-teal: #0f766e;
  --points-teal-dark: #0b5f59;
  --points-teal-soft: #e8f3f0;
  --points-line: #d5e3de;
}

.points-page {
  max-width: 100%;
  min-height: calc(100vh - 185px);
  background: linear-gradient(180deg, rgba(232, 243, 239, 0.46), rgba(246, 248, 251, 0) 560px);
}

.points-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(300px, 0.82fr);
  gap: 16px;
  align-items: start;
}

.points-page__main-column,
.points-page__side-column {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.points-page__layout .wallet-section {
  min-width: 0;
  margin-top: 0;
  border-color: var(--points-line);
  background: var(--profile-card-bg);
  box-shadow: var(--profile-card-shadow);
}

.points-page > .points-log {
  margin-top: 16px;
  border-color: var(--points-line);
  background: var(--profile-card-bg);
  box-shadow: var(--profile-card-shadow);
}

.points-section .wallet-header {
  align-items: flex-start;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(213, 227, 222, 0.78);
}

.points-section .wallet-header h3 {
  position: relative;
  padding-left: 13px;
  color: var(--profile-text-main);
  font-size: 18px;
  letter-spacing: 0.01em;
}

.points-section .wallet-header h3::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 4px;
  border-radius: 999px;
  background: var(--section-accent, var(--points-teal));
}

.points-section--transfer {
  --section-accent: var(--points-teal);
}

.points-section--transfers {
  --section-accent: #c08457;
}

.points-section--perks {
  --section-accent: #d97706;
}

.points-section--coupons {
  --section-accent: var(--points-teal);
}

.points-section--warnings {
  --section-accent: #b4483f;
}

.points-page :deep(.el-button--primary) {
  --el-button-bg-color: var(--points-teal);
  --el-button-border-color: var(--points-teal);
  --el-button-hover-bg-color: var(--points-teal-dark);
  --el-button-hover-border-color: var(--points-teal-dark);
  --el-button-active-bg-color: #084c48;
  --el-button-active-border-color: #084c48;
  border-radius: 10px;
  box-shadow: 0 8px 16px rgba(15, 118, 110, 0.16);
  font-weight: 700;
}

.points-page :deep(.el-input__wrapper),
.points-page :deep(.el-select__wrapper) {
  border-radius: 10px;
  background: var(--profile-card-bg-strong);
  box-shadow: 0 0 0 1px var(--points-line) inset;
}

.points-page :deep(.el-input__wrapper:hover),
.points-page :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.5) inset;
}

.points-page :deep(.el-input__wrapper:focus-within),
.points-page :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--points-teal) inset, 0 0 0 3px rgba(15, 118, 110, 0.12) !important;
}

.points-page :deep(.el-input__inner::placeholder) {
  color: var(--profile-text-soft);
}

.points-page :deep(.el-input-number__decrease),
.points-page :deep(.el-input-number__increase) {
  background: #f3f8f6;
  color: var(--profile-text-sub);
}

.points-page :deep(.el-input-number__decrease:hover),
.points-page :deep(.el-input-number__increase:hover) {
  background: var(--points-teal-soft);
  color: var(--points-teal);
}

.points-page button.ghost.small {
  border-color: var(--points-line);
  border-radius: 9px;
  background: var(--profile-card-bg-strong);
  color: var(--points-teal-dark);
  box-shadow: 0 6px 14px rgba(35, 72, 69, 0.06);
  font-weight: 700;
}

.points-page button.ghost.small:hover:not(:disabled) {
  border-color: rgba(15, 118, 110, 0.5);
  background: var(--points-teal-soft);
  color: var(--points-teal-dark);
}

.points-section--transfer .transfer-form {
  grid-template-columns: minmax(0, 1fr) minmax(140px, 0.55fr);
  align-items: start;
}

.points-section--transfer .transfer-form > .el-input:first-child,
.points-section--transfer .transfer-preview,
.points-section--transfer .transfer-form > .el-button {
  grid-column: 1 / -1;
}

.points-section--transfer .transfer-form > .el-input-number {
  grid-column: 1;
}

.points-section--transfer .transfer-form > .el-input:nth-child(3) {
  grid-column: 2;
}

.points-section--transfer .transfer-form > .el-button {
  justify-self: end;
  min-width: 120px;
}

.points-coupon-groups {
  display: grid;
  gap: 12px;
}

.points-coupon-group {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(224, 232, 255, 0.9);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.72);
}

.points-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--profile-text-main);
  font-size: 13px;
}

.points-subhead span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--profile-accent-soft);
  color: var(--profile-accent);
  font-size: 12px;
  font-weight: 700;
}

.points-coupon-group .account-coupon-grid {
  grid-template-columns: 1fr;
  gap: 8px;
}

.points-coupon-group .coupon-item {
  min-width: 0;
  padding: 12px;
}

@media (max-width: 820px) {
  .points-page__layout {
    grid-template-columns: 1fr;
  }

  .points-section--transfer .transfer-form {
    grid-template-columns: 1fr;
  }

  .points-section--transfer .transfer-form > .el-input-number,
  .points-section--transfer .transfer-form > .el-input:nth-child(3) {
    grid-column: 1;
  }
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

.transfer-form {
  display: grid;
  gap: 12px;
}
.transfer-form :deep(.el-input-number) {
  width: 100%;
}
.transfer-preview {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--points-teal-soft);
  border: 1px dashed rgba(15, 118, 110, 0.34);
  color: #466562;
  font-size: 13px;
}
.transfer-preview strong {
  color: var(--points-teal-dark);
}

.transfer-list {
  display: grid;
  gap: 10px;
}
.transfer-item {
  padding: 14px 16px;
  border: 1px solid var(--points-line);
  border-radius: 14px;
  background: #f7faf8;
}
.transfer-item__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.transfer-item__main strong {
  color: var(--profile-text-main);
  font-size: 14px;
}
.transfer-item__amount {
  font-weight: 700;
  font-size: 14px;
}
.transfer-in {
  color: #16a34a;
}
.transfer-out {
  color: #b4483f;
}

.points-coupon-group {
  border-color: rgba(213, 227, 222, 0.96);
  background: rgba(244, 249, 247, 0.82);
}

.points-subhead span {
  border: 1px solid rgba(15, 118, 110, 0.16);
  background: var(--points-teal-soft);
  color: var(--points-teal-dark);
}

.points-coupon-group .coupon-item {
  border-color: var(--points-line);
  background: var(--profile-card-bg-strong);
  box-shadow: 0 5px 12px rgba(35, 72, 69, 0.04);
}

.points-coupon-group .coupon-item:hover {
  border-color: rgba(15, 118, 110, 0.52);
  background: #fbfffd;
  box-shadow: 0 10px 20px rgba(35, 72, 69, 0.1);
  transform: translateY(-2px);
}

.points-page .empty {
  border-color: rgba(191, 212, 204, 0.95);
  background: rgba(244, 249, 247, 0.84);
}

.points-log {
  border-color: var(--points-line);
  background: var(--profile-card-bg);
  box-shadow: var(--profile-card-shadow);
}

.points-log__head h3 {
  color: var(--profile-text-main);
}

.points-log__head h3::before {
  background: var(--points-teal);
}

.points-log :deep(.el-table th.el-table__cell) {
  background: #edf5f2;
  color: #36534f;
}

.points-log :deep(.el-table tr:hover > td.el-table__cell) {
  background: #f4faf8;
}
</style>
