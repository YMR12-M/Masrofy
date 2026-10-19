import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../lib/hooks.js';

const ThemeContext = createContext(null);

const THEME_COLORS = { light: '#f5f3ee', dark: '#0e1412' };

/** 'light' | 'dark' | 'auto' (يتبع إعداد الجهاز) — تفضيل شخصي لكل جهاز */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useLocalStorage('masrofy.theme', 'auto');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'dark' || (preference === 'auto' && media.matches) ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
