import type { WindowName } from "./menu";

export const slots: Record<WindowName, { id: string; label: string; cutoff: string }[]> = {
  Breakfast: [{ id: "breakfast-1", label: "7:00–8:00 AM", cutoff: "06:00" }, { id: "breakfast-2", label: "9:00–10:00 AM", cutoff: "08:00" }],
  Lunch: [{ id: "lunch-1", label: "12:00–2:00 PM", cutoff: "10:00" }],
  Dinner: [{ id: "dinner-1", label: "6:00–7:00 PM", cutoff: "16:00" }],
};
export function windowClosed(date: string, window: WindowName, now: number) {
  return !!date && slots[window].every(slot => now >= Date.parse(`${date}T${slot.cutoff}:00+01:00`));
}
