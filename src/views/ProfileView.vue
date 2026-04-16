<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import AppToast from '@/components/AppToast.vue'
import PublishModal from '@/components/PublishModal.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  listAvailableCoupons,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type CouponItem,
  type WechatCreatePaymentResp,
} from '@/api/payments'
import {
  commentRequirement as commentRequirementApi,
  listRequirements,
  resubmitRequirement as resubmitRequirementApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  type RequirementItem,
  type RequirementResourceVisibility,
  type RequirementStatus,
} from '@/api/requirements'
import { getDepositRatio, updateProfile } from '@/api/settings'

const router = useRouter()
const auth = useAuthStore()
const menuOpen = ref(false)
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
const payChannel = ref<'alipay' | 'wechat'>('alipay')
const payLoading = ref(false)
const currentPayment = ref<AlipayCreatePaymentResp | null>(null)
const commentVisible = ref(false)
const commentRequirement = ref<RequirementItem | null>(null)
const commentRating = ref(5)
const commentText = ref('')
const commentLoading = ref(false)
const editVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editLoading = ref(false)
const resourceVisibilityLoadingId = ref<string | null>(null)
const depositRatioPercent = ref(20)
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

function formatRequirementStatus(status: RequirementStatus) {
  const mapping: Record<RequirementStatus, string> = {
    pending_review: '待审核',
    rejected: '已拒绝',
    pending_deposit: '待付定金',
    deposit_paid: '已付定金',
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
  }

  return mapping[status]
}

function formatRequirementTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

function canPay(status: RequirementStatus) {
  return status === 'pending_deposit' || status === 'pending_final'
}

function canResubmit(status: RequirementStatus) {
  return status === 'rejected'
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function currentResourceVisibility(item: RequirementItem): RequirementResourceVisibility | null {
  return item.resource_visibility ?? null
}

function canToggleRequirementResourceVisibility(item: RequirementItem) {
  return hasBoundResource(item) && (item.status === 'final_paid' || item.status === 'completed')
}

function formatResourceVisibility(item: RequirementItem) {
  return currentResourceVisibility(item) === 'public' ? '资源已公开' : '资源私有中'
}

function nextResourceVisibility(item: RequirementItem): RequirementResourceVisibility {
  return currentResourceVisibility(item) === 'public' ? 'private' : 'public'
}

function toggleResourceVisibilityLabel(item: RequirementItem) {
  if (!canToggleRequirementResourceVisibility(item)) {
    return '尾款后可设置'
  }

  return nextResourceVisibility(item) === 'public' ? '设为公开' : '设为私有'
}

function openPayModal(item: RequirementItem) {
  if (!canPay(item.status)) {
    return
  }
  payRequirement.value = item
  payChannel.value = 'alipay'
  currentPayment.value = null
  payVisible.value = true
}

function canComment(status: RequirementStatus) {
  return status === 'final_paid' || status === 'completed'
}

function openCommentModal(item: RequirementItem) {
  if (!canComment(item.status)) {
    return
  }
  commentRequirement.value = item
  commentRating.value = item.comment_rating ?? 5
  commentText.value = item.comment_text ?? ''
  commentVisible.value = true
}

function openRequirementEditModal(item: RequirementItem) {
  if (!canResubmit(item.status)) {
    return
  }

  editRequirement.value = item
  editTitle.value = item.title
  editDescription.value = item.description ?? ''
  editBudget.value = item.budget ?? ''
  editAcceptance.value = item.acceptance_criteria ?? ''
  editVisible.value = true
}

function openAuth(mode: 'login' | 'register') {
  router.push({ name: 'home', query: { modal: 'auth', mode } })
}

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function goProfile() {
  closeUserMenu()
  router.push({ name: 'profile' })
}

function logout() {
  auth.logout()
  closeUserMenu()
  showToast('已退出登录', 'info')
  router.push({ name: 'home' })
}

async function refreshProfileData() {
  await Promise.all([loadCoupons(), loadMyRequirements(), loadDepositRatio()])
}

function handleRequirementAction(item: RequirementItem) {
  if (canPay(item.status)) {
    openPayModal(item)
  } else if (canResubmit(item.status)) {
    openRequirementEditModal(item)
  } else if (canComment(item.status)) {
    openCommentModal(item)
  }
}

function starFill(index: number) {
  const rating = commentRating.value
  if (rating >= index) {
    return 100
  }
  if (rating >= index - 0.5) {
    return 50
  }
  return 0
}

function starClass(index: number) {
  const fill = starFill(index)
  return fill === 100 ? 'full' : fill === 50 ? 'half' : ''
}

function setRating(event: MouseEvent, index: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickedInLeftHalf = event.clientX - rect.left < rect.width / 2
  commentRating.value = clickedInLeftHalf ? index - 0.5 : index
}

async function updateUsername() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改用户名', 'error')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    showToast('请输入一个新的用户名', 'error')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = ''
    showToast('用户名已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改用户名失败', 'error')
  } finally {
    usernameLoading.value = false
  }
}

