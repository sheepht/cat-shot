import { useCallback, useEffect, useRef } from 'react'

/**
 * 低延遲音效。用 Web Audio：開場先把音檔解碼成 AudioBuffer，
 * 按下時直接 start 一個 buffer source —— 延遲趨近於零、可重疊連發，
 * 而且自動跳過 mp3 開頭的編碼器靜音（HTMLAudioElement 做不到這些）。
 */
export function useSfx(src: string) {
  const ctxRef = useRef<AudioContext | null>(null)
  const bufRef = useRef<AudioBuffer | null>(null)
  const offsetRef = useRef(0) // 開頭靜音的秒數，播放時跳過

  useEffect(() => {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new AC()
    ctxRef.current = ctx

    let cancelled = false
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        if (cancelled) return
        bufRef.current = buf
        offsetRef.current = leadingSilence(buf)
      })
      .catch(() => {})

    // iOS/部分 Android：AudioContext 載入時是 suspended，必須在使用者手勢內喚醒。
    // 首次觸碰整個頁面就先 resume + 播一段無聲 buffer 解鎖，之後拍照才一定有聲。
    const unlock = () => {
      if (ctx.state === 'suspended') void ctx.resume()
      const silent = ctx.createBufferSource()
      silent.buffer = ctx.createBuffer(1, 1, 22050)
      silent.connect(ctx.destination)
      silent.start(0)
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('touchend', unlock)
      document.removeEventListener('keydown', unlock)
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('touchend', unlock)
    document.addEventListener('keydown', unlock)

    return () => {
      cancelled = true
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('touchend', unlock)
      document.removeEventListener('keydown', unlock)
      void ctx.close()
    }
  }, [src])

  return useCallback(() => {
    const ctx = ctxRef.current
    const buf = bufRef.current
    if (!ctx || !buf) return
    if (ctx.state === 'suspended') void ctx.resume() // iOS：要在使用者手勢內喚醒
    const node = ctx.createBufferSource()
    node.buffer = buf
    node.connect(ctx.destination)
    node.start(0, offsetRef.current)
  }, [])
}

/** 找出開頭第一個有聲音的位置（秒），用來跳過 mp3 的前置靜音 */
function leadingSilence(buf: AudioBuffer): number {
  const data = buf.getChannelData(0)
  const threshold = 0.01
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) {
      return Math.max(0, i / buf.sampleRate - 0.005) // 回退 5ms，別切掉起音
    }
  }
  return 0
}
