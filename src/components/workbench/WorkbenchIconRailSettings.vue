<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Switch, TIcon } from 'ui_73info'

import {
  workbenchRailAccountMenuItems,
  type WorkbenchRailAccountMenuItem,
} from '@/shared/workbenchRailAccountMenu'

defineProps<{
  switchLabel: string
}>()

const emit = defineEmits<{
  'switch-mode': []
}>()

const route = useRoute()
const router = useRouter()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const currentName = computed(() => String(route.name ?? ''))
const personalAccountActive = computed(
  () => currentName.value === 'workbench' && route.query.view === 'profile',
)

type MenuTarget = {
  name: string
  query?: Record<string, string>
}

function isActive(item: WorkbenchRailAccountMenuItem) {
  return currentName.value === item.to.name
}

/** 停在账户类页面时齿轮点亮（这些页面不再出现在图标栏上，齿轮就是它们的归属标记）。 */
const accountModeActive = computed(
  () => personalAccountActive.value || workbenchRailAccountMenuItems.some(isActive),
)

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

function switchWorkbenchMode() {
  close()
  emit('switch-mode')
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

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="workbench-icon-rail__settings" :class="{ 'is-open': open }">
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
      <TIcon :size="22">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path
            d="M19.2 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8.8 8.8 0 0 0-2.7-1.5L13.8 2h-3.6L10 4.9A8.8 8.8 0 0 0 7.2 6.4l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8.8 8.8 0 0 0 2.8 1.5l.2 2.9h3.6l.2-2.9a8.8 8.8 0 0 0 2.7-1.5l2.4 1 2-3.5-2-1.5Z"
          />
        </svg>
      </TIcon>
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
        class="workbench-icon-rail__settings-option"
        :class="{ 'is-active': personalAccountActive }"
        type="button"
        role="menuitem"
        :aria-current="personalAccountActive ? 'page' : undefined"
        @click="go({ name: 'workbench', query: { view: 'profile' } })"
      >
        个人账户
      </button>
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
      <span class="workbench-icon-rail__settings-divider" aria-hidden="true"></span>
      <button
        class="workbench-icon-rail__settings-option workbench-icon-rail__settings-switch"
        type="button"
        role="menuitem"
        @click="switchWorkbenchMode"
      >
        <Switch />
        <span>{{ switchLabel }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped src="./workbench-icon-rail-settings.css"></style>
