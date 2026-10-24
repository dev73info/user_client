<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setSeoMeta, resetSeoMeta } from '@/utils/seo'
import AboutFactsSection from '@/components/about/AboutFactsSection.vue'
import AboutHeroSection from '@/components/about/AboutHeroSection.vue'
import AboutHighlightsSection from '@/components/about/AboutHighlightsSection.vue'
import AboutJoinSection from '@/components/about/AboutJoinSection.vue'
import AboutSplitSection from '@/components/about/AboutSplitSection.vue'
import AboutStorySection from '@/components/about/AboutStorySection.vue'
import { aboutContent } from '@/shared/legalContent'
import '@/styles/about-page.css'

const router = useRouter()
const pageRef = ref<HTMLElement | null>(null)

function goHome() {
  void router.push({ name: 'home' })
}

function goRequirementHall() {
  void router.push({ name: 'requirement-hall' })
}

// 文案出自 src/shared/legalContent.json：SPA 与构建期静态快照（generate-seo-pages.mjs）共用同一份文案。
const { highlights, facts, forCreators, forClients, story, join } = aboutContent

/* ---- 滚动渐入（监听实际滚动容器，即 TScrollbar 的 wrap） ---- */
let revealEls: Element[] = []
let scrollCleanup: (() => void) | null = null

function revealCheck(): void {
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
  let changed = false
  for (const el of revealEls) {
    if (el.classList.contains('is-revealed')) {
      continue
    }
    const rect = el.getBoundingClientRect()
    // getBoundingClientRect 相对视口，滚动容器内的滚动也会改变它
    if (rect.top <= viewportH - 64 && rect.bottom >= 0) {
      el.classList.add('is-revealed')
      changed = true
    }
  }
  if (changed && revealEls.every((el) => el.classList.contains('is-revealed'))) {
    cleanupReveal()
  }
}

function cleanupReveal(): void {
  if (scrollCleanup) {
    scrollCleanup()
    scrollCleanup = null
  }
}

function setupReveal(): void {
  revealEls = Array.from(pageRef.value?.querySelectorAll('[data-reveal]') ?? [])
  if (!revealEls.length) {
    return
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  if (reduced) {
    revealEls.forEach((el) => el.classList.add('is-revealed'))
    return
  }

  // 找到实际的滚动容器：门户外壳的滚动在 TScrollbar 的 wrap 上，找不到才退回 window
  const wrap =
    document.querySelector('.app-scrollbar .t73-scrollbar__wrap') ??
    document.querySelector('.t73-scrollbar__wrap')

  const onScroll = () => revealCheck()
  if (wrap) {
    wrap.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    scrollCleanup = () => {
      wrap.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  } else {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    scrollCleanup = () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }

  // 立即检查首屏，并延迟再查一次（等布局稳定）
  revealCheck()
  window.setTimeout(() => revealCheck(), 300)
}
/* ---- 滚动渐入结束 ---- */

onMounted(async () => {
  setSeoMeta({
    title: '关于我们 - 73Info 柒叁信息',
    description:
      '柒叁信息 73Info 是一个内测中的资源与需求协作平台，优先沉淀网站开发和小工具资源，支持公开资源浏览、需求发布、沟通记录、工单跟进与合规说明。',
    path: '/about',
  })

  await nextTick()
  setupReveal()
})

onBeforeUnmount(() => {
  cleanupReveal()
  resetSeoMeta()
})
</script>

<template>
  <main ref="pageRef" class="about-page">
    <AboutHeroSection
      :lines="aboutContent.heroLines"
      :hint="aboutContent.hint"
      @primary="goRequirementHall"
      @secondary="goHome"
    />
    <AboutHighlightsSection :heading="highlights.heading" :items="highlights.items" />
    <AboutFactsSection :items="facts.items" />
    <AboutSplitSection :columns="[forCreators, forClients]" />
    <AboutStorySection :heading="story.heading" :paragraphs="story.paragraphs" :note="story.note" />
    <AboutJoinSection :heading="join.heading" :text="join.text" contact-email="fanbo@73info.cn" />
  </main>
</template>
