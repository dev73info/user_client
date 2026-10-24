<script setup lang="ts">
/**
 * 「最近交付」卡：三列交付卡片 + 筛选胶囊 + 空态。
 *
 * 和「进行中项目」同一套分工（见 DevProjectList）：交付行由视图按「已绑定资源的需求单」汇总好
 * （金额取该单的到账尾款、条数按总览 / 看板口径截断），组件只画。点卡片 `emit('open')`，
 * 「查看全部」的去处由视图传入，组件里不出现 router / TMessage / `@/api`。
 */
import { TIcon, ArrowRight, CircleCheck, Promotion } from 'ui_73info'

import type { DevHomeDeliveryRow } from '@/shared/devHomeDisplay'
import { money } from '@/shared/devFundDisplay'
import { formatCnDateTime } from '@/shared/requirementDisplay'

import type { RouteLocationRaw } from 'vue-router'

type DevDeliveryTab = { key: string; label: string }

defineProps<{
  /** 已按当前筛选档过滤、并按总览/看板口径截断过的交付行。 */
  rows: DevHomeDeliveryRow[]
  tabs: ReadonlyArray<DevDeliveryTab>
  activeTab: string
  moreTo: RouteLocationRaw
}>()

const emit = defineEmits<{
  'update:activeTab': [key: string]
  open: [requirementId: string]
}>()
</script>

<template>
  <section class="dev-surface-card dev-home__panel">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block dev-home__head-main">
        <h3 class="dev-section-title">最近交付</h3>
        <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="最近交付筛选">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="dev-chip dev-chip--button"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            :class="{ 'is-active': activeTab === tab.key }"
            @click="emit('update:activeTab', tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="dev-card-head__actions">
        <RouterLink class="dev-home__more" :to="moreTo">
          <span>查看全部</span>
          <TIcon>
            <ArrowRight />
          </TIcon>
        </RouterLink>
      </div>
    </div>

    <ul v-if="rows.length" class="dev-home__deliveries">
      <li
        v-for="row in rows"
        :key="row.requirementId"
        class="dev-home__delivery"
        role="button"
        tabindex="0"
        :aria-label="`查看「${row.resourceTitle}」的交付与到账`"
        @click="emit('open', row.requirementId)"
        @keydown.enter.prevent="emit('open', row.requirementId)"
        @keydown.space.prevent="emit('open', row.requirementId)"
      >
        <div class="dev-home__delivery-top">
          <span class="dev-home__delivery-icon" aria-hidden="true">
            <TIcon>
              <Promotion />
            </TIcon>
          </span>
          <strong class="dev-home__delivery-title">{{ row.resourceTitle }}</strong>
          <!-- 交付过的打勾：卡片只看一行，没有勾就得逐字读版本数才知道交付没交付 -->
          <TIcon v-if="row.delivered" class="dev-home__delivery-check">
            <CircleCheck />
          </TIcon>
        </div>

        <p class="dev-home__delivery-meta">
          <span class="dev-home__delivery-id">{{ row.requirementId }}</span>
          <span class="dev-home__delivery-versions">{{ row.versionCount }} 个版本</span>
        </p>

        <!-- 页脚贴卡片底边：同一排卡片标题行数不同，日期与金额也要落在同一条线上 -->
        <div class="dev-home__delivery-foot">
          <span class="dev-home__delivery-time">{{
            row.updatedAt ? formatCnDateTime(row.updatedAt) : '—'
          }}</span>
          <strong v-if="row.amount != null" class="dev-home__delivery-amount">
            {{ money(row.amount) }}
          </strong>
          <span v-else class="dev-home__delivery-amount dev-home__delivery-amount--pending"
            >未到账</span
          >
        </div>
      </li>
    </ul>
    <p v-else class="dev-empty-state dev-home__empty">
      <strong>当前筛选下没有交付记录</strong>
    </p>
  </section>
</template>

<style scoped>
/* 最近交付是三列卡片而不是行列表：一张卡只讲一次交付，行列表在这里信息密度过低
   （右侧大片留白），见设计规范第五节。整卡可点（跳到「我的接单」并定位这一单）。
   静态排布跟着组件走；900 / 640 与全屏看板的覆盖留在视图的媒体块里（`:deep()` 只能写在
   「持有子组件的那一层」）。 */
.dev-home__deliveries {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev-home__delivery {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--dev-line);
  border-radius: 12px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--dev-cyan) 7%, transparent), transparent 55%),
    var(--dev-surface-strong);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dev-home__delivery:hover {
  border-color: color-mix(in srgb, var(--dev-cyan) 36%, transparent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--dev-cyan) 10%, transparent);
}

.dev-home__delivery:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
}

/* 图标只留给交付卡，且比原尺寸矮一档——三列宽的卡片上 38px 会把标题挤掉两三个字。 */
.dev-home__delivery-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dev-cyan) 12%, transparent);
  color: var(--dev-cyan);
  font-size: 16px;
}

.dev-home__delivery-top {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 交付卡标题最多两行，三张卡的标题区等高，下面的编号与页脚才对得齐 */
.dev-home__delivery-title {
  display: -webkit-box;
  min-height: calc(14px * 1.45 * 2);
  min-width: 0;
  overflow: hidden;
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.dev-home__delivery-check {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--dev-cyan);
  font-size: 16px;
}

.dev-home__delivery-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dev-home__delivery-id,
.dev-home__delivery-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-home__delivery-versions {
  flex-shrink: 0;
  color: var(--dev-cyan);
  font-weight: 700;
}

.dev-home__delivery-time {
  color: var(--dev-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 卡片页脚：日期贴左，金额靠右 —— 金额是这张卡最想让人看到的一格 */
.dev-home__delivery-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--dev-line);
}

.dev-home__delivery-amount {
  margin-left: auto;
  color: var(--dev-gold);
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dev-home__delivery-amount--pending {
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 600;
}

/* 卡头与「进行中项目」同形：标题与筛选胶囊同一行，窄了胶囊整组落到标题下面。
   另一份在 DevProjectList，两张卡各自成立。 */
.dev-home__head-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.dev-home__tabs {
  margin: 0;
}

.dev-home__panel > .dev-card-head:has(.dev-home__head-main) {
  align-items: center;
}

.dev-home__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--dev-blue);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.dev-home__more .t73-icon {
  transition: transform 0.2s ease;
}

.dev-home__more:hover .t73-icon {
  transform: translateX(2px);
}

.dev-home__more:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
  border-radius: 8px;
}
</style>
