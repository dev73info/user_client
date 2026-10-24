<script setup lang="ts">
import { TButton, TIcon, Refresh } from 'ui_73info'

/**
 * 总览页顶部读数条：四格读数（需求 / 待处理 / 会话 / 可用券）+ 页面级刷新。
 *
 * 形状沿用菜单页的 `.wb-strip`（形状见 `styles/portal-workbench.css`），这里只多两件事：
 * 读数项带跳转、右边多一颗刷新。四个数都由视图算好传进来——组件不认识接口，也不发路由。
 *
 * ⚠️ 下面那两条 `.overview-strip a.wb-strip__item` 必须留在**本组件的 scoped** 里：
 * 它们靠 `.overview-strip a.wb-strip__item` 这个 0,2,0 的选择器压过统一层的
 * `.wb-strip__item`（0,1,0）。抽成组件后元素上只有本组件的 data-v，规则留在视图里就
 * 一条也匹配不上——链接下划线会回来、hover 也失去主色，且不报错。
 */
defineProps<{
  /** 「需求」格：全部需求数。 */
  requirementTotal: number
  /** 「待处理」格：现在就能点一下的需求数（口径见 `useRequirementOverview` 的 `actionableRequirements`）。 */
  actionableCount: number
  /** 「会话」格：有合作对象、会话还没关的需求数。 */
  conversationCount: number
  /** 「可用券」格。 */
  couponCount: number
  /** 刷新中：需求列表与券包两路谁在转都算。 */
  refreshing: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <nav class="wb-strip overview-strip" aria-label="工作台关键数据">
    <RouterLink class="wb-strip__item" :to="{ name: 'workbench-requirements' }" title="全部需求">
      <span class="wb-strip__label">需求</span>
      <span class="wb-strip__value">{{ requirementTotal }}</span>
    </RouterLink>
    <div class="wb-strip__divider" />
    <RouterLink
      class="wb-strip__item"
      :to="{ name: 'workbench-requirements' }"
      title="待处理的需求"
    >
      <span class="wb-strip__label">待处理</span>
      <span class="wb-strip__value">{{ actionableCount }}</span>
    </RouterLink>
    <div class="wb-strip__divider" />
    <RouterLink class="wb-strip__item" :to="{ name: 'workbench-messages' }" title="沟通会话">
      <span class="wb-strip__label">会话</span>
      <span class="wb-strip__value">{{ conversationCount }}</span>
    </RouterLink>
    <div class="wb-strip__divider" />
    <RouterLink class="wb-strip__item" :to="{ name: 'workbench-account' }" title="可用优惠券">
      <span class="wb-strip__label">可用券</span>
      <span class="wb-strip__value">{{ couponCount }}</span>
    </RouterLink>
    <div class="wb-strip__item wb-strip__action">
      <TButton
        icon-only
        :loading="refreshing"
        aria-label="刷新"
        title="刷新"
        @click="emit('refresh')"
      >
        <TIcon><Refresh /></TIcon>
      </TButton>
    </div>
  </nav>
</template>

<style scoped>
/* 读数项带跳转：去掉链接默认下划线，hover 时用主色提示可点。
   两条规则必须贴着这四个链接（详见脚本里的说明），别搬回视图。 */
.overview-strip a.wb-strip__item {
  color: inherit;
  text-decoration: none;
}

.overview-strip a.wb-strip__item:hover .wb-strip__value {
  color: var(--73-accent);
}
</style>
