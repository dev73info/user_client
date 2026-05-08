<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import {
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  updateProfile,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileSubscriptions,
} from '@/api/settings'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const profileLoading = ref(false)
const couponLoading = ref(false)
const coupons = ref<CouponItem[]>([])
const newUsername = ref('')
const usernameLoading = ref(false)
const profileEmail = ref('')
const newEmail = ref('')
const emailCode = ref('')
const emailCodeSending = ref(false)
const emailLoading = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordCode = ref('')
const passwordCodeSending = ref(false)
const passwordLoading = ref(false)
const subscriptionOfficialActivity = ref(false)
const subscriptionLoading = ref(false)

const amountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'amount'))
const discountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'percent'))
const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')

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

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  profileLoading.value = true
  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
    profileEmail.value = profile.email ?? ''
    subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
    if (!newEmail.value) {
      newEmail.value = profile.email ?? ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载个人资料失败', 'error')
  } finally {
    profileLoading.value = false
  }
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
  if (trimmed === auth.username) {
    showToast('用户名未发生变化', 'info')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = auth.username
    showToast('用户名已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改用户名失败', 'error')
  } finally {
    usernameLoading.value = false
  }
}

async function sendEmailVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmed = newEmail.value.trim()
  if (!trimmed) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmed === profileEmail.value) {
    showToast('新邮箱不能与当前邮箱相同', 'warning')
    return
  }

  emailCodeSending.value = true
  try {
    await sendProfileEmailChangeCode(auth.token, trimmed)
    showToast('验证码已发送到新邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送邮箱验证码失败', 'error')
  } finally {
    emailCodeSending.value = false
  }
}

async function submitEmailChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmedEmail = newEmail.value.trim()
  const trimmedCode = emailCode.value.trim()
  if (!trimmedEmail) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  emailLoading.value = true
  try {
    const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
    profileEmail.value = profile.email ?? ''
    newEmail.value = profile.email ?? ''
    emailCode.value = ''
    showToast('邮箱已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改邮箱失败', 'error')
  } finally {
    emailLoading.value = false
  }
}

async function sendPasswordVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改密码', 'error')
    return
  }

  passwordCodeSending.value = true
  try {
    await sendProfilePasswordCode(auth.token)
    showToast('验证码已发送到当前绑定邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送密码验证码失败', 'error')
  } finally {
    passwordCodeSending.value = false
  }
}

