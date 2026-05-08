<script setup lang="ts">
import type { PropType } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

import { DEV_PORTAL_URL } from '@/config/runtime'

type NavLink = {
  label: string
  to?: RouteLocationRaw
  href?: string
  active?: boolean
  align?: 'left' | 'right'
}

function isExternalHref(href?: string): boolean {
  return typeof href === 'string' && /^https?:\/\//.test(href)
}

function isDevPortalHref(href?: string): boolean {
  if (!href) {
    return false
  }

  try {
    const hrefUrl = new URL(href, window.location.origin)
    const devPortalUrl = new URL(DEV_PORTAL_URL, window.location.origin)
    return hrefUrl.origin === devPortalUrl.origin
  } catch {
    return false
  }
}

function shouldOpenInNewTab(href?: string): boolean {
  return isExternalHref(href) && !isDevPortalHref(href)
}

defineProps({
  isAuthed: { type: Boolean, default: false },
  username: { type: String, default: '' },
  menuOpen: { type: Boolean, default: false },
  navLinks: { type: Array as PropType<NavLink[]>, default: () => [] },
})

const emit = defineEmits<{
  (e: 'open-auth', mode: 'login' | 'register'): void
  (e: 'toggle-user-menu'): void
  (e: 'go-profile'): void
  (e: 'logout'): void
  (e: 'publish'): void
  (e: 'refresh'): void
}>()
</script>

<template>
  <section class="hero">
    <div class="hero-top page-header">
      <div class="brand-mark" aria-label="73Info">
        <span class="brand-dot" aria-hidden="true"></span>
        <span class="brand-text">柒叁信息</span>
      </div>
      <div class="header-actions">
        <template v-if="!isAuthed">
          <button class="auth-btn solid" type="button" @click="emit('open-auth', 'login')">登录 / 注册</button>
        </template>
        <template v-else>
          <div class="user-menu-wrapper">
            <button class="auth-btn user-pill" type="button" @click.stop="emit('toggle-user-menu')" title="用户菜单">
              {{ username || '已登录用户' }}
            </button>
            <div class="user-menu" :class="{ open: menuOpen }" aria-label="用户菜单">
              <button class="user-menu-item" type="button" @click="emit('go-profile')">统一工作台</button>
              <div class="menu-divider"></div>
              <button class="user-menu-item danger" type="button" @click="emit('logout')">退出登录</button>
            </div>
          </div>
        </template>
      </div>
    </div>
    <div class="hero-row" v-if="navLinks.length">
      <nav class="nav-links">
        <template v-for="link in navLinks" :key="link.label">
          <RouterLink v-if="link.to" :to="link.to" class="brand-link"
            :class="[{ active: link.active }, link.align === 'right' ? 'brand-link--push-right' : '']">
            {{ link.label }}
          </RouterLink>
          <a v-else :href="link.href || '#'" class="brand-link"
            :class="[{ active: link.active }, link.align === 'right' ? 'brand-link--push-right' : '']"
            :target="shouldOpenInNewTab(link.href) ? '_blank' : undefined"
            :rel="shouldOpenInNewTab(link.href) ? 'noopener noreferrer' : undefined">
            {{ link.label }}
          </a>
        </template>
      </nav>
    </div>
    <div class="hero-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 12px rgba(149, 213, 178, 0.85);
}

.brand-text {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: rgba(243, 252, 255, 0.9);
}

.hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.nav-links {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 39px;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 700;
  color: #f8fafc;
  text-decoration: none;
  border: 1px solid rgba(56, 189, 248, 0.75);
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.16);
  box-shadow: 0 10px 30px rgba(14, 165, 233, 0.18);
  white-space: nowrap;
  transition:
    background 120ms ease,
    color 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease;
}

.brand-link:hover,
.brand-link.active {
  background: rgba(14, 165, 233, 0.28);
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 12px 36px rgba(14, 165, 233, 0.22);
}

.brand-link--push-right {
  margin-left: auto;
}

.hero-content {
  width: 100%;
}

@media (max-width: 820px) {
  .hero-row {
    align-items: flex-start;
  }

  .nav-links {
    gap: 12px;
  }

  .brand-link--push-right {
    margin-left: 0;
  }

  .brand-link {
    font-size: 14px;
  }
}
</style>
