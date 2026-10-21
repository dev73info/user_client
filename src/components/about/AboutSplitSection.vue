<script setup lang="ts">
import '@/styles/about-split.css'
/** 关于我们 / 双视角对照（给创作者 / 给需求方）。两列内容结构相同，故做成同一组 props。 */
type SplitColumn = {
  heading: string
  items: { title: string; text: string }[]
}

defineProps<{
  columns: SplitColumn[]
}>()
</script>

<template>
  <section class="about-split">
    <div v-for="column in columns" :key="column.heading" class="about-split__col" data-reveal>
      <h2>{{ column.heading }}</h2>
      <ul class="about-point-list">
        <li v-for="item in column.items" :key="item.title">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>
