<script setup lang="ts">
import { ArrowRight, Promotion, RefreshRight } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  completeAsignIdentify,
  getMyRealnameVerification,
  resumeAsignIdentify,
  resumeCompanyAsignIdentify,
  startAsignIdentify,
  submitMyRealnameVerification,
  uploadGuardianConsentFile,
  withdrawMyRealnameVerification,
  startCompanyAsignIdentify,
  type RealnameAuthType,
  type StartAsignIdentifyPayload,
  type StartCompanyIdentifyPayload,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import {
  modifyCompanyInfo,
  modifyMobileByCode,
  modifyMobileThree,
  modifySignPassword,
  modifyUserName,
  resetSignPassword,
  sendVerifyCode,
  startModSignPassword,
} from '@/api/asignAccount'
import { HttpError, apiUrl } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const submitting = ref(false)
const realnameDialogVisible = ref(false)
const faceidStarting = ref(false)
const faceidChecking = ref(false)
const faceidRestoring = ref(false)
const consentUploading = ref(false)
const consentFileInput = ref<HTMLInputElement | null>(null)
const current = ref<UserRealnameVerification | null>(null)
const reviewerAvatarLoadFailed = ref(false)
const faceidAuthUrl = ref('')
const faceidQrDataUrl = ref('')
const faceidOrderNo = ref('')
const faceidBizToken = ref('')
const faceidBizId = ref('')
const faceidDialogVisible = ref(false)
const withdrawing = ref(false)
const enterpriseConfirmVisible = ref(false)
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
  idCardType: 1,
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

const authTypeLabel = computed(() => {
  const t = current.value?.auth_type
  if (t === 'IDENTITY_CARD') return '个人'
  if (t === 'ENTERPRISE') return '企业认证'
  if (t === 'RESIDENCE_HK_MC') return '港澳居民居住证'
  return '台湾居民居住证'
})

const realnameHeroDesc = computed(() => {
  if (realnameApproved.value) return '已完成实名认证，信息核验通过，可正常使用合同签署等权益。'
  if (current.value?.status === 'pending') return '实名认证审核中，请耐心等待平台核验结果。'
  if (current.value?.status === 'rejected') return '实名认证未通过，请核对证件信息后重新提交。'
  return '提交真实身份信息，经平台核验后即可开通合同签署等权益。'
})

const realnameSubmitted = computed(() => Boolean(current.value))
const identityCardSelected = computed(() => form.authType === 'IDENTITY_CARD')
const enterpriseSelected = computed(() => form.authType === 'ENTERPRISE')
const realnameApproved = computed(() => current.value?.status === 'approved')
// 当前认证主体是否为「企业」（用于爱签账户管理按身份区分功能）
const assignEnterprise = computed(() => current.value?.auth_type === 'ENTERPRISE')
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

// 仅在选中个人且证件号为 18 位（大陆身份证）时计算年龄
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
    if (result.manual_review || !result.auth_url) {
      // 非大陆身份证个人证件：爱签不提供实名认证服务，后端已转入人工审核。
      const record = await getMyRealnameVerification(auth.token)
      current.value = record
      reviewerAvatarLoadFailed.value = false
      patchForm(record)
      showToast('个人实名认证已提交，等待管理员审核', 'success')
      return
    }
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

async function startEnterpriseAsign() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
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
    const payload: StartCompanyIdentifyPayload = {
      company_name: form.companyName.trim(),
      unified_social_credit_code: form.unifiedSocialCreditCode.trim(),
      operator_name: form.operatorName.trim(),
      operator_id_card_no: form.operatorIdCardNo.trim(),
      mobile: form.mobile.trim(),
    }
    const result = await startCompanyAsignIdentify(auth.token, payload)
    faceidAuthUrl.value = result.auth_url
    faceidOrderNo.value = result.serial_no ?? ''
    faceidBizToken.value = result.serial_no ?? ''
    faceidBizId.value = result.biz_id ?? ''
    await renderFaceidQrCode(result.auth_url)
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    reviewerAvatarLoadFailed.value = false
    patchForm(record)
    showToast('企业实名认证已发起，请完成认证', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起爱签企业实名认证失败', 'error')
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

async function resumeFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  faceidRestoring.value = true
  try {
    const result = await resumeAsignIdentify(auth.token)
    if (result.manual_review || !result.auth_url) {
      // 非大陆证件走人工审核，无需二维码
      showToast('个人实名认证已提交，等待管理员审核', 'success')
      return
    }
    faceidAuthUrl.value = result.auth_url
    faceidOrderNo.value = result.serial_no ?? ''
    faceidBizToken.value = result.serial_no ?? ''
    faceidBizId.value = result.biz_id ?? ''
    await renderFaceidQrCode(result.auth_url)
    showToast('认证二维码已恢复，请继续完成人脸核身', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '恢复实名认证二维码失败', 'error')
  } finally {
    faceidRestoring.value = false
  }
}

