/**
 * Datumlogica op basis van "YYYY-MM-DD"-strings. Alle berekeningen gaan via
 * UTC zodat tijdzones en zomertijd nooit een dag kunnen verschuiven.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

/** Aantal dagen van `fromIso` tot `toIso` (positief als toIso later is). */
export function diffDays(fromIso: string, toIso: string): number {
  const ms = parseISODate(toIso).getTime() - parseISODate(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** Halve maand waar een datum in valt: dag 1-15 → H1, dag 16+ → H2. */
export function halfMonthForDate(iso: string): string {
  const day = parseISODate(iso).getUTCDate();
  return `${iso.slice(0, 7)}-${day <= 15 ? "H1" : "H2"}`;
}

/**
 * Alle halve maanden die een verblijf raakt. Een verblijf van `nights` nachten
 * vanaf `startIso` beslaat de dagen van aankomst tot en met vertrek.
 */
export function halfMonthsInRange(startIso: string, nights: number): string[] {
  const result: string[] = [];
  const days = Math.max(0, nights);
  for (let i = 0; i <= days; i++) {
    const period = halfMonthForDate(addDays(startIso, i));
    if (result[result.length - 1] !== period) result.push(period);
  }
  return result;
}

const NL_WEEKDAY_DATE = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const NL_DATE_FULL = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const NL_DAY_MONTH = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Bijvoorbeeld "ma 10 mei". */
export function formatDateNL(iso: string): string {
  return NL_WEEKDAY_DATE.format(parseISODate(iso));
}

/** Bijvoorbeeld "10 mei 2027". */
export function formatDateFullNL(iso: string): string {
  return NL_DATE_FULL.format(parseISODate(iso));
}

/** Bijvoorbeeld "10 mei". */
export function formatDayMonthNL(iso: string): string {
  return NL_DAY_MONTH.format(parseISODate(iso));
}

const NL_MONTH_YEAR = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Bijvoorbeeld "begin mei 2027" voor "2027-05-H1". */
export function formatHalfMonthNL(period: string): string {
  const [y, m, half] = period.split("-");
  const monthYear = NL_MONTH_YEAR.format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
  return `${half === "H1" ? "begin" : "eind"} ${monthYear}`;
}

/** Weeknummer binnen de reis (week 1 begint op de startdatum van de reis). */
export function tripWeekNumber(tripStartIso: string, iso: string): number {
  return Math.floor(diffDays(tripStartIso, iso) / 7) + 1;
}
