import type { StepOutput } from "./types";

export type RunPlan = { steps: { prompt: string; model: string }[]; scene: string; description: string };
export type Generate = (input: { model: string; prompt: string; includePhoto: boolean }) => Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;

export function stepPrompt(plan: RunPlan, index: number, previous: string): string {
  const input = index === 0
    ? `Photo description: ${plan.description}\nScene: ${plan.scene}`
    : `Output from step ${index}:\n${previous}`;
  return `${plan.steps[index].prompt}\n\nInput:\n${input}`;
}

/** Sequential calls: an intermediate response is the next step's actual input. */
export async function executeChain(plan: RunPlan, generate: Generate, record: (step: StepOutput) => Promise<void>) {
  if (!plan.steps.length || plan.steps.length > 6) throw new Error("A run needs 1–6 steps.");
  let previous = "";
  for (let index = 0; index < plan.steps.length; index++) {
    const step = plan.steps[index];
    const prompt = stepPrompt(plan, index, previous);
    const started = Date.now();
    const response = await generate({ model: step.model, prompt, includePhoto: index === 0 });
    if (!response.text.trim() || response.text.length > 20000) throw new Error(`Step ${index + 1} returned empty or oversized output.`);
    const output: StepOutput = { order: index, model: step.model, prompt, output: response.text.trim(),
      latencyMs: Date.now() - started, inputTokens: response.inputTokens ?? null, outputTokens: response.outputTokens ?? null };
    await record(output);
    previous = output.output;
  }
  return previous;
}
