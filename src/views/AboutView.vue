<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setSeoMeta, resetSeoMeta } from '@/utils/seo'
import { aboutContent } from '@/shared/legalContent'

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
    <!-- ===== 1. Hero ===== -->
    <section class="about-hero">
      <div class="about-hero__glow" aria-hidden="true"></div>
      <div class="about-hero__inner">
        <h1 class="about-hero__title">
          <template v-for="(line, index) in aboutContent.heroLines" :key="line">
            <br v-if="index > 0" />{{ line }}
          </template>
        </h1>
        <div class="about-hero__actions">
          <button type="button" class="about-hero__btn about-hero__btn--primary" @click="goRequirementHall">
            去需求大厅
          </button>
          <button type="button" class="about-hero__btn about-hero__btn--ghost" @click="goHome">
            浏览资源
          </button>
        </div>
        <p class="about-hero__hint">{{ aboutContent.hint }}</p>
      </div>
    </section>

    <!-- ===== 2. 平台是什么 ===== -->
    <section class="about-section">
      <div class="about-section__head" data-reveal>
        <h2>{{ highlights.heading }}</h2>
      </div>
      <div class="about-highlights">
        <div v-for="(item, idx) in highlights.items" :key="item.title" class="about-highlight" :data-reveal="`h${idx}`">
          <span class="about-highlight__bar" aria-hidden="true"></span>
          <div class="about-highlight__text">
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 3. 数据 ===== -->
    <section class="about-facts">
      <div v-for="(fact, idx) in facts.items" :key="fact.big" class="about-fact" :data-reveal="`f${idx}`">
        <strong class="about-fact__big">{{ fact.big }}</strong>
        <span class="about-fact__small">{{ fact.small }}</span>
      </div>
    </section>

    <!-- ===== 4. 给创作者 / 给需求方 ===== -->
    <section class="about-split">
      <div class="about-split__col" data-reveal>
        <h2>{{ forCreators.heading }}</h2>
        <ul class="about-point-list">
          <li v-for="item in forCreators.items" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </li>
        </ul>
      </div>
      <div class="about-split__col" data-reveal>
        <h2>{{ forClients.heading }}</h2>
        <ul class="about-point-list">
          <li v-for="item in forClients.items" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- ===== 5. 关于我们 ===== -->
    <section class="about-section about-section--story">
      <div class="about-section__head" data-reveal>
        <h2>{{ story.heading }}</h2>
      </div>
      <div class="about-story" data-reveal>
        <p v-for="(paragraph, index) in story.paragraphs" :key="index">{{ paragraph }}</p>
        <p class="about-story__note">{{ story.note }}</p>
      </div>
    </section>

    <!-- ===== 6. 加入我们 ===== -->
    <section class="about-join">
      <div class="about-join__shine" aria-hidden="true"></div>
      <div class="about-join__inner">
        <h2>{{ join.heading }}</h2>
        <p>{{ join.text }}</p>
        <div class="about-join__actions">
          <a class="about-join__btn" href="mailto:fanbo@73info.cn">fanbo@73info.cn</a>
          <router-link class="about-join__btn about-join__btn--ghost" to="/tickets">工单中心</router-link>
        </div>
      </div>
    </section>

  </main>
</template>

<style scoped>
/* ===== 基础 ===== */
.about-page {
  /* R047：内容区由 980 放宽到 1120。980 时数据墙 4 列每格只有 ≤234px，而「641–899 排 2 列」又要求
     每格 ≥243px，两个条件互斥——光调 minmax 无解（试过 220/250 都有一头塌），只能先放开容器：
     1120 下 4 列每格 ~269px，平板档 2 列每格 ~280px 起，栅格才有解。 */
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 28px 0 56px;
  font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif;
}

/* 滚动渐入（配合 data-reveal） */
[data-reveal] {
  opacity: 0;
  transform: translateY(22px);
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}

[data-reveal].is-revealed {
  opacity: 1;
  transform: translateY(0);
}

/* ===== 1. Hero ===== */
.about-hero {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 64px 56px;
  color: #f8fafc;
  background: linear-gradient(135deg, #0b1f3a, #123a63 55%, #155e75);
  box-shadow: 0 26px 64px rgba(15, 37, 71, 0.32);
  animation: about-hero-in 0.8s ease both;
}

@keyframes about-hero-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.about-hero__glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(600px 260px at 88% -10%, rgba(56, 189, 248, 0.3), transparent 60%),
    radial-gradient(500px 300px at 0% 115%, rgba(251, 191, 36, 0.14), transparent 55%);
  animation: about-glow-drift 9s ease-in-out infinite alternate;
  pointer-events: none;
}

@keyframes about-glow-drift {
  from {
    transform: translateX(-2%) translateY(0);
    opacity: 0.85;
  }
  to {
    transform: translateX(2%) translateY(-2%);
    opacity: 1;
  }
}

.about-hero__inner {
  position: relative;
  z-index: 1;
  max-width: 640px;
}

.about-hero__title {
  margin: 22px 0 16px;
  font-size: clamp(36px, 5.6vw, 54px);
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: #fff;
}

.about-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.about-hero__btn {
  padding: 13px 26px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.about-hero__btn--primary {
  color: #0b1f3a;
  background: #fbbf24;
}

.about-hero__btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(251, 191, 36, 0.4);
}

.about-hero__btn--ghost {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.22);
}

.about-hero__btn--ghost:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: translateY(-2px);
}

.about-hero__hint {
  margin: 24px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.85);
}

/* ===== 通用区块 ===== */
.about-section {
  margin: 18px 0;
  padding: 34px 36px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(219, 229, 247, 0.9);
  box-shadow: 0 12px 32px rgba(148, 163, 184, 0.08);
}

