<script setup lang="ts">
/**
 * 「注销账号」弹窗：输入确认词 + 邮箱验证码，提交后进入可配置的注销等待期。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：申请、撤销、toast 全部留在域里
 * （组件不碰 `@/api/*`、`TMessage`、`router`）。
 *
 * 状态归属：
 * - `visible`：父级持有；
 * - `confirmation` + `update:value`：确认词草稿由父级持有——视图的提交处理器要按它做
 *   最后一道「请输入“注销账号”确认操作」拦截，两处各存一份就会打架；
 * - `emailCode` + `update:email-code`：注销验证码草稿；
 * - `request`：当前注销申请；`pending=true` 时只展示等待期与撤销按钮；
 * - `ready`：确认词是否已输对（父级算好传下来，同一个判断不给两个文件各写一遍）；
 * - `saving`：申请提交 / 撤销进行中。
 *
 * 样式：`.dialog-form` / `.account-close-form` / `.account-close-actions` 原来都在视图的
 * scoped 块里，弹窗节点搬进来后父级 scoped 不再命中（弹窗整体塌版），所以三条一起搬进本
 * 组件；`.account-close-confirm-label` 与「注销结算账户」共用，已收回全局
 * `src/styles/profile.css`（「账号弹窗的共用样式」一节）。
 */
import { computed } from 'vue'

import type { AccountCloseRequestResp } from '@/api/auth'
import { TAlert, TButton, TDialog, TInput } from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 确认词草稿（父级每次打开前清空，与拆分前同口径）。 */
  confirmation: string
  /** 确认词是否已原样键入「注销账号」：没输对时「确认注销」置灰。 */
  ready: boolean
  /** 注销申请进行中：输入框与按钮一起置灰。 */
  saving: boolean
  /** 邮箱验证码草稿。 */
  emailCode: string
  /** 验证码发送中。 */
  codeSending: boolean
  /** 当前注销申请；`pending=true` 时展示等待期。 */
  request: AccountCloseRequestResp | null
  /** 读取申请状态中。 */
  loading: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 确认词输入即回传。 */
  'update:value': [value: string]
  /** 验证码输入即回传。 */
  'update:email-code': [value: string]
  /** 发送邮箱验证码。 */
  'send-code': []
  /** 点了「提交注销申请」，校验与请求都在父级。 */
  submit: []
  /** 撤销待生效的注销申请。 */
  'cancel-request': []
}>()

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const value = computed({
  get: () => props.confirmation,
  set: (next: string) => emit('update:value', next),
})

const emailCode = computed({
  get: () => props.emailCode,
  set: (next: string) => emit('update:email-code', next),
})

const pending = computed(() => Boolean(props.request?.pending))
const effectiveLabel = computed(() => {
  const value = props.request?.effective_at
  if (!value) return '等待期结束后'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="注销账号"
    class="account-dialog account-close-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form account-close-form">
      <TAlert
        tone="warning"
        :closable="false"
        show-icon
        :title="pending ? '注销申请处理中' : '注销申请提交后不会立即生效'"
        :description="
          pending
            ? `账号将在 ${effectiveLabel} 后停用；等待期内仍可正常登录，撤销后立即恢复。`
            : '等待期默认 7 天，管理端可调整。到期后账号将无法登录，历史合同、支付和业务记录会保留；微信、GitHub、Gitee、QQ 等第三方绑定会被释放。'
        "
      />

      <template v-if="pending">
        <p class="account-close-pending">
          已提交注销申请，剩余约 {{ props.request?.days_remaining ?? 0 }} 天。等待期内不会被踢下线。
        </p>
        <div class="account-close-actions">
          <TButton :disabled="props.saving" @click="emit('update:visible', false)">关闭</TButton>
          <TButton
            variant="solid"
            tone="danger"
            :loading="props.saving"
            @click="emit('cancel-request')"
          >
            撤销注销申请
          </TButton>
        </div>
      </template>

      <template v-else>
        <label class="account-close-confirm-label" for="account-close-confirmation">
          请输入“注销账号”确认
        </label>
        <TInput
          id="account-close-confirmation"
          v-model="value"
          placeholder="注销账号"
          :disabled="props.saving"
          autocomplete="off"
        />

        <label class="account-close-confirm-label" for="account-close-email-code">
          邮箱验证码
        </label>
        <div class="account-close-code-row">
          <TInput
            id="account-close-email-code"
            v-model="emailCode"
            placeholder="发送到当前账号邮箱的 6 位验证码"
            :disabled="props.saving"
            inputmode="numeric"
            autocomplete="one-time-code"
          />
          <TButton
            :loading="props.codeSending"
            :disabled="props.saving || props.codeSending"
            @click="emit('send-code')"
          >
            {{ props.codeSending ? '发送中...' : '发送验证码' }}
          </TButton>
        </div>

        <div class="account-close-actions">
          <TButton :disabled="props.saving" @click="emit('update:visible', false)">取消</TButton>
          <TButton
            variant="solid"
            tone="danger"
            :loading="props.saving"
            :disabled="!props.ready || props.loading"
            @click="emit('submit')"
          >
            提交注销申请
          </TButton>
        </div>
      </template>
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

.account-close-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.account-close-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.account-close-pending {
  margin: 0;
  color: var(--t-text-secondary);
}
</style>
