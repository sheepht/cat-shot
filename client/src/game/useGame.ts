import { useCallback, useEffect, useRef, useState } from 'react'
import { overlapRatio, scoreFor, type Rect } from './scoring'

export type Phase = 'menu' | 'playing' | 'gameover'

export interface GameSnapshot {
  phase: Phase
  level: number
  score: number
  lives: number
  object: Rect
  frame: Rect
  waiting: boolean // 等待下一隻貓出現的空檔（此時畫面不畫貓）
  lastRatio: number | null // 上一張的重疊比例，給畫面做回饋；null = 還沒拍過
  shotId: number // 每次按快門 +1，畫面用來觸發閃光
  lastHit: boolean // 這一發有沒有拍到，決定閃光顏色（灰/紅）
  healId: number // 每次補血 +1，畫面用來觸發補血音效 + 綠光
  hitStreak: number // 連續成功次數（0~4），畫成血條上的補血進度；miss 歸零
}

// --- 可調參數（座標皆正規化 0~1，正方形場）---
export const CAT_ASPECT = 713 / 560 // 跌倒貓圖片長寬比（w/h），框與物體都照這個比例才不變形

const OBJ_W = 0.36 // 移動貓的大小
const OBJ_H = OBJ_W / CAT_ASPECT

// 框跟貓主體等大：對準時虛線輪廓剛好疊在貓身上
const FRAME_W = OBJ_W
const FRAME_H = FRAME_W / CAT_ASPECT
const FRAME: Rect = { x: (1 - FRAME_W) / 2, y: (1 - FRAME_H) / 2, w: FRAME_W, h: FRAME_H } // 中央貓形目標
const ALIGN_X = FRAME.x // 貓對準框時的 object.x

// 跌倒貓從左上滑到右下：起點在左上角外的對角線上，中心沿 y=x 穿過框中央 (0.5,0.5)
const START_C = -0.25 // 物體中心起始座標（x=y），在畫面左上角外

const BASE_SPEED = 0.4 // 正規化單位 / 秒（Level 1 約 2.5 秒橫越）
const SPEED_K = 0.15 // 每升一級的加速幅度
export const MAX_LIVES = 5 // 滿血命數，血條比例用

const SPAWN_WAIT_MIN = 1 // 拍完後隔多久出下一隻（秒）
const SPAWN_WAIT_MAX = 3

const speedFor = (level: number) => BASE_SPEED * (1 + (level - 1) * SPEED_K)
const freshObject = (): Rect => ({
  x: START_C - OBJ_W / 2,
  y: START_C - OBJ_H / 2,
  w: OBJ_W,
  h: OBJ_H,
})

// --- 花招 ---
type Trick =
  | 'steady' // 等速
  | 'wave' // 忽快忽慢
  | 'linger' // 框前放慢
  | 'brake' // 快到框前急停一下
  | 'rush' // 穿框前加速
  | 'dash' // 高速衝刺
  | 'comeback' // 過框一點就掉頭回去
  | 'arc' // 往框飛、快到時走半圓繞過，剛好不進框（誘餌）

const ARC_R = 0.4 // arc 繞行框中心的半徑（夠大 → 貓不會進到框裡）

// 依關卡加權挑花招：前 5 關純直線（只加速），第 6 關起才開始有花招、越高關越花
function pickTrick(level: number): Trick {
  if (level <= 5) return 'steady'
  const weighted: [Trick, number][] = [
    ['steady', Math.max(1, 12 - level)],
    ['wave', level >= 6 ? 2 : 0],
    ['linger', level >= 6 ? 1.5 : 0],
    ['brake', level >= 7 ? 2 : 0],
    ['arc', level >= 7 ? 2 : 0],
    ['rush', level >= 8 ? 2 : 0],
    ['dash', level >= 9 ? 2 : 0],
    ['comeback', level >= 10 ? 1.5 : 0],
  ]
  const total = weighted.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [t, w] of weighted) {
    if (w <= 0) continue
    r -= w
    if (r <= 0) return t
  }
  return 'steady'
}

interface Mutable {
  phase: Phase
  level: number
  score: number
  lives: number
  object: Rect
  speed: number
  lastRatio: number | null
  shotId: number
  lastHit: boolean
  hitStreak: number
  healId: number
  // 移動狀態
  waiting: boolean
  waitLeft: number
  elapsed: number // 這隻貓出現後經過的秒數
  dir: 1 | -1 // 前進 / 倒退
  trick: Trick
  braked: boolean // brake 是否已急停過
  brakeLeft: number // 急停剩餘秒數
  inArc: boolean // arc 是否已進入圓弧段
  arcDone: boolean // arc 半圓是否走完
  arcAng: number // arc 目前角度
  arcStart: number // arc 起始角度
}

