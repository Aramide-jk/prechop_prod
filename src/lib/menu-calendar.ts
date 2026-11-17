/**
 * PreChop Menu Calendar & Weekly Planning Helpers
 * Handles Africa/Lagos timezone calculations for weekly menu scheduling,
 * week duplication (+7 days offset), and automated admin reminders.
 */

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function todayInZaria(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Lagos",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  return addDays(date, -day);
}

export function formattedDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "Africa/Lagos" }).format(new Date(`${date}T12:00:00Z`));
}

export type WeekRange = {
  start: string; // YYYY-MM-DD (Monday)
  end: string;   // YYYY-MM-DD (Sunday)
  formatted: string;
};

export function getWeekRange(referenceDate = todayInZaria()): WeekRange {
  const start = mondayOf(referenceDate);
  const end = addDays(start, 6);
  const startLabel = formattedDay(start, { month: "short", day: "numeric" });
  const endLabel = formattedDay(end, { month: "short", day: "numeric", year: "numeric" });
  return {
    start,
    end,
    formatted: `${startLabel} – ${endLabel}`,
  };
}

export function getNextWeekRange(referenceDate = todayInZaria()): WeekRange {
  const currentMonday = mondayOf(referenceDate);
  const nextMonday = addDays(currentMonday, 7);
  const nextSunday = addDays(nextMonday, 6);
  const startLabel = formattedDay(nextMonday, { month: "short", day: "numeric" });
  const endLabel = formattedDay(nextSunday, { month: "short", day: "numeric", year: "numeric" });
  return {
    start: nextMonday,
    end: nextSunday,
    formatted: `${startLabel} – ${endLabel}`,
  };
}

export function buildMenuReminderMessage(details: {
  startDate: string;
  endDate: string;
  url?: string;
  siteName?: string;
}): string {
  const url = details.url ?? "https://prechop.com.ng/admin/menus?copy=next-week";
  const siteName = details.siteName ?? "PreChop";
  const startFmt = formattedDay(details.startDate, { weekday: "short", day: "numeric", month: "short" });
  const endFmt = formattedDay(details.endDate, { weekday: "short", day: "numeric", month: "short" });

  return `👋 Hi ${siteName} Admin!\n\nNext week's menu (${startFmt} – ${endFmt}) is currently empty! Customers won't see meals available to order until meals are posted.\n\nTap here to duplicate this week's meals in 1 click:\n${url}`;
}
