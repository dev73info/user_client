<script setup lang="ts">
import '@/styles/about-hero.css'
/**
 * 关于我们 / 首屏。
 *
 * 纯展示：文案由父级从 `shared/legalContent` 传入；两个 CTA 只 emit，路由动作留在视图
 * （组件不碰 router，四端共用组件时也不用改）。
 */
defineProps<{
  /** 标题分行（第一行不带 `<br>`）。 */
  lines: string[]
  hint: string
}>()

const emit = defineEmits<{
  primary: []
  secondary: []
}>()
</script>

<template>
  <section class="about-hero">
    <div class="about-hero__glow" aria-hidden="true"></div>
    <div class="about-hero__inner">
      <h1 class="about-hero__title">
        <template v-for="(line, index) in lines" :key="line">
          <br v-if="index > 0" />{{ line }}
        </template>
      </h1>
      <div class="about-hero__actions">
        <button
          type="button"
          class="about-hero__btn about-hero__btn--primary"
          @click="emit('primary')"
        >
          去需求大厅
        </button>
        <button
          type="button"
          class="about-hero__btn about-hero__btn--ghost"
          @click="emit('secondary')"
        >
          浏览资源
        </button>
      </div>
      <p class="about-hero__hint">{{ hint }}</p>
    </div>
  </section>
</template>
