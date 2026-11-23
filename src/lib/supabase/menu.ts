import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { addons, meals, type AddOn, type Meal, type WindowName } from "@/lib/menu";

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

/**
 * Ensures the database contains real stock pools and batch links for the upcoming days.
 * Enables Option B (Database-Driven Rolling Seed) so Postgres tables stay populated
 * without requiring manual weekly scheduling.
 */
export async function ensureRollingDatabaseMenu(startDate: string, days = 14): Promise<boolean> {
  try {
    const adminKey = process.env.SUPABASE_SECRET_KEY;
    if (!adminKey) return false;
    const adminClient = getSupabaseAdminClient();

    // 1. Ensure core meals are active in the database
    await adminClient
      .from("meals")
      .update({ active: true })
      .in("slug", ["jollof", "beans", "yam"]);

    // 2. Fetch active meals and batches
    const [mealsRes, batchesRes] = await Promise.all([
      adminClient.from("meals").select("id, slug").in("slug", ["jollof", "beans", "yam"]).eq("active", true),
      adminClient.from("delivery_batches").select("id").eq("active", true),
    ]);

    const activeMeals = mealsRes.data ?? [];
    const activeBatches = batchesRes.data ?? [];
    if (!activeMeals.length || !activeBatches.length) return false;

    // 3. Generate date list for startDate .. startDate + days
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${startDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // 4. Build stock pool rows to upsert
    const poolsToUpsert: { meal_id: string; service_date: string; portion_limit: number }[] = [];
    for (const dt of dates) {
      for (const m of activeMeals) {
        poolsToUpsert.push({
          meal_id: m.id,
          service_date: dt,
          portion_limit: m.slug === "jollof" ? 30 : m.slug === "beans" ? 25 : 20,
        });
      }
    }

    const upsertRes = await adminClient
      .from("meal_stock_pools")
      .upsert(poolsToUpsert, { onConflict: "meal_id,service_date" })
      .select("id");

    if (upsertRes.error || !upsertRes.data) {
      console.error("Failed to seed rolling stock pools:", upsertRes.error);
      return false;
    }

    // 5. Link stock pools to active delivery batches
    const batchMenuItems: { batch_id: string; stock_pool_id: string; active: boolean }[] = [];
    for (const pool of upsertRes.data) {
      for (const batch of activeBatches) {
        batchMenuItems.push({
          batch_id: batch.id,
          stock_pool_id: pool.id,
          active: true,
        });
      }
    }

    await adminClient
      .from("batch_menu_items")
      .upsert(batchMenuItems, { onConflict: "batch_id,stock_pool_id" });

    return true;
  } catch (err) {
    console.error("ensureRollingDatabaseMenu error:", err);
    return false;
  }
}

/**
 * Builds an evergreen, auto-rolling customer menu for the given date range.
 * Used for offline / paused Supabase fallback so the app is always populated.
 */
export function buildEvergreenCustomerMenu(serviceDate: string, days = 7): CustomerMenu {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${serviceDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const evergreenMeals: Meal[] = meals.map((m) => {
    const stockByDate: Record<string, number> = {};
    for (const dt of dates) {
      stockByDate[dt] = m.stock;
    }
    return {
      ...m,
      stockByDate,
    };
  });

  const availability: CustomerMenu["availability"] = {};
  const cutoffsBySlot: Record<string, string[]> = {};
  const mealCutoffsBySlot: Record<string, string[]> = {};

  const defaultCutoffsByWindow: Record<WindowName, string[]> = {
    Breakfast: ["08:00"],
    Lunch: ["10:00"],
    Dinner: ["16:00"],
  };

  const windows: WindowName[] = ["Breakfast", "Lunch", "Dinner"];

  for (const dt of dates) {
    for (const w of windows) {
      const key = `${dt}|${w}`;
      availability[key] = ["jollof", "beans", "yam"];
      cutoffsBySlot[key] = ["23:59"];
    }
  }

  return {
    meals: evergreenMeals,
    addons,
    availability,
    cutoffsBySlot,
    mealCutoffsBySlot,
    defaultCutoffsByWindow,
  };
}

export async function getCustomerMenu(serviceDate: string, days = 7): Promise<CustomerMenu> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return buildEvergreenCustomerMenu(serviceDate, days);

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
      console.warn("Customer menu query returned no rows or errored; attempting rolling seed:", error?.message);
      await ensureRollingDatabaseMenu(serviceDate, 14);
      return buildEvergreenCustomerMenu(serviceDate, days);
    }

    let rows = data as unknown as MenuRow[];
    // If the database has 0 scheduled meals for this week, automatically roll the database seed
    if (!rows || rows.length === 0) {
      const seeded = await ensureRollingDatabaseMenu(serviceDate, 14);
      if (seeded) {
        const retry = await supabase.rpc("get_customer_menu", {
          p_service_date: serviceDate,
          p_days: days,
        });
        if (retry.data && Array.isArray(retry.data) && retry.data.length > 0) {
          rows = retry.data as unknown as MenuRow[];
        }
      }
      if (!rows || rows.length === 0) {
        return buildEvergreenCustomerMenu(serviceDate, days);
      }
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
    console.error("Could not connect to Supabase for the customer menu; using evergreen portfolio menu:", error);
    return buildEvergreenCustomerMenu(serviceDate, days);
  }
}
