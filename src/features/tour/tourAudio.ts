/**
 * 引导语音播放器：先放预生成的 mp3，失败再回退浏览器语音合成。
 *
 * 自动播放限制（见根仓 `docs/规则/语音引导.md` 第五节）：
 * - `play()` 只能由用户点击的同步调用栈触发，这里不做任何延时或等待；
 * - mp3 缺失、解码失败或 `play()` 被拒绝时，同一个步骤只回退一次 `speechSynthesis`；
 * - 系统语音也不可用时静音继续，卡片流程不受影响。
 */
export type TourPlayingListener = (playing: boolean) => void

export interface TourNarrator {
  play(tourKey: string, stepIndex: number, text: string, listener: TourPlayingListener): void
  stop(): void
}

function narrationUrl(tourKey: string, stepIndex: number) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}audio/tour/${tourKey}-${stepIndex + 1}.mp3`
}

export function createTourNarrator(): TourNarrator {
  let element: HTMLAudioElement | null = null
  let token = 0

  function detach(audio: HTMLAudioElement) {
    audio.onended = null
    audio.onerror = null
    try {
      audio.pause()
    } catch {
      /* 已经停止的音频，忽略 */
    }
  }

  function stop() {
    token += 1
    if (element) {
      const current = element
      element = null
      detach(current)
      try {
        current.removeAttribute('src')
        current.load()
      } catch {
        /* 释放失败不影响后续播放 */
      }
    }
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* 个别浏览器在未激活时抛错，忽略 */
    }
  }

  /** 回退到系统语音：中文、原速，优先挑一个中文音色。 */
  function speak(text: string, myToken: number, listener: TourPlayingListener) {
    if (myToken !== token) return
    const synth = typeof window === 'undefined' ? null : window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      listener(false)
      return
    }
    try {
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = 1
      const voice = synth.getVoices?.().find((item) => item.lang?.toLowerCase().startsWith('zh'))
      if (voice) utterance.voice = voice
      utterance.onend = () => {
        if (myToken === token) listener(false)
      }
      utterance.onerror = () => {
        if (myToken === token) listener(false)
      }
      synth.speak(utterance)
      listener(true)
    } catch {
      listener(false)
    }
  }

  function play(tourKey: string, stepIndex: number, text: string, listener: TourPlayingListener) {
    stop()
    const myToken = token
    let fellBack = false
    const fallback = () => {
      if (fellBack || myToken !== token) return
      fellBack = true
      speak(text, myToken, listener)
    }

    let audio: HTMLAudioElement
    try {
      audio = new Audio(narrationUrl(tourKey, stepIndex))
    } catch {
      fallback()
      return
    }
    element = audio
    audio.onended = () => {
      if (myToken === token) listener(false)
    }
    audio.onerror = fallback

    let result: Promise<void> | undefined
    try {
      result = audio.play()
    } catch {
      fallback()
      return
    }
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (myToken === token) listener(true)
        })
        .catch(fallback)
    } else {
      listener(true)
    }
  }

  return { play, stop }
}
