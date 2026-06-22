import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useGame, MAX_LIVES } from '../game/useGame'
import { useSfx } from '../game/useSfx'
import { overlapRatio, scoreFor, nearnessFor } from '../game/scoring'
import { CAT_PATH, CAT_VIEWBOX } from '../game/catPath'
import { useI18n, LANGS, type Lang } from '../i18n'
import { trackEvent } from '../analytics'

// public/ 資源用 BASE_URL 前綴，子路徑部署（GitHub Pages /cat-shot/）才不會 404
const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`
const CAT_SRC = asset('cat.webp')

const FRAME_STROKE = 'rgb(203 213 225)' // slate-300，固定灰色虛線
const FRAME_FILL = 'rgb(134 239 172)' // green-300，貼合時的背景綠光
const FRAME_FILL_MAX = 0.6 // 完全對準時的最大綠色不透明度

// 拍照成功的評價：>80 Perfect、>60 Good、其餘 OK
function rating(points: number): { text: string; cls: string } {
  if (points > 80) return { text: 'Perfect!', cls: 'text-amber-300' }
  if (points > 60) return { text: 'Good', cls: 'text-emerald-400' }
  return { text: 'OK', cls: 'text-sky-300' }
}

// 里程表轉輪位置：個位連續滾，高位只在「下面整段快滾完的最後 1 格」才跟著進位，靜止時對齊整數。
function reelPos(v: number, p: number): number {
  const pow = Math.pow(10, p)
  const digit = ((Math.floor(v / pow) % 10) + 10) % 10
  const lower = ((v % pow) + pow) % pow // 此位以下的部分 0..pow
  const toRoll = pow - lower // 距離下一次進位還差多少
  const carry = toRoll < 1 ? 1 - toRoll : 0 // 最後 1.0 才平滑進位
  return digit + carry
}

// 單一位數轉輪：0~9 加一個結尾 0（讓 9→0 順著往下滾、且首尾的 0 接得起來不跳）
function Reel({ pos }: { pos: number }) {
  return (
    <span
      className="relative inline-block overflow-hidden align-bottom"
      style={{ width: '1ch', height: '1em' }}
    >
      <span
        className="absolute left-0 top-0 flex flex-col"
        style={{ transform: `translateY(${-pos}em)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span
            key={i}
            className="text-center"
            style={{ width: '1ch', height: '1em', lineHeight: '1em' }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

// 吃角子老虎式滾動數字：值增加時用 rAF 補間，數字一路滾上去；含千分位逗號
function RollingNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (value <= displayRef.current) {
      displayRef.current = value // 後退/相等（重開遊戲）→ 直接歸位不滾
      setDisplay(value)
      return
    }
    const from = displayRef.current
    const target = value
    const DURATION = 450
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const k = Math.min(1, (t - start) / DURATION)
      const eased = 1 - Math.pow(1 - k, 3) // easeOutCubic
      const cur = k < 1 ? from + (target - from) * eased : target
      displayRef.current = cur
      setDisplay(cur)
      if (k < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  const numDigits = Math.max(1, String(Math.floor(value)).length)
  const positions: number[] = []
  for (let p = numDigits - 1; p >= 0; p--) positions.push(p)

  return (
    <span className="inline-flex leading-none tabular-nums">
      {positions.map((p) => (
        <Fragment key={p}>
          <Reel pos={reelPos(display, p)} />
          {p > 0 && p % 3 === 0 ? <span>,</span> : null}
        </Fragment>
      ))}
    </span>
  )
}

// 正方形遊戲場內的正規化座標（0~1）→ CSS 百分比定位。場是正方形所以兩軸同尺度、不變形。
function rectStyle(r: { x: number; y: number; w: number; h: number }) {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  }
}

