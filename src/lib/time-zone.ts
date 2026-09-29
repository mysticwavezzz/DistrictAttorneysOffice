export function parseDateTimeInTimeZone(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    timestamp += desired - represented;
  }

  const result = new Date(timestamp);
  const finalParts = Object.fromEntries(formatter.formatToParts(result).map((part) => [part.type, part.value]));
  const expected = [year, month, day, hour, minute].map((part) => String(part).padStart(2, "0"));
  const actual = [finalParts.year, finalParts.month, finalParts.day, finalParts.hour, finalParts.minute];
  return actual.every((part, index) => part === expected[index]) ? result : null;
}

export function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function reinterpretLegacyUtcWallTime(date: Date, timeZone: string): Date | null {
  return parseDateTimeInTimeZone(date.toISOString().slice(0, 16), timeZone);
}
