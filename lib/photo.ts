import type { createClient } from "./supabase/server";

// Public bucket reads support photos belonging to other users without a service key.
// Fetch only our configured bucket; never fetch an arbitrary URL from a form/record.
export async function readPhoto(supabase: Awaited<ReturnType<typeof createClient>>, storagePath: string) {
  const { data } = supabase.storage.from("caption-images").getPublicUrl(storagePath);
  const target = new URL(data.publicUrl);
  if (target.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin || !target.pathname.startsWith("/storage/v1/object/public/caption-images/")) throw new Error("Invalid photo location");
  const response = await fetch(target, { signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 5 * 1024 * 1024) throw new Error("Photo unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) throw new Error("Photo is too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
    : bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP" ? "image/webp" : null;
  if (!mime) throw new Error("Unsupported photo");
  return { type: "image" as const, data: bytes.toString("base64"), mime_type: mime as "image/jpeg" | "image/png" | "image/webp" };
}
