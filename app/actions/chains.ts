"use server";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { adminForAction, uuidPattern } from "@/lib/auth";
import { executeChain, type RunPlan } from "@/lib/pipeline";
import type { Step, Photo } from "@/lib/types";
import { readPhoto } from "@/lib/photo";
import { humorStyles } from "@/lib/humor";

export async function saveChain(id: string | null, revision: number, name: string, description: string, steps: Step[]) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (Array.isArray(steps) && steps.length === 0) return { error: "Add at least one prompt chain step before saving." };
  if ((id && !uuidPattern.test(id)) || !Number.isInteger(revision) || typeof name !== "string" || typeof description !== "string" || !Array.isArray(steps) || steps.length > 6)
    return { error: "Invalid prompt chain." };
  const { data, error } = await auth.supabase.rpc("tool_save_chain", { p_id: id, p_revision: revision, p_name: name, p_description: description,
    p_steps: steps.map(step => ({ id: step.id, prompt: step.prompt, llm_model_id: step.llm_model_id })) });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { id: data as string };
}

export async function deleteChain(id: string, revision: number) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (!uuidPattern.test(id) || !Number.isInteger(revision)) return { error: "Invalid prompt chain." };
  const { error } = await auth.supabase.rpc("tool_delete_chain", { p_id: id, p_revision: revision });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}

export async function findPhotos(query: string, page: number) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (typeof query !== "string" || !Number.isInteger(page) || page < 1) return { error: "Invalid search." };
  const { data, error } = await auth.supabase.rpc("admin_resource_read", { resource: "images", search_text: query.slice(0, 200), page_number: page });
  if (error) return { error: "Could not load photos." };
  return { rows: data.rows as Photo[], total: data.total as number };
}

export async function generateMedia(chain: string, revision: number, image: string, scene: string, humor: string) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (!uuidPattern.test(chain) || !uuidPattern.test(image) || !Number.isInteger(revision) || typeof scene !== "string") return { error: "Choose a chain, photo and scene." };
  const style = humorStyles.find(option => option.id === humor);
  if (!style) return { error: "Choose an available humor style." };
  const humorStyle = `${style.name}. ${style.instruction}`;
  const context = `${scene.trim()}\n\nSelected humor style: ${humorStyle}`;
  if (!scene.trim() || scene.length > 800 || context.length > 1000) return { error: "Enter a scene of at most 800 characters." };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Generation is not configured. Add GEMINI_API_KEY to this deployment." };
  const { data, error } = await auth.supabase.rpc("tool_begin_run", { p_chain: chain, p_revision: revision, p_image: image,
    p_scene: context, p_default_model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite" });
  if (error) return { error: error.message };
  const run = data as { id: string; plan: RunPlan; storage_path: string | null };
  try {
    const photo = run.storage_path ? await readPhoto(auth.supabase, run.storage_path) : undefined;
    const ai = new GoogleGenAI({ apiKey });
    const output = await executeChain({ ...run.plan, humorStyle }, async ({ model, prompt, includePhoto }) => {
      const response = await ai.interactions.create({ model, input: includePhoto && photo ? [{ type: "text", text: prompt }, photo] : prompt, store: false },
        { timeout: 30_000, retries: { strategy: "none" } });
      return { text: response.output_text ?? "", inputTokens: response.usage?.total_input_tokens, outputTokens: response.usage?.total_output_tokens };
    }, async step => {
      const { error } = await auth.supabase.rpc("tool_record_step", { p_run: run.id, p_step: step });
      if (error) throw new Error("Could not save step");
    });
    revalidatePath("/");
    return { id: run.id, output };
  } catch {
    const { error: saveError } = await auth.supabase.rpc("tool_fail_run", { p_run: run.id });
    revalidatePath("/");
    return { id: run.id, error: saveError ? "Execution stopped; its saved status could not be confirmed. Refresh generated media before retrying." : "Generation stopped. Review saved steps in Generated media, then try a new run." };
  }
}