const initialMutable = (): Mutable => ({
  phase: 'menu',
  level: 1,
  score: 0,
  lives: MAX_LIVES,
  object: freshObject(),
  speed: speedFor(1),
  lastRatio: null,
  shotId: 0,
  lastHit: false,
  hitStreak: 0,
  healId: 0,
  waiting: false,
  waitLeft: 0,
  elapsed: 0,
  dir: 1,
  trick: 'steady',
  braked: false,
  brakeLeft: 0,
  inArc: false,
  arcDone: false,
  arcAng: 0,
  arcStart: 0,
})

// 進入等待：暫時沒有貓，隨機 1~3 秒後出下一隻
function enterWait(g: Mutable) {
  g.waiting = true
  g.waitLeft = SPAWN_WAIT_MIN + Math.random() * (SPAWN_WAIT_MAX - SPAWN_WAIT_MIN)
}

// 開始一隻新貓：回到起點、選一個花招、用目前 level 的速度
function activate(g: Mutable) {
  g.object = freshObject()
  g.dir = 1
  g.elapsed = 0
  g.speed = speedFor(g.level)
  g.trick = pickTrick(g.level)
  g.braked = false
  g.brakeLeft = 0
  g.inArc = false
  g.arcDone = false
  g.arcAng = 0
  g.arcStart = 0
  g.waiting = false
}

// 依花招推進這一幀的位置（x、y 同步移動 → 維持對角線）
function advance(g: Mutable, dt: number) {
  g.elapsed += dt
  const base = g.speed
  const x = g.object.x
  let v = base
  switch (g.trick) {
    case 'steady':
      v = base
      break
    case 'wave': {
      const o = (Math.sin(g.elapsed * 5) + 1) / 2 // 0..1
      v = base * (0.35 + 1.3 * o)
      break
    }
    case 'linger': {
      const near = Math.max(0, 1 - Math.abs(x - ALIGN_X) / 0.22)
      v = base * (1 - 0.72 * near) // 越近框越慢
      break
    }
    case 'rush': {
      const near = Math.max(0, 1 - Math.abs(x - ALIGN_X) / 0.25)
      v = base * (1 + 2.2 * near) // 越近框越快
      break
    }
    case 'dash':
      v = base * 2
      break
    case 'brake': {
      if (g.brakeLeft > 0) {
        g.brakeLeft -= dt
        v = 0
      } else if (!g.braked && x > ALIGN_X - 0.15 && x < ALIGN_X - 0.03) {
        g.braked = true
        g.brakeLeft = 0.4 + Math.random() * 0.5 // 快到框前急停一下
        v = 0
      } else {
        v = base
      }
      break
    }
    case 'comeback': {
      if (g.dir === 1 && x > ALIGN_X + 0.12) g.dir = -1 // 過框一點就掉頭
      v = base * 1.15
      break
    }
    case 'arc': {
      // 往框中心直線靠近 → 靠到半徑 ARC_R 就轉成圓弧繞過 → 半圓後往右下離場
      const cx = g.object.x + OBJ_W / 2
      const cy = g.object.y + OBJ_H / 2
      if (g.arcDone) {
        const step = base * dt
        g.object = { ...g.object, x: g.object.x + step, y: g.object.y + step }
      } else if (g.inArc) {
        g.arcAng -= (base / ARC_R) * dt // 沿圓弧繞行（線速度 = base）
        if (g.arcStart - g.arcAng >= Math.PI) {
          g.arcDone = true // 半圓走完
        } else {
          const nx = 0.5 + ARC_R * Math.cos(g.arcAng)
          const ny = 0.5 + ARC_R * Math.sin(g.arcAng)
          g.object = { ...g.object, x: nx - OBJ_W / 2, y: ny - OBJ_H / 2 }
        }
      } else if (Math.hypot(0.5 - cx, 0.5 - cy) <= ARC_R) {
        g.inArc = true
        g.arcStart = Math.atan2(cy - 0.5, cx - 0.5)
        g.arcAng = g.arcStart
      } else {
        const step = base * dt
        g.object = { ...g.object, x: g.object.x + step, y: g.object.y + step }
      }
      return // arc 自己算好位置，不走下面的通用位移
    }
  }
  const step = v * g.dir * dt
  g.object = { ...g.object, x: g.object.x + step, y: g.object.y + step }
}

