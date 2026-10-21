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
 * 原来都在视图的 scoped 块里，弹窗节点搬进来后父级 scoped 不再命中（整块塌版），随组件搬走；
 * 720px 那一档断点照原样跟着走，不新增档位。
 */
import { computed, ref } from 'vue'

import { TDialog, TTag } from 'ui_73info'

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
}>()

/** 验证方式页签：纯 UI 态，手机号那条一直是灰的，切不过去。 */
const method = ref<'email' | 'mobile'>('email')

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
      <div class="account-2fa-methods">
        <button
          class="account-2fa-method"
          :class="{ active: method === 'email' }"
          type="button"
          @click="method = 'email'"
        >
          <span class="account-2fa-method__name">邮箱验证码</span>
          <small class="account-2fa-method__desc">通过绑定邮箱接收验证码</small>
        </button>
        <button
          class="account-2fa-method"
          :class="{ active: method === 'mobile' }"
          type="button"
          disabled
        >
          <span class="account-2fa-method__name">手机号验证码</span>
          <small class="account-2fa-method__desc">通过绑定手机号接收验证码</small>
          <TTag size="sm" tone="info" class="account-2fa-method__tag">暂不支持</TTag>
        </button>
      </div>

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

      <div v-else class="account-2fa-unsupported">
        <TTag tone="info">手机号两步验证暂不支持，请使用邮箱验证码</TTag>
      </div>
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
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid rgba(224, 232, 255, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.account-security-toggle-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.account-security-toggle-copy strong {
  color: #0f172a;
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
  border: 1px solid rgba(203, 213, 225, 0.98);
  border-radius: 999px;
  background: #e2e8f0;
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
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
  transition: transform 0.18s ease;
}

.account-switch-control.active .account-switch-track {
  border-color: rgba(37, 99, 235, 0.92);
  background: #2563eb;
}

.account-switch-control.active .account-switch-thumb {
  transform: translateX(20px);
}

.account-security-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.account-security-actions input {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  padding: 12px 14px;
  background: #ffffff;
  color: #0f172a;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.account-security-actions input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.account-security-actions input::placeholder {
  color: #94a3b8;
}

.account-2fa-methods {
  display: grid;
  /* 同上：允许两列收缩，窄弹窗里不让卡片把容器顶宽 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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
  border: 1px solid rgba(224, 232, 255, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.account-2fa-method.active {
  border-color: rgba(37, 99, 235, 0.92);
  box-shadow: 0 10px 26px rgba(76, 103, 172, 0.14);
  background: linear-gradient(180deg, #eef4ff 0%, #ffffff 100%);
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
  color: #64748b;
  font-size: 12px;
}

.account-2fa-method__tag {
  justify-self: start;
  margin-top: 2px;
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
  border-color: rgba(226, 232, 240, 0.96);
  background: #f8fafc;
  color: #94a3b8;
  box-shadow: none;
}

@media (max-width: 720px) {
  .account-security-actions,
  .account-security-toggle-row {
    grid-template-columns: 1fr;
  }

  .account-2fa-methods {
    grid-template-columns: 1fr;
  }

  .account-switch-control {
    justify-self: start;
  }

  .account-security-actions .ghost.small {
    width: 100%;
    justify-self: stretch;
  }
}
</style>
