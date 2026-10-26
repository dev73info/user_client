<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import {
  OAUTH_SCOPE_OPTIONS,
  createOAuthClient,
  deleteOAuthClient,
  listOAuthClients,
  rotateOAuthClientSecret,
  updateOAuthClient,
  type OAuthClient,
} from '@/api/oauthClients'
import { useAuthStore } from '@/stores/auth'
import { TButton, TInput, TMessage } from 'ui_73info'

const auth = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const clients = ref<OAuthClient[]>([])
const loadError = ref('')

const createForm = reactive({
  name: '',
  redirectUris: '',
  scopes: ['profile'] as string[],
})
const editingId = ref<string | null>(null)
const editForm = reactive({ name: '', redirectUris: '' })
/** 一次性密钥：只在创建或轮换成功时展示一次，刷新页面后不再回显。 */
const oneTimeSecret = ref<{ clientId: string; secret: string } | null>(null)
const copied = ref(false)

function urisOf(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function loadClients() {
  loading.value = true
  loadError.value = ''
  try {
    clients.value = await listOAuthClients(auth.token)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载接入客户端失败'
  } finally {
    loading.value = false
  }
}

function toggleScope(scope: string) {
  const index = createForm.scopes.indexOf(scope)
  if (index >= 0) createForm.scopes.splice(index, 1)
  else createForm.scopes.push(scope)
}

async function copySecret() {
  if (!oneTimeSecret.value) return
  try {
    await navigator.clipboard.writeText(oneTimeSecret.value.secret)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    TMessage.warning('复制失败，请手动选中密钥复制')
  }
}

async function submitCreate() {
  const name = createForm.name.trim()
  const redirect_uris = urisOf(createForm.redirectUris)
  if (!name) {
    TMessage.warning('请填写应用名称')
    return
  }
  if (!redirect_uris.length) {
    TMessage.warning('请至少填写一个回调地址')
    return
  }
  if (!createForm.scopes.length) {
    TMessage.warning('请至少选择一个权限范围')
    return
  }
  submitting.value = true
  try {
    const created = await createOAuthClient(auth.token, {
      name,
      redirect_uris,
      scopes: createForm.scopes,
    })
    if (created.client_secret) {
      oneTimeSecret.value = { clientId: created.client_id, secret: created.client_secret }
    }
    createForm.name = ''
    createForm.redirectUris = ''
    createForm.scopes = ['profile']
    await loadClients()
    TMessage.success('客户端已创建，请立即保存密钥')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '创建接入客户端失败')
  } finally {
    submitting.value = false
  }
}

function openEdit(client: OAuthClient) {
  editingId.value = client.client_id
  editForm.name = client.name
  editForm.redirectUris = client.redirect_uris.join('\n')
}

