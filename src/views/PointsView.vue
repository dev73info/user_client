<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import { Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'
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
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const logs = ref<UserPointsLog[]>([])
const loading = ref(false)
const error = ref('')
/** 读数条用的余额：与日志分开存，日志只翻当前页、余额是全量口径。 */
const pointsBalance = ref(0)
const refreshing = ref(false)
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
const transferLoading = ref(false)
const transfers = ref<PointsTransfer[]>([])

// 打赏记录的筛选：记录是一次全量取回（上限 50 条），所以筛选与分页都在前端做。
const transferKeyword = ref('')
const transferScope = ref<'all' | 'sent' | 'received'>('all')

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
/** 读数条口径：可用券不含已核销的，与「可用券」在账户页的说法一致。 */
const usableCoupons = computed(() => coupons.value.filter((item) => item.status !== 'used'))
const ownedPerkCount = computed(() => perks.value.filter((item) => item.owned).length)
const equippedPerkCount = computed(() => perks.value.filter((item) => item.equipped).length)

const transferScopes = computed(() => [
  { value: 'all' as const, label: '全部', count: transfers.value.length },
  {
    value: 'sent' as const,
    label: '我打赏的',
    count: transfers.value.filter((item) => item.from_username === auth.username).length,
  },
  {
    value: 'received' as const,
    label: '我收到的',
    count: transfers.value.filter((item) => item.to_username === auth.username).length,
  },
])

const filteredTransfers = computed(() => {
  const search = transferKeyword.value.trim().toLocaleLowerCase()
  return transfers.value.filter((item) => {
    const matchesScope =
      transferScope.value === 'all'
      || (transferScope.value === 'sent'
        ? item.from_username === auth.username
        : item.to_username === auth.username)
    const matchesSearch =
      !search
      || [item.from_username, item.to_username, item.note ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(search),
      )
    return matchesScope && matchesSearch
  })
})

const transferFiltersActive = computed(
  () => transferKeyword.value.trim() !== '' || transferScope.value !== 'all',
)

const {
  page: transferPage,
  pageSize: transferPageSize,
  total: transferTotal,
  paged: pagedTransfers,
  resetPage: resetTransferPage,
} = useClientPagination(filteredTransfers)

// 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
watch([transferKeyword, transferScope], resetTransferPage)

function resetTransferFilters() {
  transferKeyword.value = ''
  transferScope.value = 'all'
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
    pointsBalance.value = data.points_balance
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

/** 读数条的刷新：只刷读数条报的那几项（余额、权益、券包），日志有自己的分页与刷新口径。 */
async function refreshOverview() {
  refreshing.value = true
  try {
    await Promise.all([loadPoints(), loadCoupons()])
  } finally {
    refreshing.value = false
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
  transferLoading.value = true
  try {
    transfers.value = await listMyTransfers(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载打赏记录失败', 'error')
  } finally {
    transferLoading.value = false
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
    <main class="page-shell custom-page-shell profile-page points-page" :aria-busy="loading">
      <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
      <div class="wb-strip" aria-label="背包概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">积分余额</span>
          <span class="wb-strip__value">{{ loading ? '—' : pointsBalance }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">可用优惠券</span>
          <span class="wb-strip__value">{{ couponLoading ? '—' : usableCoupons.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已解锁权益</span>
          <span class="wb-strip__value">{{ loading ? '—' : ownedPerkCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已佩戴权益</span>
          <span class="wb-strip__value">{{ loading ? '—' : equippedPerkCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <el-button class="wb-toolbar__icon-btn" :loading="refreshing" aria-label="刷新背包数据"
            @click="refreshOverview">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </div>

      <section class="wallet-section points-section points-section--transfer">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">积分打赏</h3>
            <p class="wb-card-head__desc">
              向你认可的用户打赏积分，平台按 {{ feeRate }}% 收取手续费（接收方到账 {{ 100 - feeRate }}%）。
            </p>
          </div>
        </div>
        <div class="transfer-form">
          <el-input v-model="transferTo" placeholder="接收方用户名" clearable aria-label="接收方用户名" />
          <el-input-number v-model="transferAmount" :min="1" :precision="0" placeholder="打赏金额"
            class="transfer-form__amount" />
          <el-input v-model="transferNote" placeholder="附言（可选）" clearable aria-label="打赏附言" />
          <p v-if="transferAmount && transferAmount > 0" class="transfer-preview">
            接收方到账 <strong>{{ transferReceived }}</strong> 积分 · 手续费 <strong>{{ transferFee }}</strong> 积分
          </p>
          <div class="transfer-form__submit">
            <el-button class="wb-toolbar__primary" :loading="transferSaving" @click="submitTransfer">打赏</el-button>
          </div>
        </div>
      </section>

      <section class="wallet-section points-section points-section--transfers">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">打赏记录</h3>
            <p class="wb-card-head__desc">按收支方向筛选，或按对方用户名与附言搜索。</p>
          </div>
        </div>

        <div class="wb-toolbar">
          <div class="wb-chip-group" role="group" aria-label="打赏方向">
            <button v-for="scope in transferScopes" :key="scope.value" type="button"
              class="wb-chip wb-chip--button" :class="{ 'is-active': transferScope === scope.value }"
              :aria-pressed="transferScope === scope.value" @click="transferScope = scope.value">
              {{ scope.label }}<span class="wb-chip__count">{{ scope.count }}</span>
            </button>
          </div>
          <el-input v-model="transferKeyword" class="wb-toolbar__search" clearable placeholder="搜索用户名或附言"
            aria-label="搜索打赏记录">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div class="wb-toolbar__actions">
            <span v-if="transferFiltersActive" class="wb-toolbar__hint">
              筛选出 {{ transferTotal }} / {{ transfers.length }} 条
            </span>
            <el-button v-if="transferFiltersActive" class="wb-toolbar__ghost" @click="resetTransferFilters">
              <el-icon><RefreshLeft /></el-icon><span>重置</span>
            </el-button>
          </div>
        </div>

        <p v-if="transferLoading" class="wb-empty" role="status">正在加载打赏记录…</p>
        <div v-else-if="!filteredTransfers.length" class="wb-empty" role="status">
          <span class="wb-empty__title">{{ transfers.length ? '没有符合条件的打赏记录' : '暂无打赏记录' }}</span>
          <template v-if="transfers.length">换个方向或关键字再试一次。</template>
          <template v-else>在积分打赏里送出一份心意后，记录会出现在这里。</template>
        </div>
        <template v-else>
          <ul class="wb-list" aria-label="打赏记录">
            <li v-for="t in pagedTransfers" :key="t.id" class="wb-item">
              <div class="wb-item__main">
                <span class="wb-item__title">
                  {{ t.from_username === auth.username ? '我' : t.from_username }}
                  <span aria-hidden="true">→</span>
                  {{ t.to_username === auth.username ? '我' : t.to_username }}
                </span>
                <span class="wb-item__meta">
                  {{ t.created_at }}{{ t.fee > 0 ? ` · 手续费 ${t.fee}` : '' }}{{ t.note ? ` · ${t.note}` : '' }}
                </span>
              </div>
              <div class="wb-item__side">
                <span class="wb-badge" :class="{ 'wb-badge--success': t.to_username === auth.username }">
                  {{ t.to_username === auth.username ? '+' : '-' }}{{ t.to_username === auth.username ? t.received : t.amount }}
                </span>
              </div>
            </li>
          </ul>
          <div class="wb-pager">
            <div class="wb-pager__count">
              <span>共 {{ transferTotal }} 条记录</span>
              <el-select v-model="transferPageSize" class="wb-pager__size" aria-label="每页打赏记录数">
                <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
              </el-select>
            </div>
            <el-pagination v-model:current-page="transferPage" :page-size="transferPageSize"
              :total="transferTotal" :pager-count="5" layout="prev, pager, next" background
              aria-label="打赏记录分页" />
          </div>
        </template>
      </section>

      <section class="wallet-section points-section points-section--perks">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">我的权益</h3>
            <p class="wb-card-head__desc">管理已解锁的积分商城权益，佩戴后立即生效。</p>
          </div>
        </div>

        <ul v-if="displayedPerks.length" class="wb-list" aria-label="我的权益">
          <li v-for="perk in displayedPerks" :key="perk.perk_code" class="wb-item">
            <div class="wb-item__main">
              <span class="wb-item__title">{{ perkTitle(perk.perk_code) }}</span>
              <span class="wb-item__meta">{{ perkExpireText(perk) }}</span>
            </div>
            <div class="wb-item__side">
              <span class="wb-badge" :class="{ 'wb-badge--success': perk.equipped }">
                {{ perk.equipped ? '已佩戴' : '未佩戴' }}
              </span>
              <el-switch :model-value="perk.equipped" :disabled="perkSaving === perk.perk_code"
                :loading="perkSaving === perk.perk_code" aria-label="佩戴权益"
                @change="togglePerk(perk.perk_code, $event)" />
            </div>
          </li>
        </ul>

        <div v-if="!displayedPerks.length && !hasUsernameAppearance" class="wb-empty" role="status">
          <span class="wb-empty__title">还没有解锁任何权益</span>
          可在积分商城兑换相应权益后开启。
        </div>

        <div v-if="hasUsernameAppearance" class="appearance-panel">
          <div class="appearance-panel__head">
            <strong>用户名颜色设置</strong>
            <small>渐变与特定颜色为两个独立权益，二者只能使用一种。</small>
          </div>
          <el-radio-group v-model="appearanceMode">
            <el-radio value="gradient" :disabled="!gradientPerk">渐变</el-radio>
            <el-radio value="color" :disabled="colorPerks.length === 0">特定颜色</el-radio>
          </el-radio-group>
          <div v-if="appearanceMode === 'color'" class="appearance-color-row">
            <el-select v-model="selectedColor" placeholder="选择颜色" aria-label="选择用户名颜色">
              <el-option v-for="p in colorPerks" :key="p.perk_code" :value="p.perk_code">
                <span class="perk-color" :style="{ background: perkCodeHex(p.perk_code) }"></span>
                {{ perkTitle(p.perk_code) }}
              </el-option>
            </el-select>
          </div>
          <div class="appearance-panel__submit">
            <el-button class="wb-toolbar__primary" :loading="appearanceSaving" @click="saveAppearance">保存</el-button>
          </div>
        </div>
      </section>

      <section class="wallet-section points-section points-section--coupons">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">优惠券</h3>
            <p class="wb-card-head__desc">点击券卡复制券码，下单时填入即可使用。</p>
          </div>
          <div class="wb-card-head__actions">
            <el-button class="wb-toolbar__ghost" :loading="couponLoading" @click="loadCoupons">
              <el-icon><Refresh /></el-icon><span>刷新券包</span>
            </el-button>
          </div>
        </div>

        <div class="coupon-groups">
          <div class="coupon-group">
            <div class="coupon-group__head">
              <strong>满减优惠券</strong>
              <span class="wb-badge">{{ amountCoupons.length }}</span>
            </div>
            <p v-if="amountCoupons.length === 0" class="wb-empty" role="status">暂无满减优惠券</p>
            <div v-else class="coupon-items">
              <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
                @click="copyCouponCode(item.code)">
                <div class="coupon-item__head">
                  <strong>{{ item.code }}</strong>
                  <span class="wb-badge" :class="{ 'wb-badge--success': item.status !== 'used' }">
                    {{ item.status === 'used' ? '已使用' : '可用' }}
                  </span>
                </div>
                <small>{{ item.name }}</small>
                <p>{{ formatDiscount(item) }}</p>
                <p class="coupon-item__meta">
                  门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}
                </p>
              </button>
            </div>
          </div>

          <div class="coupon-group">
            <div class="coupon-group__head">
              <strong>折扣优惠券</strong>
              <span class="wb-badge">{{ discountCoupons.length }}</span>
            </div>
            <p v-if="discountCoupons.length === 0" class="wb-empty" role="status">暂无折扣优惠券</p>
            <div v-else class="coupon-items">
              <button v-for="item in discountCoupons" :key="item.code" type="button" class="coupon-item"
                @click="copyCouponCode(item.code)">
                <div class="coupon-item__head">
                  <strong>{{ item.code }}</strong>
                  <span class="wb-badge" :class="{ 'wb-badge--success': item.status !== 'used' }">
                    {{ item.status === 'used' ? '已使用' : '可用' }}
                  </span>
                </div>
                <small>{{ item.name }}</small>
                <p>{{ formatDiscount(item) }}</p>
                <p class="coupon-item__meta">
                  门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="wallet-section points-section points-section--warnings">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">评论警告</h3>
            <p class="wb-card-head__desc">管理员不会修改原评论，违规内容会保留记录并说明原因。</p>
          </div>
        </div>

        <ul v-if="commentWarnings.length" class="wb-list" aria-label="评论警告">
          <li v-for="warning in commentWarnings" :key="warning.id" class="wb-item">
            <div class="wb-item__main">
              <span class="wb-item__meta">{{ warning.created_at }} · {{ warning.operator }}</span>
              <span class="wb-item__meta">原评论：{{ warning.comment_snapshot }}</span>
              <span class="wb-item__title">警告原因：{{ warning.reason }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="wb-empty" role="status">暂无评论警告</p>
      </section>

      <section class="wallet-section points-section points-section--logs">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">积分明细</h3>
            <p class="wb-card-head__desc">
              每笔积分变动的流水，按时间倒序；这一列走服务端分页，所以不提供关键字筛选。
            </p>
          </div>
        </div>

        <p v-if="loading" class="wb-empty" role="status">正在加载积分明细…</p>
        <div v-else-if="error" class="wb-empty" role="alert">
          <span class="wb-empty__title">加载积分明细失败</span>{{ error }}
          <div class="wb-empty__actions">
            <el-button class="wb-toolbar__ghost" @click="loadPoints()">
              <el-icon><Refresh /></el-icon><span>重新加载</span>
            </el-button>
          </div>
        </div>
        <p v-else-if="!logs.length" class="wb-empty" role="status">
          <span class="wb-empty__title">暂无积分明细</span>
          签到、打赏与兑换产生的积分变动都会记在这里。
        </p>
        <template v-else>
          <ul class="wb-list" aria-label="积分明细">
            <li v-for="row in pagedLogs" :key="row.id" class="wb-item">
              <div class="wb-item__main">
                <span class="wb-item__title">{{ row.reason || '积分变动' }}</span>
                <span class="wb-item__meta">{{ row.created_at }} · 变动后余额 {{ row.balance_after }}</span>
              </div>
              <div class="wb-item__side">
                <span class="wb-badge" :class="row.delta > 0 ? 'wb-badge--success' : 'wb-badge--danger'">
                  {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                </span>
              </div>
            </li>
          </ul>
          <div class="wb-pager">
            <div class="wb-pager__count">
              <span>共 {{ logTotal }} 条明细</span>
              <el-select :model-value="logPageSize" class="wb-pager__size" aria-label="每页明细数"
                @change="handleLogPageSizeChange">
                <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
              </el-select>
            </div>
            <el-pagination :current-page="logPage" :page-size="logPageSize" :total="logTotal"
              :pager-count="5" layout="prev, pager, next" background aria-label="积分明细分页"
              @current-change="handleLogPageChange" />
          </div>
        </template>
      </section>
    </main>
  </ElConfigProvider>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager / .wb-empty / .wb-badge），
   本页只留「打赏表单」与「券卡网格」这两块统一层没有提供的布局。
   配色全部取令牌：这一页原来把 --profile-* 覆盖成一整套青绿（#0f766e / #d5e3de），
   于是同一套菜单在别的页是冷蓝、到这里变成青色，切页像换站。 */

.points-page {
  align-content: start;
}

/* === 打赏表单 === */
.transfer-form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(140px, 0.6fr);
  gap: 12px;
  align-items: start;
}

/* 表单项与工具栏控件同高同圆角：统一层的控件规格只作用于 .wb-toolbar 与 .wb-pager，
   这里的表单不在那些容器里，否则会出现「工具栏 36px 的输入框」与「表单 32px 的输入框」两种高度。 */
.transfer-form :deep(.el-input__wrapper),
.transfer-form :deep(.el-input-number),
.transfer-form :deep(.el-select__wrapper) {
  min-height: var(--wb-control-height);
  height: var(--wb-control-height);
  border-radius: var(--wb-radius-control);
}

.transfer-form__amount :deep(.el-input__wrapper) {
  width: 100%;
}

.transfer-form > .el-input:first-child,
.transfer-form > .transfer-preview,
.transfer-form > .transfer-form__submit {
  grid-column: 1 / -1;
}

.transfer-form > .transfer-form__submit {
  display: flex;
  justify-content: flex-end;
}

.transfer-preview {
  margin: 0;
  padding: 12px 14px;
  border: 1px dashed var(--wb-accent-line);
  border-radius: var(--wb-radius-item);
  background: var(--wb-accent-soft);
  color: var(--wb-ink-soft);
  font-size: 13px;
}

.transfer-preview strong {
  color: var(--wb-accent);
  font-variant-numeric: tabular-nums;
}

/* === 券卡网格 ===
   券卡是「点一下就复制券码」的整块可点区，不是列表行，所以保留网格；
   但描边、圆角、悬停与状态标签都取统一层那一套。 */
.coupon-groups {
  display: grid;
  gap: 12px;
}

.coupon-group {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--wb-line);
  border-radius: var(--wb-radius-item);
  background: var(--profile-card-bg);
}

.coupon-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--profile-text-main);
  font-size: 13px;
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
  transition: border-color 160ms ease, box-shadow 160ms ease;
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

/* === 用户名颜色设置 === */
.appearance-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid var(--wb-line);
  border-radius: var(--wb-radius-item);
  background: var(--profile-card-bg);
}

.appearance-panel__head {
  display: grid;
  gap: 4px;
}

.appearance-panel__head strong {
  color: var(--profile-text-main);
  font-size: 14px;
}

.appearance-panel__head small {
  color: var(--profile-text-sub);
  font-size: 12px;
  line-height: 1.6;
}

.appearance-color-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.appearance-color-row .el-select {
  min-width: 200px;
}

.appearance-panel__submit {
  display: flex;
  justify-content: flex-end;
}

.perk-color {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  border: 1px solid var(--wb-line);
  border-radius: 4px;
  vertical-align: -2px;
}

/* 明细里「原因 + 时间」两行贴紧：统一层的 __meta 行距按普通行给，这里行数多、收紧一点 */
.points-section--logs .wb-item__main {
  gap: 2px;
}

@media (max-width: 900px) {
  .transfer-form {
    grid-template-columns: 1fr;
  }

  .transfer-form > .el-input-number,
  .transfer-form > .el-input:nth-child(3) {
    grid-column: 1;
  }
}
</style>
