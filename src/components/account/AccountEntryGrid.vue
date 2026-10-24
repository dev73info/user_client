<script setup lang="ts">
import { ArrowRight, TButton, TIcon, TTag } from 'ui_73info'

import type { AccountEntryGroup } from '@/shared/accountEntries'

/**
 * 账户入口行：「账号与安全」与「认证管理」两张卡片共用的「分组 + 行」结构。
 *
 * 组件只渲染、只 emit `open(key)`——分发留在视图的 `openAccountEntry` 里（22 个分支跨实名 /
 * 结算 / 设置 / 绑定几个域，搬进来等于搬半个视图）。样式随组件走：`.entry-*`、`.entry-group*`
 * 全套 scoped 规则都在本文件，包括那条依赖 `.entry-row` 作祖先的 `:deep(.t73-button__label)`
 * ——它留在视图里就再也命中不了（视图里已经没有任何 `.entry-row` 节点）。
 */
defineProps<{ groups: AccountEntryGroup[] }>()

const emit = defineEmits<{ open: [key: string] }>()
</script>

<template>
  <div class="entry-groups">
    <div v-for="group in groups" :key="group.title" class="entry-group">
      <p class="entry-group__title">{{ group.title }}</p>
      <div class="entry-grid">
        <TButton
          v-for="entry in group.entries"
          :key="entry.key"
          class="entry-row"
          :class="{ 'entry-row--danger': entry.danger, 'entry-row--locked': entry.locked }"
          :aria-disabled="entry.locked ? 'true' : undefined"
          :loading="Boolean(entry.loading)"
          @click="emit('open', entry.key)"
        >
          <span class="entry-row__icon">
            <TIcon><component :is="entry.icon" /></TIcon>
          </span>
          <span class="entry-row__copy">
            <span class="entry-row__title">{{ entry.title }}</span>
            <small class="entry-row__desc">{{ entry.desc }}</small>
            <TTag v-if="entry.status" :tone="entry.status.tone" size="sm" class="entry-row__status">
              {{ entry.status.text }}
            </TTag>
          </span>
          <TIcon class="entry-row__arrow"><ArrowRight /></TIcon>
        </TButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 审核期间不放开的入口：看着就是不能点，但点了会告诉你为什么（不是死链接）。 */
.entry-row--locked {
  opacity: 0.62;
  cursor: not-allowed;
}

/* TButton 基础样式是固定 36px 高 + 左右 16px 内边距，而这里行内是 40px 图标底衬 + 两行文案，
   36px 会让图标上下顶出边框（实测内容高 37px > 内容框 34px），所以放开高度。 */
.entry-row {
  height: auto;
  min-height: 56px;
  padding-top: 8px;
  padding-bottom: 8px;
  /* TButton 默认 justify-content: center，会把「图标 + 文案 + 箭头」整块居中（实测左边空出
     56px）；入口行要从左往右排。 */
  justify-content: flex-start;
  text-align: left;
}

/* TButton 把 slot 包在 .t73-button__label 里，而它是 flex: 0 1 auto——只包住内容宽，
   于是整块被按钮居中。这里让它撑满整行、并从头排，文案区（flex: 1）再吃掉剩余宽度，
   箭头就落到最右。min-width: 0 是长文案能收省略号的前提。
   `.entry-row` 是本组件渲染的按钮，`:deep` 只穿进 TButton 内部，所以这条跟着组件一起搬。 */
.entry-row :deep(.t73-button__label) {
  flex: 1 1 auto;
  justify-content: flex-start;
  min-width: 0;
}

.entry-group {
  display: grid;
  gap: 10px;
  /* 第一组与卡片标题之间 12px：原来是视图的 `.realname-form__head + .entry-group`，搬进来后
     拿不到父级的标题元素，改成「每组 12px、后续组覆盖成 18px」；两处调用点都紧跟标题，结果一致。 */
  margin-top: 12px;
}

.entry-group + .entry-group {
  margin-top: 18px;
}

.entry-group__title {
  margin: 0;
  color: var(--profile-text-sub);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entry-row__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  /* 40px 底衬配 20px 图标：底衬要跟两行文案（14px 标题 + 12px 描述 ≈ 40px）站得住，
     36px/18px 时图标看着缩在角落、整行发空 */
  width: 40px;
  height: 40px;
  border-radius: 12px;
  /* 图标与文案之间的横向间距，标题与副标题共用同一列、因此两者到图标的距离一致。
     用 margin 而不是父层 gap：TButton 会给标签、图标、箭头各包一层 span，
     gap 会同时给箭头也加一份，白白吃掉文案宽度。值与右侧 .entry-row__status 的 margin-right 对齐，一行左右两处留白同宽 */
  margin-right: 12px;
  background: var(--profile-accent-soft);
  color: var(--profile-accent);
  font-size: 20px;
}

/* 文案区：标题与描述占左列，状态标签独占右列；标签列只在有标签时才有宽度，
   没有标签的行（列宽 0）不因此少掉一个像素。
   两行必须显式写出来：没有显式行时 grid-row 的 -1 会退化到第一行，
   跨行失效、标签又贴回标题线上 */
.entry-row__copy {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  row-gap: 2px;
  min-width: 0;
}

.entry-row__title {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--profile-text-main);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-row__desc {
  grid-column: 1;
  grid-row: 2;
  /* 描述是单行副标题：长文本（企业主体名等）必须自己收口，
     否则会溢出到右列状态标签下面（实测 245px 的格子放 279px 文案）。 */
  min-width: 0;
  overflow: hidden;
  color: var(--profile-text-sub);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态标签：跨标题与描述两行、在整块文案里垂直居中，于是它和图标、箭头共用一条中线；
   胶囊内部的文案再显式居中一次（水平 + 垂直），不依赖 TTag 自身的对齐实现。
   左边与文案留 12px、右边与箭头留 12px——既不贴标题、也不顶到箭头上，且与
   .entry-row__icon 的 margin-right 同宽。这两份间距写在标签自己的 margin 上，
   没有标签的行（标签列宽 0）不会被它吃掉宽度 */
.entry-row__status {
  grid-column: 2;
  grid-row: 1 / -1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 12px;
  margin-right: 12px;
  font-weight: 700;
  white-space: nowrap;
}

/* 箭头：双保险贴右（即使文案区没吃满），颜色与字号按次要信息给 */
.entry-row__arrow {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--profile-text-soft);
  font-size: 16px;
  transition: transform 0.2s ease;
}

/* 账户入口行在窄屏改单列：900 是标准档，也与工作台外壳（`.user-workbench` 在 ≤900px
   收成单列）同一处拐点，不再自留 780 这一档。 */
@media (max-width: 900px) {
  .entry-grid {
    grid-template-columns: 1fr;
  }
}
</style>
