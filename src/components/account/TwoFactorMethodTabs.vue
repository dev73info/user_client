<script setup lang="ts">
/**
 * 「两步验证」弹窗顶部的验证方式选择：邮箱验证码 / 手机号验证码（暂不支持）/ 身份验证器。
 *
 * 纯展示：选中项由父级持有，点击回传。手机号那条一直是灰的，切不过去。
 */
import { TTag } from 'ui_73info'

const props = defineProps<{
  /** 当前选中的验证方式。 */
  method: 'email' | 'mobile' | 'totp'
  /** 身份验证器是否已启用（已启用时在卡片上标出来）。 */
  totpEnabled: boolean
}>()

const emit = defineEmits<{
  'update:method': [method: 'email' | 'mobile' | 'totp']
}>()
</script>

<template>
  <div class="account-2fa-methods">
    <button
      class="account-2fa-method"
      :class="{ active: props.method === 'email' }"
      type="button"
      @click="emit('update:method', 'email')"
    >
      <span class="account-2fa-method__name">邮箱验证码</span>
      <small class="account-2fa-method__desc">通过绑定邮箱接收验证码</small>
    </button>
    <button class="account-2fa-method" type="button" disabled>
      <span class="account-2fa-method__name">手机号验证码</span>
      <small class="account-2fa-method__desc">通过绑定手机号接收验证码</small>
      <TTag size="sm" tone="info" class="account-2fa-method__tag">暂不支持</TTag>
    </button>
    <button
      class="account-2fa-method"
      :class="{ active: props.method === 'totp' }"
      type="button"
      @click="emit('update:method', 'totp')"
    >
      <span class="account-2fa-method__name">身份验证器</span>
      <small class="account-2fa-method__desc">通过 Authenticator 动态码验证</small>
      <TTag v-if="props.totpEnabled" size="sm" tone="success" class="account-2fa-method__tag">
        已启用
      </TTag>
    </button>
  </div>
</template>

<style scoped>
.account-2fa-methods {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.account-2fa-methods > * {
  min-width: 0;
}

.account-2fa-method {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  border-radius: 14px;
  background: var(--73-app-grad-accent-soft-02);
  color: var(--73-ink);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.account-2fa-method.active {
  border-color: color-mix(in srgb, var(--73-accent) 92%, transparent);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--73-accent) 14%, transparent);
  background: var(--73-app-grad-accent-soft-01);
}

.account-2fa-method:disabled {
  cursor: not-allowed;
  opacity: 0.66;
}

.account-2fa-method__name {
  font-weight: 800;
  font-size: 14px;
}

.account-2fa-method__desc {
  color: var(--73-ink-muted);
  font-size: 12px;
}

.account-2fa-method__tag {
  justify-self: start;
  margin-top: 2px;
}
</style>
