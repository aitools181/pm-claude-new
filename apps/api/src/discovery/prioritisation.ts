export type IdeaScoreInput = { impact: number; confidence: number; effort: number; reach: number; customerWeight?: number };
export function scoreIdea(kind: "rice" | "wsjf" | "weighted", input: IdeaScoreInput, weights: Record<string, number> = {}) {
  const effort = Math.max(0.01, input.effort || 1);
  if (kind === "rice") return (input.reach * input.impact * (input.confidence / 100) * (input.customerWeight ?? 1)) / effort;
  if (kind === "wsjf") return ((input.impact * (weights.impact ?? 1)) + (input.reach * (weights.reach ?? 1)) + (input.confidence * (weights.confidence ?? 0.1))) / effort;
  return ((input.impact * (weights.impact ?? 1)) + (input.confidence * (weights.confidence ?? 1)) + (input.reach * (weights.reach ?? 1)) + ((input.customerWeight ?? 1) * (weights.customerWeight ?? 1))) - (effort * (weights.effort ?? 1));
}
