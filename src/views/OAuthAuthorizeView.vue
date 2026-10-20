<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  consentOAuthAuthorize,
  getOAuthAuthorizeMeta,
  type OAuthAuthorizeMeta,
  type OAuthAuthorizeParams,
} from '@/api/oauth'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { TButton, TMessage } from 'ui_73info'

/**
 * R039 平台 OAuth 2.0 授权页。
 *
 * 开发者站点把买家浏览器带到这里（`/oauth/authorize?...`）。买家必须先登录
 * 或注册平台账号；同意后平台写入「开发者外部用户 ID → 平台账号」关联，
 * 并把带一次性 code 的回跳地址交给前端跳回开发者站点。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

type Phase = 'loading' | 'ready' | 'submitting' | 'error'

const phase = ref<Phase>('loading')
const errorMessage = ref('')
const meta = ref<OAuthAuthorizeMeta | null>(null)

function readQueryString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

const params = computed<OAuthAuthorizeParams>(() => ({
  client_id: readQueryString(route.query.client_id),
  redirect_uri: readQueryString(route.query.redirect_uri),
  response_type: readQueryString(route.query.response_type) || 'code',
  state: readQueryString(route.query.state),
  scope: readQueryString(route.query.scope),
  code_challenge: readQueryString(route.query.code_challenge),
  code_challenge_method: readQueryString(route.query.code_challenge_method),
  external_user_id: readQueryString(route.query.external_user_id),
}))

const canApprove = computed(() => {
  if (!meta.value) {
    return false
  }
  return !meta.value.binding.link_conflict
})

const bindingHint = computed(() => {
  const binding = meta.value?.binding
  if (!binding || !meta.value?.external_user_id) {
    return '同意后，平台会记录本次登录，但不会在开发者站点之外同步任何资料。'
  }
  if (binding.linked_to_current_user) {
    return '该开发者用户已关联到当前账号，同意后将直接继续。'
  }
  if (binding.link_conflict) {
    return '该开发者用户已关联其他平台账号，无法继续授权。请回到开发者站点更换账号或联系开发者。'
  }
  return '同意后，开发者站点将能通过平台确认你的账号，并与它的用户 ID 建立关联。'
})

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

function buildDenyRedirect(): string {
  const redirectUri = meta.value?.redirect_uri || params.value.redirect_uri
  const state = meta.value?.state || params.value.state
  try {
    const url = new URL(redirectUri)
    url.searchParams.set('error', 'access_denied')
    if (state) {
      url.searchParams.set('state', state)
    }
    return url.toString()
  } catch {
    return ''
  }
}

async function bootstrap() {
  auth.hydrate()

  if (!params.value.client_id || !params.value.redirect_uri) {
    phase.value = 'error'
    errorMessage.value = '授权链接缺少 client_id 或 redirect_uri'
    return
  }

  if (!auth.token.trim()) {
    goLogin()
    return
  }

  phase.value = 'loading'
  try {
    meta.value = await getOAuthAuthorizeMeta(auth.token, params.value)
    phase.value = 'ready'
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    phase.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '加载授权信息失败'
  }
}

async function approve() {
  if (!meta.value || !canApprove.value || phase.value === 'submitting') {
    return
  }
  phase.value = 'submitting'
  try {
    const result = await consentOAuthAuthorize(auth.token, params.value)
    window.location.assign(result.redirect_url)
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    phase.value = 'ready'
    TMessage.error(error instanceof Error ? error.message : '授权失败')
  }
}

function deny() {
  const redirectUrl = buildDenyRedirect()
  if (!redirectUrl) {
    void router.replace({ name: 'home' })
    return
  }
  window.location.assign(redirectUrl)
}

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <main class="page-shell oauth-page" :aria-busy="phase === 'loading' || phase === 'submitting'">
    <section class="oauth-card">
      <header class="oauth-card__head">
        <h1 class="oauth-card__title">授权登录</h1>
        <span v-if="meta" class="oauth-card__resource">资源 #{{ meta.resource_id }}</span>
      </header>

      <p v-if="phase === 'loading'" class="oauth-card__status" role="status">正在加载授权信息…</p>

      <div v-else-if="phase === 'error'" class="oauth-card__error" role="alert">
        <p>{{ errorMessage }}</p>
        <TButton variant="outline" @click="router.push({ name: 'home' })">返回首页</TButton>
      </div>

      <template v-else-if="meta">
        <p class="oauth-card__lead">
          <strong>{{ meta.client_name }}</strong> 请求使用你的 73Info 账号完成登录。
        </p>

        <dl class="oauth-summary">
          <div class="oauth-summary__row">
            <dt>当前账号</dt>
            <dd>{{ meta.user.username }}</dd>
          </div>
          <div v-if="meta.external_user_id" class="oauth-summary__row">
            <dt>开发者用户 ID</dt>
            <dd>{{ meta.external_user_id }}</dd>
          </div>
          <div class="oauth-summary__row">
            <dt>授权范围</dt>
            <dd>{{ meta.scope }}</dd>
          </div>
        </dl>

        <p class="oauth-card__hint" :class="{ 'oauth-card__hint--warn': meta.binding.link_conflict }">
          {{ bindingHint }}
        </p>

        <p v-if="meta.binding.link_conflict" class="oauth-card__status" role="alert">
          该开发者用户已关联其他平台账号，无法继续授权。
        </p>

        <div class="oauth-actions">
          <TButton :disabled="!canApprove" :loading="phase === 'submitting'" @click="approve">
            同意授权
          </TButton>
          <TButton variant="outline" :disabled="phase === 'submitting'" @click="deny">
            取消
          </TButton>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.oauth-page {
  display: flex;
  justify-content: center;
  padding: 48px 16px 72px;
}

.oauth-card {
  width: min(560px, 100%);
  display: grid;
  gap: 18px;
  padding: 26px;
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
}

.oauth-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.oauth-card__title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}

.oauth-card__resource {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.oauth-card__lead {
  margin: 0;
  color: #334155;
  font-size: 14px;
  line-height: 1.7;
}

.oauth-card__status {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.oauth-card__hint {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.9);
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.oauth-card__hint--warn {
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
}

.oauth-card__error {
  display: grid;
  gap: 14px;
  justify-items: start;
  color: #b91c1c;
  font-size: 13px;
}

.oauth-summary {
  display: grid;
  gap: 10px;
  margin: 0;
}

.oauth-summary__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}

.oauth-summary__row dt {
  color: #64748b;
}

.oauth-summary__row dd {
  margin: 0;
  color: #0f172a;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.oauth-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