.about-section__head {
  margin-bottom: 22px;
}

.about-section__head h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

/* ===== 2. 三件事 ===== */
.about-highlights {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-highlight {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 14px;
  background: #f8fbff;
  border: 1px solid rgba(219, 229, 247, 0.9);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.about-highlight:hover {
  transform: translateX(4px);
  border-color: rgba(37, 99, 235, 0.3);
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.1);
}

.about-highlight__bar {
  flex: 0 0 auto;
  width: 4px;
  height: 46px;
  border-radius: 999px;
  background: linear-gradient(180deg, #2563eb, #60a5fa);
}

.about-highlight__text h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}

.about-highlight__text p {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: #64748b;
}

/* ===== 3. 数据 ===== */
.about-facts {
  display: grid;
  /* 列数不在这里定：全页列宽统一写在文末「统一栅格与响应式」一节。 */
  gap: 14px;
  margin: 18px 0;
}

.about-fact {
  padding: 26px 16px;
  text-align: center;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff, #eef4ff);
  border: 1px solid rgba(191, 219, 254, 0.8);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.about-fact:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 34px rgba(37, 99, 235, 0.12);
}

.about-fact__big {
  display: block;
  font-size: 30px;
  font-weight: 900;
  color: #123a63;
  letter-spacing: -0.01em;
}

.about-fact__small {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

/* ===== 4. 左右两栏 ===== */
.about-split {
  display: grid;
  /* 列数同样见文末「统一栅格与响应式」：基础态单列，≥900 才并排。 */
  gap: 18px;
  margin: 18px 0;
}

.about-split__col {
  padding: 30px 28px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(219, 229, 247, 0.9);
  box-shadow: 0 12px 32px rgba(148, 163, 184, 0.08);
}

.about-split__col h2 {
  margin: 0 0 18px;
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}

.about-point-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.about-point-list li {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.9);
  transition: transform 160ms ease, border-color 160ms ease;
}

.about-point-list li:hover {
  transform: translateY(-2px);
  border-color: rgba(37, 99, 235, 0.3);
}

.about-point-list h3 {
  margin: 0 0 5px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.about-point-list p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.75;
  color: #64748b;
}

/* ===== 5. 关于我们 ===== */
.about-section--story {
  background: #f8fbff;
  border-color: rgba(191, 219, 254, 0.7);
}

.about-story p {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 2;
  color: #334155;
}

.about-story p:last-child {
  margin-bottom: 0;
}

.about-story__note {
  margin-top: 4px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.8);
  border: 1px solid rgba(191, 219, 254, 0.6);
  font-size: 13.5px;
  color: #1e3a5f;
}

/* ===== 6. 加入我们 ===== */
.about-join {
  position: relative;
  overflow: hidden;
  margin-top: 18px;
  padding: 48px 40px;
  text-align: center;
  border-radius: 20px;
  color: #f8fafc;
  background: linear-gradient(135deg, #0b1f3a, #155e75);
  box-shadow: 0 20px 52px rgba(15, 37, 71, 0.3);
}

.about-join__shine {
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.12), transparent);
  transform: skewX(-18deg);
  animation: about-shine 5.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes about-shine {
  0% {
    left: -40%;
  }
  55%,
  100% {
    left: 130%;
  }
}

.about-join__inner {
  position: relative;
  z-index: 1;
  max-width: 620px;
  margin: 0 auto;
}

.about-join h2 {
  margin: 0 0 14px;
  font-size: 25px;
  font-weight: 800;
  color: #fff;
}

.about-join p {
  margin: 0 auto 26px;
  max-width: 520px;
  font-size: 15px;
  line-height: 1.9;
  color: rgba(226, 232, 240, 0.92);
}

.about-join__actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
}

.about-join__btn {
  padding: 12px 22px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  color: #0b1f3a;
  background: #fbbf24;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.about-join__btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(251, 191, 36, 0.4);
}

.about-join__btn--ghost {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.about-join__btn--ghost:hover {
  background: rgba(255, 255, 255, 0.18);
}

/* ===== 统一栅格与响应式 =====
   R047：全页列宽只在这一节定义，各区块不再各自算一套 px 预算。档位只用 640 / 900 / 1180，
   轨道统一 minmax(0, 1fr)（长内容不会把轨道撑破），列数随容器宽度单向递增、不来回翻：
     数据墙：≤640 单列 · 641–1179 两列 · ≥1180 四列
     双栏　：<900 单列　· ≥900 起并排两列 */
.about-facts {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.about-split {
  grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 640px) {
  /* 栅格：手机档全部单列 */
  .about-facts {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 补白：容器与卡片同步收窄（数值沿用原样） */
  .about-page {
    width: calc(100% - 28px);
    padding: 16px 0 36px;
  }

  .about-hero {
    padding: 40px 26px;
    border-radius: 18px;
  }

  .about-section {
    padding: 24px 20px;
    border-radius: 16px;
  }

  .about-join {
    padding: 36px 22px;
    border-radius: 16px;
  }
}

@media (min-width: 900px) {
  /* 栅格：双栏够宽才并排，每栏 ≥417px（852 内容宽 - 18 间隙 的一半） */
  .about-split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  /* 栅格：容器满 1120 后数据墙升四列，每格 ~269px；再窄就只有两列 */
  .about-facts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* 无障碍：用户偏好减少动效时禁用动画 */
@media (prefers-reduced-motion: reduce) {
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .about-hero,
  .about-hero__glow,
  .about-join__shine {
    animation: none;
  }
}
</style>
