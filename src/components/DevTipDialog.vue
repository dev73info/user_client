<script setup lang="ts">
/**
 * R010 打赏弹窗。
 *
 * 用于开发者主页（`DevProfileView.vue`）他人视角：选固定档位或自填金额（受公开档案里的
 * 上下限约束）、留言（≤200 字）、可勾匿名 → 提交。
 *
 * 只有现金一种形态：下单后由后端回 `pay_url`（收银台地址，电脑端扫码），这里渲染二维码并轮询
 * `getTipOrder`，手机上扫码付完本窗口自动更新。契约里没有积分打赏与微信中间页，
 * 因此没有通道切换、也不在微信内跳中间页。
 *
 * 拆分（R047）：状态与动作在 `dev/useDevTipDialog.ts`，样式在同目录 `dev-tip-dialog.css`；
 * 对外的 props / emits 与拆分前一致。
 */
import { TButton, TCheckbox, TDialog, TInput } from 'ui_73info'

import { TIP_MESSAGE_MAX_LENGTH, formatTipCashTier } from '@/shared/devTip'
import { type DevTipDialogEmits, type DevTipDialogProps } from '@/components/dev/tipDialogModel'
import { useDevTipDialog } from '@/components/dev/useDevTipDialog'

const props = defineProps<DevTipDialogProps>()
const emit = defineEmits<DevTipDialogEmits>()

const {
  tipEnabled,
  selectedTierIndex,
  useCustom,
  customCash,
  message,
  anonymous,
  submitting,
  errorText,
  qrDataUrl,
  payUrl,
  noticeText,
  cashTiers,
  allowCustomCash,
  cashCustomHint,
  amountPreview,
  successVisible,
  stopPoll,
  pickTier,
  pickCustom,
  close,
  submit,
} = useDevTipDialog(props, emit)
</script>

<template>
  <TDialog
    :open="open"
    class="tip-dialog"
    :title="`打赏 ${username}`"
    width="480px"
    :mask-closable="false"
    @update:open="emit('update:open', $event)"
    @close="stopPoll"
  >
    <!-- 支付中：收银台二维码 -->
    <div v-if="successVisible" class="tip-dialog__pay">
      <p class="tip-dialog__pay-amount">{{ amountPreview }}</p>
      <template v-if="qrDataUrl">
        <img
          :src="qrDataUrl"
          alt="打赏支付二维码"
          class="tip-dialog__qr"
          width="220"
          height="220"
        />
        <p class="tip-dialog__pay-tip">
          请用手机扫码完成支付；支付完成后本窗口会自动更新。
        </p>
      </template>
      <template v-else-if="payUrl">
        <p class="tip-dialog__pay-tip">请点击下方链接完成支付。</p>
        <a class="tip-dialog__pay-link" :href="payUrl">打开收银台</a>
      </template>
      <template v-else>
        <p class="tip-dialog__pay-tip">正在获取支付二维码…</p>
      </template>
      <p v-if="errorText" class="tip-dialog__error" role="alert">{{ errorText }}</p>
    </div>

    <!-- 表单 -->
    <div v-else class="tip-dialog__body">
      <p v-if="tip?.thanks_message" class="tip-dialog__thanks">{{ tip.thanks_message }}</p>

      <div v-if="cashTiers.length" class="tip-dialog__tiers">
        <button
          v-for="(tier, index) in cashTiers"
          :key="`cash-${index}`"
          type="button"
          class="tip-dialog__tier"
          :class="{ 'is-active': !useCustom && selectedTierIndex === index }"
          @click="pickTier(index)"
        >
          {{ formatTipCashTier(tier) }}
        </button>
      </div>
      <button
        v-if="allowCustomCash"
        type="button"
        class="tip-dialog__custom-toggle"
        :class="{ 'is-active': useCustom }"
        @click="pickCustom"
      >
        自填金额
      </button>
      <div v-if="useCustom" class="tip-dialog__field">
        <label class="tip-dialog__label" for="tip-custom-cash">自定义金额（元）</label>
        <TInput id="tip-custom-cash" v-model="customCash" placeholder="请输入金额" />
        <span v-if="cashCustomHint" class="tip-dialog__hint">{{ cashCustomHint }}</span>
      </div>

      <div class="tip-dialog__field">
        <label class="tip-dialog__label" for="tip-message">留言（可选）</label>
        <TInput
          id="tip-message"
          v-model="message"
          type="textarea"
          :rows="3"
          :maxlength="TIP_MESSAGE_MAX_LENGTH"
          placeholder="给开发者说点什么"
        />
        <span class="tip-dialog__hint"
          >{{ Array.from(message).length }} / {{ TIP_MESSAGE_MAX_LENGTH }} 字</span
        >
      </div>

      <TCheckbox v-model="anonymous" label="匿名打赏（不在公开记录里显示我的用户名）" />

      <p class="tip-dialog__summary">
        本次打赏 <strong>{{ amountPreview }}</strong>
      </p>

      <p class="tip-dialog__notice">
        {{ noticeText }}
      </p>

      <p v-if="errorText" class="tip-dialog__error" role="alert">{{ errorText }}</p>
    </div>

    <template #footer>
      <template v-if="successVisible">
        <TButton @click="close">关闭</TButton>
      </template>
      <template v-else>
        <TButton :disabled="submitting" @click="close">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="submitting"
          :disabled="!tipEnabled"
          @click="submit"
        >
          确认打赏
        </TButton>
      </template>
    </template>
  </TDialog>
</template>

<style scoped src="./dev/dev-tip-dialog.css"></style>
