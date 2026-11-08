import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTourEngine } from '../useTour'

/**
 * 引导状态机：步骤推进、定位测量、持久化与语音回退。
 *
 * 音频用假的 Audio 类（可控制 play() 成功 / 被拒绝），系统语音用 speechSynthesis 的
 * speak / cancel 替身；定位用 fake timers 推进 260ms 的测量延时。
 */
class FakeAudio {
  static instances: FakeAudio[] = []
  static nextPlay: 'resolve' | 'reject' = 'resolve'

  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  src: string
  paused = false

  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }

  play() {
    return FakeAudio.nextPlay === 'resolve'
      ? Promise.resolve()
      : Promise.reject(new Error('blocked'))
  }

  pause() {
    this.paused = true
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }

  load() {
    /* 空实现 */
  }
}

const speak = vi.fn()
const cancel = vi.fn()

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setupEnvironment() {
  FakeAudio.instances = []
  FakeAudio.nextPlay = 'resolve'
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      lang = ''
      rate = 1
      voice: unknown = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    },
  )
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak, cancel, getVoices: () => [{ lang: 'zh-CN' }] },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  setupEnvironment()
  speak.mockClear()
  cancel.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useTour 状态机', () => {
  it('start 进入第一步，next / prev 在步骤间移动，finish 记录已看过', () => {
    const engine = createTourEngine()

    expect(engine.start('missing')).toBe(false)
    expect(engine.start('basic')).toBe(true)
    expect(engine.state.active).toBe('basic')
    expect(engine.state.index).toBe(0)
    expect(engine.currentStep.value?.title).toBe('欢迎来到工作台')
    expect(engine.totalSteps.value).toBe(9)

    engine.next()
    expect(engine.state.index).toBe(1)
    expect(engine.currentStep.value?.title).toBe('左侧图标栏')

    engine.prev()
    expect(engine.state.index).toBe(0)
    engine.prev()
    expect(engine.state.index).toBe(0)

    engine.finish()
    expect(engine.state.active).toBeNull()
    expect(window.localStorage.getItem('73info:tour:seen:basic')).toBe('1')
  })

  it('最后一步 next 等同完成，dismiss 也记录已看过', () => {
    const engine = createTourEngine()
    engine.start('basic')
    engine.state.index = engine.totalSteps.value - 1

    engine.next()
    expect(engine.state.active).toBeNull()
    expect(engine.hasSeen('basic')).toBe(true)

    engine.start('account')
    engine.dismiss()
    expect(engine.state.active).toBeNull()
    expect(engine.hasSeen('account')).toBe(true)
  })

  it('shouldOffer 只在没看过也没提示过时成立', () => {
    const engine = createTourEngine()

    expect(engine.shouldOffer('basic')).toBe(true)
    expect(engine.shouldOffer('missing')).toBe(false)

    engine.markOffered('basic')
    expect(engine.shouldOffer('basic')).toBe(false)

    window.localStorage.clear()
    engine.markSeen('basic')
    expect(engine.shouldOffer('basic')).toBe(false)
    expect(engine.hasSeen('basic')).toBe(true)
  })

  it('语音开关默认开启并持久化', () => {
    const engine = createTourEngine()
    expect(engine.state.voiceEnabled).toBe(true)

    engine.setVoice(false)
    expect(window.localStorage.getItem('73info:tour:voice')).toBe('off')
    expect(createTourEngine().state.voiceEnabled).toBe(false)

    engine.setVoice(true)
    expect(window.localStorage.getItem('73info:tour:voice')).toBe('on')
  })

  it('语音关闭时不创建音频，开启后重播会再播一次', async () => {
    const engine = createTourEngine()
    engine.setVoice(false)
    engine.start('basic')
    await flushMicrotasks()
    expect(FakeAudio.instances).toHaveLength(0)

    engine.setVoice(true)
    engine.replayNarration()
    await flushMicrotasks()
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0]?.src).toContain('/audio/tour/basic-1.mp3')
    expect(engine.audio.playing).toBe(true)

    engine.replayNarration()
    await flushMicrotasks()
    expect(FakeAudio.instances).toHaveLength(2)
  })

  it('mp3 播放被拒绝时同步回退系统语音，同一步只回退一次', async () => {
    const engine = createTourEngine()
    FakeAudio.nextPlay = 'reject'

    engine.start('basic')
    await flushMicrotasks()
    expect(speak).toHaveBeenCalledTimes(1)
    expect(engine.audio.playing).toBe(true)

    FakeAudio.instances[0]?.onerror?.()
    await flushMicrotasks()
    expect(speak).toHaveBeenCalledTimes(1)

    engine.next()
    await flushMicrotasks()
    expect(speak).toHaveBeenCalledTimes(2)
  })

  it('目标不存在时 rect 为空，切换步骤时停止上一段语音', () => {
    const engine = createTourEngine()
    engine.start('basic')
    expect(engine.state.rect).toBeNull()

    engine.next()
    expect(FakeAudio.instances[0]?.paused).toBe(true)
    expect(engine.audio.playing).toBe(false)
  })

  it('目标存在时先滚动，260ms 后测量并四周留 8px', () => {
    const target = document.createElement('div')
    target.dataset.tour = 'basic:1'
    target.getBoundingClientRect = () =>
      ({ left: 100, top: 100, width: 200, height: 50 }) as DOMRect
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    const engine = createTourEngine()
    engine.start('basic')

    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(engine.state.rect).toBeNull()

    vi.advanceTimersByTime(260)
    expect(engine.state.rect).toEqual({ top: 92, left: 92, width: 216, height: 66 })
  })

  it('目标尺寸为零（display none）时按不存在处理', () => {
    const target = document.createElement('div')
    target.dataset.tour = 'basic:1'
    target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    const engine = createTourEngine()
    engine.start('basic')
    vi.advanceTimersByTime(260)

    expect(engine.state.rect).toBeNull()
  })
})
