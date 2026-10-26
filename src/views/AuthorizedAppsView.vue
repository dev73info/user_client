<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  listOAuthAuthorizations,
  revokeOAuthAuthorization,
  type OAuthAuthorization,
} from '@/api/oauthAuthorizations'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'
import { Refresh, TButton, TIcon, TMessage, TMessageBox } from 'ui_73info'

const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref('')
const items = ref<OAuthAuthorization[]>([])
const revoking = ref('')

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

async function loadAuthorizations() {
  auth.hydrate()
  if (!auth.token.trim()) return
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await listOAuthAuthorizations(auth.token)
  } catch (error) {
    errorMessage.value = describeBackendError(error, '加载已授权应用失败')
  } finally {
    loading.value = false
  }
}

async function revoke(item: OAuthAuthorization) {
  if (revoking.value) return
  const confirmed = await TMessageBox.confirm({
    title: '撤销授权',
    content: `撤销后「${item.developer_username}」将无法再读取你的平台身份；已购订单不受影响。`,
    confirmText: '撤销授权',
    tone: 'danger',
  })
  if (!confirmed) return
  revoking.value = item.developer_username
  errorMessage.value = ''
  try {
    await revokeOAuthAuthorization(auth.token, item.developer_username)
    items.value = items.value.filter(
      (current) => current.developer_username !== item.developer_username,
    )
    TMessage.success('已撤销授权')
  } catch (error) {
    errorMessage.value = describeBackendError(error, '撤销授权失败')
    TMessage.error(errorMessage.value)
  } finally {
    revoking.value = ''
  }
}

onMounted(() => {
  void loadAuthorizations()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page" :aria-busy="loading">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="已授权应用概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">已授权开发者</span>
          <span class="wb-strip__value">{{ loading ? '—' : items.length }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton
            icon-only
            :loading="loading"
            aria-label="刷新已授权应用"
            @click="loadAuthorizations"
          >
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <h3 class="wb-card-head__title">已授权应用</h3>
      </div>
      <p v-if="loading" class="wb-empty" role="status">正在加载…</p>
      <div v-else-if="errorMessage" class="wb-empty" role="alert">
        <span>加载失败</span>
        <span>{{ errorMessage }}</span>
        <TButton variant="outline" @click="loadAuthorizations">重试</TButton>
      </div>
      <div v-else-if="!items.length" class="wb-empty">
        <span class="wb-empty__title">还没有授权任何应用</span>
        <span>在接口资源站点通过平台登录授权后，会显示在这里。</span>
      </div>
      <ul v-else class="authorized-apps" aria-label="已授权应用">
        <li v-for="item in items" :key="item.developer_username" class="authorized-app">
          <div class="authorized-app__main">
            <strong>{{ item.developer_username }}</strong>
            <span>外部用户 ID：{{ item.external_user_ids.join('、') }}</span>
            <span>
              首次授权 {{ formatTime(item.authorized_at) }} · 最近更新
              {{ formatTime(item.updated_at) }}
            </span>
          </div>
          <TButton
            variant="outline"
            tone="danger"
            :loading="revoking === item.developer_username"
            :disabled="Boolean(revoking) && revoking !== item.developer_username"
            @click="revoke(item)"
          >
            撤销授权
          </TButton>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.authorized-apps {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 16px 0 0;
  list-style: none;
}
.authorized-app {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
}
.authorized-app__main {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.authorized-app__main strong {
  color: var(--73-ink);
  font-size: 15px;
}
@media (max-width: 640px) {
  .authorized-app {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
