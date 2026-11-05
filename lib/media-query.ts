export type MediaSource = "caption-app" | "prompt-tool" | null;
export type MediaStatus = "completed" | "failed" | "running" | "pending" | null;

export function mediaStatus(value?: string): MediaStatus {
  return value === "completed" || value === "failed" || value === "running" || value === "pending" ? value : null;
}

export function mediaSource(value?: string): MediaSource {
  return value === "caption-app" || value === "prompt-tool" ? value : null;
}

export function mediaHref(chain: string | null, source: MediaSource, page = 1, status: MediaStatus = null) {
  const params = new URLSearchParams({ view: "media" });
  if (chain) params.set("chain", chain);
  if (source) params.set("source", source);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return `/?${params.toString()}`;
}