function closePayModal() {
  payVisible.value = false
}

function closeCommentModal() {
  commentVisible.value = false
}

function forceCloseEditModal() {
  editVisible.value = false
  editRequirement.value = null
}

function closeEditModal() {
  if (editLoading.value) {
    return
  }
  forceCloseEditModal()
}

async function toggleRequirementResourceVisibility(item: RequirementItem) {
  if (!auth.isAuthed || !hasBoundResource(item)) {
    return
  }

  if (!canToggleRequirementResourceVisibility(item)) {
    showToast('需求必须在已付尾款后，才能设置资源为公开或私有', 'warning')
    return
  }

  const visibility = nextResourceVisibility(item)
  resourceVisibilityLoadingId.value = item.requirement_id
  try {
    await updateRequirementResourceVisibilityApi(auth.token, item.requirement_id, { visibility })
    showToast(visibility === 'public' ? '关联资源已设为公开' : '关联资源已设为私有', 'success')
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新资源可见性失败', 'error')
  } finally {
    resourceVisibilityLoadingId.value = null
  }
}

async function submitRequirementComment() {
  if (!auth.isAuthed || !commentRequirement.value) {
    showToast('请先登录后再发表评论', 'error')
    return
  }

  if (commentRating.value < 1 || commentRating.value > 5) {
    showToast('请为已完成需求打分，范围 1 到 5 分', 'error')
    return
  }

  if (commentText.value.trim().length > 200) {
    showToast('评论字数不能超过 200 字', 'error')
    return
  }

  commentLoading.value = true
  try {
    await commentRequirementApi(auth.token, commentRequirement.value.requirement_id, {
      rating: commentRating.value,
      comment: commentText.value.trim(),
    })
    showToast('评论提交成功', 'success')
    commentVisible.value = false
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '评论提交失败', 'error')
  } finally {
    commentLoading.value = false
  }
}

async function submitRequirementResubmit() {
  if (!auth.isAuthed || !editRequirement.value) {
    showToast('请先登录后再重新提交需求', 'error')
    return
  }

  const normalizedTitle = editTitle.value.trim()
  const normalizedDescription = editDescription.value.trim()
  const normalizedAcceptance = editAcceptance.value.trim()
  const budgetRaw = String(editBudget.value ?? '').trim()

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (normalizedDescription.length < 10) {
    showToast('需求描述至少 10 个字符', 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (Number.isNaN(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (!normalizedAcceptance) {
    showToast('验收标准不能为空', 'error')
    return
  }

  editLoading.value = true
  try {
    await resubmitRequirementApi(auth.token, editRequirement.value.requirement_id, {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance,
    })

    showToast('需求已重新提交，等待审核', 'success')
    forceCloseEditModal()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重新提交失败', 'error')
  } finally {
    editLoading.value = false
  }
}

function depositAmount(item: RequirementItem) {
  if (typeof item.budget === 'number') {
    return item.budget
  }
  return 1
}

function finalDepositAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const ratio = Number(depositRatioPercent.value)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? (base * ratio) / 100 : base
  const raw = Math.max(0.01, scaled)
  return Number(raw.toFixed(2))
}

function finalPaymentAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const tail = Math.max(0.01, base - finalDepositAmount(item))
  return Number(tail.toFixed(2))
}

const isFinalPayment = computed(() => payRequirement.value?.status === 'pending_final')
const payStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

const newUsername = ref('')
const usernameLoading = ref(false)

const payAmount = computed(() => {
  if (!payRequirement.value) {
    return 0.01
  }
  if (payRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(payRequirement.value)
  }
  return finalDepositAmount(payRequirement.value)
})

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
    coupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载券包失败', 'error')
  } finally {
    loading.value = false
  }
}

async function loadDepositRatio() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const payload = await getDepositRatio(auth.token)

    if (!payload) {
      return
    }

    if (Number.isFinite(payload.deposit_ratio_percent)) {
      depositRatioPercent.value = payload.deposit_ratio_percent
    }
  } catch {
    // Keep default deposit ratio when settings API is unavailable.
  }
}

async function loadMyRequirements() {
  auth.hydrate()
  if (!auth.isAuthed) {
    myRequirements.value = []
    return
  }

  requirementLoading.value = true
  try {
    const rows = await listRequirements(auth.token)
    myRequirements.value = rows.slice(0, 20)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载需求单失败', 'error')
  } finally {
    requirementLoading.value = false
  }
}