async function submitPasswordChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }

  const trimmedPassword = newPassword.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  const trimmedCode = passwordCode.value.trim()

  if (trimmedPassword.length < 6) {
    showToast('新密码至少 6 位', 'error')
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    showToast('两次输入的新密码不一致', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  passwordLoading.value = true
  try {
    await updateProfilePassword(auth.token, trimmedPassword, trimmedCode)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordCode.value = ''
    showToast('密码已更新，请使用新密码登录', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改密码失败', 'error')
  } finally {
    passwordLoading.value = false
  }
}

async function saveSubscriptions() {
  if (!auth.isAuthed) {
    showToast('请先登录', 'error')
    return
  }

  subscriptionLoading.value = true
  try {
    const profile = await updateProfileSubscriptions(auth.token, {
      subscribe_official_activity: subscriptionOfficialActivity.value,
    })
    subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
    showToast('订阅设置已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新订阅设置失败', 'error')
  } finally {
    subscriptionLoading.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  await Promise.all([loadProfile(), loadCoupons()])
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page account-coupons-page">

    <section class="wallet-section account-settings-section">
      <div class="wallet-header">
        <div>
          <h3>账户资料</h3>
          <small class="requirement-note">当前邮箱：{{ accountEmailLabel }}</small>
        </div>
        <button class="ghost small" type="button" @click="router.push({ name: 'workbench-realname' })">实名认证</button>
      </div>

      <div class="account-settings-grid">
        <section class="account-settings-card">
          <h4>修改用户名</h4>
          <div class="profile-update-row">
            <input v-model="newUsername" type="text" placeholder="请输入新的用户名" :disabled="usernameLoading" />
            <button class="ghost small" type="button" :disabled="usernameLoading" @click="updateUsername">
              {{ usernameLoading ? '保存中...' : '保存用户名' }}
            </button>
          </div>
        </section>

        <section class="account-settings-card">
          <h4>修改邮箱</h4>
          <div class="profile-update-row">
            <input v-model="newEmail" type="email" placeholder="请输入新的邮箱地址"
              :disabled="emailLoading || emailCodeSending" />
            <button class="ghost small" type="button" :disabled="emailLoading || emailCodeSending"
              @click="sendEmailVerificationCode">
              {{ emailCodeSending ? '发送中...' : '发送验证码' }}
            </button>
          </div>
          <div class="profile-update-row">
            <input v-model="emailCode" type="text" maxlength="6" placeholder="请输入 6 位邮箱验证码" :disabled="emailLoading" />
            <button class="ghost small" type="button" :disabled="emailLoading" @click="submitEmailChange">
              {{ emailLoading ? '保存中...' : '保存邮箱' }}
            </button>
          </div>
        </section>
      </div>
    </section>

    <section class="wallet-section account-settings-section">
      <div class="wallet-header">
        <div>
          <h3>安全与订阅</h3>
          <small class="requirement-note">密码验证码会发送到当前绑定邮箱。</small>
        </div>
      </div>

      <div class="account-settings-grid">
        <section class="account-settings-card">
          <h4>修改密码</h4>
          <div class="profile-update-row">
            <input v-model="newPassword" type="password" placeholder="请输入新的密码，至少 6 位"
              :disabled="passwordLoading || passwordCodeSending" />
            <button class="ghost small" type="button"
              :disabled="passwordLoading || passwordCodeSending || !profileEmail" @click="sendPasswordVerificationCode">
              {{ passwordCodeSending ? '发送中...' : '发送验证码' }}
            </button>
          </div>
          <div class="profile-update-row profile-update-row--triple account-password-row">
            <input v-model="confirmPassword" type="password" placeholder="请再次输入新密码" :disabled="passwordLoading" />
            <input v-model="passwordCode" type="text" maxlength="6" placeholder="请输入 6 位邮箱验证码"
              :disabled="passwordLoading" />
            <button class="ghost small" type="button" :disabled="passwordLoading || !profileEmail"
              @click="submitPasswordChange">
              {{ passwordLoading ? '保存中...' : '保存密码' }}
            </button>
          </div>
        </section>

        <section class="account-settings-card">
          <h4>消息订阅</h4>
          <div class="subscription-settings">
            <label class="subscription-card account-subscription-card">
              <div class="subscription-copy">
                <strong>官方活动</strong>
                <small class="requirement-note">接收官方公告、活动和运营消息。</small>
              </div>
              <span class="subscription-switch-wrap">
                <input v-model="subscriptionOfficialActivity" class="subscription-switch-input" type="checkbox"
                  :disabled="subscriptionLoading" />
                <span class="subscription-switch" aria-hidden="true">
                  <span class="subscription-switch__thumb"></span>
                </span>
              </span>
            </label>

            <div class="subscription-actions">
              <button class="ghost small" type="button" :disabled="subscriptionLoading" @click="saveSubscriptions">
                {{ subscriptionLoading ? '保存中...' : '保存订阅设置' }}
              </button>
            </div>
          </div>
        </section>
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
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用'
              }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
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
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用'
              }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.account-coupons-page {
  gap: 16px;
}

.account-coupons-summary__head {
  align-items: flex-start;
}

.account-coupons-summary__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.account-coupons-summary__grid article,
.account-settings-card {
  padding: 16px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
}

.account-coupons-summary__grid article {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.account-coupons-summary__grid strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 24px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-coupons-summary__grid span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.account-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.account-settings-card h4 {
  margin: 0 0 14px;
  color: #0f172a;
  font-size: 16px;
}

.account-settings-card .profile-update-row:last-child,
.account-settings-card .subscription-settings:last-child {
  margin-bottom: 0;
}

.account-subscription-card {
  box-shadow: none;
}

.account-coupon-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

@media (max-width: 1100px) {

  .account-coupons-summary__grid,
  .account-settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {

  .wallet-header,
  .account-coupons-summary__grid,
  .account-settings-grid {
    grid-template-columns: 1fr;
  }

  .wallet-header {
    align-items: stretch;
  }

  .account-coupons-summary__grid strong {
    white-space: normal;
  }

  .account-password-row {
    grid-template-columns: 1fr;
  }
}
</style>
