<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const displayName = computed(() => auth.username || '当前账号')
const retrying = ref(false)

function backToLogin() {
  auth.logout()
  void router.replace(buildUnifiedAuthUrl('login', DEV_PORTAL_URL))
}

async function retryAccessCheck() {
  if (retrying.value) {
    return
  }

  retrying.value = true
  try {
    auth.hydrate(true)
    await auth.fetchProfile(true)
    const hasAccess = await auth.ensureDevAccess()

    if (hasAccess) {
      showToast('开发者权限已开通，正在进入工作台', 'success')
      await router.replace('/dev/overview')
      return
    }

    showToast('当前账号仍未开通开发者权限，请联系管理员处理', 'warning')
  } catch (error) {
    auth.logout()
    showToast(error instanceof Error ? error.message : '权限校验失败，请重新登录', 'error')
    await router.replace(buildUnifiedAuthUrl('login', DEV_PORTAL_URL))
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <main class="dev-no-access">
    <section class="dev-no-access__panel">
      <span class="dev-no-access__eyebrow">Access Required</span>
      <h1 class="dev-no-access__title">{{ displayName }} 还没有开发者权限</h1>
      <p class="dev-no-access__desc">
        开发者缴纳审核费功能已下线。当前账号无法进入开发者工作台，请联系管理员直接开通开发者角色后再登录。
      </p>

      <div class="dev-no-access__actions">
        <el-button type="primary" @click="backToLogin">退出当前账号</el-button>
        <el-button plain :loading="retrying" @click="retryAccessCheck">重试权限校验</el-button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dev-no-access {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}

.dev-no-access__panel {
  width: min(720px, 100%);
  padding: 36px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(26, 115, 232, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 251, 0.98));
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.dev-no-access__eyebrow {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(26, 115, 232, 0.1);
  color: #1a73e8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dev-no-access__title {
  margin: 18px 0 12px;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.1;
  color: #10233f;
}

.dev-no-access__desc {
  margin: 0;
  font-size: 16px;
  line-height: 1.8;
  color: #516173;
}

.dev-no-access__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

@media (max-width: 640px) {
  .dev-no-access {
    padding: 24px 16px;
  }

  .dev-no-access__panel {
    padding: 24px;
    border-radius: 22px;
  }

  .dev-no-access__actions {
    flex-direction: column;
  }
}
</style>
