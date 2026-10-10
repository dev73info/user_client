<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getTurnstileSiteKey,
  isTurnstileEnabled,
  loadTurnstile,
  type TurnstileSurfaceAction,
} from '@/shared/turnstile'

// Cloudflare Turnstile 挂件（显式渲染）。
//
// 只做三件事：把官方脚本渲染进容器、把一次性 token 通过 `update:token` 抛给调用方、
// 通过 `reset()` 重新取一枚。**校验不在前端做**（见 shared/turnstile.ts 顶部说明）。
//
// 站点密钥未配置（`VITE_TURNSTILE_SITE_KEY` 为空）时整块不渲染、也不加载官方脚本，
// 此时始终抛出空 token，后端的 `[turnstile] enabled=false` 也不再校验。

const props = defineProps({
  /** 本入口的稳定动作名，必须与后端 guard 的 expected_action 一致 */
  action: { type: String as () => TurnstileSurfaceAction, required: true },
})

const emit = defineEmits<{
  (e: 'update:token', token: string): void
}>()

const enabled = isTurnstileEnabled()

const container = ref<HTMLElement | null>(null)
const loadError = ref('')
let widgetId: string | undefined
let disposed = false

/** 渲染挂件；脚本按需加载，失败时给出可重试的提示。 */
async function mountWidget() {
  if (!enabled || !container.value) {
    return
  }
  loadError.value = ''
  try {
    const turnstile = await loadTurnstile()
    if (disposed || !container.value) {
      return
    }
    widgetId = turnstile.render(container.value, {
      sitekey: getTurnstileSiteKey(),
      action: props.action,
      theme: 'auto',
      callback: (token) => emit('update:token', token),
      'error-callback': () => {
        // 脚本加载失败 / 渲染失败：清空 token，并允许用户点重试
        emit('update:token', '')
        loadError.value = '人机验证加载失败'
      },
      'expired-callback': () => {
        // token 有时效（默认约 5 分钟），过期即作废，必须重新取
        emit('update:token', '')
      },
      'timeout-callback': () => {
        emit('update:token', '')
      },
    })
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '人机验证加载失败'
  }
}

/**
 * 重新取一枚 token。
 *
 * Turnstile 的 token **一次性**且有时效，被服务端消费后必须 reset 才能再提交一次；
 * 失败重试、发码后再提交、登录进入二次验证等场景都要调用它。
 */
function reset() {
  emit('update:token', '')
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId)
  }
}

/** 脚本加载失败后重试：清掉旧节点重新渲染。 */
function retry() {
  if (container.value && window.turnstile && widgetId) {
    window.turnstile.remove(widgetId)
    widgetId = undefined
  }
  void mountWidget()
}

onMounted(() => {
  void mountWidget()
})

onBeforeUnmount(() => {
  disposed = true
  if (widgetId && window.turnstile) {
    window.turnstile.remove(widgetId)
  }
  widgetId = undefined
})

defineExpose({ reset })
</script>

<template>
  <div v-if="enabled" class="turnstile-field">
    <div ref="container" class="turnstile-widget" aria-label="人机验证" />
    <p v-if="loadError" class="turnstile-error">
      <span>{{ loadError }}，请重试</span>
      <button class="turnstile-retry" type="button" @click="retry">重试</button>
    </p>
  </div>
</template>

<style scoped>
.turnstile-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.turnstile-widget {
  min-height: 65px;
}

.turnstile-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: #d64545;
  font-size: 0.85rem;
}

.turnstile-retry {
  padding: 0.1rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.3rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
}
</style>
