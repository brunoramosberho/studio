"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "studio-theme";
const COOKIE_KEY = "studio-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface ThemeContextValue {
  /** User-selected preference: "light" | "dark" | "system". */
  theme: ThemeMode;
  /** The theme actually applied right now ("light" or "dark"). */
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.toggle("dark", resolved === "dark");
  // Keep the iOS/Android PWA status bar in sync with the visible theme.
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta) {
    meta.content = resolved === "dark" ? "#0B0B0F" : "#FFFFFF";
  }
}

function writeCookie(value: ThemeMode) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  /**
   * SSR-resolved preference from the cookie. If absent, defaults to "system".
   * Keeps the first paint in sync with the class already set on <html> by
   * the no-flash script in the root layout.
   */
  initialTheme?: ThemeMode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme ?? "system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === "undefined") {
      // On SSR, best guess: if explicit pref, use it; else light.
      if (initialTheme === "dark") return "dark";
      return "light";
    }
    return document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  });

  // Hydrate from localStorage if the cookie was missing or stale.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored && stored !== theme) {
        setThemeState(stored);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve + apply the theme whenever preference or system preference changes.
  useEffect(() => {
    const resolve = () =>
      theme === "system" ? getSystemTheme() : (theme as ResolvedTheme);

    const resolved = resolve();
    setResolvedTheme(resolved);
    applyThemeClass(resolved);

    if (theme !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = getSystemTheme();
      setResolvedTheme(r);
      applyThemeClass(r);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    writeCookie(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
