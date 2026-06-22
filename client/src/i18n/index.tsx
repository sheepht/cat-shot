import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import zh from './locales/zh.json'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import es from './locales/es.json'
import hi from './locales/hi.json'
import ar from './locales/ar.json'
import bn from './locales/bn.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import ja from './locales/ja.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import id from './locales/id.json'
import ko from './locales/ko.json'

// 大致依使用人口排序；標籤用該語言的母語縮寫
export const LANGS = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh', label: '繁', name: '繁體中文' },
  { code: 'zh-CN', label: '简', name: '简体中文' },
  { code: 'hi', label: 'हि', name: 'हिन्दी' },
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'ar', label: 'ع', name: 'العربية' },
  { code: 'bn', label: 'বা', name: 'বাংলা' },
  { code: 'pt', label: 'PT', name: 'Português' },
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'ja', label: '日', name: '日本語' },
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'de', label: 'DE', name: 'Deutsch' },
  { code: 'id', label: 'ID', name: 'Bahasa Indonesia' },
  { code: 'ko', label: '한', name: '한국어' },
] as const

export type Lang = (typeof LANGS)[number]['code']

// 由右至左書寫的語言（目前只有阿拉伯文）
const RTL_LANGS = new Set<Lang>(['ar'])

// 每種語言一份 JSON 字典。鍵相同、值對應翻譯，含 {n} 佔位的字串由 t.reachedLevel(n) 套用。
export type Messages = typeof zh

const dictionaries: Record<Lang, Messages> = {
  zh, 'zh-CN': zhCN, en, es, hi, ar, bn, pt, ru, ja, fr, de, id, ko,
}

// 對外的字串包：純字串直接給，含佔位的字串包成函式（JSON 放不了函式）
export type Strings = Omit<Messages, 'reachedLevel'> & {
  reachedLevel: (n: number) => string
}

function build(m: Messages): Strings {
  return {
    ...m,
    reachedLevel: (n: number) => m.reachedLevel.replace('{n}', String(n)),
  }
}

const STORAGE_KEY = 'cat-shot-lang'
const SUPPORTED = LANGS.map((l) => l.code) as readonly string[]

// 偵測瀏覽器語系 → 對應到我們支援的語言，無命中則退回英文
function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED.includes(stored)) return stored as Lang
  for (const l of navigator.languages ?? [navigator.language]) {
    const lower = l.toLowerCase()
    // 中文要分繁簡：簡體用於 zh-Hans / 中國 / 新加坡 / 馬來西亞，其餘（台港澳、純 zh）給繁體
    if (lower.startsWith('zh')) {
      return /hans|-cn|-sg|-my/.test(lower) ? 'zh-CN' : 'zh'
    }
    const code = lower.split('-')[0]
    if (SUPPORTED.includes(code)) return code as Lang
  }
  return 'en'
}

type I18nValue = { lang: Lang; setLang: (l: Lang) => void; t: Strings }

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr'
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t: build(dictionaries[lang]) }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
