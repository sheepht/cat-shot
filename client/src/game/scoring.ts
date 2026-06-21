// 遊戲的「心臟」：純函式，跟畫面、React 完全無關，好單元測試。
// 全部用正規化座標（0~1，相對於正方形遊戲場）。

export interface Rect {
  x: number // 左緣（可為負 / >1，物體在場外時）
  y: number // 上緣
  w: number // 寬
  h: number // 高
}

/**
 * 物體有多少比例落在框內，回傳 0~1。
 * 軸對齊矩形（AABB）交集面積 ÷ 物體面積。
 * 100% 在框內 = 1（滿分），完全沒進框 = 0（Miss）。
 */
export function overlapRatio(object: Rect, frame: Rect): number {
  const ix = Math.max(
    0,
    Math.min(object.x + object.w, frame.x + frame.w) - Math.max(object.x, frame.x),
  )
  const iy = Math.max(
    0,
    Math.min(object.y + object.h, frame.y + frame.h) - Math.max(object.y, frame.y),
  )
  const intersection = ix * iy
  const area = object.w * object.h
  if (area <= 0) return 0
  return intersection / area
}

// 計分門檻：重疊低於這個比例就算沒拍到（0 分）。越高 = 越嚴謹、越要對準。
export const SCORE_MIN_OVERLAP = 0.7

/** 重疊比例 → 分數。低於門檻回 0（= 沒拍到）；門檻以上 [MIN..1] 映射到 [1..100] */
export function scoreFor(ratio: number): number {
  if (ratio < SCORE_MIN_OVERLAP) return 0
  const t = (ratio - SCORE_MIN_OVERLAP) / (1 - SCORE_MIN_OVERLAP)
  return Math.max(1, Math.round(t * 100))
}

/** 綠色提示強度 0~1，跟計分同一個嚴謹區間：越貼合越綠 */
export function nearnessFor(ratio: number): number {
  if (ratio <= SCORE_MIN_OVERLAP) return 0
  return (ratio - SCORE_MIN_OVERLAP) / (1 - SCORE_MIN_OVERLAP)
}
