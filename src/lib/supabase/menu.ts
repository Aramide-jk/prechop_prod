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
  cutoffsBySlot: Record<string, string[]>;
  mealCutoffsBySlot: Record<string, string[]>;
  defaultCutoffsByWindow: Record<WindowName, string[]>;
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
    const [{ data, error }, { data: addonImages }, { data: batchRows }] = await Promise.all([
      supabase.rpc("get_customer_menu", {
        p_service_date: serviceDate,
        p_days: days,
      }),
      supabase.from("add_on_catalog").select("slug,image_url").eq("active", true),
      supabase
        .from("delivery_batches")
        .select("cutoff_time,delivery_windows!inner(window,active)")
        .eq("active", true)
        .eq("delivery_windows.active", true),
    ]);
    if (error || !data) {
      console.error("Customer menu query failed:", error?.message ?? "No data returned");
      return null;
    }

    const defaultCutoffsByWindow: Record<WindowName, string[]> = {
      Breakfast: [],
      Lunch: [],
      Dinner: [],
    };
    type BatchRow = {
      cutoff_time: string;
      delivery_windows: { window: MenuRow["window"]; active: boolean } | { window: MenuRow["window"]; active: boolean }[];
    };
    for (const batch of (batchRows ?? []) as unknown as BatchRow[]) {
      const winObj = Array.isArray(batch.delivery_windows)
        ? batch.delivery_windows[0]
        : batch.delivery_windows;
      const wName = winObj?.window ? windowLabels[winObj.window] : undefined;
      if (!wName || !batch.cutoff_time) continue;
      const hhmm = batch.cutoff_time.slice(0, 5);
      if (!defaultCutoffsByWindow[wName].includes(hhmm)) {
        defaultCutoffsByWindow[wName].push(hhmm);
      }
    }

    const rows = data as unknown as MenuRow[];
    const imageBySlug = new Map((addonImages ?? []).map(addon => [addon.slug, addon.image_url]));
    const mealsBySlug = new Map<string, Meal>();
    const addonsBySlug = new Map<string, AddOn>();
    const availability: CustomerMenu["availability"] = {};
    const cutoffsBySlot: Record<string, string[]> = {};
    const mealCutoffsBySlot: Record<string, string[]> = {};

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
      meal.stockByDate![row.service_date] = Math.max(
        meal.stockByDate?.[row.service_date] ?? 0,
        row.stock_remaining,
      );
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

      const wLabel = windowLabels[row.window];
      const key = `${row.service_date}|${wLabel}`;
      availability[key] = Array.from(new Set([...(availability[key] ?? []), row.slug]));

      const rowCutoffs = Array.from(
        new Set((row.batches ?? []).map((b) => String(b.cutoff ?? "").slice(0, 5)).filter(Boolean)),
      );
      if (rowCutoffs.length) {
        cutoffsBySlot[key] = Array.from(new Set([...(cutoffsBySlot[key] ?? []), ...rowCutoffs]));
        mealCutoffsBySlot[`${key}|${row.slug}`] = rowCutoffs;
      }
    }

    return {
      meals: [...mealsBySlug.values()],
      addons: [...addonsBySlug.values()],
      availability,
      cutoffsBySlot,
      mealCutoffsBySlot,
      defaultCutoffsByWindow,
    };
  } catch (error) {
    console.error("Could not connect to Supabase for the customer menu:", error);
    return null;
  }
}
