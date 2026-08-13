import { useState, useEffect, useCallback } from 'react'

export type AppTheme = 'light' | 'dim' | 'dark' | 'system'

/** OSがダークモードかどうかを返す */
const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

/** 設定値と OS 設定から実際に適用するテーマ ('light' | 'dim' | 'dark') を解決する */
const resolveTheme = (theme: AppTheme, prefersDark: boolean): 'light' | 'dim' | 'dark' => {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

/** <html> の data-theme 属性に解決済みテーマを反映する */
const applyTheme = (resolved: 'light' | 'dim' | 'dark') => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved
  }
}

/** 保存済みの appTheme を読み出す（デフォルトは 'dim'） */
const readStoredTheme = (): AppTheme => {
  const stored = window.store?.get('appTheme' as any) as AppTheme | undefined
  return stored ?? 'dim'
}

/**
 * アプリの外観テーマを管理するフック。
 * - appTheme: ユーザー設定 ('light' | 'dim' | 'dark' | 'system')
 * - setAppTheme: 設定を更新し、electron-store と <html data-theme> に反映
 * - isDarkMode: 実際にダーク表示かどうか（既存コンポーネント互換のため維持）
 */
export const useTheme = () => {
  const [appTheme, setAppThemeState] = useState<AppTheme>(() => readStoredTheme())
  const [prefersDark, setPrefersDark] = useState<boolean>(() => systemPrefersDark())

  // OS のカラースキーム変更を監視（'system' 選択時に追従するため）
  useEffect(() => {
    if (!window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersDark(e.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      // 古いブラウザ向け（Safari 13未満など）
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [])

  // 設定 or OS 設定が変わったら <html data-theme> を更新
  const resolved = resolveTheme(appTheme, prefersDark)
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  const setAppTheme = useCallback((theme: AppTheme) => {
    setAppThemeState(theme)
    window.store?.set('appTheme' as any, theme)
  }, [])

  return {
    appTheme,
    setAppTheme,
    resolvedTheme: resolved,
    isDarkMode: resolved === 'dark'
  }
}
