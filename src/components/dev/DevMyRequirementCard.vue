<script setup lang="ts">
import { computed } from 'vue'
import type { InvoiceRecord } from '@/api/invoices'
import type { ContractSigningStatus } from '@/shared/contracts'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import DevRequirementActions from '@/components/dev/DevRequirementActions.vue'
import DevRequirementBriefField from '@/components/dev/DevRequirementBriefField.vue'
import DevRequirementCardMetaStrip from '@/components/dev/DevRequirementCardMetaStrip.vue'
import DevRequirementRatingRows from '@/components/dev/DevRequirementRatingRows.vue'
import { rowTitle, type DevMyOrderRow } from '@/shared/devDelivery'
import {
  canComment,
  canCreateRequirementContract,
  canOpenAfterSales,
  canOpenContractSign,
  canReportBreach,
  canSubmitDeliveryVersion,
  contractButtonLabel,
  contractStartHint,
  contractStatusBadge,
  contractStatusTone,
  settlementHint,
} from '@/shared/devMyRequirementCard'

/**
 * 「我的接单」一张卡片：抬头与需求说明、读数、进程条、评价、签约状态与行内操作栏。
 *
 * 判定的口径全在 `shared/devMyRequirementCard.ts`，本组件只把结果摆上去：
 * 「能不能出哪个入口」原先由页面判，现在跟着卡片走，因为其中三条（申报违约、发起合同、
 * 签署 / 查看合同）都要读签约状态；页面把一次取回的那份**算好再传**（`:contract-status`），
 * 卡片、进度条与解除合作弹窗因此共用同一份「有没有生效合同」的事实。
 *
 * 组件内不许出现 `router` / `TMessage` / `@/api/*` 的调用：跳转、提示与请求都留在页面，
 * 这里只 emit，页面接回去再发。
 *
 * 行（`rows` / `mergedRows`）仍是页面的单实例，这里只吃传下来的那一行。
 */
const props = defineProps<{
  row: DevMyOrderRow
  /** 本页一次取回的签约状态；无担保需求不查，为空。 */
  contractStatus: ContractSigningStatus | null
  /** 售后待办角标读数；空串表示没有待办（模板据此决定渲不渲染角标）。 */
  afterSalesBadge: string
  /** 角标悬停说明里的条数。 */
  afterSalesPendingCount: number
  /** 绑定资源已不在资源清单里时的兜底标题。 */
  boundResourceTitle: string | null
  /** 会话摘要（页面从 `useDevRequirementRowDialogs` 那一份记录里取）。 */
  conversationLabel: string
  conversationLoading: boolean
  /** 正在为这一单发起合同（按钮转圈）。 */
  contractCreating: boolean
  /** 这一单可上传的开发者收入票（通常是 0 或 1 张）。 */
  uploadableInvoices: InvoiceRecord[]
  /** 正在上传的票 id：用来把同排其它票的按钮一起置灰。 */
  uploadingInvoiceId: number | null
}>()

const emit = defineEmits<{
  submitDelivery: []
  openAfterSales: []
  reportBreach: []
  createContract: []
  contractAction: []
  pickInvoice: [invoiceId: number]
  openConversation: []
  openComment: []
  openReceipt: []
}>()

/** 补充行（未关联需求的交付／到账）没有需求单：签署、进度与操作栏都不出。 */
const item = computed(() => props.row.item)

/** 行抬头：需求单行取需求标题，补充行取钱包回执里的标题。 */
const title = computed(() => rowTitle(props.row))

const contractBadge = computed(() => contractStatusBadge(props.contractStatus))
const contractTone = computed(() => contractStatusTone(props.contractStatus))
const contractStartHintText = computed(() =>
  item.value ? contractStartHint(item.value, props.contractStatus) : '',
)
const settlementHintText = computed(() => (item.value ? settlementHint(item.value) : ''))

/**
 * 行内操作栏的八个判定：缺需求单时一律 false，模板因此不用再收窄类型
 * （行内事件处理器拿不到 `v-if` 的收窄，参数为 null 时也不能崩）。
 */
