<script setup lang="ts">
import type { InvoiceRecord } from '@/api/invoices'
import InvoiceUploadButton from '@/components/dev/InvoiceUploadButton.vue'
import { TButton, TIcon, ChatDotRound } from 'ui_73info'

/**
 * 接单卡的底部操作栏：交付、解除合作、合同、发票、会话与评价这几类入口。
 *
 * 「能不能出这个入口」一律由页面算成布尔传进来，组件不自己判：
 * 其中「解除合作」与「发起合同」要读本页一次取回的 `signingStatusMap`，
 * 「上传发票」要读一次取回的发票记录——在这里再查一遍就是第二份口径，
 * 会和卡片其它位置（进度条、签约徽标）打架。组件只负责排版与 emit。
 */
defineProps<{
  /** 绑定过资源、且在开发中 / 待付尾款：才可提交交付版本。 */
  canSubmitDelivery: boolean
  /** 已结单的无担保需求才有「解除合作」售后入口。 */
  canOpenAfterSales: boolean
  /** 售后待办角标读数；空串表示没有待办（模板据此决定渲不渲染角标）。 */
  afterSalesBadge: string
  /** 角标悬停说明里的条数。 */
  afterSalesPendingCount: number
  /** 有生效担保合同、状态也允许时才可申报违约。 */
  canReportBreach: boolean
  /** 担保模式下还没发起过合同。 */
  canCreateContract: boolean
  /** 正在为这一单发起合同（按钮转圈）。 */
  contractCreating: boolean
  /** 已有合同：出「签署合同 / 查看合同」。 */
  canOpenContractSign: boolean
  /** 合同按钮文案：已签过是「查看合同」，否则「签署合同」。 */
  contractLabel: string
  /** 这一单可上传的开发者收入票（通常是 0 或 1 张）。 */
  uploadableInvoices: InvoiceRecord[]
  /** 正在上传的票 id：用来把同排其它票的按钮一起置灰。 */
  uploadingInvoiceId: number | null
  /** 已结单才出评价入口。 */
  canComment: boolean
  /** 我这一单已经评过：入口是「修改评价」而不是「去评价」。 */
  commented: boolean
}>()

const emit = defineEmits<{
  submitDelivery: []
  openAfterSales: []
  reportBreach: []
  createContract: []
  contractAction: []
  /** 选发票文件：带上那一张票的 id，选完即传。 */
  pickInvoice: [invoiceId: number]
  openConversation: []
  openComment: []
}>()
</script>

<template>
  <div class="dev-list-actions">
    <!-- 行内按钮的上色走统一层的 .dev-action--soft / .dev-action--soft-danger：
         原来挂的是裸 `type="primary" plain` / `type="danger" plain`，
         Element 的 plain 变体给的是浅蓝底与粉底三件套，
         与表格行里的白底 + 主色描边不是一套，禁用态的「解除合作」更是一片粉。 -->
    <TButton
      variant="outline"
      tone="accent"
      v-if="canSubmitDelivery"
      title="交付物以绑定资源项目的新版本提交"
      @click="emit('submitDelivery')"
    >
      提交交付版本
    </TButton>
    <TButton
      variant="outline"
      tone="accent"
      v-if="canOpenAfterSales"
      :class="{ 'has-todo-badge': afterSalesBadge }"
      @click="emit('openAfterSales')"
    >
      解除合作
      <span
        v-if="afterSalesBadge"
        class="todo-badge"
        :title="`有 ${afterSalesPendingCount} 条解除合作待你处理`"
        >{{ afterSalesBadge }}</span
      >
    </TButton>
    <TButton variant="outline" tone="danger" v-if="canReportBreach" @click="emit('reportBreach')">
      解除合作
    </TButton>
    <TButton
      variant="solid"
      tone="accent"
      v-if="canCreateContract"
      :loading="contractCreating"
      @click="emit('createContract')"
    >
      发起合同
    </TButton>
    <TButton v-if="canOpenContractSign" @click="emit('contractAction')">
      {{ contractLabel }}
    </TButton>
    <!-- 客户已申请开发者收入票、且我是乙方可上传时显示；交互对齐 InvoiceCenterView。 -->
    <InvoiceUploadButton
      v-for="invoice in uploadableInvoices"
      :key="`invoice-upload-${invoice.id}`"
      :uploading="uploadingInvoiceId === invoice.id"
      :disabled="uploadingInvoiceId !== null && uploadingInvoiceId !== invoice.id"
      @pick="emit('pickInvoice', invoice.id)"
    />
    <TButton
      variant="outline"
      tone="accent"
      class="dev-action--soft dev-requirement-card__conversation"
      @click="emit('openConversation')"
    >
      <TIcon><ChatDotRound /></TIcon>
      <span>会话</span>
    </TButton>
    <TButton
      v-if="canComment && !commented"
      variant="solid"
      tone="accent"
      @click="emit('openComment')"
    >
      去评价
    </TButton>
    <TButton
      v-if="canComment && commented"
      variant="outline"
      tone="accent"
      @click="emit('openComment')"
    >
      修改评价
    </TButton>
  </div>
</template>

<style scoped>
/* 会话按钮的圆角与字重都走统一层的 .dev-action--soft（10px 方角），
   这里不再把它单独扭成胶囊——同一排的「签署合同 / 解除合作」都是方角，
   只有这一颗是 999px 时整排按钮横竖不齐（见 dev-base.css 的行内软按钮一节）。 */
.dev-requirement-card__conversation {
  font-weight: 700;
}
</style>
