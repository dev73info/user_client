<script setup lang="ts">
/**
 * 「进行中项目」卡：卡片头（标题 + 筛选胶囊 + 查看全部）+ 项目行列表 + 空态。
 *
 * 从 `views/DevHomeView.vue` 抽出来。**行是算好再传进来的**：哪几档算「进行中」、
 * 全屏时不受 5 条限制、行里的状态文案与流程进度，全在视图的 `projectRows` 里定，
 * 组件只负责画（与 `DevFunnel` 同一个分工）。筛选胶囊的当前档也留在视图——
 * 它就是 `projectRows` 的输入，放两处会各算一遍。
 *
 * 跳转同样不在这里做：点行 `emit('open')`（视图跳「我的接单」并定位这一单），
 * 「查看全部」的地址由视图按路由名传进来。组件里不出现 router / TMessage / `@/api`。
 */
import { TIcon, ArrowRight } from 'ui_73info'

import type { DevHomeProjectRow } from '@/shared/devHomeDisplay'
import { statusChipClass } from '@/shared/devHomeDisplay'
import { money } from '@/shared/devFundDisplay'
import { formatCnDateTime } from '@/shared/requirementDisplay'

import type { RouteLocationRaw } from 'vue-router'

type DevProjectTab = { key: string; label: string }

defineProps<{
  /** 已按当前筛选档过滤、并按总览/看板口径截断过的行。 */
  rows: DevHomeProjectRow[]
  /** 筛选胶囊的档位定义（哪几档、什么文案由视图给）。 */
  tabs: ReadonlyArray<DevProjectTab>
  /** 当前选中的档位，双向绑定。 */
  activeTab: string
  /** 「查看全部」的去处。 */
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
      <!-- 筛选胶囊跟在标题后面同一行：总览卡片要省纵向空间，单独一行工具栏只放四个胶囊太空 -->
      <div class="dev-card-head__title-block dev-home__head-main">
        <h3 class="dev-section-title">进行中项目</h3>
        <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="进行中项目筛选">
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

    <ul v-if="rows.length" class="dev-home__projects">
      <li
        v-for="row in rows"
        :key="row.requirementId"
        class="dev-home__project"
        :class="`dev-home__project--${row.tone}`"
        role="button"
        tabindex="0"
        :aria-label="`查看「${row.title}」的接单与交付`"
        @click="emit('open', row.requirementId)"
        @keydown.enter.prevent="emit('open', row.requirementId)"
        @keydown.space.prevent="emit('open', row.requirementId)"
      >
        <div class="dev-home__project-top">
          <strong class="dev-home__project-title">{{ row.title }}</strong>
          <span class="dev-chip dev-home__chip" :class="statusChipClass(row.status)">
            {{ row.statusLabel }}
          </span>
        </div>

        <div class="dev-home__project-foot">
          <p class="dev-home__project-meta">
            {{ row.requirementId }} · 预算
            <strong class="dev-home__project-amount">{{ money(row.budget) }}</strong>
            · 更新于 {{ formatCnDateTime(row.updatedAt) }}
          </p>

          <!-- 进度条表达的是「流程走到哪一步」（按接单状态推算），不是工作量完成度 -->
          <div class="dev-home__progress" title="按接单状态推算的流程进度">
            <span
              class="dev-home__progress-track"
              role="progressbar"
              :aria-valuenow="row.progress"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`${row.title} 流程进度`"
            >
              <span
                class="dev-home__progress-fill"
                :class="`dev-home__progress-fill--${row.tone}`"
                :style="{ width: `${row.progress}%` }"
              />
            </span>
            <span class="dev-home__progress-text">{{ row.progress }}%</span>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="dev-empty-state dev-home__empty">
      <strong>当前筛选下没有项目</strong>
    </p>
  </section>
</template>

<style scoped>
/* 项目行：标题 + 状态，以及「编号 · 预算 · 更新时间」+ 进度，行与行之间只用分隔线。
   静态排布跟着组件走；窄屏档（640）与全屏看板（`.dev-home--fullscreen`）的覆盖仍留在视图的
   媒体块里——那些规则要用 `:deep()` 才打得到子组件的内部，只有「持有子组件的那一层」能写。 */
.dev-home__projects {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条项目只占两行。整行可点（跳到「我的接单」并定位这一单），所以左右各留出内边距给 hover
   底色，再用负外边距把文字拉回与卡片头对齐的位置。
   左侧一道状态色条：一眼扫过去就分得清开发中 / 待付尾款 / 已完成，不必逐个读胶囊。 */
.dev-home__project {
  position: relative;
  display: grid;
  gap: 5px;
  margin: 0 -10px;
  padding: 11px 10px 11px 16px;
  border-bottom: 1px solid var(--dev-line);
  border-radius: 10px;
  cursor: pointer;
  transition: background 140ms ease;
}

.dev-home__project:hover {
  background: color-mix(in srgb, var(--dev-blue) 5%, transparent);
}

.dev-home__project:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
}

.dev-home__project:first-child {
  padding-top: 6px;
}

.dev-home__project:last-child {
  padding-bottom: 6px;
  border-bottom: 0;
}

.dev-home__project::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 4px;
  width: 3px;
  border-radius: 999px;
  background: var(--dev-blue);
}

