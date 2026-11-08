/**
 * 语音引导的状态机：高亮定位、步骤推进、语音播放与首次提示的持久化。
 *
 * 全站共用一份状态（模块级单例），`TourOverlay` / `TourOffer` / `TourButton` 读同一实例。
 * 定位按 `data-tour="<key>:<step>"` 锚点走：先平滑滚到视口中央，再延迟约 260ms 测量，
 * 这样滚动动画未结束时不会量到旧位置；resize 与任意容器滚动都会重新测量（rAF 节流）。
 */
import { computed, reactive } from 'vue'

import { createTourNarrator } from './tourAudio'
import { getTour, type TourStep } from './tours'

export type TourRect = {
  top: number
  left: number
  width: number
  height: number
}

export type TourState = {
  active: string | null
  index: number
  rect: TourRect | null
  voiceEnabled: boolean
}

export type TourAudioState = { playing: boolean }

const SEEN_PREFIX = '73info:tour:seen:'
const OFFERED_PREFIX = '73info:tour:offered:'
const VOICE_KEY = '73info:tour:voice'
const MEASURE_DELAY = 260
const SPOTLIGHT_PAD = 8

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 存储配额满：引导照常可用，只是不再记忆 */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function createTourEngine() {
  const narrator = createTourNarrator()
  const state = reactive<TourState>({
    active: null,
    index: 0,
    rect: null,
    voiceEnabled: readStorage(VOICE_KEY) !== 'off',
  })
  const audio = reactive<TourAudioState>({ playing: false })

  const currentTour = computed(() => (state.active ? (getTour(state.active) ?? null) : null))
  const currentStep = computed<TourStep | null>(() => currentTour.value?.steps[state.index] ?? null)
  const totalSteps = computed(() => currentTour.value?.steps.length ?? 0)

  let measureTimer = 0
  let scrollFrame = 0
  let listening = false

  function clearMeasureTimer() {
    if (!measureTimer) return
    window.clearTimeout(measureTimer)
    measureTimer = 0
  }

  function queryTarget(): Element | null {
    const target = currentStep.value?.target
    if (!target) return null
    try {
      return document.querySelector(target)
    } catch {
      return null
    }
  }

  /** 只测量，不滚动：滚动与 resize 期间调用，避免 scrollIntoView 反过来触发滚动。 */
  function updateRect() {
    const el = queryTarget()
    if (!el) {
      state.rect = null
      return
    }
    const box = el.getBoundingClientRect()
    // `display: none` 的元素量出来是 0×0：当作目标不存在，卡片居中
    if (box.width === 0 && box.height === 0) {
      state.rect = null
      return
    }
    const width = clamp(box.width + SPOTLIGHT_PAD * 2, 1, window.innerWidth)
    const height = clamp(box.height + SPOTLIGHT_PAD * 2, 1, window.innerHeight)
    const left = clamp(box.left - SPOTLIGHT_PAD, 0, window.innerWidth - width)
    const top = clamp(box.top - SPOTLIGHT_PAD, 0, window.innerHeight - height)
    state.rect = { top, left, width, height }
  }

  function scrollToTarget() {
    const el = queryTarget()
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  function focusStep() {
    clearMeasureTimer()
    if (!queryTarget()) {
      state.rect = null
      return
    }
    scrollToTarget()
    measureTimer = window.setTimeout(() => {
      measureTimer = 0
      updateRect()
    }, MEASURE_DELAY)
  }

  function handleScroll() {
    if (scrollFrame) return
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0
      updateRect()
    })
  }

  function handleResize() {
    updateRect()
  }

  function listen() {
    if (listening) return
    listening = true
    window.addEventListener('resize', handleResize)
    // capture：工作台的滚动发生在内层滚动容器上，不冒泡到 window
    window.addEventListener('scroll', handleScroll, true)
  }

  function unlisten() {
    if (!listening) return
    listening = false
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('scroll', handleScroll, true)
    if (scrollFrame) {
      window.cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
    }
  }

  function stopNarration() {
    narrator.stop()
    audio.playing = false
  }

  function narrate() {
    const tour = currentTour.value
    const step = currentStep.value
    if (!tour || !step || !state.voiceEnabled) return
    narrator.play(tour.key ?? state.active ?? '', state.index, step.body, (playing) => {
      audio.playing = playing
    })
  }

  function playCurrent() {
    stopNarration()
    narrate()
  }

  function start(key: string): boolean {
    if (!getTour(key)) return false
    stopNarration()
    state.active = key
    state.index = 0
    state.rect = null
    state.voiceEnabled = readStorage(VOICE_KEY) !== 'off'
    listen()
    focusStep()
    playCurrent()
    return true
  }

  function next() {
    if (!currentTour.value) return
    if (state.index >= totalSteps.value - 1) {
      finish()
      return
    }
    state.index += 1
    focusStep()
    playCurrent()
  }

  function prev() {
    if (!currentTour.value || state.index === 0) return
    state.index -= 1
    focusStep()
    playCurrent()
  }

  function close() {
    clearMeasureTimer()
    unlisten()
    stopNarration()
    state.active = null
    state.index = 0
    state.rect = null
  }

  function markSeen(key?: string) {
    const target = key ?? state.active
    if (!target) return
    writeStorage(`${SEEN_PREFIX}${target}`, '1')
  }

  function hasSeen(key: string): boolean {
    return readStorage(`${SEEN_PREFIX}${key}`) === '1'
  }

  function shouldOffer(key: string): boolean {
    if (!getTour(key)) return false
    return !hasSeen(key) && readStorage(`${OFFERED_PREFIX}${key}`) !== '1'
  }

  function markOffered(key: string) {
    writeStorage(`${OFFERED_PREFIX}${key}`, '1')
  }

  function finish() {
    markSeen()
    close()
  }

  function dismiss() {
    markSeen()
    close()
  }

  function setVoice(enabled: boolean) {
    state.voiceEnabled = enabled
    writeStorage(VOICE_KEY, enabled ? 'on' : 'off')
    if (!enabled) stopNarration()
  }

  function replayNarration() {
    if (!state.voiceEnabled) return
    playCurrent()
  }

  return {
    state,
    audio,
    currentTour,
    currentStep,
    totalSteps,
    start,
    next,
    prev,
    finish,
    dismiss,
    markSeen,
    hasSeen,
    shouldOffer,
    markOffered,
    setVoice,
    replayNarration,
    stopNarration,
  }
}

export type TourEngine = ReturnType<typeof createTourEngine>

const engine = createTourEngine()

export function useTour(): TourEngine {
  return engine
}
