interface ActiveGoal {
  id: string;
  name: string;
}

type GoalMatchResult = { kind: "matched"; goalId: string; goalName: string } | { kind: "unrecognized" };

function stripDiacritics(value: string): string {
  return value
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(name: string): string {
  return stripDiacritics(name.trim().toLowerCase());
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return matrix[rows - 1][cols - 1];
}

function maxDistanceForLength(length: number): number {
  return length <= 10 ? 2 : 3;
}

function singleMatch(goals: ActiveGoal[]): GoalMatchResult {
  if (goals.length !== 1) {
    return { kind: "unrecognized" };
  }

  const goal = goals[0];
  return { kind: "matched", goalId: goal.id, goalName: goal.name };
}

export function matchGoalName(extractedName: string, activeGoals: ActiveGoal[]): GoalMatchResult {
  const normalizedExtracted = normalizeName(extractedName);
  if (!normalizedExtracted || activeGoals.length === 0) {
    return { kind: "unrecognized" };
  }

  const normalizedGoals = activeGoals.map((goal) => ({
    ...goal,
    normalized: normalizeName(goal.name),
  }));

  const exactMatches = normalizedGoals.filter((goal) => goal.normalized === normalizedExtracted);
  const exactResult = singleMatch(exactMatches);
  if (exactResult.kind === "matched") {
    return exactResult;
  }

  const substringMatches = normalizedGoals.filter(
    (goal) => normalizedExtracted.includes(goal.normalized) || goal.normalized.includes(normalizedExtracted),
  );
  const substringResult = singleMatch(substringMatches);
  if (substringResult.kind === "matched") {
    return substringResult;
  }

  const maxDistance = maxDistanceForLength(normalizedExtracted.length);
  const fuzzyMatches = normalizedGoals.filter(
    (goal) => levenshtein(normalizedExtracted, goal.normalized) <= maxDistance,
  );
  return singleMatch(fuzzyMatches);
}
