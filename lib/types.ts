export type Step = { id: string; prompt: string; llm_model_id: string | null; step_order: number };
export type Chain = { id: string; name: string; description: string | null; revision: number; steps: Step[]; live: boolean };
export type Model = { id: string; name: string; provider: string };
export type Photo = { id: string; alt_text: string; url: string; storage_path?: string | null };
export type Workspace = { chains: Chain[]; models: Model[] };
export type StepOutput = { order: number; model: string; prompt: string; output: string; latencyMs: number; inputTokens: number | null; outputTokens: number | null };
export type Run = { id: string; chain_id: string | null; chain_name: string; status: string; scene: string; image_url: string | null; output: string | null; error: string | null; created_at: string; outputs: StepOutput[]; source: string };
