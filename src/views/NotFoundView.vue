<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

const route = useRoute()
const router = useRouter()

// 把用户实际访问的地址原样回显：地址抄错还是内容下架，看到路径就能自己判断
const attemptedPath = computed(() => route.fullPath || '/')

// 站内点进来时 history 里有上一页；直接粘贴地址打开时没有，此时不给「返回」按钮
const canGoBack = computed(() => {
  if (typeof window === 'undefined') {
    return false
  }
  return window.history.length > 1
})

function goHome() {
  void router.push({ name: 'home' })
}

function goRequirementHall() {
  void router.push({ name: 'requirement-hall' })
}

function goBack() {
  router.back()
}

onMounted(() => {
  setSeoMeta({
    title: '页面不存在 - 73Info 柒叁信息',
    description: '这个地址没有对应的页面，可能是链接不完整或内容已经下架。',
    path: attemptedPath.value,
    noindex: true,
  })
})

onBeforeUnmount(() => {
  resetSeoMeta()
})
</script>

<template>
  <main class="not-found-page">
    <section class="not-found-card">
      <p class="not-found-code" aria-hidden="true">404</p>
      <h1 class="not-found-title">页面不存在</h1>
      <p class="not-found-desc">
        这个地址没有对应的页面。可能是链接复制时漏了一段，也可能是内容已经下架或改了名字。
      </p>

      <p class="not-found-path">
        <span class="not-found-path__label">你访问的地址</span>
        <code class="not-found-path__value">{{ attemptedPath }}</code>
      </p>

      <div class="not-found-actions">
        <button type="button" class="not-found-btn not-found-btn--primary" @click="goHome">
          回到首页
        </button>
        <button type="button" class="not-found-btn" @click="goRequirementHall">
          去需求大厅
        </button>
        <button v-if="canGoBack" type="button" class="not-found-btn not-found-btn--ghost" @click="goBack">
          返回上一页
        </button>
      </div>

      <p class="not-found-hint">
        如果是从站内链接点进来的，欢迎到<router-link to="/tickets">工单中心</router-link>说一声，我们好把它修掉。
      </p>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(720px, calc(100% - 40px));
  min-height: 62vh;
  margin: 0 auto;
  padding: 40px 0 64px;
  font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif;
}

.not-found-card {
  width: 100%;
  padding: 44px 40px 40px;
  text-align: center;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(219, 229, 247, 0.9);
  box-shadow: 0 18px 44px rgba(148, 163, 184, 0.14);
}

.not-found-code {
  margin: 0;
  font-size: clamp(56px, 12vw, 88px);
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #0b1f3a, #2563eb 60%, #60a5fa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.not-found-title {
  margin: 14px 0 12px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #0f172a;
}

.not-found-desc {
  margin: 0 auto;
  max-width: 460px;
  font-size: 14.5px;
  line-height: 1.9;
  color: #64748b;
}

.not-found-path {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  margin: 22px auto 0;
  max-width: 520px;
  padding: 12px 16px;
  border-radius: 12px;
  background: #f8fbff;
  border: 1px solid rgba(191, 219, 254, 0.7);
}

.not-found-path__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.not-found-path__value {
  max-width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #1e3a5f;
  overflow-wrap: anywhere;
}

.not-found-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 26px;
}

.not-found-btn {
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  color: #1e3a5f;
  background: #eef4ff;
  border: 1px solid rgba(191, 219, 254, 0.9);
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.not-found-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.14);
}

.not-found-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  border-color: transparent;
}

.not-found-btn--ghost {
  color: #64748b;
  background: transparent;
  border-color: rgba(203, 213, 225, 0.9);
}

.not-found-hint {
  margin: 26px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: #94a3b8;
}

.not-found-hint a {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
}

.not-found-hint a:hover {
  text-decoration: underline;
}

@media (max-width: 820px) {
  .not-found-page {
    width: calc(100% - 28px);
    padding: 24px 0 40px;
  }

  .not-found-card {
    padding: 32px 22px 28px;
    border-radius: 16px;
  }

  .not-found-btn {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .not-found-btn {
    transition: none;
  }

  .not-found-btn:hover {
    transform: none;
  }
}
</style>
