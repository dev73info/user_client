<script setup lang="ts">
import '@/styles/about-story.css'
/** 关于我们 / 故事区。 */
defineProps<{
  heading: string
  paragraphs: string[]
  note: string
}>()
</script>

<template>
  <section class="about-section about-section--story">
    <div class="about-section__head" data-reveal>
      <h2>{{ heading }}</h2>
    </div>
    <div class="about-story" data-reveal>
      <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      <p class="about-story__note">{{ note }}</p>
    </div>
  </section>
</template>
