<script setup lang="ts">
import { Promotion, RefreshRight } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  completeWechatFaceidVerification,
  getMyRealnameVerification,
  startWechatFaceidVerification,
  submitMyRealnameVerification,
  type RealnameAuthType,
  type CompleteWechatFaceidVerificationPayload,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import { HttpError, apiUrl } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const submitting = ref(false)
const faceidStarting = ref(false)
const faceidChecking = ref(false)
const current = ref<UserRealnameVerification | null>(null)
const reviewerAvatarLoadFailed = ref(false)
const faceidAuthUrl = ref('')
const faceidQrDataUrl = ref('')
const faceidOrderNo = ref('')
const faceidBizToken = ref('')
const FACEID_POLL_INTERVAL_MS = 10_000

let faceidPollTimer: number | null = null
let faceidCheckInFlight = false

type FaceidCheckOptions = {
  background?: boolean
  silent?: boolean
}

const form = reactive({
  authType: 'IDENTITY_CARD' as RealnameAuthType,
  realName: '',
  idCardNo: '',
  companyName: '',
  unifiedSocialCreditCode: '',
  businessLicenseNo: '',
  operatorName: '',
  operatorIdCardNo: '',
})

const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
  if (!raw || raw === '/realname') {
    return ''
  }

  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }

  return raw
})

const statusText = computed(() => {
  const status = current.value?.status
  if (!status) return '未提交'
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  return '已驳回'
})

const statusType = computed<'info' | 'warning' | 'success' | 'danger'>(() => {
  const status = current.value?.status
  if (!status) return 'info'
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
})

const realnameSubmitted = computed(() => Boolean(current.value))
const identityCardSelected = computed(() => form.authType === 'IDENTITY_CARD')
const realnameApproved = computed(() => current.value?.status === 'approved')
const realnameRejected = computed(() => current.value?.status === 'rejected')
const realnameLocked = computed(() => current.value?.status === 'pending' || realnameApproved.value)
const submitDisabled = computed(
  () => realnameApproved.value || (realnameLocked.value && !identityCardSelected.value),
)

const idCardPlaceholder = computed(() => {
  const masked = current.value?.id_card_no_masked
  return masked ? `当前 ${masked}` : '请输入证件号'
})

const submitButtonText = computed(() => {
  if (realnameApproved.value) return '已通过认证'
  if (identityCardSelected.value) return current.value ? '重新发起微信刷脸' : '微信刷脸认证'
  if (!current.value || realnameRejected.value) return current.value ? '重新提交认证' : '提交认证'
  return '已提交，不能修改'
})

const reviewerName = computed(() => current.value?.reviewed_by?.trim() || '—')
const reviewerInitial = computed(
  () => Array.from(reviewerName.value === '—' ? '审' : reviewerName.value)[0] ?? '审',
)
const reviewerAvatarSrc = computed(() => {
  if (reviewerAvatarLoadFailed.value) {
    return ''
  }

  const avatarUrl = current.value?.reviewed_by_avatar_url?.trim()
  return avatarUrl ? apiUrl(avatarUrl) : ''
})

function handleReviewerAvatarError() {
  reviewerAvatarLoadFailed.value = true
}

