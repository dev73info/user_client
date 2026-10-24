<script setup lang="ts">
import '@/styles/about-join.css'
/** 关于我们 / 加入我们。联系邮箱与工单中心是站内固定入口，不随内容配置变化。 */
defineProps<{
  heading: string
  text: string
  contactEmail: string
}>()
</script>

<template>
  <section class="about-join">
    <div class="about-join__shine" aria-hidden="true"></div>
    <div class="about-join__inner">
      <h2>{{ heading }}</h2>
      <p>{{ text }}</p>
      <div class="about-join__actions">
        <a class="about-join__btn" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        <router-link class="about-join__btn about-join__btn--ghost" to="/tickets"
          >工单中心</router-link
        >
      </div>
    </div>
  </section>
</template>