// 貓是否整個離開畫面（往右下出去、或往左上退回去）
function isGone(g: Mutable): boolean {
  const { x, y } = g.object
  return x > 1 || y > 1 || x < -OBJ_W - 0.25 || y < -OBJ_H - 0.25
}

function toSnapshot(g: Mutable): GameSnapshot {
  return {
    phase: g.phase,
    level: g.level,
    score: g.score,
    lives: g.lives,
    object: g.object,
    frame: FRAME,
    waiting: g.waiting,
    lastRatio: g.lastRatio,
    shotId: g.shotId,
    lastHit: g.lastHit,
    healId: g.healId,
    hitStreak: g.hitStreak,
  }
}

/**
 * 遊戲邏輯全在這。跟渲染脫鉤：對外只給 state 快照 + 三個動作。
 */
export function useGame() {
  const ref = useRef<Mutable>(initialMutable())
  const [snap, setSnap] = useState<GameSnapshot>(() => toSnapshot(ref.current))
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef<number>(0)

  const publish = useCallback(() => setSnap(toSnapshot(ref.current)), [])

  const stopLoop = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
    }
  }, [])

  // 一次 Miss（貓在場上但沒拍到）：扣命，命歸零 → Game Over，否則等下一隻
  const registerMiss = useCallback(() => {
    const g = ref.current
    g.lives -= 1
    g.lastRatio = 0
    if (g.lives <= 0) {
      g.phase = 'gameover'
      stopLoop()
    } else {
      enterWait(g)
    }
    publish()
  }, [publish, stopLoop])

  const loop = useCallback(
    (ts: number) => {
      const g = ref.current
      if (g.phase !== 'playing') return
      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0
      lastTsRef.current = ts
      if (g.waiting) {
        g.waitLeft -= dt
        if (g.waitLeft <= 0) {
          activate(g)
          publish()
        }
      } else {
        advance(g, dt)
        if (isGone(g)) enterWait(g) // 滑出畫面 → 不扣血，等一下出下一隻
        publish()
      }
      if (ref.current.phase === 'playing') {
        rafRef.current = requestAnimationFrame(loop)
      }
    },
    [publish],
  )

  const start = useCallback(() => {
    stopLoop()
    ref.current = { ...initialMutable(), phase: 'playing' }
    enterWait(ref.current)
    ref.current.waitLeft = 0.8 // 開場短等待，讓玩家準備
    lastTsRef.current = 0
    publish()
    rafRef.current = requestAnimationFrame(loop)
  }, [loop, publish, stopLoop])

  const reset = useCallback(() => {
    stopLoop()
    ref.current = initialMutable()
    lastTsRef.current = 0
    publish()
  }, [publish, stopLoop])

  // 按快門
  const shoot = useCallback(() => {
    const g = ref.current
    if (g.phase !== 'playing') return

    // 還在等待、貓還沒出現就按 → 算 miss 扣血（但不重置等待中的貓）
    if (g.waiting) {
      g.shotId += 1
      g.lastHit = false
      g.lastRatio = 0
      g.hitStreak = 0
      g.lives -= 1
      if (g.lives <= 0) {
        g.phase = 'gameover'
        stopLoop()
      }
      publish()
      return
    }

    const ratio = overlapRatio(g.object, FRAME)
    const points = scoreFor(ratio)
    g.shotId += 1
    g.lastHit = points > 0
    if (points <= 0) {
      g.hitStreak = 0 // miss → 連續成功歸零、補血進度重算
      registerMiss()
      return
    }
    g.lastRatio = ratio
    g.score += points
    g.level += 1
    // 連續 5 次成功補 1 格血（未滿血才補；滿血則歸零、不溢補）
    g.hitStreak += 1
    if (g.hitStreak >= 5) {
      g.hitStreak = 0
      if (g.lives < MAX_LIVES) {
        g.lives += 1
        g.healId += 1
      }
    }
    enterWait(g) // 成功後也是隔 1~3 秒再來下一隻
    publish()
  }, [publish, registerMiss, stopLoop])

  useEffect(() => () => stopLoop(), [stopLoop]) // 卸載時收尾

  return { state: snap, start, shoot, reset }
}
