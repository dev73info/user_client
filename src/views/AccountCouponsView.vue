<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { apiUrl } from '@/api/http'
import {
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  sendProfileTwoFactorCode,
  updateProfile,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileTwoFactor,
  uploadProfileAvatar,
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
const avatarUrl = ref('')
const failedAvatarUrls = ref<Set<string>>(new Set())
const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
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
const twoFactorEnabled = ref(false)
const twoFactorTargetEnabled = ref(false)
const twoFactorCode = ref('')
const twoFactorCodeSending = ref(false)
const twoFactorLoading = ref(false)

const amountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'amount'),
)
const discountCoupons = computed(() =>
  coupons.value.filter((item) => item.discount_type === 'percent'),
)
const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
const twoFactorChanged = computed(() => twoFactorTargetEnabled.value !== twoFactorEnabled.value)
const twoFactorStatusText = computed(() => {
  if (twoFactorChanged.value) {
    return '待保存'
  }
  return twoFactorEnabled.value ? '已开启' : '已关闭'
})
const avatarSrc = computed(() => {
  const currentAvatarUrl = avatarUrl.value.trim()
  return currentAvatarUrl && !failedAvatarUrls.value.has(currentAvatarUrl)
    ? apiUrl(currentAvatarUrl)
    : ''
})
const avatarInitial = computed(
  () => Array.from(auth.username || newUsername.value || '用')[0] ?? '用',
)

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
    avatarUrl.value = profile.avatar_url ?? ''
    profileEmail.value = profile.email ?? ''
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
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

function openAvatarPicker() {
  avatarFileInput.value?.click()
}

function handleAvatarError() {
  const currentAvatarUrl = avatarUrl.value.trim()
  if (!currentAvatarUrl) return

  const next = new Set(failedAvatarUrls.value)
  next.add(currentAvatarUrl)
  failedAvatarUrls.value = next
}

async function handleAvatarChange(event: Event) {
  if (!auth.isAuthed) {
    showToast('请先登录后上传头像', 'error')
    return
  }

  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    showToast('头像仅支持图片格式', 'warning')
    if (input) input.value = ''
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('头像图片请控制在 2MB 以内', 'warning')
    if (input) input.value = ''
    return
  }

  avatarUploading.value = true
  try {
    const profile = await uploadProfileAvatar(auth.token, file)
    const nextAvatarUrl = profile.avatar_url ?? ''
    if (nextAvatarUrl) {
      const nextFailedUrls = new Set(failedAvatarUrls.value)
      nextFailedUrls.delete(nextAvatarUrl)
      failedAvatarUrls.value = nextFailedUrls
    }
    avatarUrl.value = nextAvatarUrl
    showToast('头像已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传头像失败', 'error')
  } finally {
    avatarUploading.value = false
    if (input) input.value = ''
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

async function sendTwoFactorVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改两步验证', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改两步验证', 'error')
    return
  }
  if (!twoFactorChanged.value) {
    showToast('两步验证设置未发生变化', 'info')
    return
  }

  twoFactorCodeSending.value = true
  try {
    await sendProfileTwoFactorCode(auth.token)
    showToast('验证码已发送到当前绑定邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送两步验证验证码失败', 'error')
  } finally {
    twoFactorCodeSending.value = false
  }
}

async function handleTwoFactorTargetChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const nextEnabled = input?.checked ?? twoFactorTargetEnabled.value
  twoFactorTargetEnabled.value = nextEnabled
  twoFactorCode.value = ''

  if (nextEnabled && !twoFactorEnabled.value && !twoFactorCodeSending.value) {
    await sendTwoFactorVerificationCode()
  }
}

