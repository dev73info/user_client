<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@dev/stores/auth'

const router = useRouter()
const auth = useAuthStore()

// ── 用户信息 ────────────────────────────────────────────────────
const displayName = computed(() => auth.username || '开发者')

// ── 实名认证状态 ───────────────────────────────────────────────
const realnameLoading = ref(false)
const realnameRecord = ref<UserRealnameVerification | null>(null)
const realnameLoadError = ref(false)

const realnameStatus = computed(() => realnameRecord.value?.status ?? null)

const realnameStatusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '审核中',
    approved: '已通过',
    rejected: '未通过',
  }
  return realnameStatus.value ? (map[realnameStatus.value] ?? realnameStatus.value) : '未提交'
})

const realnameTagType = computed<'info' | 'warning' | 'success' | 'danger'>(() => {
  if (realnameStatus.value === 'approved') return 'success'
  if (realnameStatus.value === 'pending') return 'warning'
  if (realnameStatus.value === 'rejected') return 'danger'
  return 'info'
})

const realnameDesc = computed(() => {
  if (realnameStatus.value === 'approved') return '身份信息已核验通过，可正常使用平台各项功能。'
  if (realnameStatus.value === 'pending') return '认证信息已提交，请等待管理员审核（通常 1-3 个工作日）。'
  if (realnameStatus.value === 'rejected') return `认证未通过：${realnameRecord.value?.review_note || '请查看审核备注后重新提交'}。`
  return '提交姓名与证件号，经二要素核验后即可解锁资源上传与需求对接功能。'
})

// 用于卡片左侧的状态色条
const realnameAccentClass = computed(() => {
  if (realnameStatus.value === 'approved') return 'ov-realname--approved'
  if (realnameStatus.value === 'pending') return 'ov-realname--pending'
  if (realnameStatus.value === 'rejected') return 'ov-realname--rejected'
  return 'ov-realname--none'
})

// ── 新手引导步骤 ───────────────────────────────────────────────
const newcomerGuide = [
  {
    step: '01',
    title: '完成实名认证',
    desc: '提交证件信息，经平台核验后开放后续功能权限。',
    hint: '大陆身份证可即时核验',
    cta: '去认证',
    route: { name: 'workbench-realname', query: { redirect_to: '/workbench/developer/resources/plugins-init' } },
  },
  {
    step: '02',
    title: '上传资源',
    desc: '在资源初始化页填写插件/工具的基本信息并提交审核。',
    hint: '审核通过后资源上线',
    cta: '上传资源',
    route: { name: 'dev-plugins' },
  },
  {
    step: '03',
    title: '对接需求',
    desc: '浏览需求大厅，接取匹配需求后进入沟通会话推进交付。',
    hint: '接单后自动创建沟通会话',
    cta: '进入大厅',
    route: { name: 'dev-requirement-hall' },
  },
  {
    step: '04',
    title: '查看收益',
    desc: '资源被采购后，收益将自动计入开发者钱包，可申请提现。',
    hint: '余额、交付与提现集中管理',
    cta: '查看钱包',
    route: { name: 'dev-wallet' },
  },
]

// ── 快捷入口 ───────────────────────────────────────────────────
const quickLinks = [
  { label: '上传资源', icon: '📦', route: { name: 'dev-plugins' } },
  { label: '我的资源', icon: '📋', route: { name: 'dev-resource-list' } },
  { label: '需求大厅', icon: '🧩', route: { name: 'dev-requirement-hall' } },
  { label: '我的需求单', icon: '💬', route: { name: 'dev-my-requirements' } },
  { label: '工单管理', icon: '🎫', route: null, disabled: true },
]

async function loadRealname() {
  auth.hydrate()
  if (!auth.token.trim()) return
  realnameLoading.value = true
  realnameLoadError.value = false
  try {
    realnameRecord.value = await getMyRealnameVerification(auth.token)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      realnameRecord.value = null
    } else {
      realnameLoadError.value = true
    }
  } finally {
    realnameLoading.value = false
  }
}

onMounted(async () => {
  await loadRealname()
})
</script>