function patchForm(record: UserRealnameVerification) {
  form.authType = record.auth_type
  form.realName = record.real_name ?? ''
  form.idCardNo = ''
  form.companyName = record.company_name ?? ''
  form.unifiedSocialCreditCode = record.unified_social_credit_code ?? ''
  form.businessLicenseNo = record.business_license_no ?? ''
  form.operatorName = record.operator_name ?? ''
  form.operatorIdCardNo = ''
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function tryRestoreBusinessPage(record?: UserRealnameVerification | null) {
  const target = redirectTarget.value
  if (!target) {
    return
  }

  const status = record?.status ?? current.value?.status
  // 只有已通过才自动返回，审核中需要停留提示用户
  if (status !== 'approved') {
    return
  }

  await router.replace(target)
}

function validate() {
  if (realnameSubmitted.value && identityCardSelected.value && !realnameRejected.value) {
    return ''
  }

  if (!form.realName.trim() || !form.idCardNo.trim()) {
    return '请填写姓名和证件号'
  }

  return ''
}

function buildPayload(): SubmitRealnameVerificationPayload {
  const payload: SubmitRealnameVerificationPayload = {
    auth_type: form.authType,
  }

  if (form.realName.trim()) payload.real_name = form.realName.trim()
  if (form.idCardNo.trim()) payload.id_card_no = form.idCardNo.trim()
  if (form.companyName.trim()) payload.company_name = form.companyName.trim()
  if (form.unifiedSocialCreditCode.trim()) {
    payload.unified_social_credit_code = form.unifiedSocialCreditCode.trim()
  }
  if (form.businessLicenseNo.trim()) payload.business_license_no = form.businessLicenseNo.trim()
  if (form.operatorName.trim()) payload.operator_name = form.operatorName.trim()
  if (form.operatorIdCardNo.trim()) payload.operator_id_card_no = form.operatorIdCardNo.trim()

  return payload
}

function routeStringValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

function faceidReturnPayload(): CompleteWechatFaceidVerificationPayload {
  const orderNo = routeStringValue(route.query.orderNo) || routeStringValue(route.query.order_no)
  const bizToken =
    routeStringValue(route.query.BizToken) ||
    routeStringValue(route.query.bizToken) ||
    routeStringValue(route.query.biz_token)

  return {
    order_no: orderNo || undefined,
    biz_token: bizToken || undefined,
  }
}

async function renderFaceidQrCode(url: string) {
  faceidQrDataUrl.value = await QRCode.toDataURL(url, {
    width: 220,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  })
}

function stopFaceidAutoPolling() {
  if (faceidPollTimer === null) {
    return
  }

  window.clearInterval(faceidPollTimer)
  faceidPollTimer = null
}

function startFaceidAutoPolling() {
  stopFaceidAutoPolling()
  if (!faceidAuthUrl.value || realnameApproved.value) {
    return
  }

  faceidPollTimer = window.setInterval(() => {
    void checkWechatFaceidResult({}, { background: true, silent: true })
  }, FACEID_POLL_INTERVAL_MS)
}

function clearFaceidChallenge() {
  stopFaceidAutoPolling()
  faceidAuthUrl.value = ''
  faceidQrDataUrl.value = ''
  faceidOrderNo.value = ''
  faceidBizToken.value = ''
}

function openWechatFaceidPage() {
  if (!faceidAuthUrl.value) {
    return
  }
  window.open(faceidAuthUrl.value, '_blank', 'noopener,noreferrer')
}

async function startWechatFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (realnameApproved.value) {
    showToast('实名认证已通过，无需重复核身', 'success')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
    return
  }

  faceidStarting.value = true
  try {
    const result = await startWechatFaceidVerification(auth.token, buildPayload())
    current.value = result.verification
    reviewerAvatarLoadFailed.value = false
    patchForm(result.verification)
    faceidAuthUrl.value = result.auth_url
    faceidOrderNo.value = result.order_no
    faceidBizToken.value = result.biz_token
    await renderFaceidQrCode(result.auth_url)
    startFaceidAutoPolling()
    showToast('微信人脸核身已创建', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起微信人脸核身失败', 'error')
  } finally {
    faceidStarting.value = false
  }
}

async function checkWechatFaceidResult(
  payload: CompleteWechatFaceidVerificationPayload = {},
  options: FaceidCheckOptions = {},
) {
  if (faceidCheckInFlight) {
    return
  }

  auth.hydrate()
  if (!auth.token.trim()) {
    stopFaceidAutoPolling()
    if (!options.silent) {
      showToast('登录状态已失效，请重新登录', 'error')
    }
    return
  }

  const queryPayload = {
    order_no: payload.order_no || faceidOrderNo.value || undefined,
    biz_token: payload.biz_token || faceidBizToken.value || undefined,
  }

  faceidCheckInFlight = true
  if (!options.background) {
    faceidChecking.value = true
  }
  try {
    const updated = await completeWechatFaceidVerification(auth.token, queryPayload)
    if (options.background && updated.status === 'rejected') {
      return
    }

    current.value = updated
    reviewerAvatarLoadFailed.value = false
    patchForm(updated)
    if (updated.status === 'approved') {
      clearFaceidChallenge()
      showToast('微信人脸核身已通过', 'success')
      await tryRestoreBusinessPage(updated)
    } else if (updated.status === 'rejected') {
      clearFaceidChallenge()
      showToast(updated.review_note || '微信人脸核身未通过', 'error')
    } else if (!options.silent) {
      showToast('微信人脸核身结果已更新', 'success')
    }
  } catch (err) {
    if (!options.silent) {
      showToast(err instanceof Error ? err.message : '查询微信人脸核身结果失败', 'error')
    }
  } finally {
    faceidCheckInFlight = false
    if (!options.background) {
      faceidChecking.value = false
    }
  }
}

async function submit() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (identityCardSelected.value) {
    await startWechatFaceid()
    return
  }

  if (realnameLocked.value) {
    showToast('实名认证审核中或已通过时不能修改', 'warning')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
    return
  }

  submitting.value = true
  try {
    const updated = await submitMyRealnameVerification(auth.token, buildPayload())
    current.value = updated
    reviewerAvatarLoadFailed.value = false
    patchForm(updated)
    showToast(
      updated.status === 'approved' ? '实名认证信息已更新' : '实名认证信息已提交，请等待审核',
      'success',
    )
    await tryRestoreBusinessPage(updated)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交实名认证失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function loadCurrentRealname() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    reviewerAvatarLoadFailed.value = false
    patchForm(record)
    await tryRestoreBusinessPage(record)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return
    }

    showToast(err instanceof Error ? err.message : '加载实名认证状态失败', 'error')
  }
}

