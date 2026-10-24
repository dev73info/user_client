<script setup lang="ts">
import { useInvoiceApplyForm } from '@/composables/useInvoiceApplyForm'
import {
  invoiceSideLabel,
  invoiceStatusLabel,
  kindNoticePrefix,
} from '@/shared/invoiceApplyDisplay'

/**
 * 合并开票弹窗（两侧共用）。
 *
 * 需求方一次开出「平台服务费票 + 开发者收入票」，乙方只拿自己那张开发者收入票；抬头 / 税号 /
 * 邮箱两侧共用一份，草稿也跟着只剩一份。入口守卫、金额上限与专票资料要求都在
 * `useInvoiceApplyForm`，本组件只做模板与收口（关窗 / 提交成功两个入口）。
 */
const props = defineProps<{
  visible: boolean
  token: string
  requirementId: string
  /** 当前用户在本需求中的身份：需求方一次开出两张票，乙方只拿自己那张开发者收入票。 */
  role: 'customer' | 'developer'
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submitted: []
}>()

const {
  form,
  copy,
  submitting,
  summaryLoading,
  summary,
  amountFen,
  amountCny,
  invoiceGateNotice,
  existingInvoices,
  openSides,
  buyer,
  isSpecialAvailable,
  isSpecialInvoice,
  prefillHint,
  prefillNeedsAttention,
  isOrganizationBuyer,
  saveCurrentDraft,
  submit,
  close,
} = useInvoiceApplyForm(props, {
  onVisibilityChange: (value) => {
    emit('update:visible', value)
  },
  onSubmitted: () => {
    emit('submitted')
  },
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="invoice-modal-overlay" @click.self="close">
      <article
        class="invoice-panel invoice-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.title"
      >
        <div class="invoice-panel__head invoice-modal__head">
          <div>
            <h2>{{ copy.title }}</h2>
          </div>
          <strong>{{ copy.issuer }}</strong>
          <button class="invoice-modal__close" type="button" aria-label="关闭" @click="close">
            ×
          </button>
        </div>

        <p class="invoice-panel__hint">{{ copy.hint }}</p>
        <p
          v-if="prefillHint"
          :class="prefillNeedsAttention ? 'invoice-panel__notice' : 'invoice-panel__prefill'"
        >
          {{ prefillHint }}
        </p>

        <div class="invoice-amount" aria-live="polite">
          <span class="invoice-amount__label">可开票金额</span>
          <strong class="invoice-amount__value">
            {{ summaryLoading ? '加载中…' : `¥${amountCny}` }}
          </strong>
          <small class="invoice-amount__note">{{ copy.amountNote }}</small>
          <small v-if="summary" class="invoice-amount__note">
            本需求已成功结算合计 ¥{{ summary.settledAmountCny }}（平台服务费 ¥{{
              summary.platformFeeCny
            }}
            + 开发者收入 ¥{{ summary.developerGrossAmountCny }}）
          </small>
          <small v-if="summary && openSides.length > 1" class="invoice-amount__note">
            本次申请一次开出两张：平台服务费票 ¥{{ summary.platformFeeCny }} + 开发者收入票 ¥{{
              summary.developerInvoiceCny
            }}
          </small>
          <small v-if="summary && summary.refundedFen > 0" class="invoice-amount__note">
            其中开发者已退还 / 赔付客户 ¥{{ summary.refundedCny }}，开发者票按净额 ¥{{
              summary.developerInvoiceCny
            }}
            开具；平台服务费未退，平台票不受影响。
          </small>
        </div>
        <!-- 未结单的闸门说明：比下面那条「暂无可开票金额」更具体，两条互斥，不叠着说。 -->
        <p v-if="invoiceGateNotice" class="invoice-panel__notice">
          {{ invoiceGateNotice }}
        </p>
        <p v-for="item in existingInvoices" :key="item.invoice.id" class="invoice-panel__notice">
          {{ invoiceSideLabel(item.side) }}已提交（{{ kindNoticePrefix(item.invoice.invoiceKind)
          }}{{ invoiceStatusLabel(item.invoice.status) }} · 票面 ¥{{
            item.invoice.amountCny
          }}），到「我的发票」可查看进度与发票文件。
        </p>
        <!-- 未结单的原因上面那条已经写明，这条不再重复，只管「已分账但票都开过 / 还没分账」两种情况。 -->
        <p
          v-if="!summaryLoading && summary && amountFen <= 0 && !invoiceGateNotice"
          class="invoice-panel__hint"
        >
          本需求暂无可开票金额：要么还没有成功分账的结算，要么能开的票都已经提交过了。
        </p>
        <label>
          发票抬头
          <input
            v-model="form.invoiceTitle"
            name="invoice_title"
            type="text"
            maxlength="200"
            placeholder="个人姓名、个体户或企业名称"
          />
        </label>
        <label>
          税号
          <input
            v-model="form.taxNumber"
            name="tax_number"
            type="text"
            maxlength="64"
            :placeholder="isOrganizationBuyer ? '企业或个体工商户必填' : '个人开票可不填'"
          />
        </label>
        <label>
          接收邮箱（可选）
          <input
            v-model="form.recipientEmail"
            name="recipient_email"
            type="email"
            maxlength="254"
            placeholder="用于接收开票文件"
          />
        </label>

        <fieldset class="invoice-kind">
          <legend>发票票种</legend>
          <label class="invoice-kind__option" :class="{ 'is-active': !isSpecialInvoice }">
            <input v-model="form.invoiceKind" type="radio" name="invoice-kind" value="ordinary" />
            <span>
              <strong>普通发票</strong>
              <small>默认票种，个人、个体工商户与企业都能开具</small>
            </span>
          </label>
          <label
            v-if="isSpecialAvailable"
            class="invoice-kind__option"
            :class="{ 'is-active': isSpecialInvoice }"
          >
            <input v-model="form.invoiceKind" type="radio" name="invoice-kind" value="special" />
            <span>
              <strong>增值税专用发票</strong>
              <small>仅企业可开，需补齐购买方开票资料，可用于抵扣</small>
            </span>
          </label>
          <p v-if="!isSpecialAvailable && buyer" class="invoice-panel__prefill">
            增值税专用发票只对企业主体开具，个人与个体工商户只能开普通发票。
          </p>
        </fieldset>

        <template v-if="isSpecialInvoice">
          <p class="invoice-panel__notice">
            增值税专用发票需要购买方开票资料齐全：名称与纳税人识别号用上方填写的抬头与税号，请照营业执照与开户信息补齐下面四项。
          </p>
          <label>
            注册地址
            <input
              v-model="form.buyerAddress"
              name="buyer_address"
              type="text"
              maxlength="200"
              placeholder="照营业执照的住所填写"
            />
          </label>
          <label>
            联系电话
            <input
              v-model="form.buyerPhone"
              name="buyer_phone"
              type="text"
              maxlength="32"
              placeholder="开户银行预留电话"
            />
          </label>
          <label>
            开户银行
            <input
              v-model="form.buyerBankName"
              name="buyer_bank_name"
              type="text"
              maxlength="120"
              placeholder="如：中国工商银行彝良县支行"
            />
          </label>
          <label>
            银行账号
            <input
              v-model="form.buyerBankAccount"
              name="buyer_bank_account"
              type="text"
              maxlength="64"
              placeholder="对公账户账号"
            />
          </label>
        </template>

        <div class="invoice-modal__actions">
          <button class="invoice-modal__draft" type="button" @click="saveCurrentDraft">
            保存草稿
          </button>
          <button
            class="invoice-panel__submit"
            type="button"
            :disabled="submitting || amountFen <= 0"
            @click="submit"
          >
            {{ submitting ? '提交中...' : copy.submitText }}
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style scoped src="./invoice-apply-panel.css"></style>

<style scoped src="./invoice-apply-form.css"></style>
