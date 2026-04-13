<script setup lang="ts">
import type { PropType } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

type NavLink = {
  label: string
  to?: RouteLocationRaw
  href?: string
  active?: boolean
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
          <button class="auth-btn ghost" type="button" @click="emit('open-auth', 'login')">登录</button>
          <button class="auth-btn solid" type="button" @click="emit('open-auth', 'register')">注册</button>
        </template>
        <template v-else>
          <div class="user-menu-wrapper">
            <button class="auth-btn user-pill" type="button" @click.stop="emit('toggle-user-menu')" title="用户菜单">
              {{ username || '已登录用户' }}
            </button>
            <div class="user-menu" :class="{ open: menuOpen }" aria-label="用户菜单">
              <button class="user-menu-item" type="button" @click="emit('go-profile')">个人中心</button>
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
          <RouterLink v-if="link.to" :to="link.to" class="brand-link" :class="{ active: link.active }">
            {{ link.label }}
          </RouterLink>
          <a v-else :href="link.href || '#'" class="brand-link" :class="{ active: link.active }">
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
