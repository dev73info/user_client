<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { TIcon, Top } from 'ui_73info'

/**
 * 社区页右下角的「回到顶部」浮按钮。
 *
 * 自包含：滚动容器的监听、「出不出」的判定（240px 阈值）与滚回顶部都在这里，
 * 视图只负责把这个组件放上页面。
 *
 * 唯一的耦合就是那个选择器——`.app-scrollbar .t73-scrollbar__wrap` 是 App 外壳的硬编码 DOM
 * （真正的滚动发生在它身上，不是 window）。R047 第三轮把它从视图搬进本组件：
 * 之前留在视图的理由是「scoped 样式只能命中子组件根节点」，而第三轮社区页的视觉规则
 * 整块去了 `styles/portal-pages.css`，这个理由也就不存在了，判定与动作跟着按钮走更近。
 */
const visible = ref(false)

function scrollWrap(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
}

function updateVisibility() {
  const wrap = scrollWrap()
  visible.value = Boolean(wrap && wrap.scrollTop > 240)
}

function backToTop() {
  const wrap = scrollWrap()
  if (wrap) {
    wrap.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  // 捕获阶段：App 外壳的滚动不冒泡到 window，必须用 capture 才收得到
  window.addEventListener('scroll', updateVisibility, true)
  updateVisibility()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateVisibility, true)
})
</script>

<template>
  <button
    v-if="visible"
    class="community-scroll-top"
    type="button"
    aria-label="回到顶部"
    title="回到顶部"
    @click="backToTop"
  >
    <TIcon>
      <Top />
    </TIcon>
  </button>
</template>