async function submitEdit(client: OAuthClient) {
  const name = editForm.name.trim()
  const redirect_uris = urisOf(editForm.redirectUris)
  if (!name || !redirect_uris.length) {
    TMessage.warning('应用名称与回调地址都不能为空')
    return
  }
  submitting.value = true
  try {
    await updateOAuthClient(auth.token, client.client_id, { name, redirect_uris })
    editingId.value = null
    await loadClients()
    TMessage.success('已保存')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

async function rotate(client: OAuthClient) {
  if (!window.confirm(`确定要轮换「${client.name}」的密钥吗？旧密钥会立即失效。`)) return
  submitting.value = true
  try {
    const result = await rotateOAuthClientSecret(auth.token, client.client_id)
    oneTimeSecret.value = { clientId: client.client_id, secret: result.client_secret }
    await loadClients()
    TMessage.success('新密钥已生效，请立即保存')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '轮换密钥失败')
  } finally {
    submitting.value = false
  }
}

async function remove(client: OAuthClient) {
  if (!window.confirm(`确定要删除「${client.name}」吗？删除后使用该客户端的应用会立即失效。`)) return
  submitting.value = true
  try {
    await deleteOAuthClient(auth.token, client.client_id)
    if (oneTimeSecret.value?.clientId === client.client_id) oneTimeSecret.value = null
    await loadClients()
    TMessage.success('已删除')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '删除失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadClients()
})
</script>

<template>
  <div class="dev-page dev-oauth-clients">
    <header class="dev-oauth-clients__head">
      <div>
        <h2>接入客户端</h2>
        <p>在自己的站点使用 73Info 账号登录（OAuth 2.0 授权码模式）。创建客户端需要已完成实名认证。</p>
      </div>
      <TButton variant="outline" :loading="loading" @click="loadClients">刷新</TButton>
    </header>

    <section class="dev-surface-card">
      <h3>新建客户端</h3>
      <div class="dev-oauth-clients__form">
        <label>
          应用名称
          <TInput v-model="createForm.name" placeholder="例如：我的小工具站" />
        </label>
        <label>
          回调地址（每行一个，生产用 https，本地可用 http://localhost / 127.0.0.1）
          <textarea v-model="createForm.redirectUris" rows="3" placeholder="https://example.com/oauth/callback" />
        </label>
        <fieldset>
          <legend>权限范围</legend>
          <label v-for="option in OAUTH_SCOPE_OPTIONS" :key="option.value" class="dev-oauth-clients__scope">
            <input
              type="checkbox"
              :checked="createForm.scopes.includes(option.value)"
              @change="toggleScope(option.value)"
            />
            {{ option.label }}
          </label>
        </fieldset>
        <TButton type="primary" :loading="submitting" @click="submitCreate">创建客户端</TButton>
      </div>
    </section>

    <section v-if="oneTimeSecret" class="dev-surface-card dev-oauth-clients__secret" role="alert">
      <h3>请立即保存这枚密钥</h3>
      <p>明文只显示这一次，之后只能看到掩码前缀。换一枚新的也会使旧的立即失效。</p>
      <div class="dev-oauth-clients__secret-row">
        <code>{{ oneTimeSecret.secret }}</code>
        <TButton variant="outline" @click="copySecret">{{ copied ? '已复制' : '复制密钥' }}</TButton>
        <TButton variant="outline" @click="oneTimeSecret = null">知道了</TButton>
      </div>
    </section>

    <p v-if="loadError" class="dev-empty-state" role="alert">{{ loadError }}</p>
    <p v-else-if="loading && !clients.length" class="dev-empty-state">正在加载客户端…</p>
    <p v-else-if="!clients.length" class="dev-empty-state">还没有接入客户端，先创建一个吧。</p>

    <section v-for="client in clients" :key="client.client_id" class="dev-surface-card dev-oauth-clients__item">
      <template v-if="editingId === client.client_id">
        <div class="dev-oauth-clients__form">
          <label>
            应用名称
            <TInput v-model="editForm.name" />
          </label>
          <label>
            回调地址
            <textarea v-model="editForm.redirectUris" rows="3" />
          </label>
          <div class="dev-oauth-clients__actions">
            <TButton type="primary" :loading="submitting" @click="submitEdit(client)">保存</TButton>
            <TButton variant="outline" @click="editingId = null">取消</TButton>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="dev-oauth-clients__item-head">
          <strong>{{ client.name }}</strong>
          <span v-if="!client.is_active">（已停用）</span>
        </div>
        <dl>
          <dt>client_id</dt>
          <dd><code>{{ client.client_id }}</code></dd>
          <dt>回调地址</dt>
          <dd>{{ client.redirect_uris.join('、') }}</dd>
          <dt>权限范围</dt>
          <dd>{{ client.allowed_scopes.join('、') }}</dd>
          <dt>密钥前缀</dt>
          <dd><code>{{ client.client_secret_prefix }}</code></dd>
        </dl>
        <div class="dev-oauth-clients__actions">
          <TButton variant="outline" @click="openEdit(client)">编辑</TButton>
          <TButton variant="outline" @click="rotate(client)">轮换密钥</TButton>
          <TButton variant="outline" @click="remove(client)">删除</TButton>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.dev-oauth-clients__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.dev-oauth-clients__head p {
  margin: 6px 0 0;
  color: var(--73-ink-muted, #6b7280);
  font-size: 13px;
}

.dev-oauth-clients__form {
  display: grid;
  gap: 12px;
  max-width: 640px;
}

.dev-oauth-clients__form label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--73-ink-regular, #374151);
}

.dev-oauth-clients__form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--73-border, #d9dee8);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
}

.dev-oauth-clients__form fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.dev-oauth-clients__scope {
  display: flex !important;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}

.dev-oauth-clients__secret {
  border: 1px solid var(--73-warning-border, #f2c94c);
  background: var(--73-warning-bg, #fff9e6);
}

.dev-oauth-clients__secret-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dev-oauth-clients__secret-row code {
  word-break: break-all;
  font-size: 13px;
}

.dev-oauth-clients__item {
  margin-top: 12px;
}

.dev-oauth-clients__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.dev-oauth-clients__item dl {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 6px 12px;
  margin: 0 0 12px;
  font-size: 13px;
}

.dev-oauth-clients__item dt {
  color: var(--73-ink-muted, #6b7280);
}

.dev-oauth-clients__item dd {
  margin: 0;
  word-break: break-all;
}

.dev-oauth-clients__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