export default function Play() {
  const { state, start, shoot, reset } = useGame()
  const { t, lang, setLang } = useI18n()
  const [showAbout, setShowAbout] = useState(false)
  const playShutter = useSfx(asset('camera2.mp3')) // 低延遲 Web Audio 音效
  const playCut = useSfx(asset('cut.mp3')) // 扣血音效
  const playSave = useSfx(asset('save.mp3')) // 補血音效
  const shakeRef = useRef<HTMLDivElement>(null)

  // 開始 / 再玩一次：送 GA 事件 + 開始遊戲
  const handleStart = useCallback(() => {
    trackEvent('game_start')
    start()
  }, [start])

  // 切語言：送 GA 事件（看玩家實際偏好哪些語系）+ 切換
  const handleLang = useCallback(
    (code: Lang) => {
      trackEvent('language_select', { lang: code })
      setLang(code)
    },
    [setLang],
  )

  // 打開「關於」：送 GA 事件衡量內容互動
  const handleAbout = useCallback(() => {
    trackEvent('about_open')
    setShowAbout(true)
  }, [])

  // Game Over：送 GA 事件（帶最終分數與關卡）
  useEffect(() => {
    if (state.phase !== 'gameover') return
    trackEvent('game_over', { score: state.score, level: state.level })
  }, [state.phase, state.score, state.level])

  // 升級：關卡往上跳時送 GA 事件（看玩家撐到第幾關，衡量難度曲線）
  const prevLevel = useRef(state.level)
  useEffect(() => {
    if (state.phase === 'playing' && state.level > prevLevel.current) {
      trackEvent('level_up', { level: state.level })
    }
    prevLevel.current = state.level
  }, [state.phase, state.level])

  // 補血時：播放補血音效（綠光由 healId 驅動畫面）
  useEffect(() => {
    if (state.healId === 0) return
    playSave()
  }, [state.healId, playSave])

  // 沒拍到（扣血）時：播放扣血音效 + 整個畫面小幅震動，扣血感更強
  useEffect(() => {
    if (state.shotId === 0 || state.lastHit) return
    playCut()
    shakeRef.current?.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: 'translate(-6px,3px)' },
        { transform: 'translate(5px,-4px)' },
        { transform: 'translate(-4px,2px)' },
        { transform: 'translate(3px,-2px)' },
        { transform: 'translate(0,0)' },
      ],
      { duration: 240, easing: 'ease-in-out' },
    )
  }, [state.shotId, state.lastHit, playCut])

  // 按快門：音效 + 拍照（只在遊戲中）。閃光改由拍照結果 (state.shotId) 驅動
  const shutter = useCallback(() => {
    if (state.phase !== 'playing') return
    playShutter()
    shoot()
  }, [state.phase, shoot, playShutter])

  // 空白鍵 / Enter 也能拍（記得 preventDefault，不然空白鍵會捲頁）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        shutter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shutter])

  const playing = state.phase === 'playing'
  // 貼合度（每幀更新）→ 框底背景越貼合越綠；等待空檔沒有貓時歸零
  const nearness =
    playing && !state.waiting
      ? nearnessFor(overlapRatio(state.object, state.frame))
      : 0

  return (
    <div
      onPointerDown={shutter}
      className="fixed inset-0 z-50 select-none touch-none overflow-hidden bg-slate-900 text-slate-100"
    >
      <div ref={shakeRef} className="absolute inset-0">
      {/* 置中正方形遊戲場（盡量放大；貓滑出範圍由整個螢幕裁切）*/}
      <div className="absolute left-1/2 top-1/2 aspect-square w-[min(96vw,96vh)] -translate-x-1/2 -translate-y-1/2">
        {/* 中央目標：SVG 描出的貓形虛線邊框 */}
        <svg
          viewBox={CAT_VIEWBOX}
          preserveAspectRatio="none"
          className="pointer-events-none absolute select-none overflow-visible"
          style={rectStyle(state.frame)}
        >
          <path
            d={CAT_PATH}
            fill={FRAME_FILL}
            fillOpacity={nearness * FRAME_FILL_MAX}
            stroke={FRAME_STROKE}
            strokeWidth={2}
            strokeOpacity={0.75}
            strokeDasharray="7 6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* 拍照成功時，中央框的放大淡出回饋（echo，不動真框）。
            動畫套在外層 div（transform-origin 穩定），SVG 只填滿它，避免 SVG 縮放歪掉看起來像抖。*/}
        {playing && state.lastHit && state.shotId > 0 && (
          <div
            key={`echo-${state.shotId}`}
            className="pointer-events-none absolute origin-center [animation:frame-pop_360ms_ease-out_forwards]"
            style={rectStyle(state.frame)}
          >
            <svg
              viewBox={CAT_VIEWBOX}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              <path
                d={CAT_PATH}
                fill="none"
                stroke="rgb(134 239 172)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        )}

        {/* 移動的跌倒貓（等待空檔不畫）*/}
        {playing && !state.waiting && (
          <img
            src={CAT_SRC}
            alt="跌倒貓"
            draggable={false}
            className="pointer-events-none absolute select-none drop-shadow-lg"
            style={rectStyle(state.object)}
          />
        )}

        {/* 上一發評價：快速出現、往上飄、淡出（每發重播）*/}
        {playing && state.shotId > 0 && (
          <div
            key={`score-${state.shotId}`}
            className="pointer-events-none absolute left-1/2 top-[18%] font-mono text-xl font-bold [animation:score-pop_700ms_ease-out_forwards]"
          >
            {state.lastHit ? (
              (() => {
                const r = rating(scoreFor(state.lastRatio ?? 0))
                return <span className={r.cls}>{r.text}</span>
              })()
            ) : (
              <span className="text-rose-400">Miss!</span>
            )}
          </div>
        )}
      </div>

      {/* 取景器三分構圖 grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.13) 1px, transparent 1px)',
          backgroundSize: 'calc(100% / 3) calc(100% / 3)',
        }}
      />

      {/* 浮層 UI（不擋點擊，taps 都會穿透到底層拍照）*/}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="flex items-center justify-end px-5 pt-4 text-sm [text-shadow:0_1px_3px_rgb(0_0_0)]">
          <div className="flex items-center gap-4 font-mono">
            <span className="flex items-center gap-1">
              Lv <RollingNumber value={state.level} />
            </span>
            <span className="flex items-center gap-1">
              {t.score} <RollingNumber value={state.score} />
            </span>
            <span
              className="flex items-center gap-1"
              aria-label={`${t.lives} ${state.lives}/${MAX_LIVES}`}
            >
              {Array.from({ length: MAX_LIVES }, (_, i) => {
                const filled = i < state.lives
                const isProgress = i === state.lives && state.lives < MAX_LIVES
                const pct = filled ? 100 : isProgress ? (state.hitStreak / 5) * 100 : 0
                return (
                  <span
                    key={i}
                    className="h-1.5 w-4 overflow-hidden rounded-sm bg-white/15 ring-1 ring-black/30"
                  >
                    <span
                      className="block h-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: filled
                          ? 'rgb(244 63 94)' // rose-500（滿格正紅）
                          : 'rgb(150 100 105)', // 補血進度的灰紅
                      }}
                    />
                  </span>
                )
              })}
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* iPhone 風格拍照圓圈（純裝飾，真正拍照是點整個畫面）*/}
        <div className="flex items-center justify-center pb-7">
          <div className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-white/90">
            <div className="h-14 w-14 rounded-full bg-white/90" />
          </div>
        </div>
        <footer className="pb-3 text-center text-xs text-slate-600">
          © 2026 羊姥宛工作室
        </footer>
      </div>

      {/* 拍照閃光：拍到閃灰、沒拍到（扣血）閃紅 */}
      {state.shotId > 0 && (
        <div
          key={state.shotId}
          className="pointer-events-none absolute inset-0 z-30 [animation:shutter-flash_180ms_ease-out_forwards]"
          style={{
            backgroundColor: state.lastHit ? 'rgb(50 50 50)' : 'rgb(220 38 38)',
          }}
        />
      )}

      {/* 補血綠光：浮現再淡出 */}
      {state.healId > 0 && (
        <div
          key={`heal-${state.healId}`}
          className="pointer-events-none absolute inset-0 z-20 bg-emerald-500 [animation:heal-glow_800ms_ease-out_forwards]"
        />
      )}

      {/* 開始選單：背景貓持續對角滑動，只留開始 / 關於 */}
      {state.phase === 'menu' && (
        <div className="absolute inset-0 overflow-hidden">
          {/* 壓暗 + 霧化後面遊戲場的 scrim */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          {/* 背景沿對角線無限滑動的貓 */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 w-[34vmin] -translate-x-1/2 -translate-y-1/2">
            <img
              src={CAT_SRC}
              alt=""
              draggable={false}
              className="w-full opacity-80 blur-[2px] [animation:cat-drift_4.5s_linear_infinite]"
            />
          </div>
          {/* 按鈕 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <button
              onClick={handleStart}
              className="w-44 rounded-xl bg-white py-3 text-lg font-semibold text-slate-900 active:scale-95"
            >
              {t.start}
            </button>
            <button
              onClick={handleAbout}
              className="text-lg text-slate-300 hover:text-white"
            >
              {t.about}
            </button>
          </div>
          {/* 語言切換：預設跟瀏覽器語系，這裡可手動改 */}
          <div className="absolute inset-x-0 bottom-6 flex max-h-[26vh] flex-wrap items-center justify-center gap-2 overflow-y-auto px-8">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => handleLang(code)}
                aria-pressed={lang === code}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  lang === code
                    ? 'bg-white font-semibold text-slate-900'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game Over */}
      {state.phase === 'gameover' && (
        <Overlay>
          <h2 className="text-2xl font-bold text-rose-400">{t.gameOver}</h2>
          <p className="font-mono text-lg">
            {t.finalScore} {state.score.toLocaleString('en-US')}
          </p>
          <p className="text-sm text-slate-300">{t.reachedLevel(state.level)}</p>
          <button
            onClick={handleStart}
            className="w-44 rounded-xl bg-white py-3 text-lg font-semibold text-slate-900 active:scale-95"
          >
            {t.playAgain}
          </button>
          <button
            onClick={reset}
            className="text-sm text-slate-400 hover:text-white"
          >
            {t.backToMenu}
          </button>
        </Overlay>
      )}

      {/* 關於 */}
      {showAbout && (
        <Overlay>
          <h2 className="text-xl font-bold">{t.aboutTitle}</h2>
          <p className="max-w-sm text-left text-sm leading-relaxed text-slate-300">
            {t.aboutBody}
          </p>
          <button
            onClick={() => setShowAbout(false)}
            className="w-44 rounded-xl bg-slate-600 py-3 font-semibold active:scale-95"
          >
            {t.back}
          </button>
        </Overlay>
      )}
      </div>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/85 px-6 backdrop-blur-sm">
      {children}
    </div>
  )
}
