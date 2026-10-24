<script setup lang="ts">
/**
 * 「修改邮箱」弹窗：新邮箱 + 6 位验证码。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：请求（发码 / 保存）、toast、错误文案
 * 都在视图里，组件只 emit。两段式流程也原样保留——先「发送验证码」，再填码「保存邮箱」。
 *
 * 状态归属：
 * - `visible`：父级持有；
 * - `initialEmail` / `initialCode` + `update:email` / `update:code`：两个草稿都由父级持有
 *   （`loadProfile()` 回填新邮箱、保存成功后把验证码清空，「保存」时父级读的也是它自己那份），
 *   组件只做受控输入；
 * - `saving` / `codeSending`：纯加载态，父级正在发请求。
 *
 * 样式：`.dialog-form` 跟着弹窗从视图的 scoped 块搬进来（父级 scoped 对子组件节点不命中，
 * 不搬就整块塌版）；`.profile-update-row` 与 `button.ghost.small` 是全局样式，不用带。
 */
import { computed } from 'vue'

import { TDialog } from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 新邮箱输入框初值（父级那份草稿，`loadProfile()` 会回填成当前邮箱）。 */
  initialEmail: string
  /** 验证码输入框初值（父级那份草稿，保存成功后归零）。 */
  initialCode: string
  /** 保存请求进行中：两个输入框与「保存邮箱」一起置灰。 */
  saving: boolean
  /** 发送验证码进行中：新邮箱输入框与「发送验证码」一起置灰。 */
  codeSending: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 新邮箱输入即回传。 */
  'update:email': [email: string]
  /** 验证码输入即回传。 */
  'update:code': [code: string]
  /** 点了「发送验证码」，校验与请求都在父级。 */
  'send-code': []
  /** 点了「保存邮箱」，校验与请求都在父级。 */
  submit: []
}>()

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const email = computed({
  get: () => props.initialEmail,
  set: (next: string) => emit('update:email', next),
})

const code = computed({
  get: () => props.initialCode,
  set: (next: string) => emit('update:code', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="修改邮箱"
    class="account-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <div class="profile-update-row">
        <input
          v-model="email"
          type="email"
          placeholder="请输入新的邮箱地址"
          :disabled="props.saving || props.codeSending"
        />
        <button
          class="ghost small"
          type="button"
          :disabled="props.saving || props.codeSending"
          @click="emit('send-code')"
        >
          {{ props.codeSending ? '发送中...' : '发送验证码' }}
        </button>
      </div>
      <div class="profile-update-row">
        <input
          v-model="code"
          type="text"
          maxlength="6"
          placeholder="输入6位验证码"
          :disabled="props.saving"
        />
        <button class="ghost small" type="button" :disabled="props.saving" @click="emit('submit')">
          {{ props.saving ? '保存中...' : '保存邮箱' }}
        </button>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
/* 与 UsernameDialog 同一份（视图那边还留着给未拆的弹窗用，最后统一收口）。 */
.dialog-form {
  display: grid;
  gap: 12px;
}
</style>
