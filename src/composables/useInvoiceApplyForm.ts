import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import {
  applyInvoices,
  getInvoiceSummary,
  type AppliedInvoices,
  type InvoiceableSummary,
  type InvoiceKind,
} from '@/api/invoices'
import { useInvoiceApplyDraft } from './useInvoiceApplyDraft'
import { useInvoiceApplyView } from './useInvoiceApplyView'
import { SPECIAL_FIELDS, createdInvoiceSides, createdToastText } from '@/shared/invoiceApplyDisplay'
import { TMessage } from 'ui_73info'

export type InvoiceForm = {
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
  /** 票种：默认普票，只有企业主体买方才能改成专票。 */
  invoiceKind: InvoiceKind
  /** 专票的购买方四项资料（普票时不提交）。 */
  buyerAddress: string
  buyerPhone: string
  buyerBankName: string
  buyerBankAccount: string
}

export type InvoiceApplyFormOptions = {
  visible: boolean
  token: string
  requirementId: string
  /** 当前用户在本需求中的身份：需求方一次开出两张票，乙方只拿自己那张开发者收入票。 */
  role: 'customer' | 'developer'
}

export type InvoiceApplyFormHooks = {
  onVisibilityChange: (visible: boolean) => void
  onSubmitted: () => void
}

/**
 * 开票弹窗的状态、预填与提交（R047 从 `components/InvoiceApplyDialog.vue` 拆出）。
 *
 * 口径与拆出前逐条一致：
 * - 汇总金额由后端算（只认已成功分账的结算单），买方主体随汇总一起回来；
 * - 预填只填空字段，且**统一按买方（需求方）的实名主体**——两张票都开给他，不因为谁来申请而变；
 * - 专票只给企业主体：个人与个体工商户都不给入口；草稿里存着专票也会在买方资料回来后归回普票；
 * - 提交前逐条拦：抬头、可开票金额、企业买方的税号、专票四项资料，文案与拆出前一致；
 * - 提交成功后清表单、清草稿、关窗并回抛 `submitted`；抬头与实名主体不一致时改用 warning 提示。
 * 展示派生在 `useInvoiceApplyView`，草稿读写在 `useInvoiceApplyDraft`。
 */
