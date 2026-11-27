'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Button } from './button';
import { MoonIcon, SunIcon } from './icons';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'cropsy-theme';

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light');

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const applyTheme = useCallback((next) => {
    const root = document.documentElement;
    root.classList.toggle('dark', next === 'dark');
    root.style.colorScheme = next;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be disabled; the class-based theme still works for this session.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: applyTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className, label }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={label ?? (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
      className={className}
    >
      <SunIcon className="h-5 w-5 dark:hidden" />
      <MoonIcon className="hidden h-5 w-5 dark:block" />
    </Button>
  );
}
