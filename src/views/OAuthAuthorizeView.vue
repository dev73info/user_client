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
 * 或注册平台账号；同意后平台只为「当前账号 + 该客户端」签发一次性授权码，
 * 并把带 `code` 的回跳地址交给前端跳回开发者站点。
 *
 * 本页**不接收 `external_user_id`**：关联由开发者服务端在换令牌时提交建立，
 * 浏览器只能决定「用哪个账号同意」，决定不了绑定对象。
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
}))

const canApprove = computed(() => Boolean(meta.value))

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
          <div class="oauth-summary__row">
            <dt>授权范围</dt>
            <dd>{{ meta.scope }}</dd>
          </div>
        </dl>

        <p class="oauth-card__hint">
          同意后，开发者站点可通过平台确认你的账号，并与它自己的用户 ID 建立关联；
          平台不会向开发者同步手机号、邮箱或密码。
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
  border: 1px solid color-mix(in srgb, var(--73-accent) 72%, transparent);
  background: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  box-shadow: 0 18px 42px color-mix(in srgb, var(--73-accent) 12%, transparent);
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
  color: var(--73-ink);
}

.oauth-card__resource {
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 700;
}

.oauth-card__lead {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 14px;
  line-height: 1.7;
}

.oauth-card__status {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.6;
}

.oauth-card__hint {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.7;
}

.oauth-card__hint--warn {
  background: color-mix(in srgb, var(--73-danger-soft) 90%, transparent);
  color: var(--73-danger);
}

.oauth-card__error {
  display: grid;
  gap: 14px;
  justify-items: start;
  color: var(--73-danger);
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
  color: var(--73-ink-muted);
}

.oauth-summary__row dd {
  margin: 0;
  color: var(--73-ink);
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