export function useInvoiceApplyForm(
  options: InvoiceApplyFormOptions,
  hooks: InvoiceApplyFormHooks,
) {
  const submitting = ref(false)
  const summaryLoading = ref(false)
  const summary = ref<InvoiceableSummary | null>(null)
  const form = reactive<InvoiceForm>({
    invoiceTitle: '',
    taxNumber: '',
    recipientEmail: '',
    invoiceKind: 'ordinary',
    buyerAddress: '',
    buyerPhone: '',
    buyerBankName: '',
    buyerBankAccount: '',
  })

  const {
    copy,
    amountFen,
    amountCny,
    invoiceGateNotice,
    existingInvoices,
    staleInvoices,
    openSides,
  } = useInvoiceApplyView({ summary, role: options.role })

  const { restoreDraft, saveDraft, clearDraft } = useInvoiceApplyDraft()

  const buyer = computed(() => summary.value?.buyer ?? null)

  /** 买方在本视角下的称呼：需求方看自己，乙方看客户。文案里拼它，好让乙方一眼看出带出的是谁。 */
  const buyerPrefix = computed(() => (options.role === 'customer' ? '' : '需求方'))

  /** 买方是否企业 / 个体工商户：抬头取公司全称，且这一侧的税号必填。 */
  const isOrganizationBuyer = computed(() => buyer.value?.isOrganization ?? false)

  /** 企业 / 个体工商户买方必须给税号：普票与专票都一样，前端先挡一道，后端同样会拒。 */
  const isTaxNumberRequired = computed(() => isOrganizationBuyer.value)

  /** 企业主体（实名类型 `ENTERPRISE`）：唯一能申请专用发票的买方。 */
  const ENTERPRISE_AUTH_TYPE = 'ENTERPRISE'

  /**
   * 能不能开专票：只有**企业主体**可以。
   *
   * 个人买方没有税号，开不了专票；个体工商户虽是企业组织形式，但平台口径是专票只给企业申请。
   * 买方实名还没通过时 `authType` 是空串，这时也不给专票入口，免得提交后被后端驳回。
   */
  const isSpecialAvailable = computed(() => buyer.value?.authType === ENTERPRISE_AUTH_TYPE)

  /** 本次申请是不是专票：非企业买方即使草稿里存着专票，也按普票提交。 */
  const isSpecialInvoice = computed(
    () => form.invoiceKind === 'special' && isSpecialAvailable.value,
  )

  function missingSpecialFields(): string[] {
    if (!isSpecialInvoice.value) {
      return []
    }
    return SPECIAL_FIELDS.filter((field) => !form[field.key].trim()).map((field) => field.label)
  }

  const prefillTitle = computed(() => buyer.value?.title ?? '')
  const prefillTaxNumber = computed(() => buyer.value?.taxNumber ?? '')

  /** 预填情况的说明：带出来了就说来源，没带出来是因为实名没过，提示手填。 */
  const prefillHint = computed(() => {
    if (buyer.value?.title) {
      return options.role === 'customer'
        ? '抬头与税号已按本人实名主体自动填写，可修改。'
        : '抬头与税号已按需求方（客户）实名主体自动填写，可修改。'
    }
    if (!buyer.value) {
      return ''
    }
    return buyer.value.realnameStatus === 'pending'
      ? `${buyerPrefix.value}实名认证审核中，抬头与税号需手动填写。`
      : `${buyerPrefix.value}未完成实名认证，抬头与税号需手动填写。`
  })

  /** 预填没成功时才需要用户注意，用警示样式；自动带出只是说明，用弱化样式。 */
  const prefillNeedsAttention = computed(() => !buyer.value?.title && !!buyer.value)

  /** 只填充空字段，绝不覆盖用户输入或已保存的草稿。必须在 restoreDraft 之后调用。 */
  function applyPrefill() {
    if (!form.invoiceTitle.trim() && prefillTitle.value) {
      form.invoiceTitle = prefillTitle.value
    }
    if (!form.taxNumber.trim() && prefillTaxNumber.value) {
      form.taxNumber = prefillTaxNumber.value
    }
    if (!form.recipientEmail.trim() && buyer.value?.email) {
      form.recipientEmail = buyer.value.email
    }
    // 买方主体一确定就把开不出来的票种归回普票：草稿里可能存着专票，而非企业主体只能开普票。
    // 只在拿到买方资料后判断——资料还没回来时不能替用户改票种（那时 `isSpecialAvailable` 是 false）。
    if (buyer.value && !isSpecialAvailable.value && form.invoiceKind === 'special') {
      form.invoiceKind = 'ordinary'
    }
  }

  /** 抬头与实名主体不一致时给出提醒文案；一致或无从比对时返回空串。 */
  function invoiceTitleNotice(title: string) {
    const expected = prefillTitle.value
    const trimmed = title.trim()
    if (expected && trimmed && trimmed !== expected) {
      return `发票抬头与${buyerPrefix.value}实名主体「${expected}」不一致，请确认无误`
    }
    return ''
  }

  /** 拉取本需求的合并开票汇总：金额由后端按已成功分账的结算单算出，买方主体也随它一起回来。 */
  async function ensureSummary() {
    if (summaryLoading.value || !options.token || !options.requirementId) {
      return
    }
    summaryLoading.value = true
    try {
      summary.value = await getInvoiceSummary(options.token, options.requirementId)
      // 拿到买方主体就补齐还空着的字段：只填空字段，用户已经手填或草稿里存过的都不动。
      applyPrefill()
    } catch (error) {
      summary.value = null
      TMessage.error(error instanceof Error ? error.message : '加载可开票金额失败')
    } finally {
      summaryLoading.value = false
    }
  }

  function close() {
    saveDraft(form)
    hooks.onVisibilityChange(false)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close()
    }
  }

  /** 模板上的「保存草稿」：把当前表单交回草稿层（与关闭弹窗同一个写入口）。 */
  function saveCurrentDraft() {
    saveDraft(form)
  }

  async function submit() {
    if (!form.invoiceTitle.trim()) {
      TMessage.warning('请填写发票抬头')
      return
    }
    if (amountFen.value <= 0) {
      TMessage.warning('本需求暂无可开票的已结算金额')
      return
    }
    if (isTaxNumberRequired.value && !form.taxNumber.trim()) {
      TMessage.warning(`${buyerPrefix.value}实名主体为企业或个体工商户，请填写税号`)
      return
    }
    // 专票的资料要求比后端那份「缺项报错」更早生效：这里缺哪几项就直接说哪几项。
    const missingSpecial = missingSpecialFields()
    if (missingSpecial.length > 0) {
      TMessage.warning(`增值税专用发票需要填写：${missingSpecial.join('、')}`)
      return
    }
    const notice = invoiceTitleNotice(form.invoiceTitle)
    submitting.value = true
    try {
      const applied = await applyInvoices(options.token, {
        requirement_id: options.requirementId,
        invoice_title: form.invoiceTitle.trim(),
        tax_number: form.taxNumber.trim(),
        recipient_email: form.recipientEmail.trim(),
        invoice_kind: form.invoiceKind,
        // 普票不带专票资料：用户先填了专票资料又改回普票时，别把无关信息提交上去。
        buyer_address: isSpecialInvoice.value ? form.buyerAddress.trim() : '',
        buyer_phone: isSpecialInvoice.value ? form.buyerPhone.trim() : '',
        buyer_bank_name: isSpecialInvoice.value ? form.buyerBankName.trim() : '',
        buyer_bank_account: isSpecialInvoice.value ? form.buyerBankAccount.trim() : '',
      })
      form.invoiceTitle = ''
      form.taxNumber = ''
      form.recipientEmail = ''
      form.invoiceKind = 'ordinary'
      form.buyerAddress = ''
      form.buyerPhone = ''
      form.buyerBankName = ''
      form.buyerBankAccount = ''
      clearDraft()
      hooks.onVisibilityChange(false)
      hooks.onSubmitted()
      const message = notice || createdToastText(createdInvoiceSides(applied, summary.value))
      if (notice) {
        TMessage.warning(message)
      } else {
        TMessage.success(message)
      }
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交开票申请失败')
    } finally {
      submitting.value = false
    }
  }

  watch(
    () => options.visible,
    (open) => {
      if (open) {
        // 先恢复草稿再用已缓存的汇总补空字段；汇总回来后会再补一次（见 `ensureSummary`）。
        restoreDraft(form, SPECIAL_FIELDS)
        applyPrefill()
        void ensureSummary()
        document.addEventListener('keydown', handleKeydown)
      } else {
        document.removeEventListener('keydown', handleKeydown)
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    form,
    copy,
    submitting,
    summaryLoading,
    summary,
    amountFen,
    amountCny,
    invoiceGateNotice,
    existingInvoices,
    staleInvoices,
    openSides,
    buyer,
    isOrganizationBuyer,
    isSpecialAvailable,
    isSpecialInvoice,
    prefillHint,
    prefillNeedsAttention,
    saveCurrentDraft,
    submit,
    close,
  }
}