async function submitRequirementPayment() {
  if (!payRequirement.value) {
    return
  }

  const requirement = payRequirement.value
  const channel = payChannel.value
  const amount = payAmount.value

  payLoading.value = true
  try {
    if (!currentPayment.value) {
      let createPayload: AlipayCreatePaymentResp | WechatCreatePaymentResp | AlipayPageCreatePaymentResp

      if (channel === 'alipay') {
        createPayload = await createAlipayPagePayment(auth.token, {
          requirement_id: requirement.requirement_id,
          amount_cny: amount,
          description: `需求 ${requirement.requirement_id} ${payStageLabel.value}`,
        })

        currentPayment.value = {
          payment_id: createPayload.payment_id,
          requirement_id: createPayload.requirement_id,
          channel: createPayload.channel,
          amount_cny: createPayload.amount_cny,
          status: createPayload.status,
          alipay_order_string: '',
          expires_at: createPayload.expires_at,
        }
      } else {
        createPayload = await createPayment(auth.token, channel, {
          requirement_id: requirement.requirement_id,
          amount_cny: amount,
          description: `需求 ${requirement.requirement_id} ${payStageLabel.value}`,
        })

        const wechatPayload = createPayload as WechatCreatePaymentResp
        currentPayment.value = {
          payment_id: wechatPayload.payment_id,
          requirement_id: wechatPayload.requirement_id,
          channel: wechatPayload.channel,
          amount_cny: wechatPayload.amount_cny,
          status: wechatPayload.status,
          alipay_order_string: wechatPayload.code_url,
          expires_at: wechatPayload.expires_at,
        }
      }

      showToast(`${payStageLabel.value}支付订单已生成，正在跳转支付页`, 'success')
      router.push({
        name: 'payment',
        query: {
          payment_id: currentPayment.value.payment_id,
          requirement_id: requirement.requirement_id,
          channel,
          amount_cny: currentPayment.value.amount_cny.toString(),
          expires_at: currentPayment.value.expires_at,
          ...(channel === 'alipay' ? { page: '1' } : { qr_content: currentPayment.value.alipay_order_string }),
        },
      })
      return
    }

    const confirmResult = await confirmPayment(auth.token, channel, currentPayment.value.payment_id)

    if (!confirmResult.ok) {
      throw new Error(confirmResult.message || `确认${payStageLabel.value}支付失败`)
    }

    showToast(`${payStageLabel.value}支付确认成功`, 'success')
    payVisible.value = false
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
  }
}


onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  await Promise.all([loadCoupons(), loadMyRequirements(), loadDepositRatio()])
})

const heroNavLinks = computed(() => {
  const links = [
    { label: '返回首页', to: { name: 'home' } },
    { label: '个人中心', to: { name: 'profile' }, active: true },
    { label: '我的定制资源', to: { name: 'my-custom-resources' } }
  ]

  return links
})
</script>

