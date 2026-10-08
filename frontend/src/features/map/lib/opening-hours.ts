/**
 * Pure opening hours parsing for OpenStreetMap opening_hours strings.
 * Evaluates current time in Asia/Kolkata.
 * NOTE: Do NOT import maplibre-gl, React, or DOM APIs in this file.
 */

export interface ParsedOpeningHours {
  raw: string;
  isOpen?: boolean | undefined;
  statusBadge?: string | undefined; // "Open 24/7" | "Open" | "Closed"
  statusDetail?: string | undefined; // e.g. "Closes at 18:00", "Opens at 09:00"
}

const DAY_INDICES: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

/**
 * Parses time string "HH:MM" into minutes from midnight (0..1439).
 */
function parseTimeToMinutes(timeStr: string): number | null {
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Gets the current day of the week (0 = Sunday .. 6 = Saturday) and
 * minute of the day (0 .. 1439) in Asia/Kolkata timezone.
 */
export function getKolkataNow(referenceDate?: Date): {
  dayOfWeek: number;
  currentMinutes: number;
} {
  const date = referenceDate ?? new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayStr = (parts.find((p) => p.type === "weekday")?.value || "Sun")
    .slice(0, 2)
    .toLowerCase();

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minStr, 10);

  const dayOfWeek = DAY_INDICES[weekdayStr] ?? 0;
  const currentMinutes = hour * 60 + minute;

  return { dayOfWeek, currentMinutes };
}

/**
 * Parses an opening_hours string.
 * Returns isOpen and status text ONLY for simple, unambiguously parsable patterns (e.g. "24/7", "Mo-Su 09:00-18:00").
 * For anything complex or ambiguous (rules, holidays, off, comma lists), returns isOpen: undefined.
 */
export function parseOpeningHours(
  rawInput?: string | null,
  referenceDate?: Date,
): ParsedOpeningHours {
  if (!rawInput || typeof rawInput !== "string") {
    return { raw: "" };
  }

  const raw = rawInput.trim();
  if (!raw) return { raw: "" };

  // 1. "24/7"
  if (/^24\/7$/i.test(raw)) {
    return {
      raw,
      isOpen: true,
      statusBadge: "Open 24/7",
      statusDetail: "Open 24 hours",
    };
  }

  // If input contains complex tokens (semicolons, multiple intervals with comma, holidays, off, breaks), return raw string with undefined status
  if (
    /[,;]/.test(raw) ||
    /\b(ph|sh|off|sunrise|sunset|open|closed)\b/i.test(raw)
  ) {
    return { raw, isOpen: undefined };
  }

  // 2. Simple Daily pattern: "09:00-18:00" or "Daily 09:00-18:00"
  const dailyMatch = raw.match(
    /^(?:daily\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i,
  );
  if (dailyMatch) {
    const openM = parseTimeToMinutes(dailyMatch[1]!);
    const closeM = parseTimeToMinutes(dailyMatch[2]!);
    if (openM !== null && closeM !== null) {
      const { currentMinutes } = getKolkataNow(referenceDate);
      const isOpen =
        openM <= closeM
          ? currentMinutes >= openM && currentMinutes < closeM
          : currentMinutes >= openM || currentMinutes < closeM; // overnight hours

      return {
        raw,
        isOpen,
        statusBadge: isOpen ? "Open" : "Closed",
        statusDetail: isOpen
          ? `Closes at ${dailyMatch[2]}`
          : `Opens at ${dailyMatch[1]}`,
      };
    }
  }

  // 3. Simple Day Range pattern: "Mo-Su 09:00-18:00", "Mo-Sa 10:00-22:00"
  const rangeMatch = raw.match(
    /^([a-z]{2})-([a-z]{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i,
  );
  if (rangeMatch) {
    const startDayKey = rangeMatch[1]!.toLowerCase();
    const endDayKey = rangeMatch[2]!.toLowerCase();
    const startDay = DAY_INDICES[startDayKey];
    const endDay = DAY_INDICES[endDayKey];

    const openM = parseTimeToMinutes(rangeMatch[3]!);
    const closeM = parseTimeToMinutes(rangeMatch[4]!);

    if (
      startDay !== undefined &&
      endDay !== undefined &&
      openM !== null &&
      closeM !== null
    ) {
      const { dayOfWeek, currentMinutes } = getKolkataNow(referenceDate);

      // Check if current day is in range
      let isDayInRange = false;
      if (startDay <= endDay) {
        isDayInRange = dayOfWeek >= startDay && dayOfWeek <= endDay;
      } else {
        // e.g. Fri-Mon (5 .. 1)
        isDayInRange = dayOfWeek >= startDay || dayOfWeek <= endDay;
      }

      if (!isDayInRange) {
        return {
          raw,
          isOpen: false,
          statusBadge: "Closed",
          statusDetail: `Opens ${rangeMatch[1]} ${rangeMatch[3]}`,
        };
      }

      const isOpen =
        openM <= closeM
          ? currentMinutes >= openM && currentMinutes < closeM
          : currentMinutes >= openM || currentMinutes < closeM;

      return {
        raw,
        isOpen,
        statusBadge: isOpen ? "Open" : "Closed",
        statusDetail: isOpen
          ? `Closes at ${rangeMatch[4]}`
          : `Opens at ${rangeMatch[3]}`,
      };
    }
  }

  // Fallback for any other pattern: honest display of raw text with no fabricated badge
  return {
    raw,
    isOpen: undefined,
  };
}
