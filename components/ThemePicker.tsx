"use client";
import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => { window.addEventListener("themechange", callback); return () => window.removeEventListener("themechange", callback); };
const getTheme = () => { try { return localStorage.getItem("chuckles-theme") || "system"; } catch { return "system"; } };
export default function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system");
  return <div className="theme-switch" role="group" aria-label="Appearance">{(["light", "dark", "system"] as const).map(value => <button key={value} type="button" title={value === "system" ? "Use system theme" : `Use ${value} theme`} aria-label={value === "system" ? "System theme" : `${value === "light" ? "Light" : "Dark"} theme`} aria-pressed={theme === value} onClick={() => {
    try { localStorage.setItem("chuckles-theme", value); } catch { /* Still apply for this visit. */ }
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event("themechange"));
  }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{value === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : value === "dark" ? <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}</svg></button>)}</div>;
}