const flags = computed(() => {
  const value = item.value
  if (!value) {
    return {
      submitDelivery: false,
      openAfterSales: false,
      reportBreach: false,
      createContract: false,
      openContractSign: false,
      contractLabel: contractButtonLabel(props.contractStatus),
      comment: false,
      commented: false,
    }
  }

  return {
    submitDelivery: canSubmitDeliveryVersion(value),
    openAfterSales: canOpenAfterSales(value),
    reportBreach: canReportBreach(value, props.contractStatus),
    createContract: canCreateRequirementContract(value, props.contractStatus),
    openContractSign: canOpenContractSign(value, props.contractStatus),
    contractLabel: contractButtonLabel(props.contractStatus),
    comment: canComment(value),
    commented: value.developer_comment_rating != null,
  }
})
</script>

<template>
  <article class="dev-requirement-card">
    <header class="dev-requirement-card__head">
      <div class="dev-requirement-card__title-block">
        <span class="dev-requirement-hall__requirement-id">{{ row.requirementId }}</span>
        <h3 class="dev-requirement-hall__title">{{ title }}</h3>
        <!-- 需求说明：需求描述与验收标准两段，一个「展开 / 收起」管两段（见 DevRequirementBriefField）。 -->
        <DevRequirementBriefField
          v-if="item"
          :description="item.description"
          :acceptance-criteria="item.acceptance_criteria"
        />
        <p v-else class="dev-requirement-card__description">
          这条到账所属的需求已解除绑定，需求单列表里已经查不到它。
        </p>
      </div>
      <div class="dev-requirement-card__tags">
        <!-- 状态标签已去掉：卡内的流程进度条（RequirementProgressGuide）已经写明走到哪一步，
             卡片头再顶一枚「开发中 / 待付尾款」是同一条信息的第二遍。
             发布方式走全站共用的 .pay-mode-chip（见 PaymentModeChip），
             与需求大厅、我的需求、搜索结果同一枚胶囊。 -->
        <PaymentModeChip v-if="item" :mode="item.payment_mode" />
      </div>
    </header>

    <DevRequirementCardMetaStrip
      :row="row"
      :bound-resource-title="boundResourceTitle"
      :conversation-label="conversationLabel"
      :conversation-loading="conversationLoading"
      @open-receipt="emit('openReceipt')"
    />

    <div v-if="item" class="dev-requirement-card__progress">
      <RequirementProgressGuide
        :requirement="item"
        :payment-mode="item.payment_mode"
        view="dev"
        :contract-status="contractStatus"
      />
    </div>

    <div v-if="settlementHintText" class="signing-start-hint">
      {{ settlementHintText }}
    </div>

    <DevRequirementRatingRows :item="item" />

    <div v-if="item && item.payment_mode !== 'self_managed'" class="dev-requirement-card__signing">
      <div class="signing-status-bar">
        <span class="signing-status-badge" :class="`signing-status-badge--${contractTone}`">
          {{ contractBadge }}
        </span>
      </div>
      <div v-if="contractStartHintText" class="signing-start-hint">
        {{ contractStartHintText }}
      </div>
    </div>

    <!-- 签署与操作栏只给需求单行：补充行（未关联需求的交付／到账）没有可执行的接单动作。
         行内按钮本体在 `DevRequirementActions`，能不能出哪个入口由本卡片的 `flags` 判定后传进去。 -->
    <footer v-if="item" class="dev-requirement-card__actions">
      <!-- 行内操作按钮走统一层的 .dev-list-actions（32px 高 / 10px 圆角），
           与资源列表、我的团队的行内按钮同一规格。 -->
      <DevRequirementActions
        :can-submit-delivery="flags.submitDelivery"
        :can-open-after-sales="flags.openAfterSales"
        :after-sales-badge="afterSalesBadge"
        :after-sales-pending-count="afterSalesPendingCount"
        :can-report-breach="flags.reportBreach"
        :can-create-contract="flags.createContract"
        :contract-creating="contractCreating"
        :can-open-contract-sign="flags.openContractSign"
        :contract-label="flags.contractLabel"
        :uploadable-invoices="uploadableInvoices"
        :uploading-invoice-id="uploadingInvoiceId"
        :can-comment="flags.comment"
        :commented="flags.commented"
        @submit-delivery="emit('submitDelivery')"
        @open-after-sales="emit('openAfterSales')"
        @report-breach="emit('reportBreach')"
        @create-contract="emit('createContract')"
        @contract-action="emit('contractAction')"
        @pick-invoice="emit('pickInvoice', $event)"
        @open-conversation="emit('openConversation')"
        @open-comment="emit('openComment')"
      />
    </footer>
  </article>
