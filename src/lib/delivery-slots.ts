import type { WindowName } from "./menu";

export const slots: Record<WindowName, { id: string; label: string; cutoff: string }[]> = {
  Breakfast: [{ id: "breakfast-1", label: "7:00–8:00 AM", cutoff: "06:00" }, { id: "breakfast-2", label: "9:00–10:00 AM", cutoff: "08:00" }],
  Lunch: [{ id: "lunch-1", label: "12:00–2:00 PM", cutoff: "10:00" }],
  Dinner: [{ id: "dinner-1", label: "6:00–7:00 PM", cutoff: "16:00" }],
};

export function windowClosed(
  date: string,
  window: WindowName,
  now: number,
  customCutoffs?: string[],
) {
  if (!date) return false;
  const cutoffs =
    customCutoffs !== undefined
      ? customCutoffs
      : slots[window].map((slot) => slot.cutoff);
  if (cutoffs.length === 0) return true;
  return cutoffs.every((cutoff) => {
    const hhmm = cutoff.slice(0, 5);
    return now >= Date.parse(`${date}T${hhmm}:00+01:00`);
  });
}
