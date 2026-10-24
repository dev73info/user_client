<script setup lang="ts">
/**
 * 买家「已授权应用」：列出把自己平台账号关联到外部用户 ID 的开发者站点，并支持撤销。
 *
 * 撤销只解除授权映射并失效该开发者签发的令牌，不会影响已购订单。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError } from '@/api/http'
import {
  listOAuthAuthorizations,
  revokeOAuthAuthorization,
  type OAuthAuthorization,
} from '@/api/oauthAuthorizations'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useAuthStore } from '@/stores/auth'
import { Refresh, TButton, TIcon, TMessage, TMessageBox } from 'ui_73info'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const errorMessage = ref('')
const items = ref<OAuthAuthorization[]>([])
const revoking = ref<string | null>(null)

function goLogin() {
  void router.replace({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function loadAuthorizations() {
  auth.hydrate()
  if (!auth.token.trim()) {
    goLogin()
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await listOAuthAuthorizations(auth.token)
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    errorMessage.value = errorText(error, '加载已授权应用失败')
  } finally {
    loading.value = false
  }
}

async function revoke(item: OAuthAuthorization) {
  if (revoking.value) {
    return
  }
  const confirmed = await TMessageBox.confirm({
    title: '撤销授权',
    content: `撤销后，「${item.developer_username}」将无法再通过平台读取你的账号身份；已购订单不受影响。`,
    confirmText: '撤销授权',
    tone: 'danger',
  })
  if (!confirmed) {
    return
  }
  revoking.value = item.developer_username
  try {
    await revokeOAuthAuthorization(auth.token, item.developer_username)
    items.value = items.value.filter(
      (current) => current.developer_username !== item.developer_username,
    )
    TMessage.success('已撤销授权')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    TMessage.error(errorText(error, '撤销授权失败'))
  } finally {
    revoking.value = null
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
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">已授权应用</h3>
        </div>
      </div>

      <p v-if="loading && !items.length" class="wb-empty" role="status">正在加载…</p>
      <div v-else-if="errorMessage" class="wb-empty" role="alert">
        <span class="wb-empty__title">加载失败</span>
        <span>{{ errorMessage }}</span>
        <TButton variant="outline" @click="loadAuthorizations">重试</TButton>
      </div>
      <div v-else-if="!items.length" class="wb-empty">
        <span class="wb-empty__title">还没有授权任何应用</span>
        <span>在接口资源站点登录时授权后，会显示在这里。</span>
      </div>
      <ul v-else class="wb-list" aria-label="已授权应用">
        <li v-for="item in items" :key="item.developer_username" class="wb-item">
          <div class="wb-item__main">
            <span class="wb-item__title">{{ item.developer_username }}</span>
            <span class="wb-item__meta">
              外部用户 ID：{{ item.external_user_ids.join('、') }}
            </span>
            <span class="wb-item__meta"
              >接口资源 {{ item.api_resource_count }} 个 · 授权于 {{ item.authorized_at }}</span
            >
          </div>
          <div class="wb-item__side">
            <TButton
              variant="outline"
              tone="danger"
              :loading="revoking === item.developer_username"
              :disabled="Boolean(revoking) && revoking !== item.developer_username"
              @click="revoke(item)"
            >
              撤销授权
            </TButton>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