<template>
  <div class="dev-page dev-overview">

    <!-- 欢迎头 -->
    <div class="ov-header">
      <div class="ov-header__left">
        <p class="ov-header__greeting">欢迎回来</p>
        <h2 class="ov-header__name">{{ displayName }}</h2>
      </div>
    </div>

    <!-- 顶部双列：实名认证 + 快捷入口 -->
    <div class="ov-top-grid">

      <!-- 实名认证卡片 -->
      <el-card shadow="never" class="dev-surface-card ov-realname-card" :class="realnameAccentClass">
        <div class="ov-realname-card__eyebrow">Identity Verification</div>
        <div class="ov-realname-card__title-row">
          <h3 class="dev-section-title">实名认证</h3>
          <el-tag :type="realnameTagType" size="small" effect="light">{{ realnameStatusLabel }}</el-tag>
        </div>
        <p class="dev-section-desc ov-realname-card__desc">{{ realnameDesc }}</p>
        <div class="ov-realname-card__actions">
          <el-button plain :loading="realnameLoading" size="small" @click="loadRealname">刷新</el-button>
          <el-button v-if="realnameStatus !== 'approved'" type="primary" size="small"
            @click="router.push({ name: 'workbench-realname', query: { redirect_to: '/workbench/developer/resources/plugins-init' } })">{{
              realnameStatus === 'rejected' ? '重新认证' : realnameStatus === 'pending' ? '查看进度' : '去认证' }}</el-button>
          <el-button v-else plain size="small" @click="router.push({ name: 'workbench-realname' })">查看详情</el-button>
        </div>
      </el-card>

      <!-- 快捷入口卡片 -->
      <el-card shadow="never" class="dev-surface-card ov-quick-card">
        <div class="ov-realname-card__eyebrow">Quick Access</div>
        <h3 class="dev-section-title" style="margin-bottom: 18px;">快捷入口</h3>
        <div class="ov-quick-grid">
          <button v-for="link in quickLinks" :key="link.label" class="ov-quick-item"
            :class="{ 'ov-quick-item--disabled': link.disabled }" :disabled="link.disabled"
            @click="!link.disabled && link.route && router.push(link.route)">
            <span class="ov-quick-item__icon">{{ link.icon }}</span>
            <div class="ov-quick-item__body">
              <span class="ov-quick-item__label">{{ link.label }}</span>
              <span v-if="link.disabled" class="ov-quick-item__badge">暂未开放</span>
            </div>
          </button>
        </div>
      </el-card>

    </div>

    <!-- 新手引导 -->
    <el-card shadow="never" class="dev-surface-card">
      <h3 class="dev-section-title">新手引导</h3>
      <p class="dev-section-desc">按以下步骤推进，快速完成从入驻到接单的全流程。</p>

      <div class="dev-overview-guide">
        <article v-for="item in newcomerGuide" :key="item.step" class="dev-overview-guide__item">
          <div class="dev-overview-guide__step">{{ item.step }}</div>
          <div class="dev-overview-guide__title">{{ item.title }}</div>
          <p class="dev-overview-guide__desc">{{ item.desc }}</p>
          <div class="dev-overview-guide__footer">
            <span class="dev-overview-guide__hint">{{ item.hint }}</span>
            <el-button type="primary" plain size="small" @click="router.push(item.route)">{{ item.cta }}</el-button>
          </div>
        </article>
      </div>
    </el-card>

  </div>
</template>

<style scoped>
.dev-overview {
  gap: 20px;
}

/* ── 欢迎头 ─────────────────────────────────────────────────── */
.ov-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 4px 2px 0;
}

.ov-header__greeting {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--dev-muted);
  text-transform: uppercase;
}

.ov-header__name {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--dev-ink);
  letter-spacing: -0.02em;
}

/* ── 顶部双列 ────────────────────────────────────────────────── */
.ov-top-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* ── 实名认证卡片 ────────────────────────────────────────────── */
.ov-realname-card {
  position: relative;
  overflow: hidden;
}

.ov-realname-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  border-radius: 4px 0 0 4px;
}

.ov-realname--none::before {
  background: #cbd5e1;
}

.ov-realname--pending::before {
  background: #f59e0b;
}

.ov-realname--approved::before {
  background: #10b981;
}

.ov-realname--rejected::before {
  background: #ef4444;
}

.ov-realname-card__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dev-blue);
  margin-bottom: 8px;
}

.ov-realname-card__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.ov-realname-card__title-row .dev-section-title {
  margin: 0;
}

.ov-realname-card__desc {
  min-height: 38px;
}

.ov-realname-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

/* ── 快捷入口卡片 ────────────────────────────────────────────── */
.ov-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.ov-quick-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(17, 24, 39, 0.07);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(243, 246, 255, 0.7));
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  text-align: left;
}

.ov-quick-item:hover:not(.ov-quick-item--disabled) {
  background: rgba(31, 74, 209, 0.06);
  border-color: rgba(31, 74, 209, 0.2);
  transform: translateY(-1px);
}

.ov-quick-item:active:not(.ov-quick-item--disabled) {
  transform: translateY(0);
}

.ov-quick-item--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ov-quick-item__icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.ov-quick-item__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ov-quick-item__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--dev-ink);
}

.ov-quick-item__badge {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

/* ── 响应式 ──────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .ov-top-grid {
    grid-template-columns: 1fr;
  }
}
</style>
