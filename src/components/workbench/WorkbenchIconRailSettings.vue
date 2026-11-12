<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useUserAvatar } from '@/composables/useUserAvatar'
import { PROFILE_AVATAR_UPDATED_EVENT } from '@/shared/profileEvents'
import {
  workbenchRailAccountMenuItems,
  type WorkbenchRailAccountMenuItem,
} from '@/shared/workbenchRailAccountMenu'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  username?: string
}>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
/** 账户头像与顶栏用户胶囊同一口径：有图显示图片，没有或加载失败回退首字母。 */
const { avatarSrc, ensureLoaded, refresh, markFailed } = useUserAvatar()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const avatarInitial = computed(() => (props.username || '?').slice(0, 1).toUpperCase())

function handleAvatarUpdated() {
  void refresh()
}

const currentName = computed(() => String(route.name ?? ''))

type MenuTarget = {
  name: string
  query?: Record<string, string>
}

function isActive(item: WorkbenchRailAccountMenuItem) {
  return currentName.value === item.to.name
}

/** 停在账户类页面时账户图标点亮（这些页面不再出现在图标栏上，它就是它们的归属标记）。 */
const accountModeActive = computed(() => workbenchRailAccountMenuItems.some(isActive))

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function go(to: MenuTarget) {
  close()
  void router.push(to)
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!open.value || !(event.target instanceof Node)) {
    return
  }
  if (!rootRef.value?.contains(event.target)) {
    close()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close()
  }
}

watch(
  () => route.fullPath,
  () => close(),
)

watch(
  () => auth.token,
  () => {
    void ensureLoaded()
  },
)

onMounted(() => {
  void ensureLoaded()
  window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div
    ref="rootRef"
    class="workbench-icon-rail__settings"
    :class="{ 'is-open': open }"
    data-tour="basic:6"
  >
    <button
      class="workbench-icon-rail__item workbench-icon-rail__settings-trigger"
      type="button"
      :class="{ 'is-active': accountModeActive }"
      aria-label="账户菜单"
      aria-haspopup="menu"
      :aria-expanded="open"
      title="账户"
      @click="toggle"
    >
      <span class="workbench-icon-rail__settings-avatar">
        <img
          v-if="avatarSrc"
          class="workbench-icon-rail__settings-avatar-image"
          :src="avatarSrc"
          alt=""
          @error="markFailed"
        />
        <template v-else>{{ avatarInitial }}</template>
      </span>
      <span class="workbench-icon-rail__tooltip">账户</span>
    </button>

    <section
      v-if="open"
      class="workbench-icon-rail__settings-menu"
      role="menu"
      aria-label="账户"
      @click.stop
    >
      <button
        v-for="item in workbenchRailAccountMenuItems"
        :key="item.key"
        class="workbench-icon-rail__settings-option"
        :class="{ 'is-active': isActive(item) }"
        type="button"
        role="menuitem"
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="go(item.to)"
      >
        {{ item.label }}
      </button>
    </section>
  </div>
</template>

<style scoped src="./workbench-icon-rail-settings.css"></style>
