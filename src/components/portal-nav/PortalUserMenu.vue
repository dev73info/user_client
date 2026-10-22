<script setup lang="ts">
import { ArrowDown, TIcon, UserFilled } from 'ui_73info'

// 用户胶囊 + 下拉菜单：只负责渲染与发事件，开合状态、导航与退出登录都在顶栏那一层
defineProps<{
  open: boolean
  username: string
  avatarSrc: string
}>()

const emit = defineEmits<{
  toggle: []
  workbench: []
  logout: []
  avatarError: []
}>()
</script>

<template>
  <div class="portal-user">
    <button
      class="portal-user__trigger"
      :class="{ 'is-open': open }"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :title="username || '已登录用户'"
      @click="emit('toggle')"
    >
      <span
        class="portal-user__avatar"
        :class="{ 'portal-user__avatar--image': Boolean(avatarSrc) }"
      >
        <img
          v-if="avatarSrc"
          class="portal-user__avatar-image"
          :src="avatarSrc"
          alt=""
          @error="emit('avatarError')"
        />
        <TIcon v-else>
          <UserFilled />
        </TIcon>
      </span>
      <span class="portal-user__name">{{ username || '已登录用户' }}</span>
      <TIcon class="portal-user__caret">
        <ArrowDown />
      </TIcon>
    </button>
    <Transition name="portal-user-menu">
      <div v-show="open" class="portal-user__menu" :class="{ open }">
        <button type="button" @click="emit('workbench')">工作台</button>
        <button type="button" class="danger" @click="emit('logout')">退出登录</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.portal-user {
  position: relative;
}

/* 与顶栏其它按钮同一套重置（border / font / cursor）内联在这里，不再依赖跨文件的公共重置规则 */
.portal-user__trigger {
  border: 0;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  max-width: 320px;
  padding: 5px 12px 5px 5px;
  border-radius: 999px;
  background: var(--ptn-accent-wash-faint);
  color: var(--ptn-accent-ink);
  font-weight: 700;
  font-size: 13px;
  transition:
    background-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;
}

/* 头像：优先用 `GET /settings/profile` 的 avatar_url；没有（或加载失败）时退回人物剪影 */
.portal-user__avatar {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ptn-inverse);
  color: var(--ptn-accent-brand);
  box-shadow: inset 0 0 0 1px var(--ptn-line-accent-soft);
}

.portal-user__avatar--image {
  overflow: hidden;
  background: var(--ptn-surface-muted);
}

.portal-user__avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portal-user__avatar .t73-icon {
  width: 16px;
  height: 16px;
  font-size: 16px;
}

.portal-user__name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portal-user__caret {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  font-size: 14px;
  opacity: 0.72;
  transition: transform 200ms var(--portal-nav-motion);
}

.portal-user__trigger:hover,
.portal-user__trigger.is-open {
  background: var(--ptn-accent-tint-strong);
  box-shadow: inset 0 0 0 1px var(--ptn-line-hover-soft);
}

.portal-user__trigger:hover .portal-user__caret,
.portal-user__trigger.is-open .portal-user__caret {
  opacity: 1;
}

.portal-user__trigger.is-open .portal-user__caret {
  transform: rotate(180deg);
}

.portal-user__trigger:focus-visible {
  outline: 3px solid var(--ptn-focus-halo);
  outline-offset: 2px;
}

.portal-user__menu {
  position: absolute;
  top: calc(100% + 10px);
  right: -16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid var(--ptn-line-menu);
  background: var(--ptn-surface-soft);
  box-shadow: 0 18px 40px var(--ptn-shadow-strong);
}

.portal-user-menu-enter-active,
.portal-user-menu-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms var(--portal-nav-motion);
  transform-origin: top right;
}

.portal-user-menu-enter-from,
.portal-user-menu-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

.portal-user-menu-enter-active .portal-user__menu button {
  animation: portal-user-menu-item-in 220ms var(--portal-nav-motion) both;
}

.portal-user-menu-enter-active .portal-user__menu button:nth-child(2) {
  animation-delay: 35ms;
}

@keyframes portal-user-menu-item-in {
  from {
    opacity: 0;
    transform: translateX(6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.portal-user__menu button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--ptn-ink-strong);
}

.portal-user__menu button:hover {
  background: var(--ptn-surface-muted-strong);
}

.portal-user__menu .danger {
  color: var(--ptn-danger-ink);
}

@media (prefers-reduced-motion: reduce) {
  .portal-user-menu-enter-active,
  .portal-user-menu-leave-active,
  .portal-user-menu-enter-active .portal-user__menu button {
    animation: none;
    transition: none;
  }
}

/* 中窄屏更挤：用户胶囊收一号，把宽度还给搜索框 */
@media (max-width: 1180px) {
  .portal-user__trigger {
    gap: 7px;
    padding: 4px 11px 4px 4px;
    font-size: 12px;
  }

  .portal-user__avatar {
    width: 24px;
    height: 24px;
  }

  .portal-user__avatar .t73-icon {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }

  .portal-user__caret {
    width: 12px;
    height: 12px;
    font-size: 12px;
  }
}

/* 单行放不下时（两行版式、窄屏）才允许把用户名截断，桌面端保持完整 */
@media (max-width: 900px) {
  .portal-user__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
