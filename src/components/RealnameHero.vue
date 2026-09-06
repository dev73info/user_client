<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getMyAdapayMember } from '@/api/adapay'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const current = ref<UserRealnameVerification | null>(null)
const adapayMember = ref<{ onboardingStatus: string } | null>(null)

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
  if (t === 'ENTERPRISE') return '企业'
  if (t === 'SOLE_PROPRIETOR') return '个体工商户'
  if (t === 'RESIDENCE_HK_MC') return '港澳居民'
  if (t === 'RESIDENCE_TAIWAN') return '台湾居民'
  return '未认证'
})

const asignAuthText = computed(() => {
  const status = current.value?.status
  if (status === 'approved') return '已认证'
  if (status === 'pending') return '审核中'
  if (status === 'rejected') return '未通过'
  return '未认证'
})

const adapayStatusText = computed(() => {
  const status = adapayMember.value?.onboardingStatus
  if (status === 'active') return '已认证'
  if (status === 'under_review') return '审核中'
  if (status === 'pending') return '待认证'
  if (status === 'failed') return '未通过'
  return '未认证'
})

const heroDesc = computed(() => {
  if (current.value?.status === 'approved') {
    return '已完成实名认证，信息核验通过，可正常使用合同签署等权益。'
  }
  if (current.value?.status === 'pending') return '实名认证审核中，请耐心等待平台核验结果。'
  if (current.value?.status === 'rejected') return '实名认证未通过，请核对证件信息后重新提交。'
  return '提交真实身份信息，经平台核验后即可开通合同签署等权益。'
})

onMounted(async () => {
  auth.hydrate()
  if (!auth.token) {
    return
  }
  try {
    current.value = await getMyRealnameVerification(auth.token)
  } catch {
    current.value = null
  }
  try {
    adapayMember.value = await getMyAdapayMember(auth.token)
  } catch {
    adapayMember.value = null
  }
})
</script>

<template>
  <section class="realname-hero" :class="`realname-hero--${statusType}`">
    <div class="realname-hero__copy">
      <p class="realname-hero__eyebrow">Identity Verification</p>
      <h1 class="realname-hero__title">实名认证</h1>
      <p class="realname-hero__desc">{{ heroDesc }}</p>
      <div class="realname-hero__tag">
        <el-tag :type="statusType" round>实名认证：{{ statusText }}</el-tag>
      </div>
    </div>
    <div class="realname-hero__metrics">
      <div class="realname-metrics__item">
        <span>认证类型</span>
        <strong>{{ authTypeLabel }}</strong>
      </div>
      <div class="realname-metrics__item">
        <span>爱签认证</span>
        <strong>{{ asignAuthText }}</strong>
      </div>
      <div class="realname-metrics__item">
        <span>Adapay认证</span>
        <strong>{{ adapayStatusText }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.realname-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 24px;
  padding: 20px 24px;
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

@media (max-width: 860px) {
  .realname-hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }
}

@media (max-width: 720px) {
  .realname-hero__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