async function submitTwoFactorChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改两步验证', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改两步验证', 'error')
    return
  }
  if (!twoFactorChanged.value) {
    showToast('两步验证设置未发生变化', 'info')
    return
  }

  const trimmedCode = twoFactorCode.value.trim()
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  twoFactorLoading.value = true
  try {
    const profile = await updateProfileTwoFactor(
      auth.token,
      twoFactorTargetEnabled.value,
      trimmedCode,
    )
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    twoFactorCode.value = ''
    await auth.fetchProfile(true).catch(() => undefined)
    showToast(twoFactorEnabled.value ? '两步验证已开启' : '两步验证已关闭', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新两步验证失败', 'error')
  } finally {
    twoFactorLoading.value = false
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
        <button class="ghost small" type="button" @click="router.push({ name: 'workbench-realname' })">
          实名认证
        </button>
      </div>

      <div class="account-settings-grid">
        <section class="account-settings-card account-avatar-card">
          <h4>头像</h4>
          <div class="account-avatar-row">
            <button class="account-avatar-button" type="button" :disabled="avatarUploading" @click="openAvatarPicker">
              <img v-if="avatarSrc" :src="avatarSrc" alt="用户头像" @error="handleAvatarError" />
              <span v-else>{{ avatarInitial }}</span>
            </button>
            <div class="account-avatar-copy">
              <strong>{{ auth.username || newUsername || '当前用户' }}</strong>
              <small class="requirement-note">支持 PNG、JPG、WEBP、GIF，最大 2MB。</small>
              <button class="ghost small" type="button" :disabled="avatarUploading" @click="openAvatarPicker">
                {{ avatarUploading ? '上传中...' : '更换头像' }}
              </button>
            </div>
          </div>
          <input ref="avatarFileInput" class="account-avatar-input" type="file"
            accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarChange" />
        </section>

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
            <input v-model="emailCode" type="text" maxlength="6" placeholder="输入6位验证码" :disabled="emailLoading" />
            <button class="ghost small" type="button" :disabled="emailLoading" @click="submitEmailChange">
              {{ emailLoading ? '保存中...' : '保存邮箱' }}
            </button>
          </div>
        </section>
        <section class="account-settings-card account-password-card">
          <h4>修改密码</h4>
          <div class="profile-update-row account-password-row account-password-row--send">
            <input v-model="newPassword" type="password" placeholder="请输入新的密码，至少 6 位"
              :disabled="passwordLoading || passwordCodeSending" />
            <button class="ghost small" type="button"
              :disabled="passwordLoading || passwordCodeSending || !profileEmail" @click="sendPasswordVerificationCode">
              {{ passwordCodeSending ? '发送中...' : '发送验证码' }}
            </button>
          </div>
          <div class="profile-update-row profile-update-row--triple account-password-row account-password-row--confirm">
            <input v-model="confirmPassword" type="password" placeholder="请再次输入新密码" :disabled="passwordLoading" />
            <input v-model="passwordCode" type="text" maxlength="6" placeholder="输入6位验证码" :disabled="passwordLoading" />
            <button class="ghost small" type="button" :disabled="passwordLoading || !profileEmail"
              @click="submitPasswordChange">
              {{ passwordLoading ? '保存中...' : '保存密码' }}
            </button>
          </div>
        </section>

        <section class="account-settings-card account-security-card">
          <div class="account-security-head">
            <div>
              <h4>两步验证</h4>
              <small class="requirement-note">当前邮箱：{{ accountEmailLabel }}</small>
            </div>
            <span class="account-security-status" :class="{ pending: twoFactorChanged }">
              {{ twoFactorStatusText }}
            </span>
          </div>

          <label class="account-security-toggle-row">
            <span class="account-security-toggle-copy">
              <strong>邮箱验证码保护</strong>
              <small class="requirement-note">
                {{
                  twoFactorTargetEnabled
                    ? '登录时校验邮箱验证码，登录态最多保留 1 天。'
                    : '关闭后登录态有效期按系统设置。'
                }}
              </small>
            </span>
            <span class="account-switch-control" :class="{ active: twoFactorTargetEnabled }">
              <input v-model="twoFactorTargetEnabled" type="checkbox"
                :disabled="twoFactorLoading || twoFactorCodeSending || !profileEmail"
                @change="handleTwoFactorTargetChange" />
              <span class="account-switch-track" aria-hidden="true">
                <span class="account-switch-thumb"></span>
              </span>
            </span>
          </label>

          <div class="account-security-actions">
            <input v-model="twoFactorCode" type="text" maxlength="6" placeholder="输入 6 位验证码"
              :disabled="twoFactorLoading || !profileEmail || !twoFactorChanged" />
            <button class="ghost small" type="button" :disabled="twoFactorCodeSending || twoFactorLoading || !profileEmail || !twoFactorChanged
              " @click="sendTwoFactorVerificationCode">
              {{ twoFactorCodeSending ? '发送中...' : '发送验证码' }}
            </button>
            <button class="ghost small" type="button" :disabled="twoFactorLoading || !profileEmail || !twoFactorChanged"
              @click="submitTwoFactorChange">
              {{ twoFactorLoading ? '保存中...' : '保存设置' }}
            </button>
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
            <span class="coupon-status" :class="item.status">{{
              item.status === 'used' ? '已使用' : '可用'
              }}</span>
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
            <span class="coupon-status" :class="item.status">{{
              item.status === 'used' ? '已使用' : '可用'
              }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">
            门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}
          </p>
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

.account-settings-card .profile-update-row:last-child {
  margin-bottom: 0;
}

.account-avatar-card {
  display: grid;
  align-content: start;
}

.account-avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.account-avatar-button {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 76px;
  height: 76px;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 28px;
  font-weight: 900;
}

.account-avatar-button:disabled {
  cursor: wait;
  opacity: 0.78;
}

.account-avatar-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-avatar-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.account-avatar-copy strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-avatar-copy .ghost.small {
  justify-self: start;
}

.account-avatar-input {
  display: none;
}

.account-coupon-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.account-password-card {
  display: grid;
  gap: 12px;
}

.account-password-card .account-password-row {
  display: grid;
  gap: 10px;
  margin-bottom: 0;
}

.account-password-row--send {
  grid-template-columns: minmax(0, 1fr) auto;
}

.account-password-row--confirm {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
}

.account-password-card .ghost.small {
  min-width: 110px;
  justify-self: end;
}

.account-security-card {
  display: grid;
  align-content: start;
  gap: 14px;
  grid-column: 1 / -1;
  padding: 18px;
  border-color: rgba(191, 210, 245, 0.98);
}

.account-security-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.account-security-head h4 {
  margin-bottom: 6px;
}

.account-security-status {
  flex: 0 0 auto;
  min-width: 62px;
  padding: 5px 10px;
  border: 1px solid rgba(134, 239, 172, 0.92);
  border-radius: 999px;
  background: rgba(240, 253, 244, 0.96);
  color: #166534;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  text-align: center;
}

.account-security-status.pending {
  border-color: rgba(253, 230, 138, 0.95);
  background: rgba(255, 251, 235, 0.98);
  color: #92400e;
}

.account-security-toggle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid rgba(224, 232, 255, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.account-security-toggle-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.account-security-toggle-copy strong {
  color: #0f172a;
  font-weight: 800;
}

.account-switch-control {
  position: relative;
  display: inline-grid;
  width: 46px;
  height: 26px;
}

.account-switch-control input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.account-switch-control input:disabled {
  cursor: not-allowed;
}

.account-switch-track {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(203, 213, 225, 0.98);
  border-radius: 999px;
  background: #e2e8f0;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.account-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
  transition: transform 0.18s ease;
}

.account-switch-control.active .account-switch-track {
  border-color: rgba(37, 99, 235, 0.92);
  background: #2563eb;
}

.account-switch-control.active .account-switch-thumb {
  transform: translateX(20px);
}

.account-security-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.account-security-actions input {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 12px;
  padding: 12px 14px;
  background: #ffffff;
  color: #0f172a;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.account-security-actions input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.account-security-actions input::placeholder {
  color: #94a3b8;
}

.account-security-actions .ghost.small {
  min-width: 104px;
}

.account-security-actions .ghost.small:disabled {
  border-color: rgba(226, 232, 240, 0.96);
  background: #f8fafc;
  color: #94a3b8;
  box-shadow: none;
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

  .account-password-row--send,
  .account-password-row--confirm,
  .account-security-actions,
  .account-security-toggle-row {
    grid-template-columns: 1fr;
  }

  .account-security-head {
    align-items: flex-start;
  }

  .account-switch-control {
    justify-self: start;
  }

  .account-password-card .ghost.small,
  .account-security-actions .ghost.small {
    width: 100%;
    justify-self: stretch;
  }
}
</style>
