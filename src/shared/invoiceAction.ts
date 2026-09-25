import type { InvoiceRecord } from '@/api/invoices'

/**
 * 判定「这张票归哪个工作台、现在等谁、这里给不给上传按钮」只需要这几个字段。
 *
 * 收窄成结构类型，调用方与测试都不必造一份完整发票记录（与 `invoiceAvailability.ts` 同一做法）。
 */
export type InvoiceActionFacts = Pick<
  InvoiceRecord,
  'invoiceRole' | 'documentKind' | 'status' | 'documentUrl' | 'reviewNote'
  | 'developerUsername' | 'customerUsername'
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
 * 这张票属不属于当前这个工作台；不属于就整行都不在这页出现。
 *
 * 列表接口一次把两端共用的票都返回（`list_my_invoices`：`customer_username = 我` 或
 * `developer_username = 我且是开发者收入票`），但两个工作台的发票中心是两件事，还要按当前
 * 工作台再分一次：
 *
 * - **客户工作台**只留我作为买方（`customer_username`）的票：平台服务费票，以及乙方开给我的
 *   收入票——两张都是我实际能收到的票，动作只有查看与下载。
 * - **开发者工作台**只留我作为乙方要开的收入票。平台服务费票不算乙方的票（它的 `developer_username`
 *   也会填成需求里的那个乙方，光看这个字段会把平台票误收进来），所以必须同时判 `invoice_role`。
 *
 * 这道过滤是必须的：不过滤时开发者切到客户工作台会看到自己要上传的那张票，买方切到开发者工作台
 * 会看到平台开给自己的票，两边都在看另一侧的清单，却又都不给对应的按钮。
 */
export function invoiceInWorkbench(
  invoice: InvoiceActionFacts,
  viewer: string,
  perspective: InvoicePerspective,
): boolean {
  return perspective === 'developer'
    ? invoice.invoiceRole === 'developer' && invoice.developerUsername === viewer
    : invoice.customerUsername === viewer
}

/**
 * 这张票在这一页上按什么状态显示：状态徽标、状态筛选与顶部读数都以它为准。
 *
 * 开发者收入票**没有平台审核这一步**——乙方上传发票文件即视为已开具（见
 * `backend_73info/src/modules/invoice/service.rs` 的 `upload_invoice_document`），它真实的状态只有
 * 两个：文件在 = 已开具，文件不在 = 待乙方开具。但 `status` 这一列是与平台服务费票的审核流共用的，
 * 旧版本上传时会把它写成 `under_review`，于是行上挂出一个平台并不执行的「审核中」（实测反馈：
 * 这个标签没有用，平台不管这张票）。这里按票的性质归一，别让历史值决定用户看到什么；后端也在
 * 启动时把存量票归一到这两个状态（见 `db/schema_postgres/commercial_compliance.sql`）。
 *
 * 红票是红冲那一刻就已生效的凭证，原蓝票被红冲后是终态，两者都照读原状态——它们是平台侧的账务
 * 动作，与「谁上传了文件」无关。
 */
export function invoiceDisplayStatus(invoice: InvoiceActionFacts): InvoiceRecord['status'] {
  if (
    invoice.invoiceRole !== 'developer'
    || invoice.documentKind === 'red'
    || invoice.status === 'reversed'
  ) {
    return invoice.status
  }
  return invoice.documentUrl ? 'approved' : 'requested'
}

/**
 * 行上「审核说明」要显示的文本；不该显示时返回空串。
 *
 * 审核只发生在平台服务费票上：那张票由平台财务自己开具、自己确认，说明写的是财务的处理意见。
 * 开发者收入票由乙方上传即视为已开具，平台不审这张票，票上任何说明都是旧版本遗留的，显示出来
 * 只会让人以为平台在管这件事。
 */
export function invoiceReviewNote(invoice: InvoiceActionFacts): string {
  return invoice.invoiceRole === 'developer' ? '' : invoice.reviewNote ?? ''
}

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
 * 已开具（`approved`）的蓝票照样给上传入口，因为**乙方换的是文件，不是票**：票号、金额、抬头都
 * 不变，上回传错文件或不清晰时就地重传即可，不必走「财务端红冲 → 重新申请」那条重开链路
 * （后端 `upload_invoice_document` 也只对乙方本人放开已开具的票换文件）。界面上要能看出这是替换
 * 而不是第一次上传，所以按钮文案见 `InvoiceCenterView` 的 `uploadButtonLabel`。
 *
 * 被红冲（`reversed`）的蓝票与红票都不再接收文件：前者是终态、任何一方都改不了，后者（红字发票）
 * 只能由平台财务端补传红字文件。
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
    && invoiceDisplayStatus(invoice) !== 'reversed'
  )
}

/**
 * 「这张票现在等谁」的一句话说明；不该显示或不需要等待时返回空串。
 *
 * 这一行只属于**开发者工作台**。同一份列表两端共用，但客户工作台里我作为买方能做的事只有查看与
 * 下载，票在谁手上不影响这些操作，责任方那句话在这里是纯噪音（实测反馈：客户工作台不需要这行）；
 * 单测锁住客户工作台返回空串。
 *
 * 开发者工作台里则必须写清在等谁：「待处理 / 审核中」这些状态词只说明票走到哪一步，不说明该谁
 * 动手，而行的右侧只有责任方才看得到操作按钮。这里再分一次「这张票的乙方是不是我」——两端共用
 * 一个列表，开发者工作台里也会出现别人开给客户的收入票（我在那笔需求里只是买方），此时上传按钮
 * 同样不给，说明也就不能写「由你开具」。
 *
 * 红票是已经生效的冲销凭证，不参与等待；已开具（`approved`）与被红冲（`reversed`）的行也无事
 * 可等（按显示状态判定：开发者收入票文件一传上来就已开具，不再等任何人）。需补充材料
 * （`rejected`）时这一行与「审核说明」相邻，正好说清是谁要补。
 */
export function invoiceWaitingHint(
  invoice: InvoiceActionFacts,
  viewer: string,
  perspective: InvoicePerspective,
): string {
  if (perspective === 'customer') {
    return ''
  }
  if (invoice.documentKind === 'red') {
    return ''
  }
  const status = invoiceDisplayStatus(invoice)
  if (status === 'approved' || status === 'reversed') {
    return ''
  }
  if (invoice.invoiceRole === 'platform') {
    return '由平台开具：平台财务开票并上传后，可在此下载'
  }
  return invoice.developerUsername === viewer
    ? '由你开具：上传发票文件后即视为已开具，客户可下载'
    : '由乙方开具：乙方上传发票文件后可在此下载'
}
