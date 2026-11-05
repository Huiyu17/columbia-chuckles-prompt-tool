"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { mediaHref, mediaSource, mediaStatus, type MediaSource, type MediaStatus } from "@/lib/media-query";

export default function MediaFilter({ chains, selected, source = null, status = null }: { chains: { id: string; name: string }[]; selected: string | null; source?: MediaSource; status?: MediaStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <div className="row filter" aria-busy={pending}>
    <label>Prompt chain<select name="chain" value={selected ?? ""} disabled={pending} onChange={event => {
      const href = mediaHref(event.target.value || null, source, 1, status);
      startTransition(() => router.push(href, { scroll: false }));
    }}><option value="">All prompt chains</option>{chains.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></label>
    <label>Source<select name="source" value={source ?? ""} disabled={pending} onChange={event => {
      const href = mediaHref(selected, mediaSource(event.target.value), 1, status);
      startTransition(() => router.push(href, { scroll: false }));
    }}><option value="">All</option><option value="caption-app">Public app</option><option value="prompt-tool">Prompt Chain Tool</option></select></label>
    <label>Generation status<select name="status" value={status ?? ""} disabled={pending} onChange={event => {
      const href = mediaHref(selected, source, 1, mediaStatus(event.target.value));
      startTransition(() => router.push(href, { scroll: false }));
    }}><option value="">All</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="running">In progress</option><option value="pending">Pending</option></select></label>
    {pending && <span role="status" className="small muted">Loading results…</span>}
  </div>;
}
