<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError } from '@/api/http'
import {
  getMyRealnameVerification,
  submitMyRealnameVerification,
  type RealnameAuthType,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const submitting = ref(false)
const current = ref<UserRealnameVerification | null>(null)

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

const authTypeText = computed(() => {
  const map: Record<RealnameAuthType, string> = {
    IDENTITY_CARD: '大陆身份证',
    RESIDENCE_HK_MC: '港澳居民居住证',
    RESIDENCE_TAIWAN: '台湾居民居住证',
  }
  return map[form.authType]
})
const pageSignals = computed(() => [
  `当前状态：${statusText.value}`,
  `证件类型：${authTypeText.value}`,
  redirectTarget.value ? '审核通过后会自动返回业务页' : '提交后等待管理员审核',
])

function patchForm(record: UserRealnameVerification) {
  form.authType = record.auth_type
  form.realName = record.real_name ?? ''
  form.idCardNo = record.id_card_no ?? ''
  form.companyName = record.company_name ?? ''
  form.unifiedSocialCreditCode = record.unified_social_credit_code ?? ''
  form.businessLicenseNo = record.business_license_no ?? ''
  form.operatorName = record.operator_name ?? ''
  form.operatorIdCardNo = record.operator_id_card_no ?? ''
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

async function loadMyRealname() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    patchForm(record)
    await tryRestoreBusinessPage(record)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      current.value = null
      return
    }

    showToast(err instanceof Error ? err.message : '加载实名认证信息失败', 'error')
  } finally {
    loading.value = false
  }
}

function validate() {
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

async function submit() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
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
    patchForm(updated)
    showToast('实名认证信息已提交，请等待审核', 'success')
    await tryRestoreBusinessPage(updated)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交实名认证失败', 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadMyRealname()
})
</script>

<template>
  <main class="portal-page realname-page-shell">

    <section class="realname-layout">
      <el-card shadow="never" class="realname-card realname-card--status">
        <div class="realname-card__head">
          <div class="realname-card__actions">
            <el-tag :type="statusType">{{ statusText }}</el-tag>
            <el-button plain class="realname-plain-btn" :loading="loading" @click="loadMyRealname">刷新状态</el-button>
          </div>
        </div>

        <div v-if="current" class="realname-metrics">
          <div class="realname-metrics__item">
            <span>证件类型</span>
            <strong>{{ current.auth_type === 'IDENTITY_CARD' ? '大陆身份证' : current.auth_type === 'RESIDENCE_HK_MC' ?
              '港澳居民居住证' : '台湾居民居住证' }}</strong>
          </div>
          <div class="realname-metrics__item">
            <span>审核人</span>
            <strong>{{ current.reviewed_by || '—' }}</strong>
          </div>
          <div class="realname-metrics__item">
            <span>审核时间</span>
            <strong>{{ formatTime(current.reviewed_at) }}</strong>
          </div>
          <div class="realname-metrics__item">
            <span>审核备注</span>
            <strong>{{ current.review_note || '—' }}</strong>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="realname-card">
        <div class="realname-form__head">
          <h3>提交认证信息</h3>
          <el-tag type="info">当前类型：{{ authTypeText }}</el-tag>
        </div>

        <el-form label-position="top" class="realname-form" @submit.prevent>
          <el-form-item label="证件类型">
            <el-radio-group v-model="form.authType">
              <el-radio value="IDENTITY_CARD">大陆身份证</el-radio>
              <el-radio value="RESIDENCE_HK_MC">港澳居民居住证</el-radio>
              <el-radio value="RESIDENCE_TAIWAN">台湾居民居住证</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="姓名">
            <el-input v-model="form.realName" maxlength="120" placeholder="请输入真实姓名" />
          </el-form-item>
          <el-form-item label="证件号">
            <el-input v-model="form.idCardNo" maxlength="64" placeholder="请输入证件号" />
          </el-form-item>

          <div class="realname-form__actions">
            <el-button type="primary" class="realname-submit-btn" :loading="submitting" @click="submit">
              {{ current ? '重新提交认证' : '提交认证' }}
            </el-button>
          </div>
        </el-form>
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

.realname-card__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.realname-card__head h2 {
  margin: 0;
  font-size: 22px;
  color: #0f172a;
}

.realname-card__head p {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.75;
}

.realname-card__actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.realname-metrics {
  margin-top: 16px;
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

.realname-form__actions {
  margin-top: 12px;
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

:deep(.realname-submit-btn.el-button--primary:hover) {
  border-color: rgba(37, 99, 235, 0.95);
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
}

@media (max-width: 720px) {
  :deep(.realname-card .el-card__body) {
    padding: 16px;
  }
}
</style>
