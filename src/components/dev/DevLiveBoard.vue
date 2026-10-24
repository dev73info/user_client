<script setup lang="ts">
/**
 * 看板第三栏：实时动态流 + 资源项目概况。只在全屏且拿到快照后出现（`v-if` 由视图把着）。
 *
 * 从 `views/DevHomeView.vue` 抽出来。**行是算好再传进来的**：条目配哪个图标、什么色调、
 * 时间写「时:分」还是「月-日 时:分」、键怎么拼，全在 `shared/devHomeDisplay` 的
 * `buildFeedRows` / `buildResourceCells` 里定（与 `DevProjectList` 同一个分工）。
 * 组件只画，且只管一件事：`animated` 为 false 时首帧不播入场动画。
 */
import { TIcon } from 'ui_73info'

import type { DevHomeFeedRow, DevHomeResourceCell } from '@/shared/devHomeDisplay'
import { formatCount, signedMoney } from '@/shared/devHomeDisplay'

defineProps<{
  /** 已按 kind 配好图标与色调、并拼好键的动态流行。 */
  feed: DevHomeFeedRow[]
  /** 首帧不重放：动态流第一次铺满时为 false，之后新插入的条目才播一次入场动画。 */
  animated: boolean
  /** 资源项目概况的三格读数。 */
  resources: DevHomeResourceCell[]
}>()
</script>

<template>
  <div class="dev-home__live">
    <section class="dev-surface-card dev-home__panel dev-home__feed-panel">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">实时动态</h3>
        </div>
      </div>

      <TransitionGroup
        v-if="feed.length"
        tag="ul"
        class="dev-home__feed"
        name="dev-home-feed"
        :css="animated"
        aria-live="polite"
      >
        <li v-for="row in feed" :key="row.key" class="dev-home__feed-item">
          <span
            class="dev-home__feed-icon"
            :class="`dev-home__feed-icon--${row.tone}`"
            aria-hidden="true"
          >
            <TIcon>
              <component :is="row.icon" />
            </TIcon>
          </span>
          <div class="dev-home__feed-copy">
            <strong class="dev-home__feed-title">{{ row.title }}</strong>
            <span class="dev-home__feed-meta">
              <time :datetime="row.fullTime" :title="row.fullTime">{{ row.time }}</time>
              <template v-if="row.requirementId"> · {{ row.requirementId }}</template>
            </span>
          </div>
          <strong
            v-if="row.amount != null"
            class="dev-home__feed-amount"
            :class="`dev-home__feed-amount--${row.tone}`"
          >
            {{ signedMoney(row.amount) }}
          </strong>
        </li>
      </TransitionGroup>
      <p v-else class="dev-empty-state dev-home__empty">
        <strong>暂无动态</strong>
      </p>
    </section>

    <section class="dev-surface-card dev-home__panel dev-home__resources-panel">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资源项目</h3>
        </div>
      </div>
      <dl class="dev-home__resources">
        <div v-for="cell in resources" :key="cell.key" class="dev-home__resource">
          <dt>
            <TIcon>
              <component :is="cell.icon" />
            </TIcon>
            {{ cell.label }}
          </dt>
          <dd>{{ formatCount(cell.value) }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
/* 静态排布跟着组件走；`.dev-home__live :deep(.dev-home__feed)` 那条滚动覆盖（全屏撑满、
   640 档放开高度）仍留在视图的媒体块里——`:deep()` 只能在「持有子组件的那一层」编译成后代选择器。 */

/* 第三栏：动态流吃掉剩余高度并在卡内滚动，资源概况按内容高度贴底 */
.dev-home__live {
  grid-area: live;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

/* 卡片头固定、列表本体在卡内滚动。这条原先在视图里与 `.dev-home__main .dev-home__panel`
   合并成一条规则（两者都是卡片根节点）；拆开后各管各的卡，语义不变。 */
.dev-home__feed-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 实时动态：图标 + 标题 / 时间 + 金额。新条目从顶部插入并闪一下底色 */
.dev-home__feed {
  display: grid;
  align-content: start;
  list-style: none;
}

.dev-home__feed-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin: 0 -10px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--dev-line);
  border-radius: 10px;
}

.dev-home__feed-item:last-child {
  border-bottom: 0;
}

.dev-home__feed-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 15px;
}

.dev-home__feed-icon--gold {
  background: color-mix(in srgb, var(--dev-gold) 14%, transparent);
  color: var(--dev-gold);
}

.dev-home__feed-icon--cyan {
  background: color-mix(in srgb, var(--dev-cyan) 14%, transparent);
  color: var(--dev-cyan);
}

.dev-home__feed-icon--muted {
  background: color-mix(in srgb, var(--dev-muted) 14%, transparent);
  color: var(--dev-ink-soft);
}

.dev-home__feed-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.dev-home__feed-title {
  overflow: hidden;
  color: var(--dev-ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dev-home__feed-meta {
  overflow: hidden;
  color: var(--dev-muted);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.dev-home__feed-amount {
  color: var(--dev-ink-soft);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dev-home__feed-amount--gold {
  color: var(--dev-gold);
}

/* 入场动画的类名由 TransitionGroup 生成（`name="dev-home-feed"`），所以这条与 keyframes 都得
   跟着动态流留在这个组件里——scoped 会把 keyframes 改名，写在别的文件里就配不上了。 */
.dev-home-feed-enter-active {
  animation: dev-home-feed-in 1.6s ease-out;
}

.dev-home-feed-move {
  transition: transform 0.35s ease;
}

.dev-home-feed-leave-active {
  display: none;
}

@keyframes dev-home-feed-in {
  0% {
    opacity: 0;
    transform: translateY(-10px);
    background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  }
  18% {
    opacity: 1;
    transform: translateY(0);
    background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  }
  100% {
    background: transparent;
  }
}

/* 资源项目：三格读数一排 */
.dev-home__resources {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.dev-home__resource {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
}

.dev-home__resource dt {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--dev-muted);
  font-size: 12px;
  white-space: nowrap;
}

.dev-home__resource dd {
  margin: 0;
  color: var(--dev-ink);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* 减弱动效时不播入场动画：新条目直接出现，不做位移与底色闪动 */
@media (prefers-reduced-motion: reduce) {
  .dev-home-feed-enter-active {
    animation: none;
  }
}
</style>
