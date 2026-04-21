/**
 * API pricing in USD per million tokens / per image.
 * Keep this table in sync with the provider pricing pages — a one-line update
 * is all that's needed when Anthropic or Google moves prices.
 */

export const MODEL_PRICING = {
  "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "gemini-3.1-flash-image-preview": { perImageUsd: 0.039 },
} as const;

export type ModelId = keyof typeof MODEL_PRICING;

export function textModelCostUsd(
  modelId: ModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[modelId];
  if (!("inputPerMTok" in pricing)) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

export function imageModelCostUsd(modelId: ModelId, images: number): number {
  const pricing = MODEL_PRICING[modelId];
  if (!("perImageUsd" in pricing)) return 0;
  return images * pricing.perImageUsd;
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(1)}`;
}
