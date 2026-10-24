<script setup lang="ts">
/**
 * 「修改密码」弹窗：新密码 + 再次输入 + 6 位邮箱验证码。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：发码、保存、校验与 toast 都在视图
 * （组件不碰 `@/api/*`、`TMessage`、`router`）。三段输入仍然写在两行里，
 * 行模板（`.profile-update-row` + `--triple`）是全局样式，只有列宽覆盖跟着本弹窗走。
 *
 * 状态归属：
 * - `visible`：父级持有；
 * - `initialPassword` / `initialConfirm` / `initialCode` + `update:password` / `update:confirm` /
 *   `update:code`：三份草稿都由父级持有（保存成功后父级统一清空，提交时也是父级读），
 *   组件只做受控输入；
 * - `saving` / `codeSending`：纯加载态，父级正在发请求；
 * - `emailBound`：没绑邮箱时改了密码也收不到验证码，两个「发送 / 保存」都得拦在外面
 *   （判断仍在视图，这里只接收结果）。
 *
 * 样式：`.dialog-form` 原来写在视图的 scoped 块里，弹窗节点搬进来后父级 scoped 不再命中
 * （整块塌版），随组件搬走；两个 `.account-password-row--*` 的列宽与 720px 窄屏档是
 * **全局**样式（`src/styles/profile.css` 的「账号弹窗的共用样式」一节）——那档断点与
 * 「两步验证」弹窗共用一份，且 scoped 的 `[data-v-x]` 特异性更高、会压住全局媒体查询，
 * 所以基声明也放在全局那边。
 */
import { computed } from 'vue'

import { TDialog } from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 当前密码输入框初值（父级那份草稿）。 */
  initialOldPassword: string
  /** 新密码输入框初值（父级那份草稿）。 */
  initialPassword: string
  /** 再次输入的新密码初值。 */
  initialConfirm: string
  /** 验证码输入框初值（保存成功后父级归零）。 */
  initialCode: string
  /** 保存请求进行中。 */
  saving: boolean
  /** 发送验证码进行中。 */
  codeSending: boolean
  /** 当前账号是否已绑定邮箱：没绑时发码与保存都不可用。 */
  emailBound: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 当前密码输入即回传。 */
  'update:old-password': [password: string]
  /** 新密码输入即回传。 */
  'update:password': [password: string]
  /** 再次输入的新密码输入即回传。 */
  'update:confirm': [confirm: string]
  /** 验证码输入即回传。 */
  'update:code': [code: string]
  /** 点了「发送验证码」，校验与请求都在父级。 */
  'send-code': []
  /** 点了「保存密码」，校验与请求都在父级。 */
  submit: []
}>()

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const oldPassword = computed({
  get: () => props.initialOldPassword,
  set: (next: string) => emit('update:old-password', next),
})

const password = computed({
  get: () => props.initialPassword,
  set: (next: string) => emit('update:password', next),
})

const confirm = computed({
  get: () => props.initialConfirm,
  set: (next: string) => emit('update:confirm', next),
})

const code = computed({
  get: () => props.initialCode,
  set: (next: string) => emit('update:code', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="修改密码"
    class="account-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <div class="profile-update-row account-password-row">
        <input
          v-model="oldPassword"
          type="password"
          placeholder="请输入当前密码"
          autocomplete="current-password"
          :disabled="props.saving || props.codeSending"
        />
      </div>
      <div class="profile-update-row account-password-row account-password-row--send">
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          placeholder="请输入新的密码，至少 6 位"
          :disabled="props.saving || props.codeSending"
        />
        <button
          class="ghost small"
          type="button"
          :disabled="props.saving || props.codeSending || !props.emailBound"
          @click="emit('send-code')"
        >
          {{ props.codeSending ? '发送中...' : '发送验证码' }}
        </button>
      </div>
      <div
        class="profile-update-row profile-update-row--triple account-password-row account-password-row--confirm"
      >
        <input
          v-model="confirm"
          type="password"
          placeholder="请再次输入新密码"
          :disabled="props.saving"
        />
        <input
          v-model="code"
          type="text"
          maxlength="6"
          placeholder="输入6位验证码"
          :disabled="props.saving"
        />
        <button
          class="ghost small"
          type="button"
          :disabled="props.saving || !props.emailBound"
          @click="emit('submit')"
        >
          {{ props.saving ? '保存中...' : '保存密码' }}
        </button>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
.dialog-form {
  display: grid;
  gap: 12px;
}
</style>
