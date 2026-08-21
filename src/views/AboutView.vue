<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setSeoMeta, resetSeoMeta } from '@/utils/seo'

const router = useRouter()
const pageRef = ref<HTMLElement | null>(null)

function goHome() {
  void router.push({ name: 'home' })
}

function goRequirementHall() {
  void router.push({ name: 'requirement-hall' })
}

const highlights = [
  { title: '放作品', desc: '整理好介绍和下载，公开可浏览，能被真正需要的人找到。' },
  { title: '发需求', desc: '写清楚要做什么、预算多少、验收标准是什么，等人来接。' },
  { title: '有留痕', desc: '沟通、签署、进度都留在平台上，合作过程有据可查。' },
]

const facts = [
  { big: '内测中', small: '基础服务免费' },
  { big: '留痕', small: '每一步有记录' },
  { big: '审核', small: '需求人工过一遍' },
  { big: '透明', small: '规则先公示再上线' },
]

const forCreators = [
  { title: '作品有地方放', desc: '不用只躺在聊天记录里，整理好放上来，别人能看、能收藏、能顺着找到你。' },
  { title: '接单在明面上走', desc: '谁做了什么、做到哪一步、改了什么，平台上都看得见，省得来回拉扯。' },
  { title: '交付记录攒下来', desc: '按时交付、好好验收，这些都会留下，慢慢就变成你的信誉。' },
]

const forClients = [
  { title: '需求写清楚就发', desc: '不用挨个找人问能不能做，把事、预算、验收标准写明白，平台审核后进大厅。' },
  { title: '进度看得见', desc: '接单、开发、交付、验收，每一步状态都在，不会干等着不知道进展。' },
  { title: '有事有据可查', desc: '沟通记录、签署记录、交付记录都在，真有问题也不至于空口无凭。' },
]

/* ---- 滚动渐入（监听实际滚动容器，兼容 el-scrollbar） ---- */
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

  // 找到实际的滚动容器：优先 el-scrollbar 的 wrap，否则用 window
  const wrap =
    document.querySelector('.el-scrollbar__wrap') ??
    document.querySelector('.app-scrollbar .el-scrollbar__wrap')

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
      '柒叁信息 73Info 是一个内测中的资源与需求协作平台，优先沉淀 Minecraft、网站开发和小工具资源，支持公开资源浏览、需求发布、沟通记录、工单跟进与合规说明。',
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
        <span class="about-hero__eyebrow">73INFO · 柒叁信息</span>
        <h1 class="about-hero__title">资源与需求<br />协作平台</h1>
        <p class="about-hero__lead">
          做资源的把作品放上来，有需求的把单子发出来。<br />
          两边在同一个地方，作品和需求就能对得上。
        </p>
        <div class="about-hero__actions">
          <button type="button" class="about-hero__btn about-hero__btn--primary" @click="goRequirementHall">
            去需求大厅
          </button>
          <button type="button" class="about-hero__btn about-hero__btn--ghost" @click="goHome">
            浏览资源
          </button>
        </div>
        <p class="about-hero__hint">目前内测中 · 基础服务免费</p>
      </div>
    </section>

    <!-- ===== 2. 平台是什么 ===== -->
    <section class="about-section">
      <div class="about-section__head" data-reveal>
        <h2>这个平台能做什么</h2>
        <p>就三件事，不绕弯子</p>
      </div>
      <div class="about-highlights">
        <div v-for="(item, idx) in highlights" :key="item.title" class="about-highlight" :data-reveal="`h${idx}`">
          <span class="about-highlight__bar" aria-hidden="true"></span>
          <div class="about-highlight__text">
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 3. 数据 ===== -->
    <section class="about-facts">
      <div v-for="(fact, idx) in facts" :key="fact.big" class="about-fact" :data-reveal="`f${idx}`">
        <strong class="about-fact__big">{{ fact.big }}</strong>
        <span class="about-fact__small">{{ fact.small }}</span>
      </div>
    </section>

    <!-- ===== 4. 给创作者 / 给需求方 ===== -->
    <section class="about-split">
      <div class="about-split__col" data-reveal>
        <span class="about-split__kicker">FOR CREATORS</span>
        <h2>如果你是做资源的</h2>
        <ul class="about-point-list">
          <li v-for="item in forCreators" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </li>
        </ul>
      </div>
      <div class="about-split__col" data-reveal>
        <span class="about-split__kicker">FOR CLIENTS</span>
        <h2>如果你有需求要找人做</h2>
        <ul class="about-point-list">
          <li v-for="item in forClients" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- ===== 5. 关于我们 ===== -->
    <section class="about-section about-section--story">
      <div class="about-section__head" data-reveal>
        <h2>关于这个平台</h2>
      </div>
      <div class="about-story" data-reveal>
        <p>
          柒叁信息，域名 73info.cn。最早是把自己做的一些 Minecraft 的东西、小工具放出来，
          后来发现很多人有类似的需求：做出来的东西没地方放，想找人做点事又不知道找谁。
          干脆把这两件事放在一个平台上。
        </p>
        <p>
          现在还在内测，功能在一点点加。方向很明确：
          作品有地方展示，需求能找到人做，合作过程有记录。
        </p>
        <p class="about-story__note">
          资金托管、交易担保这类需要资质的服务，现在没有做。以后做不做、怎么做，都会先公示规则再上线。
        </p>
      </div>
    </section>

    <!-- ===== 6. 加入我们 ===== -->
    <section class="about-join">
      <div class="about-join__shine" aria-hidden="true"></div>
      <div class="about-join__inner">
        <h2>这个平台，是靠人用起来的</h2>
        <p>
          有作品，欢迎来发；有需求，欢迎来提；觉得哪里不对，也欢迎直接说。
          邮件和工单都行，看到了都会回。
        </p>
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
  width: min(980px, calc(100% - 40px));
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

.about-hero__eyebrow {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.about-hero__title {
  margin: 22px 0 16px;
  font-size: clamp(36px, 5.6vw, 54px);
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: #fff;
}

.about-hero__lead {
  margin: 0;
  font-size: 16px;
  line-height: 1.95;
  color: rgba(226, 232, 240, 0.94);
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

.about-section__head p {
  margin: 6px 0 0;
  font-size: 14px;
  color: #64748b;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.about-split__kicker {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #2563eb;
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

/* ===== 响应式 ===== */
@media (max-width: 820px) {
  .about-page {
    width: calc(100% - 28px);
    padding: 16px 0 36px;
  }

  .about-hero {
    padding: 40px 26px;
    border-radius: 18px;
  }

  .about-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .about-split {
    grid-template-columns: 1fr;
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
