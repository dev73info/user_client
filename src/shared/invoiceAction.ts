import type { InvoiceRecord } from '@/api/invoices'

/**
 * 判定「这张票现在等谁、这里给不给上传按钮」只需要这几个字段。
 *
 * 收窄成结构类型，调用方与测试都不必造一份完整发票记录（与 `invoiceAvailability.ts` 同一做法）。
 */
export type InvoiceActionFacts = Pick<
  InvoiceRecord,
  'invoiceRole' | 'documentKind' | 'status' | 'developerUsername'
>

/**
 * 当前这一页站在哪一侧看票：发票中心两端各有一个入口，同一张票在两个入口下的可做动作不同。
 *
 * - `customer`：「客户工作台 → 账户服务 → 发票中心」。这里我是买方，票是别人开给我的，只能查看与下载。
 * - `developer`：「开发者工作台 → 财务中心 → 发票中心」。这里我是乙方，票是我开给客户的，待开时要上传。
 *
 * 取值与 `InvoiceApplyDialog` 的 `role` 一致，两处指的是同一件事。**视角由工作台决定，不由「我在
 * 这张票里是谁」决定**：一个账号可能在这笔需求里是买方、在另一笔里是乙方，两边看到的是同一份列表，
 * 但当前这一页给的按钮只能属于它自己那一侧的职责。
 */
export type InvoicePerspective = 'customer' | 'developer'

/**
 * 当前这一页要不要给这张票显示上传入口。
 *
 * 两道条件缺一不可：
 *
 * 1. **工作在开发者工作台**。上传是乙方那一侧的动作；客户工作台里这张票对我只是「收到的票」，
 *    只能查看与下载。此前这里只判了票的性质（`invoiceRole === 'developer'`），于是客户在发票中心
 *    也会看到开发者收入票上的「选择文件」，看起来像是要他上传乙方开的票——这是错误的引导，
 *    点下去也必然被后端拒绝。
 * 2. **我就是这张票的乙方**。平台服务费票由平台（财务端）开具并上传，开发者收入票由乙方开具并
 *    上传，买方只负责索取与下载；`upload_invoice_document` 同样要求 `developer_username`
 *    就是操作者，且只能传蓝票（见 `backend_73info/src/modules/invoice/service.rs`）。
 *
 * 已通过（`approved`）与被红冲（`reversed`）的蓝票都不再接收文件：前者是终态，后者只能补传红字
 * 发票文件，那件事只有财务端做得了。
 */
export function canUploadInvoiceDocument(
  invoice: InvoiceActionFacts,
  viewer: string,
  perspective: InvoicePerspective,
): boolean {
  return (
    perspective === 'developer'
    && invoice.documentKind === 'blue'
    && invoice.invoiceRole === 'developer'
    && invoice.developerUsername === viewer
    && invoice.status !== 'approved'
    && invoice.status !== 'reversed'
  )
}

/**
 * 「这张票现在等谁」的一句话说明；不需要等待时返回空串。
 *
 * 发票中心是需求方与乙方共用的一页，同一张票在两侧的责任方不同：「待处理 / 审核中」这些状态词
 * 只说明票走到哪一步，不说明该谁动手，而行的右侧只有责任方才看得到操作按钮。等待中的行必须写清
 * 在等谁，否则需求方会把「待处理」当成在等自己——平台服务费票尤其如此（它由平台财务开具，用户
 * 侧谁都点不动）。
 *
 * 措辞跟着视角走：客户工作台里不该出现「由你开具，请你上传」，那是乙方工作台才成立的说法。
 * 在开发者工作台里还要再分一次「这张票的乙方是不是我」——两端共用一个列表，开发者工作台里也会
 * 出现别人开给客户的收入票（我在那笔需求里只是买方），此时上传按钮同样不给，说明也就不能写「由你开具」。
 *
 * 红票是已经生效的冲销凭证，不参与等待；已开具（`approved`）与被红冲（`reversed`）的行也无事
 * 可等。需补充材料（`rejected`）时这一行与「审核说明」相邻，正好说清是谁要补。
 */
export function invoiceWaitingHint(
  invoice: InvoiceActionFacts,
  viewer: string,
  perspective: InvoicePerspective,
): string {
  if (invoice.documentKind === 'red') {
    return ''
  }
  if (invoice.status === 'approved' || invoice.status === 'reversed') {
    return ''
  }
  if (invoice.invoiceRole === 'platform') {
    return '由平台开具：平台财务开票并上传后，可在此下载'
  }
  return perspective === 'developer' && invoice.developerUsername === viewer
    ? '由你开具：上传发票文件后由平台审核'
    : '由乙方开具：乙方上传发票文件、平台审核通过后可在此下载'
}
