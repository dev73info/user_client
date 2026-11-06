<script setup lang="ts">
/**
 * 「两步验证」弹窗：验证方式（邮箱 / 手机号）+ 开关 + 6 位验证码。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：发码、保存、`auth.fetchProfile()`
 * 与 toast 都在视图（组件不碰 `@/api/*`、`TMessage`、`router`）。
 * 手机号那条路一直是「暂不支持」的灰按钮，文案与禁用状态原样保留。
 *
 * 状态归属：
 * - `visible`：父级持有；
 * - `targetEnabled` + `update:toggle`：开关的目标值由父级持有——父级的变更处理要拿它
 *   判断「是不是刚打开」，进而自动发一次验证码，同时清掉已填的验证码；
 * - `code` + `update:code`：验证码草稿由父级持有（提交时父级读）；
 * - `saving` / `codeSending` / `changed` / `emailBound` / `emailLabel`：父级算好传下来
 *   （`changed` 是「开关目标值 ≠ 已保存值」，提交前的「设置未变化」拦截也用它）；
 * - `method`（邮箱 / 手机号页签）是纯 UI 态，留在组件内部。
 *
 * 样式：`.dialog-form` 与整组 `.account-2fa-*` / `.account-security-*` / `.account-switch-*`
 * 原来都在视图的 scoped 块里，弹窗节点搬进来后父级 scoped 不再命中（整块塌版），随组件搬走。
 * 其中「两栏卡片 / 开关行 / 操作行」的列宽与 720px 窄屏档是**全局**样式
 * （`src/styles/profile.css` 的「账号弹窗的共用样式」一节）：那档断点与「修改密码」弹窗
 * 共用一份，且 scoped 的 `[data-v-x]` 特异性更高、会压住全局媒体查询，所以基声明也放在全局。
 */
import { computed, ref } from 'vue'

import type { ProfileTotpSetup } from '@/api/settings'
import { TDialog, TTag } from 'ui_73info'

import TotpSettingsPanel from './TotpSettingsPanel.vue'
import TwoFactorMethodTabs from './TwoFactorMethodTabs.vue'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 开关的目标状态（父级那份 `twoFactorTargetEnabled`）。 */
  targetEnabled: boolean
  /** 验证码输入框初值（保存成功后父级归零）。 */
  code: string
  /** 保存请求进行中。 */
  saving: boolean
  /** 发送验证码进行中。 */
  codeSending: boolean
  /** 目标状态与已保存状态是否不同：没变化时发码与保存都不可用。 */
  changed: boolean
  /** 当前账号是否已绑定邮箱：没绑时开关、发码、保存都不可用。 */
  emailBound: boolean
  /** 「当前邮箱：…」那行文案（未绑定时是「未绑定邮箱」，由父级折算）。 */
  emailLabel: string
  /** 身份验证器是否已启用。 */
  totpEnabled: boolean
  /** 身份验证器状态查询进行中。 */
  totpStatusLoading: boolean
  /** 身份验证器启用时间，未启用为 null。 */
  totpConfirmedAt: string | null
  /** 待确认的绑定信息；非空时展开二维码与动态码输入。 */
  totpSetup: ProfileTotpSetup | null
  /** 生成绑定信息进行中。 */
  totpSetupLoading: boolean
  /** 绑定动态码草稿。 */
  totpBindCode: string
  /** 启用身份验证器进行中。 */
  totpEnableSubmitting: boolean
  /** 停用确认是否展开。 */
  totpDisableVisible: boolean
  /** 停用动态码草稿。 */
  totpDisableCode: string
  /** 停用身份验证器进行中。 */
  totpDisableSubmitting: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 验证码输入即回传。 */
  'update:code': [code: string]
  /** 拨动开关：父级据此回写目标状态、清空验证码，必要时自动发一次验证码。 */
  toggle: [enabled: boolean]
  /** 点了「发送验证码」。 */
  'send-code': []
  /** 点了「保存设置」。 */
  submit: []
  /** 点了「生成绑定二维码」。 */
  'start-totp-setup': []
  /** 取消绑定。 */
  'cancel-totp-setup': []
  /** 绑定动态码输入即回传。 */
  'update:totp-bind-code': [code: string]
  /** 点了「确认启用」。 */
  'confirm-enable-totp': []
  /** 点了「停用」。 */
  'start-totp-disable': []
  /** 取消停用。 */
  'cancel-totp-disable': []
  /** 停用动态码输入即回传。 */
  'update:totp-disable-code': [code: string]
  /** 点了「确认停用」。 */
  'confirm-disable-totp': []
  /** 点了「复制密钥」。 */
  'copy-totp-secret': []
}>()

/** 验证方式页签：纯 UI 态，手机号那条一直是灰的，切不过去。 */
const method = ref<'email' | 'mobile' | 'totp'>('email')

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const code = computed({
  get: () => props.code,
  set: (next: string) => emit('update:code', next),
})

