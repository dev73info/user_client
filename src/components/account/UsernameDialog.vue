<script setup lang="ts">
/**
 * 「修改用户名」弹窗。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：接口只有 `initial` + 一组 `update:xxx`
 * 事件，请求、toast、路由都在视图里（组件不碰 `@/api/*`、`TMessage`、`router`）。
 *
 * 状态归属：
 * - `visible`：父级持有（拆分前后都一样）——一直由父级决定弹窗开合，
 *   子组件不先卸载再回传，草稿重置时序不变；
 * - `initial` / `update:value`：用户名草稿由父级持有（`loadProfile()` 与 `onMounted`
 *   都往里写过值，「保存」时父级读的也是它自己那份），组件只做受控输入；
 * - `saving`：纯加载态，父级正在发请求。
 *
 * 样式：`.dialog-form` 原本写在视图的 scoped 块里，弹窗节点搬进本组件后父级 scoped
 * 立刻不命中（弹窗整体塌版），所以随组件一起搬进这里；`.profile-update-row` 与
 * `button.ghost.small` 是全局样式（`styles/profile.css` / `styles/shell.css`），不用带。
 */
import { computed } from 'vue'

import { TDialog } from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有，子组件只把它转成 `TDialog` 的 `open`。 */
  visible: boolean
  /** 输入框初值（父级那份用户名草稿）。 */
  initial: string
  /** 保存请求进行中：输入框与按钮一起置灰，按钮文案换成「保存中...」。 */
  saving: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗（点关闭按钮 / Esc / 点遮罩），父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 输入即回传：父级提交时读的是自己那份 `newUsername`。 */
  'update:value': [value: string]
  /** 点了「保存用户名」，校验与请求都在父级。 */
  submit: []
}>()

/** 受控输入：取值来自父级，写入立刻回传（不在组件内另存一份，避免两份草稿打架）。 */
const value = computed({
  get: () => props.initial,
  set: (next: string) => emit('update:value', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="修改用户名"
    class="account-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <div class="profile-update-row">
        <input
          v-model="value"
          type="text"
          placeholder="请输入新的用户名"
          :disabled="props.saving"
        />
        <button class="ghost small" type="button" :disabled="props.saving" @click="emit('submit')">
          {{ props.saving ? '保存中...' : '保存用户名' }}
        </button>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
/* 本文件唯一给弹窗内容用的活规则（视图那边也还留着一份给未拆的弹窗用，最后统一收口）。 */
.dialog-form {
  display: grid;
  gap: 12px;
}
</style>
