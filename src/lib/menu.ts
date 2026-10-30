export type WindowName = "Breakfast" | "Lunch" | "Dinner";
export type Meal = { id: string; name: string; description: string; price: number; stock: number; image: string; allergens: string; proteins: string[]; extras: string[]; stockByDate?: Record<string, number> };
export type AddOn = { id: string; name: string; price: number; stock: number; category: string; image?: string };
export type Plate = { id: string; mealId: string; date: string; window: WindowName; protein: string; extras: Record<string, number> };
export const windows: WindowName[] = ["Breakfast", "Lunch", "Dinner"];
export const addons: AddOn[] = [
  { id: "chicken", name: "Chicken", price: 800, stock: 25, category: "Protein" },
  { id: "beef", name: "Beef", price: 500, stock: 18, category: "Protein" },
  { id: "fish", name: "Fish", price: 700, stock: 12, category: "Protein" },
  { id: "egg", name: "Egg", price: 300, stock: 18, category: "Protein" },
  { id: "coleslaw", name: "Coleslaw", price: 400, stock: 10, category: "Side" },
  { id: "plantain", name: "Plantain", price: 500, stock: 12, category: "Side" },
  { id: "water", name: "Bottled water", price: 300, stock: 24, category: "Drink" },
];
export const meals: Meal[] = [
  { id: "jollof", name: "Smoky jollof rice", description: "Slow-cooked in a rich tomato sauce. A little smoky, a lot to love.", price: 1500, stock: 30, image: "/images/jollof.png", allergens: "Sample recipe: ask about seasoning allergens before ordering.", proteins: ["chicken", "beef", "fish", "egg"], extras: ["chicken", "beef", "egg", "coleslaw", "plantain", "water"] },
  { id: "beans", name: "Beans & plantain", description: "Soft honey beans with sweet, golden plantain. Comfort on a plate.", price: 1800, stock: 20, image: "/images/beans.png", allergens: "Sample recipe: no declared allergens. Cross-contact may occur.", proteins: ["chicken", "fish", "egg"], extras: ["chicken", "egg", "coleslaw", "plantain", "water"] },
  { id: "yam", name: "Yam & egg sauce", description: "Tender yam, fresh tomatoes and a generous spoonful of egg sauce.", price: 2200, stock: 12, image: "/images/yam.png", allergens: "Contains egg.", proteins: ["chicken", "beef", "fish"], extras: ["chicken", "beef", "coleslaw", "plantain", "water"] },
];
export const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
export function plateTotal(plate: Pick<Plate, "mealId" | "protein" | "extras">, mealList = meals, addonList = addons) {
  return (mealList.find(m => m.id === plate.mealId)?.price ?? 0) + (addonList.find(a => a.id === plate.protein)?.price ?? 0) + Object.entries(plate.extras).reduce((sum, [id, count]) => sum + (addonList.find(a => a.id === id)?.price ?? 0) * count, 0);
}
export function addOnUsed(cart: Plate[], id: string) {
  return cart.reduce((sum, plate) => sum + (plate.protein === id ? 1 : 0) + (plate.extras[id] ?? 0), 0);
}
export function mealRemaining(cart: Plate[], mealId: string, date: string, mealList = meals) {
  const meal = mealList.find(m => m.id === mealId);
  return Math.max(0, (meal?.stockByDate?.[date] ?? meal?.stock ?? 0) - cart.filter(p => p.mealId === mealId && p.date === date).length);
}
export function upcomingDates() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
}
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Africa/Lagos" }).format(new Date(`${date}T12:00:00Z`));
}
export function readCart(raw: string | null, mealList = meals, addonList = addons): Plate[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const valid: Plate[] = [];
    for (const p of parsed.slice(0, 100)) {
      const meal = mealList.find(m => m.id === p?.mealId);
      if (!meal || typeof p.id !== "string" || valid.some(v => v.id === p.id) || typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || !windows.includes(p.window) || (p.protein !== "none" && !meal.proteins.includes(p.protein)) || !p.extras || typeof p.extras !== "object" || Array.isArray(p.extras)) continue;
      if (!Object.entries(p.extras).every(([id, n]) => meal.extras.includes(id) && Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 100)) continue;
      if (mealRemaining(valid, meal.id, p.date, mealList) < 1) continue;
      if (addonList.some(a => addOnUsed(valid, a.id) + (p.protein === a.id ? 1 : 0) + (p.extras[a.id] ?? 0) > a.stock)) continue;
      valid.push(p as Plate);
    }
    return valid;
  } catch { return []; }
}
