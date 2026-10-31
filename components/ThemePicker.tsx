"use client";
import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => { window.addEventListener("themechange", callback); return () => window.removeEventListener("themechange", callback); };
const getTheme = () => { try { return localStorage.getItem("chuckles-theme") || "system"; } catch { return "system"; } };
export default function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system");
  return <label className="theme-picker">Appearance<select aria-label="Appearance" value={theme} onChange={event => {
    const value = event.target.value;
    try { localStorage.setItem("chuckles-theme", value); } catch { /* Still apply for this visit. */ }
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event("themechange"));
  }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