.dev-home__project:first-child::before {
  top: 7px;
}

.dev-home__project:last-child::before {
  bottom: 7px;
}

.dev-home__project--gold::before {
  background: var(--dev-gold);
}

.dev-home__project--cyan::before {
  background: var(--dev-cyan);
}

.dev-home__project--muted::before {
  background: color-mix(in srgb, var(--dev-muted) 50%, transparent);
}

.dev-home__project-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* 项目行不再带图标：每行的图标都相同、不承载信息，去掉后标题能与面板标题左对齐。 */
.dev-home__project-title {
  min-width: 0;
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* 行内标签比 .dev-chip 默认形态矮一档，避免把行撑高。资金卡的保证金胶囊有一份同样的规则
   （见 DevFundPanel），两处各管各的卡片，合并进统一层反而会让别的页也跟着变矮。 */
.dev-home__chip {
  flex: 0 0 auto;
  padding: 4px 10px;
}

.dev-home__project-meta {
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

/* 预算读数跟在「预算」二字后面，不再单独占一行，所以只加深、加粗即可：
   字号与 tabular-nums 都从 .dev-home__project-meta 继承。 */
.dev-home__project-amount {
  color: var(--dev-ink);
  font-weight: 700;
}

/* 第二行：左侧「编号 · 预算 · 更新时间」，右侧进度。
   进度列给固定宽，用 auto 的话只按读数文字算宽、轨道会被挤成 0。 */
.dev-home__project-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  align-items: center;
  gap: 4px 14px;
  min-width: 0;
}

.dev-home__project-foot .dev-home__progress {
  min-width: 0;
}

/* 进度：轨道 + 按状态着色的填充，读数写在右侧 */
.dev-home__progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.dev-home__progress-track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dev-muted) 22%, transparent);
  overflow: hidden;
}

.dev-home__progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--dev-blue);
  transition: width 0.3s ease;
}

.dev-home__progress-fill--gold {
  background: var(--dev-gold);
}

.dev-home__progress-fill--cyan {
  background: var(--dev-cyan);
}

.dev-home__progress-fill--muted {
  background: color-mix(in srgb, var(--dev-muted) 70%, transparent);
}

.dev-home__progress-text {
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 卡头：标题与筛选胶囊同一行，窄了胶囊整组落到标题下面。
   「最近交付」那张卡的卡头是同一套写法（见 DevDeliveryList），两份各自成立。 */
.dev-home__head-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
}

/* 列表内的筛选标签走统一层的 .dev-toolbar + .dev-chip-group / .dev-chip--button，
   位置与其它菜单页一致（卡片头下方），卡片头右侧只留「查看全部」这个动作 */
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