/** 开关按原生 checkbox 的 `change` 走：把「勾上没有」直接交给父级处理。
 *  取不到目标元素时沿用当前值（与拆分前 `input?.checked ?? twoFactorTargetEnabled` 同口径）。 */
function onToggle(event: Event): void {
  emit('toggle', (event.target as HTMLInputElement | null)?.checked ?? props.targetEnabled)
}
</script>

<template>
  <TDialog
    :open="props.visible"
    title="两步验证"
    class="account-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <TwoFactorMethodTabs
        :method="method"
        :totp-enabled="props.totpEnabled"
        @update:method="method = $event"
      />

      <template v-if="method === 'email'">
        <label class="account-security-toggle-row">
          <span class="account-security-toggle-copy">
            <strong>邮箱验证码保护</strong>
            <small class="requirement-note">当前邮箱：{{ props.emailLabel }}</small>
          </span>
          <span class="account-switch-control" :class="{ active: props.targetEnabled }">
            <input
              :checked="props.targetEnabled"
              type="checkbox"
              :disabled="props.saving || props.codeSending || !props.emailBound"
              @change="onToggle"
            />
            <span class="account-switch-track" aria-hidden="true">
              <span class="account-switch-thumb"></span>
            </span>
          </span>
        </label>
        <div class="account-security-actions">
          <input
            v-model="code"
            type="text"
            maxlength="6"
            placeholder="输入 6 位验证码"
            :disabled="props.saving || !props.emailBound || !props.changed"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="props.codeSending || props.saving || !props.emailBound || !props.changed"
            @click="emit('send-code')"
          >
            {{ props.codeSending ? '发送中...' : '发送验证码' }}
          </button>
          <button
            class="ghost small"
            type="button"
            :disabled="props.saving || !props.emailBound || !props.changed"
            @click="emit('submit')"
          >
            {{ props.saving ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </template>

      <div v-else-if="method === 'mobile'" class="account-2fa-unsupported">
        <TTag tone="info">手机号两步验证暂不支持，请使用邮箱验证码</TTag>
      </div>

      <TotpSettingsPanel
        v-else
        :enabled="props.totpEnabled"
        :confirmed-at="props.totpConfirmedAt"
        :status-loading="props.totpStatusLoading"
        :setup="props.totpSetup"
        :setup-loading="props.totpSetupLoading"
        :bind-code="props.totpBindCode"
        :enable-submitting="props.totpEnableSubmitting"
        :disable-visible="props.totpDisableVisible"
        :disable-code="props.totpDisableCode"
        :disable-submitting="props.totpDisableSubmitting"
        @start-setup="emit('start-totp-setup')"
        @cancel-setup="emit('cancel-totp-setup')"
        @update:bind-code="emit('update:totp-bind-code', $event)"
        @confirm-enable="emit('confirm-enable-totp')"
        @start-disable="emit('start-totp-disable')"
        @cancel-disable="emit('cancel-totp-disable')"
        @update:disable-code="emit('update:totp-disable-code', $event)"
        @confirm-disable="emit('confirm-disable-totp')"
        @copy-secret="emit('copy-totp-secret')"
      />
    </div>
  </TDialog>
</template>

<style scoped>
.dialog-form {
  display: grid;
  gap: 12px;
}

.account-security-toggle-row {
  display: grid;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  border-radius: 14px;
  background: var(--73-app-grad-accent-soft-02);
}

.account-security-toggle-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.account-security-toggle-copy strong {
  color: var(--73-ink);
  font-weight: 800;
}

.account-switch-control {
  position: relative;
  display: inline-grid;
  width: 46px;
  height: 26px;
}

.account-switch-control input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.account-switch-control input:disabled {
  cursor: not-allowed;
}

.account-switch-track {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--73-ink-disabled) 98%, transparent);
  border-radius: 999px;
  background: var(--73-border);
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.account-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--73-surface-strong);
  box-shadow: 0 2px 5px color-mix(in srgb, var(--73-ink) 20%, transparent);
  transition: transform 0.18s ease;
}

.account-switch-control.active .account-switch-track {
  border-color: color-mix(in srgb, var(--73-accent) 92%, transparent);
  background: var(--73-accent);
}

.account-switch-control.active .account-switch-thumb {
  transform: translateX(20px);
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

.account-security-actions input:disabled {
  background: var(--73-surface-strong);
  color: var(--73-ink-placeholder);
}

.account-security-actions input::placeholder {
  color: var(--73-ink-placeholder);
}

.account-2fa-unsupported {
  display: flex;
  justify-content: center;
  padding: 22px 0;
}

.account-security-actions .ghost.small {
  min-width: 104px;
}

.account-security-actions .ghost.small:disabled {
  border-color: color-mix(in srgb, var(--73-border) 96%, transparent);
  background: var(--73-surface-strong);
  color: var(--73-ink-placeholder);
  box-shadow: none;
}
</style>
