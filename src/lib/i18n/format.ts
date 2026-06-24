export const LOCALE = "pl-PL";

/** Format YYYY-MM or YYYY-MM-DD as localized month + year. */
export function formatMonthYear(value: string): string {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

export function formatMonthsOfData(count: number): string {
  if (count === 1) return "1 miesiąc";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} miesiące`;
  }
  return `${count} miesięcy`;
}