onMounted(async () => {
  await loadCurrentRealname()
  const payload = faceidReturnPayload()
  if (payload.order_no || payload.biz_token) {
    await checkWechatFaceidResult(payload)
  }
})

onBeforeUnmount(() => {
  stopFaceidAutoPolling()
})
</script>

<template>
  <main class="portal-page realname-page-shell">
    <section class="realname-layout">
      <el-card shadow="never" class="realname-card realname-card--status">
        <div v-if="current" class="realname-metrics">
          <div class="realname-metrics__item">
            <span>证件类型</span>
            <strong>{{
              current.auth_type === 'IDENTITY_CARD'
                ? '大陆身份证'
                : current.auth_type === 'RESIDENCE_HK_MC'
                  ? '港澳居民居住证'
                  : '台湾居民居住证'
            }}</strong>
          </div>
          <div class="realname-metrics__item">
            <span>审核人</span>
            <div class="realname-reviewer">
              <span class="realname-reviewer__avatar" aria-hidden="true">
                <img v-if="reviewerAvatarSrc" :src="reviewerAvatarSrc" :alt="`${reviewerName} 的头像`"
                  @error="handleReviewerAvatarError" />
                <span v-else>{{ reviewerInitial }}</span>
              </span>
              <strong>{{ reviewerName }}</strong>
            </div>
          </div>
          <div class="realname-metrics__item">
            <span>审核时间</span>
            <strong>{{ formatTime(current.reviewed_at) }}</strong>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="realname-card">
        <div class="realname-form__head">
          <h3>提交认证信息</h3>
          <el-tag :type="statusType" class="realname-form-status-tag" round>实名认证：{{ statusText }}</el-tag>
        </div>

        <div class="realname-form-layout" :class="{ 'realname-form-layout--with-faceid': faceidAuthUrl }">
          <el-form label-position="top" class="realname-form" @submit.prevent>
            <el-form-item label="证件类型">
              <el-radio-group v-model="form.authType" :disabled="realnameLocked">
                <el-radio value="IDENTITY_CARD">大陆身份证</el-radio>
                <el-radio value="RESIDENCE_HK_MC">港澳居民居住证</el-radio>
                <el-radio value="RESIDENCE_TAIWAN">台湾居民居住证</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="姓名">
              <el-input v-model="form.realName" maxlength="120" placeholder="请输入真实姓名" :disabled="realnameLocked" />
            </el-form-item>
            <el-form-item label="证件号">
              <el-input v-model="form.idCardNo" maxlength="64" :placeholder="idCardPlaceholder"
                :disabled="realnameLocked" />
            </el-form-item>

            <div class="realname-form__actions">
              <el-button type="primary" class="realname-submit-btn" :loading="submitting || faceidStarting"
                :disabled="submitDisabled" @click="submit">
                <el-icon v-if="identityCardSelected">
                  <Promotion />
                </el-icon>
                {{ submitButtonText }}
              </el-button>
            </div>
          </el-form>

          <div v-if="faceidAuthUrl" class="realname-faceid-panel">
            <div class="realname-faceid-panel__main">
              <div class="realname-faceid-panel__copy">
                <strong>微信扫码核身</strong>
                <span>二维码有效期约 120 分钟</span>
              </div>
              <img v-if="faceidQrDataUrl" class="realname-faceid-panel__qr" :src="faceidQrDataUrl" alt="微信人脸核身二维码" />
            </div>
            <div class="realname-faceid-panel__actions">
              <el-button class="realname-plain-btn" @click="openWechatFaceidPage">
                <el-icon>
                  <Promotion />
                </el-icon>
                打开核身页面
              </el-button>
              <el-button type="primary" class="realname-submit-btn" :loading="faceidChecking"
                @click="checkWechatFaceidResult()">
                <el-icon>
                  <RefreshRight />
                </el-icon>
                查询结果
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </section>
  </main>
