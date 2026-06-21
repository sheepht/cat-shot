import ReactGA from 'react-ga4'

// GA4 評估 ID 由建置時的環境變數注入（VITE_GA_ID）。
// 沒設就完全不啟用 → dev / 沒設定的環境不會送任何資料。
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

export function initAnalytics() {
  if (!GA_ID) return
  ReactGA.initialize(GA_ID)
  ReactGA.send({ hitType: 'pageview', page: window.location.pathname })
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!GA_ID) return
  ReactGA.event(name, params)
}
