// ---------------------------------------------------------------------------
// Modelux error hierarchy
// ---------------------------------------------------------------------------

export class ModeluxError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ModeluxError";
  }
}

export interface BudgetInfo {
  name: string;
  spend_usd: number;
  cap_usd: number;
  period: "daily" | "weekly" | "monthly";
  period_resets_at: string;
}

export class BudgetExceededError extends ModeluxError {
  public readonly budget: BudgetInfo;
  public readonly retryAfter: number | null;

  constructor(message: string, budget: BudgetInfo, retryAfter: number | null) {
    super(message, 402, "budget_exceeded");
    this.name = "BudgetExceededError";
    this.budget = budget;
    this.retryAfter = retryAfter;
  }
}
