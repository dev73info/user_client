<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import OAuthClientCreateDialog from '@/components/dev/OAuthClientCreateDialog.vue'
import { useDevOAuthClients } from '@/composables/useDevOAuthClients'
import { Refresh, TButton, TCard, TIcon, TInput } from 'ui_73info'

const {
  clients,
  copied,
  copySecret,
  createForm,
  editForm,
  editingId,
  init,
  loadClients,
  loadError,
  loading,
  oneTimeSecret,
  openEdit,
  remove,
  rotate,
  submitCreate,
  submitEdit,
  submitting,
  toggleScope,
} = useDevOAuthClients()

const createOpen = ref(false)
const activeClientCount = computed(() => clients.value.filter((client) => client.is_active).length)

onMounted(init)

function openCreate() {
  createForm.name = ''
  createForm.redirectUris = ''
  createForm.scopes = ['profile']
  createOpen.value = true
}

async function handleCreate() {
  if (await submitCreate()) {
    createOpen.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-oauth-clients">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">客户端</span>
          <span class="dev-meta-strip__value">{{ clients.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">已启用</span>
          <span class="dev-meta-strip__value">{{ activeClientCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton
            icon-only
            :loading="loading"
            aria-label="刷新接入客户端"
            title="刷新接入客户端"
            @click="loadClients"
          >
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">接入客户端</h3>
          <p class="dev-section-desc">
            在自己的站点使用 73Info 账号登录（OAuth 2.0 授权码模式）。创建客户端需要已完成实名认证。
          </p>
        </div>
        <div class="dev-card-head__actions">
          <TButton variant="solid" tone="accent" @click="openCreate">新建客户端</TButton>
        </div>
      </div>

      <OAuthClientCreateDialog
        v-model:open="createOpen"
        :name="createForm.name"
        :redirect-uris="createForm.redirectUris"
        :scopes="createForm.scopes"
        :submitting="submitting"
        @update:name="createForm.name = $event"
        @update:redirect-uris="createForm.redirectUris = $event"
        @toggle-scope="toggleScope"
        @submit="handleCreate"
      />

      <section v-if="oneTimeSecret" class="dev-oauth-clients__secret" role="alert">
        <h3>请立即保存这枚密钥</h3>
        <p>明文只显示这一次，之后只能看到掩码前缀。换一枚新的也会使旧的立即失效。</p>
        <div class="dev-oauth-clients__secret-row">
          <code>{{ oneTimeSecret.secret }}</code>
          <TButton variant="outline" @click="copySecret">{{
            copied ? '已复制' : '复制密钥'
          }}</TButton>
          <TButton variant="outline" @click="oneTimeSecret = null">知道了</TButton>
        </div>
      </section>

      <p v-if="loadError" class="dev-empty-state" role="alert">{{ loadError }}</p>
      <p v-else-if="loading && !clients.length" class="dev-empty-state">正在加载客户端…</p>
      <p v-else-if="!clients.length" class="dev-empty-state">还没有接入客户端，先创建一个吧。</p>

      <section
        v-for="client in clients"
        :key="client.client_id"
        class="dev-stack-item dev-oauth-clients__item"
      >
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
              <TButton
                type="button"
                variant="solid"
                tone="accent"
                :loading="submitting"
                @click="submitEdit(client)"
                >保存</TButton
              >
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
            <dd>
              <code>{{ client.client_id }}</code>
            </dd>
            <dt>回调地址</dt>
            <dd>{{ client.redirect_uris.join('、') }}</dd>
            <dt>权限范围</dt>
            <dd>{{ client.allowed_scopes.join('、') }}</dd>
            <dt>密钥前缀</dt>
            <dd>
              <code>{{ client.client_secret_prefix }}</code>
            </dd>
          </dl>
          <div class="dev-oauth-clients__actions">
            <TButton variant="outline" @click="openEdit(client)">编辑</TButton>
            <TButton variant="outline" @click="rotate(client)">轮换密钥</TButton>
            <TButton variant="outline" @click="remove(client)">删除</TButton>
          </div>
        </template>
      </section>
    </TCard>
  </div>
</template>

<style scoped>
.dev-oauth-clients__secret {
  margin-bottom: 16px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--73-warning) 30%, transparent);
  border-radius: var(--dev-radius-inner);
  background: color-mix(in srgb, var(--73-warning) 8%, var(--dev-surface));
}

.dev-oauth-clients__secret h3 {
  margin: 0 0 6px;
  color: var(--dev-ink);
  font-size: 15px;
  font-weight: 600;
}

.dev-oauth-clients__secret p {
  margin: 0 0 12px;
  color: var(--dev-muted);
  font-size: 13px;
  line-height: 1.6;
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
  display: grid;
  gap: 10px;
}

.dev-oauth-clients__item + .dev-oauth-clients__item {
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

<style scoped src="@/components/dev/dev-oauth-clients-form.css"></style>