</template>

<style scoped>
.realname-page-shell {
  gap: 26px;
}

.realname-layout {
  display: grid;
  gap: 28px;
}

:deep(.realname-card.el-card) {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
  color: #0f172a;
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
}

:deep(.realname-card .el-card__body) {
  padding: 20px;
}

.realname-metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.realname-metrics__item {
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.92);
}

.realname-metrics__item span {
  color: #64748b;
  font-size: 12px;
}

.realname-metrics__item strong {
  color: #0f172a;
  font-size: 14px;
}

.realname-reviewer {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.realname-reviewer__avatar {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(219, 234, 254, 0.94);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.realname-reviewer__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.realname-reviewer__avatar>span {
  color: inherit;
  font-size: inherit;
}

.realname-form__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.realname-form__head h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.realname-form-layout {
  display: grid;
  gap: 20px;
}

.realname-form-layout--with-faceid {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  align-items: start;
}

.realname-form {
  min-width: 0;
}

.realname-form__actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.realname-faceid-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(147, 197, 253, 0.55);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(248, 250, 252, 0.92));
}

.realname-faceid-panel__main {
  display: grid;
  gap: 14px;
  justify-items: center;
  text-align: center;
}

.realname-faceid-panel__copy {
  display: grid;
  gap: 6px;
}

.realname-faceid-panel__copy strong {
  color: #0f172a;
  font-size: 16px;
}

.realname-faceid-panel__copy span {
  color: #64748b;
  font-size: 13px;
}

.realname-faceid-panel__qr {
  width: 148px;
  height: 148px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(198, 210, 236, 0.78);
  background: #fff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.12);
}

.realname-faceid-panel__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

:deep(.realname-form .el-form-item__label) {
  color: #475569;
  font-weight: 600;
}

:deep(.realname-form .el-radio) {
  color: #0f172a;
}

:deep(.realname-form .el-radio__label) {
  color: #0f172a;
}

:deep(.realname-form .el-input__wrapper) {
  background: rgba(248, 250, 252, 0.96);
  box-shadow: inset 0 0 0 1px rgba(198, 210, 236, 0.72);
}

:deep(.realname-form .el-input__inner) {
  color: #0f172a;
}

:deep(.realname-form .el-input__inner::placeholder) {
  color: #94a3b8;
}

:deep(.realname-form .el-input__wrapper.is-focus) {
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.8);
}

:deep(.realname-plain-btn.el-button) {
  border-color: rgba(198, 210, 236, 0.82);
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.92);
}

:deep(.realname-plain-btn.el-button:hover) {
  border-color: rgba(96, 165, 250, 0.72);
  background: rgba(219, 234, 254, 0.96);
  color: #1d4ed8;
}

:deep(.realname-submit-btn.el-button--primary) {
  border-color: rgba(37, 99, 235, 0.82);
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
}

:deep(.realname-submit-btn.el-button .el-icon),
:deep(.realname-plain-btn.el-button .el-icon) {
  margin-right: 6px;
}

:deep(.realname-submit-btn.el-button--primary:hover) {
  border-color: rgba(37, 99, 235, 0.95);
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
}

@media (max-width: 720px) {
  :deep(.realname-card .el-card__body) {
    padding: 16px;
  }

  .realname-form-layout--with-faceid {
    grid-template-columns: 1fr;
  }

  .realname-faceid-panel {
    margin-top: 2px;
  }
}
</style>
