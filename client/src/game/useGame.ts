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

// 跌倒貓從左上滑到右下：起點在左上角外的對角線上，中心沿 y=x 穿過框中央 (0.5,0.5)
const START_C = -0.25 // 物體中心起始座標（x=y），在畫面左上角外

const BASE_SPEED = 0.4 // 正規化單位 / 秒（Level 1 約 2.5 秒橫越）
const SPEED_K = 0.15 // 每升一級的加速幅度
export const MAX_LIVES = 5 // 滿血命數，血條比例用

const speedFor = (level: number) => BASE_SPEED * (1 + (level - 1) * SPEED_K)
const freshObject = (): Rect => ({
  x: START_C - OBJ_W / 2,
  y: START_C - OBJ_H / 2,
  w: OBJ_W,
  h: OBJ_H,
})

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
  hitStreak: number // 累積成功次數，每 5 次補 1 格血
  healId: number
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
})

function toSnapshot(g: Mutable): GameSnapshot {
  return {
    phase: g.phase,
    level: g.level,
    score: g.score,
    lives: g.lives,
    object: g.object,
    frame: FRAME,
    lastRatio: g.lastRatio,
    shotId: g.shotId,
    lastHit: g.lastHit,
    healId: g.healId,
    hitStreak: g.hitStreak,
  }
}

/**
 * 遊戲邏輯全在這。跟渲染脫鉤：對外只給 state 快照 + 三個動作。
 * 之後要換 canvas，動這個 hook 以外的東西都不用碰。
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

  // 換下一個物體（沿用目前 level 的速度）
  const spawnNext = useCallback(() => {
    const g = ref.current
    g.object = freshObject()
    g.speed = speedFor(g.level)
  }, [])

  // 一次 Miss：扣命，命歸零 → Game Over，否則換下一個
  const registerMiss = useCallback(() => {
    const g = ref.current
    g.lives -= 1
    g.lastRatio = 0
    if (g.lives <= 0) {
      g.phase = 'gameover'
      stopLoop()
    } else {
      spawnNext()
    }
    publish()
  }, [publish, spawnNext, stopLoop])

  const loop = useCallback(
    (ts: number) => {
      const g = ref.current
      if (g.phase !== 'playing') return
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0
      lastTsRef.current = ts
      const step = g.speed * dt
      g.object = { ...g.object, x: g.object.x + step, y: g.object.y + step }
      if (g.object.x > 1 || g.object.y > 1) {
        spawnNext() // 整個滑出右下 → 不扣血，直接換下一隻
      }
      publish()
      if (ref.current.phase === 'playing') {
        rafRef.current = requestAnimationFrame(loop)
      }
    },
    [publish, spawnNext],
  )

  const start = useCallback(() => {
    stopLoop()
    ref.current = { ...initialMutable(), phase: 'playing' }
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

  // 按快門：算重疊 → 0% 算 Miss，否則加分、升級、加速、換下一個
  const shoot = useCallback(() => {
    const g = ref.current
    if (g.phase !== 'playing') return
    const ratio = overlapRatio(g.object, FRAME)
    const points = scoreFor(ratio)
    g.shotId += 1
    g.lastHit = points > 0
    if (points <= 0) {
      g.hitStreak = 0 // miss → 連續成功歸零、補血進度重算
      registerMiss() // 不夠貼合 → 算沒拍到，扣血（registerMiss 會 publish）
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
    spawnNext()
    publish()
  }, [publish, registerMiss, spawnNext])

  useEffect(() => () => stopLoop(), [stopLoop]) // 卸載時收尾

  return { state: snap, start, shoot, reset }
}
