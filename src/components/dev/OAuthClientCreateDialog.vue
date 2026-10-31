<script setup lang="ts">
import { computed } from 'vue'
import { TButton, TDialog, TInput } from 'ui_73info'

import { OAUTH_SCOPE_OPTIONS } from '@/api/oauthClients'

/**
 * 新建接入客户端的弹窗：只做展示与受控输入，请求与校验都在
 * `useDevOAuthClients` / 视图里（创建成功后由视图关闭弹窗）。
 */
const props = defineProps<{
  open: boolean
  name: string
  redirectUris: string
  scopes: string[]
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:name': [name: string]
  'update:redirect-uris': [uris: string]
  'toggle-scope': [scope: string]
  submit: []
}>()

const name = computed({
  get: () => props.name,
  set: (value: string) => emit('update:name', value),
})
const redirectUris = computed({
  get: () => props.redirectUris,
  set: (value: string) => emit('update:redirect-uris', value),
})

function close() {
  emit('update:open', false)
}
</script>

<template>
  <TDialog
    :open="props.open"
    title="新建客户端"
    width="560px"
    @update:open="emit('update:open', $event)"
  >
    <div class="dev-oauth-clients__form">
      <label>
        应用名称
        <TInput v-model="name" placeholder="例如：我的小工具站" />
      </label>
      <label>
        回调地址（每行一个，生产用 https，本地可用 http://localhost / 127.0.0.1）
        <textarea
          v-model="redirectUris"
          rows="3"
          placeholder="https://example.com/oauth/callback"
        />
      </label>
      <fieldset>
        <legend>权限范围</legend>
        <label
          v-for="option in OAUTH_SCOPE_OPTIONS"
          :key="option.value"
          class="dev-oauth-clients__scope"
        >
          <input
            type="checkbox"
            :checked="props.scopes.includes(option.value)"
            @change="emit('toggle-scope', option.value)"
          />
          {{ option.label }}
        </label>
      </fieldset>
    </div>

    <template #footer>
      <div class="dev-oauth-clients__dialog-actions">
        <TButton variant="outline" @click="close">取消</TButton>
        <TButton
          type="button"
          variant="solid"
          tone="accent"
          :loading="props.submitting"
          @click="emit('submit')"
          >创建客户端</TButton
        >
      </div>
    </template>
  </TDialog>
</template>

<style scoped src="./dev-oauth-clients-form.css"></style>

<style scoped>
.dev-oauth-clients__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
