export type BudgetGaugeColor = "muted" | "success" | "warning" | "error";

export function getBudgetUsageRatio(
  usedAfter: number,
  totalBudget: number | null,
): number | null {
  if (totalBudget === null) return null;
  return usedAfter / Math.max(totalBudget, 1);
}

export function getBudgetGaugeColor(
  usedAfter: number,
  totalBudget: number | null,
): BudgetGaugeColor {
  const ratio = getBudgetUsageRatio(usedAfter, totalBudget);
  if (ratio === null) return "muted";
  if (ratio >= 1) return "error";
  if (ratio >= 0.8) return "warning";
  return "success";
}

export function getOverBudgetChars(
  estimatedChars: number,
  remainingBudget: number | null,
): number {
  if (remainingBudget === null) return 0;
  return Math.max(estimatedChars - remainingBudget, 0);
}

export function shouldShowOverBudgetDelta(overBudgetChars: number): boolean {
  return overBudgetChars > 0;
}
