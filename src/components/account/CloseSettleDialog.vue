<script setup lang="ts">
/**
 * 「注销结算账户」弹窗：一句警示 + 「请输入“注销结算账户”确认」的二次确认面板 +
 * 取消 / 确认注销。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：注销请求、`refreshAdapayMember()`、
 * toast 全部留在视图（组件不碰 `@/api/*`、`TMessage`、`router`）。文案与「注销后要重新
 * 绑卡」的警告一字不改。
 *
 * 状态归属：
 * - `visible`：父级持有；
 * - `confirmation` + `update:value`：确认词草稿由父级持有——视图的提交处理器要按它做
 *   最后一道「请输入“注销结算账户”确认操作」拦截；
 * - `ready`：确认词是否已输对（父级算好传下来，同一个判断不给两个文件各写一遍）；
 * - `saving`：注销请求进行中。
 *
 * 样式：`.dialog-form` / `.account-close-form` / `.account-close-confirm-label` /
 * `.account-close-actions` 原来都在视图的 scoped 块里，弹窗节点搬进来后父级 scoped
 * 不再命中（弹窗整体塌版），所以四条一起搬进本组件（与 CloseAccountDialog 同一份）。
 */
import { computed } from 'vue'

import { TAlert, TButton, TDialog, TInput } from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 确认词草稿（父级每次打开前清空，与拆分前同口径）。 */
  confirmation: string
  /** 确认词是否已原样键入「注销结算账户」：没输对时「确认注销」置灰。 */
  ready: boolean
  /** 注销请求进行中：输入框与两个按钮一起置灰。 */
  saving: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 确认词输入即回传。 */
  'update:value': [value: string]
  /** 点了「确认注销」，校验与请求都在父级。 */
  submit: []
}>()

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const value = computed({
  get: () => props.confirmation,
  set: (next: string) => emit('update:value', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="注销结算账户"
    class="account-dialog account-close-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form account-close-form">
      <TAlert
        tone="warning"
        :closable="false"
        show-icon
        title="注销后本账号将无法接收合同款与分账"
        description="要恢复收款必须重新绑定银行卡（重新走一次渠道核验）。如果还有未结算的合同款或未到账的分账，请先等款项结清再注销——否则渠道可能拒绝，或钱卡在托管里。"
      />
      <label class="account-close-confirm-label" for="close-settle-confirmation">
        请输入“注销结算账户”确认
      </label>
      <TInput
        id="close-settle-confirmation"
        v-model="value"
        placeholder="注销结算账户"
        :disabled="props.saving"
        autocomplete="off"
      />
      <div class="account-close-actions">
        <TButton :disabled="props.saving" @click="emit('update:visible', false)">取消</TButton>
        <TButton
          variant="solid"
          tone="danger"
          :loading="props.saving"
          :disabled="!props.ready"
          @click="emit('submit')"
        >
          确认注销
        </TButton>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
.dialog-form {
  display: grid;
  gap: 12px;
}

.account-close-form {
  gap: 16px;
}

.account-close-confirm-label {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.account-close-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
