import type { Metadata } from "next";
import ThemePicker from "@/components/ThemePicker";
import "./globals.css";
export const metadata: Metadata = { title: "Prompt Chain Tool | Columbia Chuckles", description: "Build and run campus humor prompt chains.", robots: { index: false, follow: false } };
const initTheme = `(function(){try{var t=localStorage.getItem('chuckles-theme');document.documentElement.dataset.theme=['light','dark'].includes(t)?t:'system'}catch{}})()`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: initTheme }} /></head><body><div className="appearance"><ThemePicker /></div>{children}</body></html>;
}
