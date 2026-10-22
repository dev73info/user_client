import { ref } from 'vue'

import { uploadInvoiceDocument, type InvoiceRecord } from '@/api/invoices'
import { canUploadInvoiceDocument } from '@/shared/invoiceAction'

import { TMessage } from 'ui_73info'

/**
 * 接单卡上的「上传发票」：哪张票能传、选文件、选完即传。
 *
 * 与「我的发票」页的 `useInvoiceCenter` 是两套交互：那边是先选文件、再点「确认替换」的两步式，
 * 这边只有一颗按钮，选完直接传到那张票上，所以不记「已选文件」，也没有二次确认入口。
 *
 * 隐藏的原生 file input 仍旧留在页面里：一页共用一个（`v-for` 出来的按钮各带一个既看不见
 * 又互相抢焦点），这里只把它的 ref 与 change 处理交出去。登录身份由页面注入，
 * 与 `useBreachCase` 同一写法，composable 自己不去 store 里再取一次。
 */
export function useInvoiceUpload(options: { token: () => string; username: () => string }) {
  /**
   * 我作为乙方的开发者收入票：按需求编号索引。
   *
   * 列表加载时一并 `listMyInvoices`，只留下 `invoiceRole === 'developer'` 且乙方是我的票。
   * 卡片 footer 的「上传发票」据此显示——与财务中心「我的发票」同一套判定
   * （`canUploadInvoiceDocument`）。
   */
  const invoiceByRequirement = ref<Record<string, InvoiceRecord>>({})
  const uploadingInvoiceId = ref<number | null>(null)
  const hiddenInvoiceFileInput = ref<HTMLInputElement | null>(null)
  const pickingInvoiceId = ref<number | null>(null)

  /**
   * 把「我作为乙方」的开发者收入票按需求编号收进映射，供卡片操作栏取用。
   * 同一需求若有多张（历史 / 红冲后重开），后写覆盖前写——列表接口通常只回当前有效票。
   */
  function applyInvoices(invoices: InvoiceRecord[]) {
    const username = options.username()
    const map: Record<string, InvoiceRecord> = {}
    for (const invoice of invoices) {
      if (invoice.invoiceRole === 'developer' && invoice.developerUsername === username) {
        map[invoice.requirementId] = invoice
      }
    }
    invoiceByRequirement.value = map
  }

  /** 该需求该显示哪几张「上传发票」：有开发者收入蓝票、且共享层判定可传，最多一张。 */
  function uploadableInvoicesFor(requirementId: string): InvoiceRecord[] {
    const invoice = invoiceByRequirement.value[requirementId]
    if (!invoice) {
      return []
    }
    return canUploadInvoiceDocument(invoice, options.username(), 'developer') ? [invoice] : []
  }

  function pickInvoiceFile(invoiceId: number) {
    pickingInvoiceId.value = invoiceId
    hiddenInvoiceFileInput.value?.click()
  }

  function selectInvoiceFile(event: Event) {
    const input = event.target as HTMLInputElement
    const invoiceId = pickingInvoiceId.value
    const file = input.files?.[0]
    // 清空 value，否则同一张发票连选两次同一个文件不会触发 change
    input.value = ''
    if (!file || invoiceId === null) {
      return
    }
    const invoice = Object.values(invoiceByRequirement.value).find((item) => item.id === invoiceId)
    if (!invoice) {
      return
    }
    // 列表卡按钮固定文案「上传发票」：选完文件立刻上传，不再二次确认。
    void uploadInvoiceDoc(invoice, file)
  }

  async function uploadInvoiceDoc(invoice: InvoiceRecord, file: File) {
    uploadingInvoiceId.value = invoice.id
    try {
      const replacing = Boolean(invoice.documentUrl)
      const updated = await uploadInvoiceDocument(options.token(), invoice.id, file)
      invoiceByRequirement.value = {
        ...invoiceByRequirement.value,
        [updated.requirementId]: updated,
      }
      TMessage.success(
        replacing ? '发票文件已替换，客户下载到的就是这一份' : '发票文件已上传，客户可下载了',
      )
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传发票文件失败')
    } finally {
      uploadingInvoiceId.value = null
    }
  }

  return {
    /** 隐藏 file input 的 ref：模板上 `ref="hiddenInvoiceFileInput"` 绑它。 */
    hiddenInvoiceFileInput,
    uploadingInvoiceId,
    applyInvoices,
    uploadableInvoicesFor,
    pickInvoiceFile,
    selectInvoiceFile,
  }
}
