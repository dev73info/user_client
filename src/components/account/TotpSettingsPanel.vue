<script setup lang="ts">
/**
 * 「身份验证器」面板：状态行 + 绑定二维码 + 停用确认，渲染在「两步验证」弹窗的第三个页签里。
 *
 * 纯展示：所有请求、错误文案与 toast 都在 `useAccountTotpSettings`，这里只收 props、
 * 回传草稿与按钮动作。二维码在本地用 `qrcode` 画 `otpauth://` 地址（与微信登录弹窗同口径），
 * 不把扫码地址发到任何第三方。
 */
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

import type { ProfileTotpSetup } from '@/api/settings'
import { TTag } from 'ui_73info'

const props = defineProps<{
  /** 是否已启用身份验证器。 */
  enabled: boolean
  /** 启用时间（东八区 `YYYY-MM-DD HH:MM:SS`），未启用为 null。 */
  confirmedAt: string | null
  /** 状态查询进行中。 */
  statusLoading: boolean
  /** 待确认的绑定信息；非空时面板展开二维码与动态码输入。 */
  setup: ProfileTotpSetup | null
  /** 生成绑定信息进行中。 */
  setupLoading: boolean
  /** 绑定动态码草稿。 */
  bindCode: string
  /** 启用请求进行中。 */
  enableSubmitting: boolean
  /** 停用确认是否展开。 */
  disableVisible: boolean
  /** 停用动态码草稿。 */
  disableCode: string
  /** 停用请求进行中。 */
  disableSubmitting: boolean
}>()

const emit = defineEmits<{
  'start-setup': []
  'cancel-setup': []
  'update:bind-code': [code: string]
  'confirm-enable': []
  'start-disable': []
  'cancel-disable': []
  'update:disable-code': [code: string]
  'confirm-disable': []
  'copy-secret': []
}>()

const qrDataUrl = ref('')
const qrError = ref('')

watch(
  () => props.setup?.otpauth_uri ?? '',
  async (uri) => {
    qrDataUrl.value = ''
    qrError.value = ''
    if (!uri) {
      return
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(uri, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
    } catch {
      qrError.value = '二维码生成失败，请重新生成绑定密钥'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="totp-panel">
    <div class="totp-status-row">
      <span class="totp-status-copy">
        <strong>身份验证器</strong>
        <small v-if="props.enabled && props.confirmedAt" class="requirement-note">
          启用时间：{{ props.confirmedAt }}
        </small>
      </span>
      <TTag :tone="props.enabled ? 'success' : 'info'">
        {{ props.enabled ? '已启用' : '未启用' }}
      </TTag>
    </div>

    <div v-if="!props.setup && !props.disableVisible" class="totp-actions">
      <button
        v-if="!props.enabled"
        class="ghost small"
        type="button"
        :disabled="props.statusLoading || props.setupLoading"
        @click="emit('start-setup')"
      >
        {{ props.setupLoading ? '生成中...' : '生成绑定二维码' }}
      </button>
      <button v-else class="ghost small" type="button" @click="emit('start-disable')">停用</button>
    </div>

    <template v-if="props.setup">
      <div class="totp-qr">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="身份验证器绑定二维码" />
        <span v-else>{{ qrError || '二维码生成中...' }}</span>
      </div>
      <p class="totp-hint">
        使用 Microsoft Authenticator 扫码，或手动输入密钥。丢失验证器可联系超级管理员重置。
      </p>
      <div class="totp-secret-row">
        <code class="totp-secret">{{ props.setup.secret }}</code>
        <button class="ghost small" type="button" @click="emit('copy-secret')">复制密钥</button>
      </div>
      <div class="account-security-actions">
        <input
          :value="props.bindCode"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="输入 6 位动态码"
          :disabled="props.enableSubmitting"
          @input="emit('update:bind-code', ($event.target as HTMLInputElement).value)"
        />
        <button
          class="ghost small"
          type="button"
          :disabled="props.enableSubmitting"
          @click="emit('cancel-setup')"
        >
          取消
        </button>
        <button
          class="ghost small"
          type="button"
          :disabled="props.enableSubmitting"
          @click="emit('confirm-enable')"
        >
          {{ props.enableSubmitting ? '启用中...' : '确认启用' }}
        </button>
      </div>
    </template>

    <template v-if="props.disableVisible">
      <div class="account-security-actions">
        <input
          :value="props.disableCode"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="输入当前 6 位动态码"
          :disabled="props.disableSubmitting"
          @input="emit('update:disable-code', ($event.target as HTMLInputElement).value)"
        />
        <button
          class="ghost small"
          type="button"
          :disabled="props.disableSubmitting"
          @click="emit('cancel-disable')"
        >
          取消
        </button>
        <button
          class="ghost small"
          type="button"
          :disabled="props.disableSubmitting"
          @click="emit('confirm-disable')"
        >
          {{ props.disableSubmitting ? '停用中...' : '确认停用' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.totp-panel {
  display: grid;
  gap: 12px;
}

.totp-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  border-radius: 14px;
  background: var(--73-app-grad-accent-soft-02);
}

.totp-status-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.totp-status-copy strong {
  color: var(--73-ink);
  font-weight: 800;
}

.totp-actions {
  display: flex;
  justify-content: flex-end;
}

.totp-qr {
  display: grid;
  place-items: center;
  min-height: 180px;
  border-radius: 14px;
  background: var(--73-surface-strong);
  color: var(--73-ink-muted);
}

.totp-qr img {
  display: block;
  width: 180px;
  height: 180px;
}

.totp-hint {
  margin: 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

.totp-secret-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.totp-secret {
  flex: 1;
  min-width: 0;
  border: 1px dashed color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.account-security-actions {
  display: grid;
  gap: 10px;
  align-items: center;
}

.account-security-actions input {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  border-radius: 16px;
  padding: 12px 14px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  outline: none;
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--73-ink) 3%, transparent);
}

.account-security-actions input::placeholder {
  color: var(--73-ink-placeholder);
}

.account-security-actions .ghost.small {
  min-width: 104px;
}
</style>
