import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { money, moneyCompact } from "./format";

export type ThemeChoice = "system" | "light" | "dark";

type Settings = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  /** Desktop sidebar collapsed to an icon-only rail. */
  navCollapsed: boolean;
  toggleNav: () => void;
  /** Money formatters. The app is BDT only. */
  fmt: (value: number) => string;
  fmtCompact: (value: number) => string;
};

const SettingsContext = createContext<Settings | null>(null);

const THEME_KEY = "ac.theme";
const NAV_KEY = "ac.navCollapsed";

function readTheme(): ThemeChoice {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function readNavCollapsed(): boolean {
  return localStorage.getItem(NAV_KEY) === "1";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(readNavCollapsed);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  }, []);

  const toggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(NAV_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const value = useMemo<Settings>(
    () => ({
      theme,
      setTheme,
      navCollapsed,
      toggleNav,
      fmt: money,
      fmtCompact: moneyCompact,
    }),
    [theme, setTheme, navCollapsed, toggleNav],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