</template>

<style scoped>
.dev-requirement-card {
  /* 需求说明（需求描述 + 验收标准）的排版参数：正文行高、收起时留几行。
     正文的 line-height、收起的 max-height、收起时压平的段落网格三处必须是同一个值，
     提到卡片上做变量，免得三处各写一遍、改一处忘两处。
     （真正用到它们的排版规则在 `DevRequirementBriefField` 里；自定义属性按 DOM 继承，
     那个组件是这张卡的子节点，值照样拿得到。） */
  --dev-brief-line-height: 1.5;
  --dev-brief-collapsed-lines: 3;
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.dev-requirement-card:hover {
  border-color: var(--wb-accent-line);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--dev-ink) 10%, transparent);
}

.dev-requirement-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-requirement-card__title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

/* 卡片式列表的行标题取统一层的 .dev-stack-item__title 档位（16px），
   原来是 17px，比同一页的其他行标题大一档 */
.dev-requirement-card__title-block .dev-requirement-hall__title {
  font-size: 16px;
}

/* 补充行（需求已解绑）那一句占位。样式与 `DevRequirementBriefField` 里的正文容器是同一份：
   scoped 样式只对本组件模板里的元素生效，那边两段 v-html 容器在子组件里，只能各留一份。 */
.dev-requirement-card__title-block .dev-requirement-card__description {
  margin: 0;
  font-size: 13px;
  line-height: var(--dev-brief-line-height);
  color: var(--dev-muted);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dev-requirement-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.dev-requirement-card__signing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 配色统一：这里原先混用了青绿 var(--73-success)、琥珀 var(--73-warning)、Element 灰 var(--73-ink-placeholder)/var(--73-ink-disabled)/var(--73-ink)、
   暖黄 var(--73-warning)，与开发者体系的蓝/青/金三支强调色都对不上，一律换成令牌。 */
.dev-requirement-card__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 0;
  padding: 12px 0 0;
  border-top: 1px dashed var(--dev-line);
  background: transparent;
  text-align: left;
}

/* 行内操作按钮的容器与规格都走统一层的 .dev-list-actions（见 dev-base.css），
   本页不再自己写一份 flex 布局，否则按钮高度会退回按钮自己的默认档。 */

.signing-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 100%;
}

.signing-status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.signing-status-badge--signed {
  background: color-mix(in srgb, var(--dev-cyan) 16%, transparent);
  color: var(--dev-cyan);
}

.signing-status-badge--progress {
  background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  color: var(--dev-blue);
}

/* 破坏性状态徽标的那支红由页面根给（`--dmr-danger`）：原先写的是
   `var(--dev-danger, var(--73-danger))`，而 `--dev-danger` 从来没定义过，真正生效的一直是兜底值。
   拆卡片时把这一支红提到页面根上（取值一字未改），本文件只写变量、零裸色值。 */
.signing-status-badge--danger {
  background: color-mix(in srgb, var(--dmr-danger) 12%, transparent);
  color: var(--dmr-danger);
}

.signing-status-badge--muted {
  background: color-mix(in srgb, var(--dev-muted) 16%, transparent);
  color: var(--dev-muted);
}

.signing-start-hint {
  margin-top: 4px;
  color: var(--dev-gold);
  font-size: 12px;
  line-height: 1.5;
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
  .dev-requirement-card__head {
    flex-direction: column;
  }
}
</style>
