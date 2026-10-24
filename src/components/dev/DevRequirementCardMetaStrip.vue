<script setup lang="ts">
import { computed } from 'vue'
import {
  deliveryVersionLine,
  latestReceiptAt,
  receiptMoney,
  receiptTotal,
  rowCustomer,
  rowUpdatedAt,
  type DevMyOrderRow,
} from '@/shared/devDelivery'
import { developmentCycleLabel } from '@/shared/requirementArchive'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { TIcon, View } from 'ui_73info'

/**
 * 卡片中段的两条读数：上面一格是「预算 / 开发周期 / 委托方 / 最近更新 / 会话」，
 * 下面一格是交付物与到账（原来「交付记录」页的两列，现在与需求单同卡）。
 *
 * 只渲染、只 emit：行（交付与到账已经归并好）、绑定资源的兜底标题、会话摘要都由卡片算好传进来。
 * 到账是多笔时这里只放合计与笔数，逐笔摊开在「查看回款详情」弹窗里。
 */
const props = defineProps<{
  row: DevMyOrderRow
  /** 绑定资源已不在资源清单里时的兜底标题（卡片按页面的资源清单查好传下来）。 */
  boundResourceTitle: string | null
  /** 会话摘要：没会话时说「打开后创建会话」，有则最近一条的时间。 */
  conversationLabel: string
  conversationLoading: boolean
}>()

const emit = defineEmits<{ openReceipt: [] }>()

const item = computed(() => props.row.item)

/** 预算：没有预算写「待议价」，不写 ¥0。 */
const budgetText = computed(() => formatMoney(item.value?.budget))

/** R014：开发周期（天）文案（担保需求合同有效期的依据）；未填返回空串，卡片据此不渲染该格。 */
const developmentCycleText = computed(() =>
  developmentCycleLabel(item.value?.development_cycle_days),
)

/** 交付物标题：有版本时用交付行，没有版本时回落到需求绑定的资源，没绑定才是「未关联资源」。 */
const deliveryTitle = computed(() => {
  if (props.row.delivery) {
    return props.row.delivery.resourceTitle
  }
  if (props.boundResourceTitle) {
    return props.boundResourceTitle
  }

  return '未关联资源'
})

/** 交付物副行：平台 · 最新版本 · 版本总数 · 资源状态；没有版本时说清原因，不留一行空白。 */
const deliveryLine = computed(() =>
  props.row.delivery ? deliveryVersionLine(props.row.delivery) : '暂无交付版本',
)

/** 到账合计：没有到账给占位符；笔数只在多笔时说，否则一个合计对不上看到的逐笔流水。 */
const receiptAmountText = computed(() =>
  props.row.receipts.length > 0 ? receiptMoney(receiptTotal(props.row.receipts)) : '—',
)

const receiptMetaText = computed(() => {
  const latest = latestReceiptAt(props.row.receipts)
  if (!latest) {
    return '暂无到账'
  }

  const counted = props.row.receipts.length > 1 ? `共 ${props.row.receipts.length} 笔 · ` : ''
  return `${counted}最近 ${formatCnDateTime(latest)}`
})

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}
</script>

<template>
  <div class="dev-requirement-card__meta">
    <span v-if="item" class="dev-requirement-card__meta-item">
      <label>预算</label>
      <strong>{{ budgetText }}</strong>
    </span>
    <!-- R014：开发周期（天）——担保需求合同有效期的依据；无担保 / 未填不渲染。 -->
    <span
      v-if="item && developmentCycleText"
      class="dev-requirement-card__meta-item"
      data-testid="dev-requirement-development-cycle"
    >
      <label>开发周期</label>
      <strong>{{ developmentCycleText }}</strong>
    </span>
    <span class="dev-requirement-card__meta-item">
      <label>委托方</label>
      <strong>{{ rowCustomer(row) || '—' }}</strong>
    </span>
    <span class="dev-requirement-card__meta-item">
      <label>最近更新</label>
      <strong>{{ rowUpdatedAt(row) }}</strong>
    </span>
    <span v-if="item" class="dev-requirement-card__meta-item">
      <label>会话</label>
      <strong>{{ conversationLoading ? '加载中' : conversationLabel }}</strong>
    </span>
  </div>

  <!-- 交付物与到账：原「交付记录」页的两列，现在与需求单同卡。
       到账是多笔时行上只放合计与笔数，逐笔摊开在「查看回款详情」弹窗里。 -->
  <div class="dev-requirement-card__delivery">
    <div class="dev-delivery-cell">
      <label>交付物</label>
      <strong>{{ deliveryTitle }}</strong>
      <span class="dev-delivery-cell__line">{{ deliveryLine }}</span>
    </div>
    <div class="dev-delivery-cell">
      <label>到账</label>
      <strong class="dev-delivery-cell__amount">{{ receiptAmountText }}</strong>
      <span class="dev-delivery-cell__line">{{ receiptMetaText }}</span>
      <button
        v-if="row.receipts.length > 0"
        type="button"
        class="dev-requirement-card__receipt-toggle"
        @click="emit('openReceipt')"
      >
        <TIcon><View /></TIcon>
        <span>查看回款详情</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dev-requirement-card__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed var(--dev-line);
  border-bottom: 1px dashed var(--dev-line);
}

.dev-requirement-card__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__meta-item label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-requirement-card__meta-item strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

/* === 交付物与到账（合并自「交付记录」页） ===
   两格并排：左边是交付的资源与版本，右边是到账合计、笔数与最近一笔时间。
   窄屏收成一列（见本文件 640px 的媒体查询）。 */
.dev-requirement-card__delivery {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dev-delivery-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-bg);
}

.dev-delivery-cell label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-delivery-cell strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

/* 到账金额用金色：与收益钱包的入账、回款详情里的逐笔金额同一支。
   选择器带 `strong` 是为了压过上面那条（同权重、写在后面）。 */
strong.dev-delivery-cell__amount {
  color: var(--dev-gold);
  font-variant-numeric: tabular-nums;
}

.dev-delivery-cell__line {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dev-ink-soft);
  overflow-wrap: anywhere;
}

/* 查看回款详情：与描述「展开 / 收起」同一支文字按钮，不挤进行内操作栏 */
.dev-requirement-card__receipt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dev-blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__receipt-toggle:hover {
  text-decoration: underline;
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
  .dev-requirement-card__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* 交付与到账并排两格在窄屏会各剩不到 150px，读不出资源标题与流水时间，收成一列 */
  .dev-requirement-card__delivery {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
