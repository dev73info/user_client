<script setup lang="ts">
import { Promotion, RefreshRight } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  completeAsignIdentify,
  getMyRealnameVerification,
  startAsignIdentify,
  submitMyRealnameVerification,
  uploadGuardianConsentFile,
  type RealnameAuthType,
  type StartAsignIdentifyPayload,
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
const consentUploading = ref(false)
const consentFileInput = ref<HTMLInputElement | null>(null)
const current = ref<UserRealnameVerification | null>(null)
const reviewerAvatarLoadFailed = ref(false)
const faceidAuthUrl = ref('')
const faceidQrDataUrl = ref('')
const faceidOrderNo = ref('')
const faceidBizToken = ref('')
const faceidBizId = ref('')
const FACEID_POLL_INTERVAL_MS = 10_000

const isMobile = ref(false)
let mobileMatch: MediaQueryList | null = null
function syncMobileViewport() {
  isMobile.value = Boolean(mobileMatch?.matches)
}

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
  mobile: '',
  companyName: '',
  unifiedSocialCreditCode: '',
  businessLicenseNo: '',
  operatorName: '',
  operatorIdCardNo: '',
  guardianConsent: false,
  guardianConsentFile: '',
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
const enterpriseSelected = computed(() => form.authType === 'ENTERPRISE')
const realnameApproved = computed(() => current.value?.status === 'approved')
const realnameRejected = computed(() => current.value?.status === 'rejected')
const realnameLocked = computed(() => current.value?.status === 'pending' || realnameApproved.value)
const identityCardRequiredMissing = computed(
  () =>
    identityCardSelected.value &&
    (!form.realName.trim() || !form.idCardNo.trim() || !form.mobile.trim()),
)
const minorGuardianRequiredMissing = computed(
  () => isMinor14To18.value && (!form.guardianConsent || !form.guardianConsentFile.trim()),
)
const submitDisabled = computed(
  () =>
    realnameLocked.value ||
    identityCardRequiredMissing.value ||
    isUnder14.value ||
    minorGuardianRequiredMissing.value,
)

function idCardAge(idCardNo: string): number | null {
  const text = idCardNo.trim().toUpperCase()
  if (text.length !== 18) {
    return null
  }
  const birthday = text.slice(6, 14)
  if (!/^\d{8}$/.test(birthday)) {
    return null
  }
  const year = Number(birthday.slice(0, 4))
  const month = Number(birthday.slice(4, 6))
  const day = Number(birthday.slice(6, 8))
  const birth = new Date(year, month - 1, day)
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null
  }
  const now = new Date()
  let age = now.getFullYear() - year
  const monthDiff = now.getMonth() - (month - 1)
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1
  }
  return age
}

// 仅在选中大陆身份证且证件号为 18 位时计算年龄
const idCardAgeValue = computed(() =>
  identityCardSelected.value ? idCardAge(form.idCardNo) : null,
)
// 未满 14 周岁：禁止实名
const isUnder14 = computed(() =>
  idCardAgeValue.value !== null && idCardAgeValue.value < 14,
)
// 14~18 周岁：需要监护人同意
const isMinor14To18 = computed(() =>
  idCardAgeValue.value !== null &&
  idCardAgeValue.value >= 14 &&
  idCardAgeValue.value < 18,
)
// 已满 18 周岁：无需监护人同意
const isAdult = computed(() =>
  idCardAgeValue.value !== null && idCardAgeValue.value >= 18,
)

const idCardPlaceholder = computed(() => {
  const masked = current.value?.id_card_no_masked
  return masked ? `${masked}` : '请输入证件号'
})

