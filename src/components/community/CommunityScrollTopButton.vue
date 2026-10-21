<script setup lang="ts">
import { TIcon, Top } from 'ui_73info'

/**
 * 社区页右下角的「回到顶部」浮按钮。
 *
 * 零耦合：只收一个布尔（出不出）和一个不带载荷的事件（被点了），**不碰**滚动容器、
 * 不认识社区、也不认识路由——滚回顶部那 10 行（含 `document.querySelector` 摸 App 外壳）
 * 仍留在 `CommunityView.vue` 里，原样不动。
 *
 * 样式也留在视图的 `<style scoped>` 里（`.community-scroll-top`，含 920px 那档断点）：
 * 父组件的 scoped 样式会作用到子组件根节点，把样式搬过来反而要重写断点。
 */
defineProps<{ visible: boolean }>()

const emit = defineEmits<{ scroll: [] }>()
</script>

<template>
  <button
    v-if="visible"
    class="community-scroll-top"
    type="button"
    aria-label="回到顶部"
    title="回到顶部"
    @click="emit('scroll')"
  >
    <TIcon>
      <Top />
    </TIcon>
  </button>
</template>
