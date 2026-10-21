<script setup lang="ts">
/**
 * 总览右侧的「快捷入口」面板：四个开发者侧入口，纯站内链接，没有数据也没有事件。
 *
 * 移动端整列由视图收起（`.overview-side-stack` 在 `@760` 里 `display: none`），
 * 所以这里那两条移动端断点原本就画在一条 `display: none` 的父级上，不生效，已随拆分删掉。
 */
</script>

<template>
  <section class="overview-panel">
    <div class="overview-section-head overview-section-head--compact">
      <div>
        <h2>快捷入口</h2>
      </div>
    </div>
    <div class="overview-dev-links">
      <RouterLink :to="{ name: 'dev-plugins' }">资源初始化</RouterLink>
      <RouterLink :to="{ name: 'dev-requirement-hall' }">需求大厅</RouterLink>
      <RouterLink :to="{ name: 'dev-wallet' }">收益钱包</RouterLink>
      <RouterLink :to="{ name: 'dev-my-requirements' }">我的接单</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.overview-dev-links {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-dev-links a {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 14px;
  background: #ffffff;
  color: #0f172a;
  text-decoration: none;
  font-size: 13px;
  font-weight: 800;
}

.overview-dev-links a:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: #f8fbff;
  color: #1d4ed8;
}
</style>
