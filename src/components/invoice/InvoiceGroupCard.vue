<script setup lang="ts">
/**
 * 一个需求一张卡：卡头写几票共用的抬头与金额合计，卡内逐票成行。
 *
 * 同一笔需求的两张票（平台服务费票 + 开发者收入票）如果按票平铺会占两行几乎一样的记录，
 * 收成一张卡后卡头只写共用信息，金额 / 状态 / 动作仍各自独立（判定见 `@/shared/invoiceGroups`）。
 *
 * 组件只做展示与事件上报：上传、下载、查看、重新申请都由页面（`useInvoiceCenter`）处理。
 */
import type { InvoiceRecord } from '@/api/invoices'
import {
  canUploadInvoiceDocument,
  invoiceDisplayStatus,
  invoiceReviewNote,
  invoiceWaitingHint,
} from '@/shared/invoiceAction'
import {
  invoiceDeveloperTypeLabel,
  invoiceDisplayAmount,
  invoiceGroupAmountLabel,
  invoiceRoleLabel,
  invoiceStatusBadgeClass,
  invoiceStatusLabel,
} from '@/shared/invoiceDisplay'
import type { InvoiceGroup } from '@/shared/invoiceGroups'
import { TButton, TIcon, UploadFilled } from 'ui_73info'

const props = defineProps<{
  group: InvoiceGroup<InvoiceRecord>
  username: string
  perspective: 'customer' | 'developer'
  uploadingId: number | null
  downloadingId: number | null
  /** 已选好文件、等待上传的发票 id */
  selectedIds: number[]
}>()

const emit = defineEmits<{
  (e: 'reapply'): void
  (e: 'open-document', invoice: InvoiceRecord): void
  (e: 'save-document', invoice: InvoiceRecord): void
  (e: 'upload-document', invoice: InvoiceRecord): void
  (e: 'pick-file', invoiceId: number): void
}>()

/** 这张卡里有没有票能重开（原票已被红冲）：卡头据此给「重新申请」。 */
function canReapplyGroup(): boolean {
  return props.group.invoices.some(
    (invoice) => invoice.documentKind === 'blue' && invoiceDisplayStatus(invoice) === 'reversed',
  )
}

function canUpload(invoice: InvoiceRecord): boolean {
  return canUploadInvoiceDocument(invoice, props.username, props.perspective)
}

function waitingHint(invoice: InvoiceRecord): string {
  return invoiceWaitingHint(invoice, props.username, props.perspective)
}

function reviewNote(invoice: InvoiceRecord): string {
  return invoiceReviewNote(invoice)
}

/**
 * 按钮文案随「有没有文件、有没有选好新文件」变，两步走：
 * - 第一次上传是「选择文件 → 上传发票」；
 * - 已经开具过的票是「重新上传发票 → 确认替换」，一眼看出这是换掉原来那份。
 */
function uploadButtonLabel(invoice: InvoiceRecord): string {
  if (props.uploadingId === invoice.id) return '上传中…'
  if (!props.selectedIds.includes(invoice.id)) {
    return invoice.documentUrl ? '重新上传发票' : '选择文件'
  }
  return invoice.documentUrl ? '确认替换' : '上传发票'
}

function onUploadClick(invoice: InvoiceRecord): void {
  if (props.selectedIds.includes(invoice.id)) {
    emit('upload-document', invoice)
  } else {
    emit('pick-file', invoice.id)
  }
}
</script>