async function restoreFaceidChallengeIfNeeded() {
  // 刷新页面后：爱签认证链接仅存于内存，会丢失。
  if (current.value?.status !== 'pending') return
  if (faceidAuthUrl.value) return

  // 企业认证：续发企业认证二维码
  if (enterpriseSelected.value) {
    await resumeEnterpriseFaceid()
    return
  }

  // 个人：仅大陆身份证（走爱签扫码人脸核身）
  if (!identityCardSelected.value) return

  const queryPayload = {
    biz_id: faceidBizId.value || undefined,
    serial_no: faceidOrderNo.value || undefined,
    order_no: faceidOrderNo.value || undefined,
  }
  if (queryPayload.serial_no || queryPayload.biz_id) {
    await checkWechatFaceidResult(queryPayload, { silent: true })
    // 查询后状态可能已更新（通过/驳回），此时无需再续发
    if (current.value?.status !== 'pending' || faceidAuthUrl.value) return
  }

  await resumeFaceid()
}

async function resumeEnterpriseFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  faceidRestoring.value = true
  try {
    const result = await resumeCompanyAsignIdentify(auth.token)
    faceidAuthUrl.value = result.auth_url
    faceidOrderNo.value = result.serial_no ?? ''
    faceidBizToken.value = result.serial_no ?? ''
    faceidBizId.value = result.biz_id ?? ''
    await renderFaceidQrCode(result.auth_url)
    showToast('企业认证二维码已恢复，请继续完成认证', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '恢复企业认证二维码失败', 'error')
  } finally {
    faceidRestoring.value = false
  }
}

// 人脸核身二维码出现时自动弹出核身弹窗，并收起「提交认证信息」弹窗，避免双弹窗叠放。
watch(faceidAuthUrl, (url) => {
  if (url) {
    faceidDialogVisible.value = true
    realnameDialogVisible.value = false
  } else {
    faceidDialogVisible.value = false
  }
})

async function handleWithdraw() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  withdrawing.value = true
  try {
    await withdrawMyRealnameVerification(auth.token)
    clearFaceidChallenge()
    current.value = null
    reviewerAvatarLoadFailed.value = false
    // 重置表单回到「未提交」的可编辑状态
    form.authType = 'IDENTITY_CARD'
    form.idCardType = 1
    form.realName = ''
    form.idCardNo = ''
    form.mobile = ''
    form.companyName = ''
    form.unifiedSocialCreditCode = ''
    form.businessLicenseNo = ''
    form.operatorName = ''
    form.operatorIdCardNo = ''
    form.guardianConsent = false
    form.guardianConsentFile = ''
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
    showToast('已撤回实名认证，可重新提交', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '撤回实名认证失败', 'error')
  } finally {
    withdrawing.value = false
  }
}

/// 切换到企业认证：删除原有个人的实名认证，回到未提交，再打开企业认证表单引导填写。
async function startEnterpriseCertification() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  enterpriseConfirmVisible.value = false
  withdrawing.value = true
  try {
    // 若已有实名认证（含已通过），先删除，回到未提交
    if (current.value) {
      await withdrawMyRealnameVerification(auth.token)
    }
    clearFaceidChallenge()
    current.value = null
    reviewerAvatarLoadFailed.value = false
    // 重置表单并切换到企业认证
    form.authType = 'ENTERPRISE'
    form.idCardType = 1
    form.realName = ''
    form.idCardNo = ''
    form.mobile = ''
    form.companyName = ''
    form.unifiedSocialCreditCode = ''
    form.businessLicenseNo = ''
    form.operatorName = ''
    form.operatorIdCardNo = ''
    form.guardianConsent = false
    form.guardianConsentFile = ''
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
    showToast('已切换为企业认证，请填写企业认证信息', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '切换到企业认证失败', 'error')
  } finally {
    withdrawing.value = false
  }
}

