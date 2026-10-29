<script setup lang="ts">
import { Box, Compass, Document, EditPen, Files, Suitcase, TIcon, Tickets, Wallet } from 'ui_73info'

/**
 * 头像卡里的移动端快捷入口：App 式宫格图标，顶替右侧「快捷入口」面板（该面板移动端隐藏）。
 * 第一行是需求方自己的事（发需求 → 看定制 → 签合同 → 开发票），
 * 第二行是开发者侧（找需求 → 接单 → 做资源 → 收钱），各按做事先后排。
 * 只在 640 档出现（见 `profile-quick-nav.css`）。
 */
</script>

<template>
  <nav class="overview-hero__quick" aria-label="快捷入口">
    <!-- 带 modal=publish 回到总览即弹出发布需求窗口（watch 在 `useProfilePublishRequirement` 里），
         关闭时会清掉这个参数 -->
    <RouterLink :to="{ name: 'workbench', query: { view: 'profile', modal: 'publish' } }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><EditPen /></TIcon
      ></span>
      <span>我有需求</span>
    </RouterLink>
    <RouterLink :to="{ name: 'workbench-requirements' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Suitcase /></TIcon
      ></span>
      <span>我的定制</span>
    </RouterLink>
    <RouterLink :to="{ name: 'workbench-signatures' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Files /></TIcon
      ></span>
      <span>我的合同</span>
    </RouterLink>
    <RouterLink :to="{ name: 'workbench-invoices' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Document /></TIcon
      ></span>
      <span>我的发票</span>
    </RouterLink>
    <RouterLink :to="{ name: 'dev-requirement-hall' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Compass /></TIcon
      ></span>
      <span>需求大厅</span>
    </RouterLink>
    <RouterLink :to="{ name: 'dev-my-requirements' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Tickets /></TIcon
      ></span>
      <span>我的接单</span>
    </RouterLink>
    <RouterLink :to="{ name: 'dev-plugins' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Box /></TIcon
      ></span>
      <span>资源初始化</span>
    </RouterLink>
    <RouterLink :to="{ name: 'dev-wallet' }">
      <span class="overview-hero__quick-icon"
        ><TIcon :size="22"><Wallet /></TIcon
      ></span>
      <span>收益钱包</span>
    </RouterLink>
  </nav>
</template>

<style scoped src="./profile-quick-nav.css"></style>
