export type MediaSource = "caption-app" | "prompt-tool" | null;

export function mediaSource(value?: string): MediaSource {
  return value === "caption-app" || value === "prompt-tool" ? value : null;
}

export function mediaHref(chain: string | null, source: MediaSource, page = 1) {
  const params = new URLSearchParams({ view: "media" });
  if (chain) params.set("chain", chain);
  if (source) params.set("source", source);
  if (page > 1) params.set("page", String(page));
  return `/?${params.toString()}`;
}
