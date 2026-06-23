import type { Database } from "@/types/database";

type GoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];
type PaymentRow = Pick<Database["public"]["Tables"]["goal_payments"]["Row"], "amount" | "payment_month">;

export type GoalStatus = "ahead" | "on_track" | "behind";

export type GoalMetricsInput = Pick<GoalRow, "target_amount" | "saved_amount" | "deadline" | "created_at" | "status">;

export interface GoalMetrics {
  requiredPace: number | null;
  projectedCompletionDate: string | null;
  status: GoalStatus | null;
  monthsOfData: number;
  averageMonthlyPayment: number;
}

function toYearMonth(isoDate: string): { year: number; month: number } {
  return {
    year: Number(isoDate.slice(0, 4)),
    month: Number(isoDate.slice(5, 7)),
  };
}

function normalizeAsOfDate(asOfDate: string | Date): string {
  if (typeof asOfDate === "string") {
    return asOfDate.slice(0, 10);
  }
  const year = asOfDate.getFullYear();
  const month = String(asOfDate.getMonth() + 1).padStart(2, "0");
  const day = String(asOfDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthsBetweenInclusive(startYear: number, startMonth: number, endYear: number, endMonth: number): number {
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

function addCalendarMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function compareCalendarDates(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function getMetricsWindowStart(createdAt: string, payments: PaymentRow[]): { year: number; month: number } {
  const created = toYearMonth(createdAt);
  let startYear = created.year;
  let startMonth = created.month;

  for (const payment of payments) {
    const paymentMonth = toYearMonth(payment.payment_month);
    if (paymentMonth.year < startYear || (paymentMonth.year === startYear && paymentMonth.month < startMonth)) {
      startYear = paymentMonth.year;
      startMonth = paymentMonth.month;
    }
  }

  return { year: startYear, month: startMonth };
}

export function countGoalLifetimeMonths(
  createdAt: string,
  asOfDate: string | Date,
  payments: PaymentRow[] = [],
): number {
  const start = getMetricsWindowStart(createdAt, payments);
  const asOf = toYearMonth(normalizeAsOfDate(asOfDate));
  const count = monthsBetweenInclusive(start.year, start.month, asOf.year, asOf.month);
  return Math.max(count, 0);
}

export function formatMonthsOfData(count: number): string {
  return count === 1 ? "1 month" : `${count} months`;
}

export function averageMonthlyPayment(createdAt: string, asOfDate: string | Date, payments: PaymentRow[]): number {
  const start = getMetricsWindowStart(createdAt, payments);
  const monthCount = countGoalLifetimeMonths(createdAt, asOfDate, payments);
  if (monthCount <= 0) {
    return 0;
  }

  const amountsByMonth = new Map<string, number>();
  for (const payment of payments) {
    const key = payment.payment_month.slice(0, 7);
    amountsByMonth.set(key, (amountsByMonth.get(key) ?? 0) + payment.amount);
  }

  let total = 0;
  let cursorYear = start.year;
  let cursorMonth = start.month;
  for (let i = 0; i < monthCount; i++) {
    const key = `${cursorYear}-${String(cursorMonth).padStart(2, "0")}`;
    total += amountsByMonth.get(key) ?? 0;
    const next = addCalendarMonths(cursorYear, cursorMonth, 1);
    cursorYear = next.year;
    cursorMonth = next.month;
  }

  return total / monthCount;
}

export function requiredPace(
  target: number,
  saved: number,
  deadline: string | null,
  asOfDate: string | Date,
): number | null {
  if (!deadline) {
    return null;
  }

  const asOf = toYearMonth(normalizeAsOfDate(asOfDate));
  const deadlineParts = toYearMonth(deadline);
  const monthsRemaining = monthsBetweenInclusive(asOf.year, asOf.month, deadlineParts.year, deadlineParts.month);

  if (monthsRemaining <= 0) {
    return null;
  }

  return (target - saved) / monthsRemaining;
}

export function projectedCompletionDate(
  saved: number,
  target: number,
  average: number,
  asOfDate: string | Date,
): string | null {
  const remaining = target - saved;
  if (remaining <= 0 || average <= 0) {
    return null;
  }

  const monthsNeeded = Math.ceil(remaining / average);
  const asOf = toYearMonth(normalizeAsOfDate(asOfDate));
  const projected = addCalendarMonths(asOf.year, asOf.month, monthsNeeded);
  return firstOfMonth(projected.year, projected.month);
}

export function goalStatus(projectedDate: string | null, deadline: string | null): GoalStatus | null {
  if (!deadline || !projectedDate) {
    return null;
  }

  const comparison = compareCalendarDates(projectedDate, deadline);
  if (comparison < 0) {
    return "ahead";
  }
  if (comparison === 0) {
    return "on_track";
  }
  return "behind";
}

export function computeGoalMetrics(
  goal: GoalMetricsInput,
  payments: PaymentRow[],
  asOfDate: string | Date = new Date(),
): GoalMetrics {
  const monthsOfData = countGoalLifetimeMonths(goal.created_at, asOfDate, payments);
  const averageMonthlyPaymentValue = averageMonthlyPayment(goal.created_at, asOfDate, payments);
  const requiredPaceValue = requiredPace(goal.target_amount, goal.saved_amount, goal.deadline, asOfDate);
  const projectedCompletionDateValue = projectedCompletionDate(
    goal.saved_amount,
    goal.target_amount,
    averageMonthlyPaymentValue,
    asOfDate,
  );
  const status = goalStatus(projectedCompletionDateValue, goal.deadline);

  return {
    requiredPace: requiredPaceValue,
    projectedCompletionDate: projectedCompletionDateValue,
    status,
    monthsOfData,
    averageMonthlyPayment: averageMonthlyPaymentValue,
  };
}
