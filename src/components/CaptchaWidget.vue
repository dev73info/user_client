<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { AltchaWidgetElement } from 'altcha'
import {
  applyCaptchaAttributes,
  isCaptchaEnabled,
  loadAltchaWidget,
  type AltchaStateChangeDetail,
} from '@/shared/captcha'

// 自托管 ALTCHA 人机验证挂件。
//
// 只做三件事：把 widget 挂进容器、把一次性 payload 通过 `update:token` 抛给调用方、
// 通过 `reset()` 重新取一枚。**校验不在前端做**（见 shared/captcha.ts 顶部说明）。
//
// 开关未打开（`VITE_CAPTCHA_ENABLED` 非 true / 1）时整块不渲染、也不加载库，
// 此时始终抛出空 payload，后端对应关闭校验。

const emit = defineEmits<{
  (e: 'update:token', token: string): void
}>()

const enabled = isCaptchaEnabled()

const container = ref<HTMLElement | null>(null)
const loadError = ref('')
let widget: AltchaWidgetElement | null = null
let disposed = false
/** 每次挂载递增；reset 后让在途的旧挂载作废，避免重建出两个挂件。 */
let mountSeq = 0

function handleStateChange(event: Event) {
  const detail = (event as CustomEvent<AltchaStateChangeDetail>).detail
  if (!detail) {
    return
  }
  if (detail.state === 'verified') {
    emit('update:token', detail.payload ?? '')
    return
  }
  if (detail.state === 'expired' || detail.state === 'error') {
    // payload 有时效且一次性，过期 / 失败即作废，必须重新取
    emit('update:token', '')
  }
}

function destroyWidget() {
  if (widget) {
    widget.removeEventListener('statechange', handleStateChange)
    widget.remove()
    widget = null
  }
}

/** 挂载挂件；库按需加载，失败时给出可重试的提示。 */
async function mountWidget() {
  if (!enabled || !container.value) {
    return
  }
  loadError.value = ''
  const seq = ++mountSeq
  try {
    await loadAltchaWidget()
    if (disposed || seq !== mountSeq || !container.value) {
      return
    }
    const element = document.createElement('altcha-widget')
    applyCaptchaAttributes(element)
    element.addEventListener('statechange', handleStateChange)
    widget = element
    container.value.appendChild(element)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '人机验证加载失败'
  }
}

/**
 * 重新取一枚 payload。
 *
 * ALTCHA 的 payload **一次性**且有时效，被服务端消费后必须重建挂件才能再提交一次；
 * 失败重试、发码后再提交、登录进入二次验证等场景都要调用它。
 */
function reset() {
  emit('update:token', '')
  destroyWidget()
  void mountWidget()
}

onMounted(() => {
  void mountWidget()
})

onBeforeUnmount(() => {
  disposed = true
  destroyWidget()
})

defineExpose({ reset })
</script>

<template>
  <div v-if="enabled" class="captcha-field">
    <div ref="container" class="captcha-widget" aria-label="人机验证" />
    <p v-if="loadError" class="captcha-error">
      <span>{{ loadError }}，请重试</span>
      <button class="captcha-retry" type="button" @click="reset">重试</button>
    </p>
  </div>
</template>

<style scoped>
.captcha-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.captcha-widget {
  min-height: 48px;
}

.captcha-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--73-danger);
  font-size: 0.85rem;
}

.captcha-retry {
  padding: 0.1rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.3rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
}
</style>
