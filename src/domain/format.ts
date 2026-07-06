const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const EUR_CENTS = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Hele euro's voor overzichten, centen zodra een bedrag niet rond is. */
export function formatEuro(amount: number): string {
  return Number.isInteger(amount) ? EUR.format(amount) : EUR_CENTS.format(amount);
}

const DATETIME_NL = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Voor timestamps zoals "laatst geëxporteerd", bijvoorbeeld "6 jul 2026, 14:03". */
export function formatTimestampNL(isoDateTime: string): string {
  return DATETIME_NL.format(new Date(isoDateTime));
}
