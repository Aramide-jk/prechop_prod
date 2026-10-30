import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { AddOn, Meal, WindowName } from "@/lib/menu";

type MenuRow = {
  service_date: string;
  window: "breakfast" | "lunch" | "dinner";
  meal_id: string;
  slug: string;
  name: string;
  description: string;
  base_price_ngn: number;
  image_url: string;
  allergen_note: string;
  stock_limit: number;
  stock_remaining: number;
  proteins: { id: string; slug: string; name: string; price_ngn: number; stock_limit: number }[];
  extras: { id: string; slug: string; name: string; price_ngn: number; category: string; stock_limit: number }[];
  batches: { id: string; name: string; starts_at: string; ends_at: string; cutoff: string }[];
};

export type CustomerMenu = {
  meals: Meal[];
  addons: AddOn[];
  availability: Record<string, string[]>;
};

const windowLabels: Record<MenuRow["window"], WindowName> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export async function getCustomerMenu(serviceDate: string, days = 7): Promise<CustomerMenu | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const [{ data, error }, { data: addonImages }] = await Promise.all([
      supabase.rpc("get_customer_menu", {
        p_service_date: serviceDate,
        p_days: days,
      }),
      supabase.from("add_on_catalog").select("slug,image_url").eq("active", true),
    ]);
    if (error || !data) {
      console.error("Customer menu query failed:", error?.message ?? "No data returned");
      return null;
    }

    const rows = data as unknown as MenuRow[];
    const imageBySlug = new Map((addonImages ?? []).map(addon => [addon.slug, addon.image_url]));
    const mealsBySlug = new Map<string, Meal>();
    const addonsBySlug = new Map<string, AddOn>();
    const availability: CustomerMenu["availability"] = {};

    for (const row of rows) {
      const meal = mealsBySlug.get(row.slug) ?? {
        id: row.slug,
        name: row.name,
        description: row.description,
        price: row.base_price_ngn,
        stock: row.stock_limit,
        stockByDate: {},
        image: row.image_url || "/images/beans.png",
        allergens: row.allergen_note,
        proteins: [],
        extras: [],
      };
      meal.stockByDate![row.service_date] = row.stock_remaining;
      for (const addon of [...(row.proteins ?? []), ...(row.extras ?? [])]) {
        addonsBySlug.set(addon.slug, {
          id: addon.slug,
          name: addon.name,
          price: addon.price_ngn,
          stock: addon.stock_limit,
          image: imageBySlug.get(addon.slug) ?? "",
          category: "category" in addon
            ? addon.category === "drink" ? "Drink" : addon.category === "side" ? "Side" : "Protein"
            : "Protein",
        });
      }
      meal.proteins = Array.from(new Set([...meal.proteins, ...(row.proteins ?? []).map(item => item.slug)]));
      meal.extras = Array.from(new Set([...meal.extras, ...(row.extras ?? []).map(item => item.slug)]));
      mealsBySlug.set(row.slug, meal);

      const key = `${row.service_date}|${windowLabels[row.window]}`;
      availability[key] = [...(availability[key] ?? []), row.slug];
    }

    return {
      meals: [...mealsBySlug.values()],
      addons: [...addonsBySlug.values()],
      availability,
    };
  } catch (error) {
    console.error("Could not connect to Supabase for the customer menu:", error);
    return null;
  }
}
