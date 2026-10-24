<script setup lang="ts">
import '@/styles/about-facts.css'
/** 关于我们 / 数据墙。列数由样式决定（基础 2 列 → ≤640 单列 → ≥1180 四列），组件不管布局。 */
defineProps<{
  items: { big: string; small: string }[]
}>()
</script>

<template>
  <section class="about-facts">
    <div v-for="(fact, idx) in items" :key="fact.big" class="about-fact" :data-reveal="`f${idx}`">
      <strong class="about-fact__big">{{ fact.big }}</strong>
      <span class="about-fact__small">{{ fact.small }}</span>
    </div>
  </section>
</template>