const submitButtonText = computed(() => {
  if (realnameApproved.value) return '已通过认证'
  if (realnameLocked.value && identityCardSelected.value) return '认证处理中'
  if (identityCardSelected.value) return current.value ? '重新发起实名认证' : '实名认证'
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
  form.mobile = ''
  form.companyName = record.company_name ?? ''
  form.unifiedSocialCreditCode = record.unified_social_credit_code ?? ''
  form.businessLicenseNo = record.business_license_no ?? ''
  form.operatorName = record.operator_name ?? ''
  form.operatorIdCardNo = ''
  form.guardianConsent = record.guardian_consent ?? false
  form.guardianConsentFile = record.guardian_consent_file ?? ''
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
  if (enterpriseSelected.value) {
    if (!form.companyName.trim()) return '请填写企业名称'
    if (!form.unifiedSocialCreditCode.trim()) return '请填写统一社会信用代码'
    if (!form.operatorName.trim()) return '请填写经办人姓名'
    if (!form.operatorIdCardNo.trim()) return '请填写经办人身份证号'
    if (!isValidMobile(form.mobile)) return '请填写正确的手机号'
    return ''
  }

  if (!form.realName.trim() || !form.idCardNo.trim()) {
    return '请填写姓名和证件号'
  }
  if (!form.mobile.trim()) return '请填写手机号'
  if (!isValidMobile(form.mobile)) return '请填写正确的手机号'
  if (isUnder14.value) return '未满 14 周岁的未成年人不能进行实名认证'
  if (isMinor14To18.value && !form.guardianConsent) return '请确认已取得监护人同意'
  if (isMinor14To18.value && !form.guardianConsentFile.trim()) return '请上传监护人同意书'

  return ''
}

function isValidMobile(value: string): boolean {
  const text = value.trim()
  return /^1\d{10}$/.test(text)
}

function buildPayload(): SubmitRealnameVerificationPayload {
  const payload: SubmitRealnameVerificationPayload = {
    auth_type: form.authType,
  }

  if (form.realName.trim()) payload.real_name = form.realName.trim()
  if (form.idCardNo.trim()) payload.id_card_no = form.idCardNo.trim()
  if (form.mobile.trim()) payload.mobile = form.mobile.trim()
  if (form.companyName.trim()) payload.company_name = form.companyName.trim()
  if (form.unifiedSocialCreditCode.trim()) {
    payload.unified_social_credit_code = form.unifiedSocialCreditCode.trim()
  }
  if (form.businessLicenseNo.trim()) payload.business_license_no = form.businessLicenseNo.trim()
  if (form.operatorName.trim()) payload.operator_name = form.operatorName.trim()
  if (form.operatorIdCardNo.trim()) payload.operator_id_card_no = form.operatorIdCardNo.trim()
  // 只有 14~18 周岁的未成年人才需要监护人同意；成年人无需传
  if (isMinor14To18.value) {
    payload.guardian_consent = form.guardianConsent
    if (form.guardianConsentFile.trim()) {
      payload.guardian_consent_file = form.guardianConsentFile.trim()
    }
  }

  return payload
}

function routeStringValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

function faceidReturnPayload(): { serial_no?: string; order_no?: string; biz_id?: string } {
  const serialNo =
    routeStringValue(route.query.serial_no) ||
    routeStringValue(route.query.serialNo) ||
    routeStringValue(route.query.order_no) ||
    routeStringValue(route.query.orderNo)
  const bizId = routeStringValue(route.query.biz_id) || routeStringValue(route.query.bizId)

  return {
    serial_no: serialNo || undefined,
    order_no: serialNo || undefined,
    biz_id: bizId || undefined,
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
  faceidBizId.value = ''
}

function openWechatFaceidPage() {
  if (!faceidAuthUrl.value) {
    return
  }
  window.open(faceidAuthUrl.value, '_blank', 'noopener,noreferrer')
}

const MAX_CONSENT_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_CONSENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
  'application/octet-stream',
]
const ALLOWED_CONSENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf']

function consentFileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) {
    return ''
  }
  return name.slice(dot + 1).toLowerCase()
}

function isAllowedConsentFile(file: File): boolean {
  const ext = consentFileExtension(file.name)
  if (ext && ALLOWED_CONSENT_EXTENSIONS.includes(ext)) {
    return true
  }
  const mime = (file.type || '').toLowerCase()
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp' || mime === 'application/pdf'
}

function openConsentPicker() {
  consentFileInput.value?.click()
}

