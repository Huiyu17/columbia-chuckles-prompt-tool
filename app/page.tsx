import Link from "next/link";
import { requireAdmin, uuidPattern } from "@/lib/auth";
import type { Workspace, Run } from "@/lib/types";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
import ChainWorkspace from "@/components/ChainWorkspace";
import MediaGallery from "@/components/MediaGallery";
export const maxDuration = 300;
export default async function Home({ searchParams }: { searchParams: Promise<{ chain?: string; view?: string; page?: string }> }) {
  const { supabase, user } = await requireAdmin();
  const sp = await searchParams;
  const { data, error } = await supabase.rpc("tool_workspace");
  const workspace = data as Workspace | null;
  const chain = sp.chain && uuidPattern.test(sp.chain) ? sp.chain : null;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(sp.page) || 1)));
  const mediaView = sp.view === "media";
  const media = mediaView ? await supabase.rpc("tool_media", { p_chain: chain, p_page: page }) : null;
  return <div className="shell"><header className="topbar"><Link href="/" className="brand-link"><BrandMark /></Link><div className="account"><span className="small muted">{user.email}</span><LogoutButton /></div></header>
    <nav className="main-nav" aria-label="Main navigation"><Link className={!mediaView ? "active" : ""} href="/">Prompt chains</Link><Link className={mediaView ? "active" : ""} href="/?view=media">Generated media</Link><span className="staff-badge">Superadmin</span></nav>
    {error || !workspace ? <section role="alert" className="card stack"><h1>Prompt chain tool is not ready.</h1><p>Could not load the workspace. Check the shared database connection and apply the Week 8 migration.</p><details><summary>Setup details</summary><p>{error?.message}</p><code>supabase/015_prompt_chain_tool.sql</code></details></section>
      : mediaView ? <MediaGallery chains={workspace.chains} selected={chain} page={page} rows={(media?.data?.rows ?? []) as Run[]} total={media?.data?.total ?? 0} error={media?.error?.message} />
      : <ChainWorkspace key={chain ?? "new"} data={workspace} selected={chain} />}
    <footer>Columbia Chuckles · Prompt Chain Tool</footer></div>;
}