<template>
  <li class="wb-item invoice-center__group" :title="`需求 ${group.requirementId}`">
    <div class="invoice-center__group-head">
      <div class="wb-item__main">
        <span class="wb-item__title">{{ group.invoiceTitle }}</span>
        <span class="wb-item__meta">金额合计 {{ invoiceGroupAmountLabel(group) }}</span>
      </div>
      <div class="wb-item__side">
        <!-- 重新申请是需求级动作（弹窗一次把该需求能开的票都开出来），所以按钮在卡头，
             不逐票重复——同一笔需求的两张票都红冲时，逐票给按钮会出现两个同样的入口。 -->
        <TButton v-if="canReapplyGroup()" variant="outline" @click="emit('reapply')">
          <span>重新申请</span>
        </TButton>
      </div>
    </div>

    <ul class="invoice-center__tickets">
      <li
        v-for="invoice in group.invoices"
        :key="invoice.id"
        class="invoice-center__ticket"
        :title="invoice.invoiceNo"
      >
        <div class="wb-item__main">
          <span class="wb-item__meta">
            <!-- 票种与票性标注跟在行首，替代原来的票号标题位：它们是客户与财务都要认的信息。 -->
            <span
              v-if="invoice.invoiceKind === 'special'"
              class="invoice-center__kind invoice-center__kind--special"
              >专用发票</span
            >
            <span v-if="invoice.documentKind === 'red'" class="invoice-center__kind">红字发票</span>
            {{ invoiceRoleLabel(invoice.invoiceRole) }} · 金额 {{ invoiceDisplayAmount(invoice) }} ·
            {{
              invoice.invoiceRole === 'developer'
                ? invoiceDeveloperTypeLabel(invoice.developerType)
                : '客户服务费'
            }}
          </span>
          <!-- 抬头正常是同组共用的；红冲后换了抬头重开时，与卡头不同的票在这里自己标出来。 -->
          <span v-if="invoice.invoiceTitle !== group.invoiceTitle" class="wb-item__meta">
            本票抬头：{{ invoice.invoiceTitle }}
          </span>
          <!-- 等待中的票要说清在等谁：状态词只说明走到哪一步，责任方才是用户想知道的。 -->
          <span v-if="waitingHint(invoice)" class="wb-item__meta">{{ waitingHint(invoice) }}</span>
          <!-- 专票的购买方四项资料：开发者要照这四项在电子税务局开票。 -->
          <span v-if="invoice.invoiceKind === 'special'" class="wb-item__meta">
            专票购买方资料：{{ invoice.buyerAddress }} · {{ invoice.buyerPhone }} ·
            {{ invoice.buyerBankName }} · {{ invoice.buyerBankAccount }}
          </span>
          <span v-if="invoice.documentKind === 'red' && invoice.reversalOfId" class="wb-item__meta">
            冲销原票 #{{ invoice.reversalOfId
            }}{{ invoice.reversalReason ? ` · ${invoice.reversalReason}` : '' }}
          </span>
          <span v-else-if="invoice.status === 'reversed'" class="wb-item__meta">
            红冲原因：{{ invoice.reversalReason || '未记录' }}
          </span>
          <span v-if="reviewNote(invoice)" class="wb-item__meta"
            >审核说明：{{ reviewNote(invoice) }}</span
          >
        </div>

        <div class="wb-item__side">
          <span class="wb-badge" :class="invoiceStatusBadgeClass(invoiceDisplayStatus(invoice))">{{
            invoiceStatusLabel(invoiceDisplayStatus(invoice))
          }}</span>
          <TButton
            v-if="invoice.documentUrl"
            variant="outline"
            @click="emit('open-document', invoice)"
          >
            <span>查看发票</span>
          </TButton>
          <TButton
            v-if="invoice.documentUrl"
            variant="outline"
            :loading="downloadingId === invoice.id"
            @click="emit('save-document', invoice)"
          >
            <span>下载发票</span>
          </TButton>
          <TButton
            v-if="canUpload(invoice)"
            variant="outline"
            :loading="uploadingId === invoice.id"
            :disabled="uploadingId !== null && uploadingId !== invoice.id"
            @click="onUploadClick(invoice)"
          >
            <TIcon><UploadFilled /></TIcon><span>{{ uploadButtonLabel(invoice) }}</span>
          </TButton>
        </div>
      </li>
    </ul>
  </li>
</template>

<style scoped>
/* 票种与票性的标注：一枚小签，跟在票行的行首（票号不再展示，它来领这一行）。
   红字发票用浅红底；专用发票用主色底，客户一眼能认出自己申请的是哪一种。
   色值全部取 `.profile-page` 上定义的 `--profile-*`（本页根节点带 profile-page），
   两套主题下与实际取值一致，组件里不再写裸色值。 */
.invoice-center__kind {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--profile-danger-soft);
  color: var(--profile-danger-text);
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.invoice-center__kind--special {
  background: var(--profile-accent-soft);
  color: var(--profile-accent);
}

/* === 一个需求一张卡 ===
   卡片的描边 / 圆角 / 底色仍由统一层 .wb-item 提供，这里只把内部排版从
   「左信息 + 右操作」一行改成竖排：卡头一行，下面逐票成行。 */
.invoice-center__group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 12px;
}

/* 卡头：正文占满剩余宽度，卡级动作按内容宽度贴右。 */
.invoice-center__group-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  min-width: 0;
}

/* 逐票子行只靠一条极浅的分隔线分开，不再各围一圈描边。 */
.invoice-center__tickets {
  display: grid;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--wb-line);
  list-style: none;
}

.invoice-center__ticket {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
}

.invoice-center__ticket + .invoice-center__ticket {
  border-top: 1px dashed var(--wb-line);
}

/* 触屏档：卡头与子行都改竖排（统一层在这一档已把 .wb-item__side 改成左对齐）。 */
@media (max-width: 640px) {
  .invoice-center__group-head,
  .invoice-center__ticket {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
