<script setup lang="ts">
/**
 * 门户首页主视觉 + 移动端入口宫格（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 纯展示组件：两颗主按钮与宫格里的四个入口都只回抛事件，跳哪、是否已登录、
 * 开发者账号看到「发布资源」还是「发布需求」，全部由视图决定（本组件不碰 store / router）。
 * 样式仍在全局 `styles/home.css`（`.portal-hero*` / `.portal-entry*`），本组件不带 `<style>`。
 */
withDefaults(
  defineProps<{
    /** 主视觉下方的一排信号词 */
    signals: readonly string[]
    /** 开发者账号的 CTA 是「发布资源」，普通用户是「发布需求」 */
    isDeveloperAccount: boolean
    /** 第二颗按钮文案：开发者「我要接单」，普通用户「成为开发者」 */
    devActionLabel: string
  }>(),
  { signals: () => [] },
)

const emit = defineEmits<{
  (e: 'publish'): void
  (e: 'dev-workbench'): void
  (e: 'free-resources'): void
  (e: 'community'): void
}>()
</script>

<template>
  <section class="portal-hero">
    <div class="portal-hero__main">
      <div class="portal-hero__copy">
        <h1>
          <span>资源与需求</span><span class="portal-title-accent">协作</span><span>平台</span>
        </h1>

        <div v-if="signals.length" class="portal-signal-list">
          <span v-for="signal in signals" :key="signal" class="portal-signal">{{ signal }}</span>
        </div>

        <div class="portal-hero__actions">
          <button
            class="portal-primary-action portal-publish-action"
            type="button"
            @click="emit('publish')"
          >
            {{ isDeveloperAccount ? '发布资源' : '发布需求' }}
          </button>
          <button class="portal-secondary-action" type="button" @click="emit('dev-workbench')">
            {{ devActionLabel }}
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- 移动端入口宫格：替代主视觉里的两颗按钮与下方两张大卡片，一个图标配一行字、上下排；
       主视觉在移动端只留作横幅（后期改轮播图） -->
  <nav class="portal-entry-grid" aria-label="快捷入口">
    <button type="button" class="portal-entry portal-entry--publish" @click="emit('publish')">
      <span class="portal-entry__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
        </svg>
      </span>
      <span class="portal-entry__label">{{ isDeveloperAccount ? '发布资源' : '发布需求' }}</span>
    </button>
    <button type="button" class="portal-entry portal-entry--take" @click="emit('dev-workbench')">
      <span class="portal-entry__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
        </svg>
      </span>
      <span class="portal-entry__label">{{ devActionLabel }}</span>
    </button>
    <button type="button" class="portal-entry portal-entry--free" @click="emit('free-resources')">
      <span class="portal-entry__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </svg>
      </span>
      <span class="portal-entry__label">免费资源</span>
    </button>
    <button type="button" class="portal-entry portal-entry--community" @click="emit('community')">
      <span class="portal-entry__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
      </span>
      <span class="portal-entry__label">社区交流</span>
    </button>
  </nav>
</template>
