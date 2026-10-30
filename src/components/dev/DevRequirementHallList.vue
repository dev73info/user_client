<script setup lang="ts">
import { TButton, TIcon, TTable, TTableColumn, Tickets } from 'ui_73info'

import PaymentModeChip from '@/components/PaymentModeChip.vue'
import type { RequirementItem } from '@/api/devRequirements'
import {
  bindButtonLabel,
  formatRequirementBudget,
  requirementPreviewText,
  type RequirementBindGate,
} from '@/shared/devRequirementHall'
import { formatCnDateTime } from '@/shared/requirementDisplay'

/**
 * 可接需求列表：宽屏是表格，窄屏（≤640）换成 App 式的卡片流。
 *
 * 两套视图同时渲染，靠 CSS 决定显示哪一套——和改造前一致，不做 JS 断点判断。
 * 「接单」按钮上的字由父级给的 `gate`（目前只有入驻协议签署状态）算出来，
 * 判定在 `@/shared/devRequirementHall` 的 `bindButtonLabel` 里；保证金由后端在接单时判。
 */
const props = defineProps<{
  rows: RequirementItem[]
  /** 列表刷新中（表格遮罩 + 卡片流的 aria-busy） */
  loading: boolean
  /** 空态文案（加载中与真的没单是两句不同的话） */
  emptyText: string
  /** 接单资格读数：决定每行按钮上写「接单」还是「需先签署协议」等 */
  gate: RequirementBindGate
}>()

const emit = defineEmits<{
  /** 点某一行的「接单」 */
  open: [requirement: RequirementItem]
  /** 空态里去签《开发者入驻协议》 */
  sign: []
}>()

/** 某一行的按钮文案。 */
function rowButtonLabel(row: RequirementItem): string {
  return bindButtonLabel(row, props.gate)
}
</script>

<template>
  <!-- 列宽可拖：表头右边缘的拖拽手柄由 TTableColumn 的 `resizable` 打开，与边框无关
       （TTable 的 `border` 是画竖线的皮肤开关，本页要的是无框表格，所以不给）。
       窄窗口下列宽合计超过卡片时表格本来就会横向滚动（见 dev-responsive.css 的说明），
       现在用户至少可以把列拖窄，自己把表格收进卡片宽度。 -->
  <TTable :loading="loading" :data="rows" stripe class="dev-table dev-requirement-hall__table">
    <template #empty>
      <p class="dev-empty-state">{{ emptyText }}</p>
    </template>
    <!-- 列宽合计必须留在卡片可用宽度以内（桌面端 1440 宽时约 965px）。
         固定五列 110+88+108+132+118 = 556px，需求列（min-width 260）吃掉剩余宽度。
         大厅入口本身就是「未被接单」，行状态对接单决策没有增量信息，故不展示状态列。 -->
    <TTableColumn label="需求" min-width="260" resizable>
      <template #default="scope">
        <div class="dev-requirement-hall__title-cell">
          <div class="dev-requirement-hall__requirement-id">{{ scope.row.requirement_id }}</div>
          <div class="dev-requirement-hall__title">{{ scope.row.title }}</div>
          <div class="dev-requirement-hall__desc">
            {{ requirementPreviewText(scope.row.description, '暂无补充描述') }}
          </div>
        </div>
      </template>
    </TTableColumn>
    <TTableColumn prop="creator" label="发起人" width="110" resizable show-overflow-tooltip />
    <TTableColumn label="预算" width="88" resizable>
      <template #default="scope">
        <span>{{ formatRequirementBudget(scope.row.budget) }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="发布方式" width="108" resizable>
      <template #default="scope">
        <PaymentModeChip :mode="scope.row.payment_mode" />
      </template>
    </TTableColumn>
    <!-- 发布时间只报到分钟：后端给的是「2026-09-28 15:30:00」，19 个字符要 144px，
         132px 的列会被截成「2026-09-28 15:…」；掐掉秒之后 107px 就够。
         列名是「发布时间」而不是「最近更新」——契约里没有更新时间的字段。 -->
    <TTableColumn label="发布时间" width="132" resizable show-overflow-tooltip>
      <template #default="scope">{{ formatCnDateTime(scope.row.created_time) }}</template>
    </TTableColumn>
    <TTableColumn label="操作" width="118" fixed="right" resizable>
      <template #default="scope">
        <TButton variant="outline" tone="accent" @click="emit('open', scope.row)">
          {{ rowButtonLabel(scope.row) }}
        </TButton>
      </template>
    </TTableColumn>
  </TTable>

  <!-- 窄屏不铺五列表格，改成 App 式的卡片流：标题与预算一行、描述一行、发布方式与发起人一行，动作贴右 -->
  <div class="hall-feed" :aria-busy="loading">
    <p v-if="loading && !rows.length" class="hall-feed__state">正在加载需求…</p>
    <div v-else-if="!rows.length" class="hall-feed__state hall-feed__state--empty">
      <span class="hall-feed__empty-icon" aria-hidden="true">
        <TIcon :size="26"><Tickets /></TIcon>
      </span>
      <p>{{ emptyText }}</p>
      <!-- 窄屏列表为空时，签协议提示并到空态里：说明在上、按钮在下，页顶那条随之隐藏 -->
      <div v-if="!gate.agreementSigned" class="hall-feed__agreement">
        <strong>尚未签署《开发者入驻协议》</strong>
        <TButton variant="solid" tone="accent" class="hall-feed__cta" @click="emit('sign')">
          去签署协议
        </TButton>
      </div>
    </div>
    <ul v-else class="hall-feed__list" aria-label="可接需求">
      <li v-for="row in rows" :key="row.requirement_id" class="hall-feed__item">
        <div class="hall-feed__head">
          <span class="hall-feed__title">{{ row.title }}</span>
          <span class="hall-feed__budget">{{ formatRequirementBudget(row.budget) }}</span>
        </div>
        <p class="hall-feed__desc">{{ requirementPreviewText(row.description, '暂无补充描述') }}</p>
        <div class="hall-feed__foot">
          <div class="hall-feed__meta">
            <PaymentModeChip :mode="row.payment_mode" />
            <span>{{ row.creator }}</span>
            <span>{{ formatCnDateTime(row.created_time) }}</span>
          </div>
          <TButton variant="solid" tone="accent" class="hall-feed__cta" @click="emit('open', row)">
            {{ rowButtonLabel(row) }}
          </TButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dev-requirement-hall__table :deep(.cell),
.dev-requirement-hall__title-cell {
  min-width: 0;
}

.dev-requirement-hall__requirement-id,
.dev-requirement-hall__title,
.dev-requirement-hall__desc {
  overflow-wrap: anywhere;
}

.dev-requirement-hall__desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}