// ── 爱签账户管理（为电子签署准备） ──────────────────────────────
const asignDialogVisible = ref(false)
const asignDialogKind = ref('')
const asignEntries = computed(() => {
  const entries: { key: string; title: string }[] = [
    { key: 'mobileByCode', title: '修改绑定手机号（验证码方式）' },
    { key: 'mobileThree', title: '修改手机号（运营商三要素校验）' },
    { key: 'signPwd', title: '修改签约密码' },
    { key: 'startSignPwd', title: '初始化签约密码' },
    { key: 'resetSignPwd', title: '重置签约密码' },
  ]
  if (assignEnterprise.value) {
    entries.push({ key: 'company', title: '修改企业信息' })
  } else {
    entries.push({ key: 'personal', title: '修改个人信息' })
  }
  entries.push({ key: 'enterprise', title: '主体变更' })
  return entries
})
const asignDialogTitle = computed(
  () => asignEntries.value.find((e) => e.key === asignDialogKind.value)?.title ?? '爱签账户管理',
)

function openAsignDialog(key: string) {
  // 初始化签约密码无表单，直接打开爱签设置页面，无需再弹窗。
  if (key === 'startSignPwd') {
    void handleStartModSignPassword()
    return
  }
  // 企业认证：若已有个人认证，先弹窗确认，再删除并引导填写企业认证。
  if (key === 'enterprise') {
    if (current.value) {
      enterpriseConfirmVisible.value = true
    } else {
      void startEnterpriseCertification()
    }
    return
  }
  asignDialogKind.value = key
  asignDialogVisible.value = true
}
const asign = reactive({
  mobileByCode: { mobile: '', code: '', ctoken: '' },
  mobileThree: { name: '', idCard: '', mobile: '' },
  modifyPwd: { oldSignPwd: '', signPwd: '' },
  resetPwd: { signPwd: '' },
  company: { companyName: '', legalName: '', legalIdCard: '' },
  personal: { personalName: '', identifyType: 2, mobile: '', bankCard: '' },
})
const asignLoading = reactive({
  sendCode: false,
  mobileByCode: false,
  mobileThree: false,
  signPwd: false,
  startSignPwd: false,
  resetSignPwd: false,
  company: false,
  personal: false,
})

function requireToken(): boolean {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return false
  }
  return true
}