async function handleConsentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (!isAllowedConsentFile(file)) {
    showToast('同意书仅支持 PNG、JPG、WEBP 图片或 PDF 文件', 'warning')
    return
  }
  if (file.size > MAX_CONSENT_FILE_SIZE) {
    showToast('同意书文件不能超过 5MB', 'warning')
    return
  }

  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  consentUploading.value = true
  try {
    const result = await uploadGuardianConsentFile(auth.token, file)
    form.guardianConsentFile = result.guardian_consent_file
    showToast('监护人同意书已上传', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传监护人同意书失败', 'error')
  } finally {
    consentUploading.value = false
  }
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

  if (realnameLocked.value && !realnameRejected.value) {
    showToast('实名认证正在处理中，请稍后查询结果', 'warning')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
    return
  }

  faceidStarting.value = true
  try {
    const payload: StartAsignIdentifyPayload = {
      real_name: form.realName.trim(),
      id_card_no: form.idCardNo.trim(),
      mobile: form.mobile.trim() || null,
    }
    if (isMinor14To18.value) {
      payload.guardian_consent = form.guardianConsent
      payload.guardian_consent_file = form.guardianConsentFile.trim()
    }
    const result = await startAsignIdentify(auth.token, payload)
    faceidAuthUrl.value = result.auth_url
    faceidOrderNo.value = result.serial_no ?? ''
    faceidBizToken.value = result.serial_no ?? ''
    faceidBizId.value = result.biz_id ?? ''
    await renderFaceidQrCode(result.auth_url)
    // 重新加载当前实名状态（后端已创建 pending 记录）
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    patchForm(record)
    showToast('爱签实名认证已发起', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起爱签实名认证失败', 'error')
  } finally {
    faceidStarting.value = false
  }
}

async function checkWechatFaceidResult(
  payload: { serial_no?: string; order_no?: string; biz_id?: string } = {},
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
    biz_id: payload.biz_id || faceidBizId.value || undefined,
    serial_no: payload.serial_no || faceidOrderNo.value || undefined,
    order_no: payload.order_no || faceidOrderNo.value || undefined,
  }

  faceidCheckInFlight = true
  if (!options.background) {
    faceidChecking.value = true
  }
  try {
    const updated = await completeAsignIdentify(auth.token, queryPayload)
    if (options.background && updated.status === 'rejected') {
      return
    }

    current.value = updated
    reviewerAvatarLoadFailed.value = false
    patchForm(updated)
    if (updated.status === 'approved') {
      clearFaceidChallenge()
      showToast('爱签实名认证已通过', 'success')
      await tryRestoreBusinessPage(updated)
    } else if (updated.status === 'rejected') {
      clearFaceidChallenge()
      showToast(updated.review_note || '爱签实名认证未通过', 'error')
    } else if (!options.silent) {
      // 认证结果仍为处理中（pending）：如实提示，避免误导为「已更新」
      if (faceidAuthUrl.value) {
        showToast('认证仍在处理中，请先完成人脸核身后再查询', 'warning')
      } else {
        showToast('实名认证正在处理中，请稍后查询结果', 'warning')
      }
    }
  } catch (err) {
    if (!options.silent) {
      showToast(err instanceof Error ? err.message : '查询爱签实名认证结果失败', 'error')
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

  // 大陆身份证走爱签人脸核身；企业/港澳/台湾走人工提交审核。
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
  mobileMatch = window.matchMedia('(max-width: 720px)')
  syncMobileViewport()
  mobileMatch.addEventListener('change', syncMobileViewport)

  await loadCurrentRealname()
  const payload = faceidReturnPayload()
  if (payload.serial_no || payload.order_no || payload.biz_id) {
    await checkWechatFaceidResult(payload)
  }
})

onBeforeUnmount(() => {
  mobileMatch?.removeEventListener('change', syncMobileViewport)
  mobileMatch = null
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
                : current.auth_type === 'ENTERPRISE'
                  ? '企业认证'
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
                <el-radio value="ENTERPRISE">企业认证</el-radio>
                <el-radio value="RESIDENCE_HK_MC">港澳居民居住证</el-radio>
                <el-radio value="RESIDENCE_TAIWAN">台湾居民居住证</el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 企业认证字段 -->
            <template v-if="enterpriseSelected">
              <el-form-item label="企业名称" required>
                <el-input v-model="form.companyName" maxlength="120" placeholder="请输入企业名称"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="统一社会信用代码" required>
                <el-input v-model="form.unifiedSocialCreditCode" maxlength="64" placeholder="请输入统一社会信用代码"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="营业执照号">
                <el-input v-model="form.businessLicenseNo" maxlength="64" placeholder="请输入营业执照号（可选）"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="经办人姓名" required>
                <el-input v-model="form.operatorName" maxlength="120" placeholder="请输入经办人姓名"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="经办人身份证号" required>
                <el-input v-model="form.operatorIdCardNo" maxlength="64" placeholder="请输入经办人身份证号"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="手机号" required>
                <el-input v-model="form.mobile" maxlength="11" placeholder="请输入经办人手机号（用于电子签署）"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item>
                <el-alert type="info" :closable="false" show-icon
                  title="企业认证信息提交后将由平台审核，审核通过后可用于合同签署。" />
              </el-form-item>
            </template>

            <!-- 个人证件字段（非企业） -->
            <template v-else>
              <el-form-item label="姓名" required>
                <el-input v-model="form.realName" maxlength="120" placeholder="请输入真实姓名" :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="证件号" required>
                <el-input v-model="form.idCardNo" maxlength="64" :placeholder="idCardPlaceholder"
                  :disabled="realnameLocked" />
              </el-form-item>
              <el-form-item label="手机号" required>
                <el-input v-model="form.mobile" maxlength="11" placeholder="请输入本人手机号（用于电子签署）"
                  :disabled="realnameLocked" />
              </el-form-item>
            </template>

            <el-form-item v-if="isUnder14">
              <el-alert
                type="error"
                :closable="false"
                show-icon
                title="未满 14 周岁的未成年人不能进行实名认证"
              />
            </el-form-item>

            <el-form-item v-if="isMinor14To18">
              <el-checkbox v-model="form.guardianConsent" :disabled="realnameLocked">
                我已取得监护人同意
              </el-checkbox>
            </el-form-item>

            <el-form-item v-if="isMinor14To18 && form.guardianConsent" label="监护人同意书" required>
              <div class="realname-consent-upload">
                <input
                  ref="consentFileInput"
                  class="realname-consent-upload__native"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                  @change="handleConsentFileChange"
                />
                <el-button plain :loading="consentUploading" :disabled="realnameLocked" @click="openConsentPicker">
                  选择文件上传
                </el-button>
                <span v-if="form.guardianConsentFile" class="realname-consent-upload__name">
                  已上传：{{ form.guardianConsentFile.split('/').pop() || '同意书' }}
                </span>
                <span v-else class="realname-consent-upload__hint">
                  请上传监护人签署的同意书（图片或 PDF，5MB 以内）
                </span>
                <a class="realname-consent-template" href="/guardian-consent-template.html" target="_blank" rel="noopener noreferrer">
                  下载监护人同意书模板
                </a>
              </div>
            </el-form-item>

            <el-form-item v-if="isAdult">
              <el-alert
                type="info"
                :closable="false"
                show-icon
                title="您已年满 18 周岁，无需上传监护人同意书"
              />
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
                <strong>{{ isMobile ? '请完成人脸核身认证' : '请使用手机扫码，完成人脸核身认证' }}</strong>
                <span>认证通过后将自动生效，无需重复提交</span>
              </div>

              <template v-if="!isMobile">
                <img v-if="faceidQrDataUrl" class="realname-faceid-panel__qr" :src="faceidQrDataUrl" alt="爱签实名认证二维码" />
                <ol class="realname-faceid-panel__steps">
                  <li>用手机 <strong>微信 / 支付宝</strong> 扫描上方二维码</li>
                  <li>在手机端按提示完成 <strong>人脸核身</strong></li>
                  <li>认证通过后状态自动更新为「已通过」</li>
                </ol>
              </template>

              <div v-else class="realname-faceid-panel__mobile-tip">
                <p>请在手机上完成人脸核身认证。</p>
                <p class="realname-faceid-panel__mobile-sub">
                  点击下方「打开认证页面」，将跳转到爱签认证页面完成核身。
                </p>
              </div>
            </div>
            <div class="realname-faceid-panel__actions">
              <el-button class="realname-plain-btn" @click="openWechatFaceidPage">
                <el-icon>
                  <Promotion />
                </el-icon>
                {{ isMobile ? '打开认证页面完成核身' : '扫码不便？点此打开认证页面' }}
              </el-button>
              <el-button type="primary" class="realname-submit-btn" :loading="faceidChecking"
                @click="checkWechatFaceidResult()">
                <el-icon>
                  <RefreshRight />
                </el-icon>
                查询结果
              </el-button>
            </div>
            <p class="realname-faceid-panel__hint">
              实名认证需本人完成，二维码有效期约 120 分钟。若已完成核身，可点击「查询结果」刷新认证状态。
            </p>
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

.realname-consent-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.realname-consent-upload__native {
  display: none;
}

.realname-consent-upload__name {
  color: #15803d;
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.realname-consent-upload__hint {
  color: #64748b;
  font-size: 12px;
}

.realname-consent-template {
  color: #d97706;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.realname-consent-template:hover {
  color: #b45309;
  opacity: 1;
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

.realname-faceid-panel__steps {
  margin: 2px 0 0;
  padding: 0 0 0 20px;
  display: grid;
  gap: 6px;
  text-align: left;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-faceid-panel__steps li {
  list-style: decimal;
}

.realname-faceid-panel__steps strong {
  color: #0f172a;
}

.realname-faceid-panel__mobile-tip {
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-faceid-panel__mobile-sub {
  color: #64748b;
}

.realname-faceid-panel__hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
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
