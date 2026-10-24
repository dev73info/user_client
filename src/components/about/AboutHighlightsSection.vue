<script setup lang="ts">
import '@/styles/about-highlights.css'
/**
 * 关于我们 /「平台是什么」三条亮点。
 *
 * `data-reveal` 由本组件自己渲染：父级的滚动渐入靠 `querySelectorAll('[data-reveal]')` 找元素，
 * 属性落在子组件内部也能被找到，但必须由组件写出——漏了就是「渐入永远不触发」且不报错。
 */
defineProps<{
  heading: string
  items: { title: string; text: string }[]
}>()
</script>

<template>
  <section class="about-section">
    <div class="about-section__head" data-reveal>
      <h2>{{ heading }}</h2>
    </div>
    <div class="about-highlights">
      <div
        v-for="(item, idx) in items"
        :key="item.title"
        class="about-highlight"
        :data-reveal="`h${idx}`"
      >
        <span class="about-highlight__bar" aria-hidden="true"></span>
        <div class="about-highlight__text">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