<template>
  <main class="page-shell custom-page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta">
        <div class="hero">
          <h1>{{ auth.username ? `${auth.username} 的个人中心` : '个人中心' }}</h1>
          <p class="desc">管理你的账户、优惠券与需求单，统一使用页面布局标准。</p>
        </div>
        <div class="hero-actions">
          <button class="refresh-btn" type="button" :disabled="loading || requirementLoading"
            @click="refreshProfileData">
            {{ loading || requirementLoading ? '刷新中...' : '刷新资料' }}
          </button>
        </div>
      </div>
    </HomeHeroSection>

    <section class="glass-panel">
      <header class="panel-head">
        <div>
          <h2>账户概览</h2>
          <p class="lead">在这里查看你的优惠券和折扣券背包。</p>
        </div>
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
          <h3>修改用户名</h3>
        </div>
        <div class="profile-update-row">
          <input v-model="newUsername" type="text" placeholder="请输入新的用户名" :disabled="usernameLoading" />
          <button class="ghost small" type="button" :disabled="usernameLoading" @click="updateUsername">
            {{ usernameLoading ? '保存中...' : '保存用户名' }}
          </button>
        </div>
      </section>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>我提交的需求单</h3>
          <button class="ghost small" type="button" :disabled="requirementLoading" @click="loadMyRequirements">
            {{ requirementLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="myRequirements.length === 0" class="empty">暂无已提交需求单</div>
        <ul v-else class="requirement-list">
          <li v-for="item in myRequirements" :key="item.requirement_id" class="requirement-row"
            :class="{ clickable: canPay(item.status) || canComment(item.status) || canResubmit(item.status) }"
            @click="handleRequirementAction(item)">
            <div class="requirement-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.requirement_id }}</span>
              <small v-if="hasBoundResource(item)" class="requirement-resource-visibility">{{
                formatResourceVisibility(item) }}</small>
              <small v-if="hasBoundResource(item) && !canToggleRequirementResourceVisibility(item)"
                class="requirement-note">资源公开/私有切换需在已付尾款后开放</small>
              <small v-if="item.status === 'rejected' && item.review_note" class="requirement-note">驳回原因：{{
                item.review_note }}</small>
            </div>
            <span class="requirement-status">{{ formatRequirementStatus(item.status) }}</span>
            <span>{{ formatBudget(item.budget) }}</span>
            <time>{{ formatRequirementTime(item.updated_at) }}</time>
            <div class="requirement-actions">
              <button v-if="hasBoundResource(item)" class="ghost small" type="button"
                :disabled="resourceVisibilityLoadingId === item.requirement_id || !canToggleRequirementResourceVisibility(item)"
                @click.stop="toggleRequirementResourceVisibility(item)">
                {{ resourceVisibilityLoadingId === item.requirement_id ? '提交中...' : toggleResourceVisibilityLabel(item)
                }}
              </button>
              <button v-if="canResubmit(item.status)" class="ghost small" type="button"
                @click.stop="openRequirementEditModal(item)">重新编辑</button>
              <button v-else-if="canPay(item.status)" class="ghost small" type="button"
                @click.stop="openPayModal(item)">去支付</button>
              <button v-else-if="canComment(item.status)" class="ghost small" type="button"
                @click.stop="openCommentModal(item)">去评价</button>
            </div>
          </li>
        </ul>
      </section>

      <PublishModal :visible="editVisible" modalTitle="重新编辑需求" submitText="重新提交审核" loadingText="提交中..."
        v-model:publishTitle="editTitle" v-model:publishDescription="editDescription" v-model:publishBudget="editBudget"
        v-model:publishAcceptance="editAcceptance" :publishLoading="editLoading" @close="closeEditModal"
        @submit="submitRequirementResubmit" />

      <div v-if="payVisible && payRequirement" class="modal-wrap" @click.self="closePayModal">
        <section class="pay-modal" aria-label="需求支付弹窗">
          <h3>支付{{ payStageLabel }}</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ payRequirement.title }}</p>
          <p class="pay-line"><strong>需求编号：</strong>{{ payRequirement.requirement_id }}</p>
          <p class="pay-line"><strong>预算：</strong>{{ formatBudget(payRequirement.budget) }}</p>
          <p v-if="!isFinalPayment" class="pay-line"><strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%</p>
          <p class="pay-amount">实付款：<strong>¥{{ payAmount.toFixed(2) }}</strong></p>

          <div class="pay-channel-row">
            <strong>支付方式：</strong>
            <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
              <button type="button" class="payment-option" :class="{ active: payChannel === 'alipay' }"
                @click="payChannel = 'alipay'">
                <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
                支付宝
              </button>
              <button type="button" class="payment-option" :class="{ active: payChannel === 'wechat' }"
                @click="payChannel = 'wechat'">
                <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信支付" />
                微信支付
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="ghost" type="button" @click="closePayModal">取消</button>
            <button class="ghost" type="button" :disabled="payLoading" @click="submitRequirementPayment">
              {{ payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}` }}
            </button>
          </div>
        </section>
      </div>

      <div v-if="commentVisible && commentRequirement" class="modal-wrap" @click.self="closeCommentModal">
        <section class="pay-modal" aria-label="需求评论弹窗">
          <h3>评价需求</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ commentRequirement.title }}</p>
          <p class="pay-line"><strong>需求编号：</strong>{{ commentRequirement.requirement_id }}</p>
          <div class="pay-line">
            <strong>评分：</strong>
            <div class="rating-row">
              <button v-for="star in 5" :key="star" type="button" class="rating-star" :class="starClass(star)"
                @click="setRating($event, star)">
                ★
              </button>
              <span class="rating-value">{{ commentRating.toFixed(1) }} 分</span>
            </div>
          </div>
          <div class="pay-line">
            <strong>评论内容：</strong>
          </div>
          <textarea class="comment-input" v-model="commentText" rows="4" maxlength="200"
            placeholder="请输入评论，最多 200 字"></textarea>
          <p class="tip">已输入 {{ commentText.length }} / 200 字</p>

          <div class="actions">
            <button class="ghost" type="button" @click="closeCommentModal">取消</button>
            <button class="ghost" type="button" :disabled="commentLoading" @click="submitRequirementComment">
              {{ commentLoading ? '提交中...' : '提交评论' }}
            </button>
          </div>
        </section>
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