/* 卡片流只在窄屏出现，宽屏仍是表格 */
.hall-feed {
  display: none;
}

@media (max-width: 640px) {
  .dev-requirement-hall__table {
    display: none;
  }

  .hall-feed {
    display: block;
  }

  /* 空态与加载态不再套白卡，直接落在页面底色上：图标 + 一行说明 */
  .hall-feed__state {
    margin: 0;
    padding: 40px 16px;
    color: var(--dev-muted);
    font-size: 13px;
    text-align: center;
  }

  .hall-feed__state--empty {
    display: grid;
    justify-items: center;
    gap: 12px;
  }

  .hall-feed__state--empty p {
    margin: 0;
  }

  .hall-feed__agreement {
    display: grid;
    justify-items: center;
    gap: 10px;
    margin-top: 8px;
  }

  .hall-feed__agreement strong {
    color: var(--dev-ink);
    font-size: 14px;
    font-weight: 700;
  }

  .hall-feed__empty-icon {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--dev-blue-soft);
    color: var(--dev-blue);
    font-size: 26px;
  }

  .hall-feed__list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hall-feed__item {
    display: grid;
    gap: 8px;
    padding: 14px;
    border-radius: 16px;
    background: var(--dev-surface-strong);
    box-shadow: var(--dev-shadow-card-soft);
  }

  .hall-feed__item:active {
    background: var(--dev-blue-tint);
  }

  .hall-feed__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .hall-feed__title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    color: var(--dev-ink);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
  }

  .hall-feed__budget {
    flex: 0 0 auto;
    color: var(--dev-amount);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .hall-feed__desc {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    color: var(--dev-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .hall-feed__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--dev-line);
  }

  .hall-feed__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-width: 0;
    color: var(--dev-muted);
    font-size: 12px;
  }

  .hall-feed__cta {
    flex: 0 0 auto;
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
  }
}
</style>
