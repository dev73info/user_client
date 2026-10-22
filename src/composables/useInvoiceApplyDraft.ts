import { TMessage } from 'ui_73info'

import type { InvoiceForm } from './useInvoiceApplyForm'

/** 草稿键：申请合并成一次动作、抬头只剩一份，草稿也跟着只剩一份。 */
const DRAFT_KEY = 'invoice_apply_draft_v1'

/**
 * 开票弹窗的本地草稿（R047 从 `components/InvoiceApplyDialog.vue` 拆出）。
 *
 * 只做三件事：恢复、保存、清空。三条口径与拆出前一致：
 * - 恢复**只填空字段**，绝不覆盖用户已经输入的内容；
 * - 票种与专票四项资料同样只填空：旧草稿没有这几个字段，读出来是 undefined，按默认值兜底；
 *   这里不判「能不能开专票」——恢复时买方主体可能还没回来，等 `applyPrefill` 拿到买方资料后
 *   再把非企业主体的专票归回普票；
 * - 草稿损坏（JSON 解析失败）就整条删掉，下次输入会重新写。
 */
export function useInvoiceApplyDraft() {
  function restoreDraft(form: InvoiceForm, specialFields: ReadonlyArray<{ key: string }>) {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) {
      return
    }
    try {
      const draft = JSON.parse(raw) as Partial<InvoiceForm>
      if (!form.invoiceTitle.trim()) {
        form.invoiceTitle = draft.invoiceTitle ?? ''
      }
      if (!form.taxNumber.trim()) {
        form.taxNumber = draft.taxNumber ?? ''
      }
      if (!form.recipientEmail.trim()) {
        form.recipientEmail = draft.recipientEmail ?? ''
      }
      // 票种与专票资料同样只填空：旧草稿没有这几个字段，读出来是 undefined，按默认值兜底。
      // 这里不判「能不能开专票」——草稿恢复时买方主体可能还没回来，等 `applyPrefill` 拿到买方
      // 资料后再把非企业主体的专票归回普票。
      if (draft.invoiceKind === 'special') {
        form.invoiceKind = 'special'
      }
      for (const field of specialFields) {
        const key = field.key as 'buyerAddress' | 'buyerPhone' | 'buyerBankName' | 'buyerBankAccount'
        if (!form[key].trim()) {
          form[key] = draft[key] ?? ''
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  function saveDraft(form: InvoiceForm) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    TMessage.success('草稿已保存')
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
  }

  return { restoreDraft, saveDraft, clearDraft }
}