async function handleSendVerifyCode() {
  if (!requireToken()) return
  if (!asign.mobileByCode.mobile.trim()) {
    showToast('请先填写新手机号', 'warning')
    return
  }
  asignLoading.sendCode = true
  try {
    const res = await sendVerifyCode(auth.token, { mobile: asign.mobileByCode.mobile.trim() })
    if (res.success) {
      asign.mobileByCode.ctoken = res.data?.codeToken ?? ''
      showToast('验证码已发送，请查收短信', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送验证码失败', 'error')
  } finally {
    asignLoading.sendCode = false
  }
}

async function handleModifyMobileByCode() {
  if (!requireToken()) return
  if (!asign.mobileByCode.mobile.trim() || !asign.mobileByCode.code.trim() || !asign.mobileByCode.ctoken.trim()) {
    showToast('请填写手机号与验证码（需先发送验证码）', 'warning')
    return
  }
  asignLoading.mobileByCode = true
  try {
    const res = await modifyMobileByCode(auth.token, {
      mobile: asign.mobileByCode.mobile.trim(),
      code: asign.mobileByCode.code.trim(),
      ctoken: asign.mobileByCode.ctoken.trim(),
    })
    if (res.success) {
      showToast('手机号已修改', 'success')
      asign.mobileByCode.mobile = ''
      asign.mobileByCode.code = ''
      asign.mobileByCode.ctoken = ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改手机号失败', 'error')
  } finally {
    asignLoading.mobileByCode = false
  }
}

async function handleModifyMobileThree() {
  if (!requireToken()) return
  if (!asign.mobileThree.name.trim() || !asign.mobileThree.idCard.trim() || !asign.mobileThree.mobile.trim()) {
    showToast('请填写姓名、证件号、新手机号', 'warning')
    return
  }
  asignLoading.mobileThree = true
  try {
    const res = await modifyMobileThree(auth.token, {
      name: asign.mobileThree.name.trim(),
      idCard: asign.mobileThree.idCard.trim(),
      mobile: asign.mobileThree.mobile.trim(),
    })
    if (res.success) {
      showToast('手机号已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改手机号失败', 'error')
  } finally {
    asignLoading.mobileThree = false
  }
}

async function handleModifySignPassword() {
  if (!requireToken()) return
  if (!asign.modifyPwd.oldSignPwd.trim() || !asign.modifyPwd.signPwd.trim()) {
    showToast('请填写旧密码和新密码', 'warning')
    return
  }
  asignLoading.signPwd = true
  try {
    const res = await modifySignPassword(auth.token, {
      oldSignPwd: asign.modifyPwd.oldSignPwd.trim(),
      signPwd: asign.modifyPwd.signPwd.trim(),
    })
    if (res.success) {
      showToast('签约密码已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改签约密码失败', 'error')
  } finally {
    asignLoading.signPwd = false
  }
}

async function handleStartModSignPassword() {
  if (!requireToken()) return
  asignLoading.startSignPwd = true
  try {
    const res = await startModSignPassword(auth.token, {})
    if (res.success && res.data?.signUrl) {
      window.open(res.data.signUrl, '_blank', 'noopener,noreferrer')
      showToast('已打开签约密码修改页面', 'success')
    } else {
      showToast('初始化成功，请在爱签页面完成设置', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '初始化签约密码失败', 'error')
  } finally {
    asignLoading.startSignPwd = false
  }
}

async function handleResetSignPassword() {
  if (!requireToken()) return
  if (!asign.resetPwd.signPwd.trim()) {
    showToast('请填写新签约密码', 'warning')
    return
  }
  asignLoading.resetSignPwd = true
  try {
    const res = await resetSignPassword(auth.token, { signPwd: asign.resetPwd.signPwd.trim() })
    if (res.success) {
      showToast('签约密码已重置', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重置签约密码失败', 'error')
  } finally {
    asignLoading.resetSignPwd = false
  }
}

async function handleModifyCompanyInfo() {
  if (!requireToken()) return
  if (!asign.company.companyName.trim() && !asign.company.legalName.trim()) {
    showToast('请填写企业名称或法人信息', 'warning')
    return
  }
  asignLoading.company = true
  try {
    const res = await modifyCompanyInfo(auth.token, {
      companyName: asign.company.companyName.trim() || undefined,
      name: asign.company.legalName.trim() || undefined,
      idCard: asign.company.legalIdCard.trim() || undefined,
      idCardType: 1,
    })
    if (res.success) {
      showToast(res.data ? '企业信息已修改，新印章已生成' : '企业信息已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改企业信息失败', 'error')
  } finally {
    asignLoading.company = false
  }
}

async function handleModifyUserName() {
  if (!requireToken()) return
  if (!asign.personal.personalName.trim()) {
    showToast('请填写姓名', 'warning')
    return
  }
  if (asign.personal.identifyType === 2 && !asign.personal.mobile.trim()) {
    showToast('请填写手机号', 'warning')
    return
  }
  if (asign.personal.identifyType === 3 && !asign.personal.bankCard.trim()) {
    showToast('请填写银联卡号', 'warning')
    return
  }
  asignLoading.personal = true
  try {
    const res = await modifyUserName(auth.token, {
      name: asign.personal.personalName.trim(),
      identifyType: asign.personal.identifyType,
      mobile: asign.personal.identifyType === 2 ? asign.personal.mobile.trim() : undefined,
      bankCard: asign.personal.identifyType === 3 ? asign.personal.bankCard.trim() : undefined,
    })
    if (res.success) {
      showToast('个人信息已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改个人信息失败', 'error')
  } finally {
    asignLoading.personal = false
  }
}

async function submit() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  // 个人走爱签人脸核身（后端自动分流大陆/港澳台）；企业走爱签企业实名认证。
  if (identityCardSelected.value) {
    await startWechatFaceid()
    return
  }

  if (enterpriseSelected.value) {
    await startEnterpriseAsign()
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
  // 刷新后尝试恢复丢失的爱签二维码（若仍未完成人脸核身）
  await restoreFaceidChallengeIfNeeded()
})

onBeforeUnmount(() => {
  mobileMatch?.removeEventListener('change', syncMobileViewport)
  mobileMatch = null
  stopFaceidAutoPolling()
})
</script>

<template>
  <main class="portal-page realname-page-shell">
    <section class="realname-hero" :class="`realname-hero--${statusType}`">
      <div class="realname-hero__copy">
        <p class="realname-hero__eyebrow">Identity Verification</p>
        <h1 class="realname-hero__title">实名认证</h1>
        <p class="realname-hero__desc">{{ realnameHeroDesc }}</p>
        <div class="realname-hero__tag">
          <el-tag :type="statusType" round>实名认证：{{ statusText }}</el-tag>
        </div>
      </div>
      <div v-if="current" class="realname-hero__metrics">
        <div class="realname-metrics__item">
          <span>证件类型</span>
          <strong>{{ authTypeLabel }}</strong>
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
    </section>

    <el-dialog v-model="realnameDialogVisible" title="提交认证信息" class="realname-dialog" width="620px" :close-on-click-modal="true">
          <div class="realname-form__head">
            <el-tag :type="statusType" class="realname-form-status-tag" round>实名认证：{{ statusText }}</el-tag>
          </div>

          <el-form label-position="top" class="realname-form" @submit.prevent>
            <el-form-item label="证件类型">
              <el-radio-group v-model="form.authType" :disabled="realnameLocked">
                <el-radio value="IDENTITY_CARD">个人</el-radio>
                <el-radio value="ENTERPRISE">企业认证</el-radio>
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
              <el-form-item label="证件类型">
                <el-select v-model="form.idCardType" :disabled="realnameLocked" style="width: 100%">
                  <el-option label="居民身份证" :value="1" />
                  <el-option label="台湾居民来往大陆通行证" :value="2" disabled />
                  <el-option label="港澳居民来往内地通行证" :value="3" disabled />
                </el-select>
              </el-form-item>
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
      </el-dialog>

    <el-card shadow="never" class="realname-card asign-account-card">
        <div class="realname-form__head">
          <h3>认证管理</h3>
        </div>
        <div class="asign-account-card__entries">
          <el-button class="asign-entry" @click="realnameDialogVisible = true">
            <span>开始认证</span>
            <el-icon class="asign-entry__arrow"><ArrowRight /></el-icon>
          </el-button>
          <el-button v-for="entry in asignEntries" :key="entry.key" class="asign-entry"
            :loading="entry.key === 'startSignPwd' ? asignLoading.startSignPwd : false" @click="openAsignDialog(entry.key)">
            <span>{{ entry.title }}</span>
            <el-icon class="asign-entry__arrow"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </el-card>

    <el-card shadow="never" class="realname-card realname-guide-card">
      <h3>认证说明</h3>
      <ul class="realname-guide-card__list">
        <li>认证信息仅用于资质核验，请务必真实有效。</li>
        <li>大陆居民身份证支持即时人脸核验。</li>
        <li>企业认证需平台人工审核，请耐心等待。</li>
        <li>审核通过后可用于合同签署。</li>
      </ul>
    </el-card>

    <el-dialog v-model="faceidDialogVisible" :title="enterpriseSelected ? '企业认证' : '人脸核身认证'" class="realname-faceid-dialog" width="480px" :close-on-click-modal="false">
      <div class="realname-faceid-panel__main">
        <div class="realname-faceid-panel__copy">
          <strong>{{ isMobile ? (enterpriseSelected ? '请完成企业实名认证' : '请完成人脸核身认证') : (enterpriseSelected ? '请使用手机扫码，完成企业实名认证' : '请使用手机扫码，完成人脸核身认证') }}</strong>
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
        <el-button type="danger" plain :loading="withdrawing" @click="handleWithdraw">撤回认证</el-button>
        <el-button type="primary" class="realname-submit-btn" :loading="faceidChecking"
          @click="checkWechatFaceidResult()">
          <el-icon>
            <RefreshRight />
          </el-icon>
          查询结果
        </el-button>
        <el-button class="realname-plain-btn" @click="openWechatFaceidPage">
          <el-icon>
            <Promotion />
          </el-icon>
          {{ isMobile ? '打开认证页面完成核身' : '扫码不便？点此打开认证页面' }}
        </el-button>
      </div>
      <p class="realname-faceid-panel__hint">
        实名认证需本人完成，二维码有效期约 120 分钟。若已完成核身，可点击「查询结果」刷新认证状态。
      </p>
    </el-dialog>

    <el-dialog v-model="asignDialogVisible" :title="asignDialogTitle" class="asign-dialog" width="520px" :close-on-click-modal="true" align-center>
      <template v-if="asignDialogKind === 'mobileByCode'">
        <p class="asign-hint">通过短信验证码更换爱签账户绑定的手机号，需先获取验证码。</p>
        <div class="asign-row">
          <el-input v-model="asign.mobileByCode.mobile" placeholder="新手机号" />
          <el-button plain :loading="asignLoading.sendCode" @click="handleSendVerifyCode">发送验证码</el-button>
        </div>
        <div class="asign-row">
          <el-input v-model="asign.mobileByCode.code" placeholder="短信验证码" />
          <el-button type="primary" :loading="asignLoading.mobileByCode" @click="handleModifyMobileByCode">确认修改</el-button>
        </div>
      </template>

      <template v-else-if="asignDialogKind === 'mobileThree'">
        <p class="asign-hint">校验本人姓名与身份证号后，将爱签账户绑定手机号更换为新手机号。</p>
        <div class="asign-row"><el-input v-model="asign.mobileThree.name" placeholder="本人姓名" /></div>
        <div class="asign-row"><el-input v-model="asign.mobileThree.idCard" placeholder="本人身份证号" /></div>
        <div class="asign-row"><el-input v-model="asign.mobileThree.mobile" placeholder="新手机号" /></div>
        <el-button type="primary" :loading="asignLoading.mobileThree" @click="handleModifyMobileThree">确认修改</el-button>
      </template>

      <template v-else-if="asignDialogKind === 'signPwd'">
        <p class="asign-hint">需提供旧签约密码，用于修改爱签账户签约密码。</p>
        <div class="asign-row"><el-input v-model="asign.modifyPwd.oldSignPwd" type="password" placeholder="旧签约密码" /></div>
        <div class="asign-row"><el-input v-model="asign.modifyPwd.signPwd" type="password" placeholder="新签约密码" /></div>
        <el-button type="primary" :loading="asignLoading.signPwd" @click="handleModifySignPassword">确认修改</el-button>
      </template>

      <template v-else-if="asignDialogKind === 'resetSignPwd'">
        <p class="asign-hint">忘记原签约密码时使用，设置后立即生效。</p>
        <div class="asign-row"><el-input v-model="asign.resetPwd.signPwd" type="password" placeholder="新签约密码" /></div>
        <el-button type="primary" :loading="asignLoading.resetSignPwd" @click="handleResetSignPassword">确认重置</el-button>
      </template>

      <template v-else-if="asignDialogKind === 'company'">
        <p class="asign-hint">修改企业名称将自动生成新印章，法人信息请配合身份证号填写。</p>
        <div class="asign-row"><el-input v-model="asign.company.companyName" placeholder="新企业名称（可选）" /></div>
        <div class="asign-row"><el-input v-model="asign.company.legalName" placeholder="法人姓名（可选）" /></div>
        <div class="asign-row"><el-input v-model="asign.company.legalIdCard" placeholder="法人身份证号（可选）" /></div>
        <el-button type="primary" :loading="asignLoading.company" @click="handleModifyCompanyInfo">确认修改</el-button>
      </template>

      <template v-else-if="asignDialogKind === 'personal'">
        <p class="asign-hint">通过运营商三要素或银行卡四要素校验本人信息后更新资质。</p>
        <div class="asign-row"><el-input v-model="asign.personal.personalName" placeholder="姓名" /></div>
        <div class="asign-row">
          <el-radio-group v-model="asign.personal.identifyType">
            <el-radio :value="2">运营商三要素</el-radio>
            <el-radio :value="3">银行卡四要素</el-radio>
          </el-radio-group>
        </div>
        <div v-if="asign.personal.identifyType === 2" class="asign-row"><el-input v-model="asign.personal.mobile" placeholder="手机号" /></div>
        <div v-if="asign.personal.identifyType === 3" class="asign-row"><el-input v-model="asign.personal.bankCard" placeholder="银联卡号" /></div>
        <el-button type="primary" :loading="asignLoading.personal" @click="handleModifyUserName">确认修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="enterpriseConfirmVisible" title="切换为企业认证" class="asign-dialog" width="480px" :close-on-click-modal="false" align-center>
      <p class="asign-hint">切换为企业认证后，当前个人实名认证将失效并被删除。是否继续？</p>
      <div class="asign-confirm__actions">
        <el-button @click="enterpriseConfirmVisible = false">取消</el-button>
        <el-button type="primary" :loading="withdrawing" @click="startEnterpriseCertification">继续</el-button>
      </div>
    </el-dialog>
  </main>
</template>

<style scoped>
.realname-page-shell {
  gap: 26px;
}

.realname-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 24px;
  padding: 30px 32px;
  border-radius: 26px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background:
    radial-gradient(circle at top left, rgba(84, 124, 255, 0.16), transparent 30%),
    radial-gradient(circle at bottom right, rgba(100, 213, 255, 0.12), transparent 26%),
    rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
  align-items: center;
}

.realname-hero__copy {
  display: grid;
  gap: 12px;
  align-content: center;
}

.realname-hero__eyebrow {
  margin: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.realname-hero__title {
  margin: 0;
  font-size: 28px;
  color: #0f172a;
}

.realname-hero__desc {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.7;
}

.realname-hero__tag {
  margin-top: 2px;
}

.realname-hero__metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.realname-guide-card :deep(.el-card__body) {
  padding: 18px 20px;
}

.realname-guide-card h3 {
  margin: 0 0 10px;
  font-size: 16px;
  color: #0f172a;
}

.realname-guide-card__list {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  list-style: none;
}

.realname-guide-card__list li {
  position: relative;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-guide-card__list li::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
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

.realname-form {
  min-width: 0;
}

:global(.realname-dialog.el-dialog) {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.18);
}

:global(.realname-dialog .el-dialog__header) {
  padding: 20px 20px 0;
}

:global(.realname-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

:global(.realname-dialog .el-dialog__body) {
  padding: 12px 20px 20px;
}

:global(.realname-dialog .realname-form-status-tag) {
  margin-bottom: 14px;
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

:global(.realname-faceid-dialog.el-dialog) {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.18);
}

:global(.realname-faceid-dialog .el-dialog__header) {
  padding: 20px 20px 0;
}

:global(.realname-faceid-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

:global(.realname-faceid-dialog .el-dialog__body) {
  padding: 12px 20px 20px;
  display: grid;
  gap: 14px;
  text-align: center;
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

@media (max-width: 860px) {
  .realname-hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }
}

@media (max-width: 720px) {
  :deep(.realname-card .el-card__body) {
    padding: 16px;
  }

  .realname-hero__metrics {
    grid-template-columns: 1fr;
  }

  .asign-account-card__entries {
    grid-template-columns: 1fr;
  }
}

.asign-account-card__entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.asign-entry.el-button {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 14px 16px;
  height: auto;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  font-weight: 600;
  text-align: left;
}

.asign-entry.el-button:hover {
  border-color: rgba(96, 165, 250, 0.55);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
}

.asign-entry__arrow {
  color: #94a3b8;
  flex: 0 0 auto;
  transition: transform 0.2s ease;
}

.asign-entry.el-button:hover .asign-entry__arrow {
  transform: translateX(3px);
}

:global(.asign-dialog.el-dialog) {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.18);
}

:global(.asign-dialog .el-dialog__header) {
  padding: 20px 20px 0;
}

:global(.asign-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

:global(.asign-dialog .el-dialog__body) {
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

:global(.asign-dialog .el-dialog__body > .el-button) {
  align-self: flex-end;
  margin-top: 4px;
}

:global(.asign-dialog .el-button--primary) {
  border-color: rgba(37, 99, 235, 0.82);
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
}

:global(.asign-dialog .el-button--primary:hover) {
  border-color: rgba(37, 99, 235, 0.95);
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
}

.asign-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.asign-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.asign-row:last-child {
  margin-bottom: 0;
}

.asign-row .el-input {
  flex: 1;
}

.asign-hint {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
  margin: 0 0 12px;
}
</style>
