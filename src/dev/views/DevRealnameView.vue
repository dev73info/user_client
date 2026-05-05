<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getMyRealnameVerification,
  submitRealnameVerification,
  type DevRealnameAuthType,
  type DevRealnameVerification,
  type DevSubmitRealnamePayload,
} from '@dev/api/realname'
import { HttpError } from '@dev/api/http'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const submitting = ref(false)
const current = ref<DevRealnameVerification | null>(null)

const form = reactive({
  authType: 'IDENTITY_CARD' as DevRealnameAuthType,
  realName: '',
  idCardNo: '',
  companyName: '',
  unifiedSocialCreditCode: '',
  businessLicenseNo: '',
  operatorName: '',
  operatorIdCardNo: '',
})

const statusLabel = computed(() => {
  if (!current.value) return '未认证'
  const map: Record<string, string> = {
    pending: '审核中',
    approved: '已通过',
    rejected: '未通过',
  }
  return map[current.value.status] || current.value.status
})

const statusType = computed<'info' | 'warning' | 'success' | 'danger'>(() => {
  if (!current.value) return 'info'
  if (current.value.status === 'pending') return 'warning'
  if (current.value.status === 'approved') return 'success'
  return 'danger'
})

const authTypeLabel = computed(() => {
  const map: Record<DevRealnameAuthType, string> = {
    IDENTITY_CARD: '大陆身份证',
    RESIDENCE_HK_MC: '港澳居民居住证',
    RESIDENCE_TAIWAN: '台湾居民居住证',
  }
  return map[form.authType]
})

const hasCurrentRecord = computed(() => current.value !== null)
const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
  if (!raw || raw === '/dev/realname') {
    return ''
  }
  return raw
})

async function tryRestoreBusinessPage(record?: DevRealnameVerification | null) {
  const status = record?.status ?? current.value?.status
  if (status !== 'approved') {
    return
  }

  const target = redirectTarget.value || '/dev/resources/plugins-init'
  await router.replace(target)
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

function patchFormByRecord(record: DevRealnameVerification) {
  form.authType = record.auth_type
  form.realName = record.real_name ?? ''
  form.idCardNo = record.id_card_no ?? ''
  form.companyName = record.company_name ?? ''
  form.unifiedSocialCreditCode = record.unified_social_credit_code ?? ''
  form.businessLicenseNo = record.business_license_no ?? ''
  form.operatorName = record.operator_name ?? ''
  form.operatorIdCardNo = record.operator_id_card_no ?? ''
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
    patchFormByRecord(record)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      current.value = null
      return
    }
    showToast(error instanceof Error ? error.message : '加载实名认证信息失败', 'error')
  } finally {
    loading.value = false
  }
}

function validateForm() {
  if (!form.realName.trim() || !form.idCardNo.trim()) {
    return '请填写姓名和证件号'
  }

  return ''
}

function buildSubmitPayload(): DevSubmitRealnamePayload {
  const payload: DevSubmitRealnamePayload = {
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

  const validationError = validateForm()
  if (validationError) {
    showToast(validationError, 'warning')
    return
  }

  submitting.value = true
  try {
    const updated = await submitRealnameVerification(auth.token, buildSubmitPayload())
    current.value = updated
    patchFormByRecord(updated)
    if (updated.status === 'approved') {
      showToast('身份核验通过！正在跳转...', 'success')
    } else {
      showToast('实名认证信息已提交，请等待审核', 'success')
    }
    await tryRestoreBusinessPage(updated)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交实名认证失败', 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadMyRealname()
})
</script>

<template>
  <div class="dev-page">
    <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
      <div class="dev-realname-header">
        <div>
          <h3 class="dev-section-title">实名认证</h3>
          <p class="dev-section-desc">支持大陆身份证、港澳居民居住证、台湾居民居住证三种证件类型。提交后由平台管理员审核。</p>
        </div>
        <div class="dev-realname-header__actions">
          <el-tag :type="statusType">{{ statusLabel }}</el-tag>
          <el-button plain :loading="loading" @click="loadMyRealname">刷新状态</el-button>
        </div>
      </div>

      <div class="dev-realname-metrics" v-if="hasCurrentRecord && current">
        <div class="dev-realname-metrics__item">
          <span>证件类型</span>
          <strong>{{ current.auth_type === 'IDENTITY_CARD' ? '大陆身份证' : current.auth_type === 'RESIDENCE_HK_MC' ? '港澳居民居住证' : '台湾居民居住证' }}</strong>
        </div>
        <div class="dev-realname-metrics__item">
          <span>审核人</span>
          <strong>{{ current.reviewed_by || '—' }}</strong>
        </div>
        <div class="dev-realname-metrics__item">
          <span>审核时间</span>
          <strong>{{ formatTime(current.reviewed_at) }}</strong>
        </div>
        <div class="dev-realname-metrics__item">
          <span>审核备注</span>
          <strong>{{ current.review_note || '—' }}</strong>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-realname-form-head">
        <h3 class="dev-section-title">提交认证信息</h3>
        <el-tag type="info">当前类型：{{ authTypeLabel }}</el-tag>
      </div>

      <el-form label-position="top" class="dev-realname-form" @submit.prevent>
        <el-form-item label="证件类型">
          <el-radio-group v-model="form.authType">
            <el-radio value="IDENTITY_CARD">大陆身份证</el-radio>
            <el-radio value="RESIDENCE_HK_MC">港澳居民居住证</el-radio>
            <el-radio value="RESIDENCE_TAIWAN">台湾居民居住证</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="姓名">
          <el-input v-model="form.realName" placeholder="请输入真实姓名" maxlength="120" />
        </el-form-item>
        <el-form-item label="证件号">
          <el-input v-model="form.idCardNo" placeholder="请输入证件号" maxlength="64" />
        </el-form-item>

        <div class="dev-realname-form__actions">
          <el-button type="primary" :loading="submitting" @click="submit">
            {{ hasCurrentRecord ? '重新提交认证' : '提交认证' }}
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.dev-realname-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.dev-realname-header__actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.dev-realname-metrics {
  margin-top: 18px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.dev-realname-metrics__item {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid rgba(17, 24, 39, 0.08);
}

.dev-realname-metrics__item span {
  font-size: 12px;
  color: var(--dev-muted);
}

.dev-realname-metrics__item strong {
  font-size: 14px;
  color: var(--dev-ink);
}

.dev-realname-form-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.dev-realname-form {
  margin-top: 12px;
}

.dev-realname-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.dev-realname-form__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

@media (max-width: 768px) {
  .dev-realname-form__actions {
    justify-content: stretch;
  }

  .dev-realname-form__actions :deep(.el-button) {
    width: 100%;
  }
}
</style>