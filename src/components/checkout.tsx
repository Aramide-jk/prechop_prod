"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PaymentPreview,
  type PaymentDetails,
} from "@/components/payment-preview";
import { PaymentReturnDialog } from "@/components/payment-return-dialog";
import { CheckoutSkeleton } from "@/components/skeletons";
import { SignInDialog } from "@/components/sign-in";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CircleNotch,
  Clock,
  Gift,
  ShoppingBag,
  Storefront,
  Trash,
  Wallet,
} from "@phosphor-icons/react";
import type { CustomerCampaignSummary } from "@/lib/campaign";
import {
  addons,
  formatDate,
  meals,
  money,
  plateTotal,
  readCart,
  upcomingDates,
  type AddOn,
  type Meal,
  type Plate,
  type WindowName,
} from "@/lib/menu";

import { slots as previewSlots } from "@/lib/delivery-slots";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  defaultStoreSettings,
  fetchStoreSettings,
  isCampaignLive,
  type StoreSettings,
} from "@/lib/settings";
const areas = [
  { id: "abu", name: "ABU · Samaru campus", fee: 500 },
  { id: "samaru", name: "Samaru", fee: 700 },
  { id: "sabon-gari", name: "Sabon Gari", fee: 1000 },
];
type Area = { id: string; name: string; fee: number };
type SavedAddress = {
  id: string;
  label: string;
  areaId: string;
  address: string;
  note: string;
};
type Delivery = {
  slot: string;
  area: string;
  address: string;
  note: string;
  savedAddressId: string;
  fulfillment?: "delivery" | "pickup";
};
type CheckoutSlot = { id: string; label: string; cutoff: string };
type CheckoutSlots = Record<WindowName, CheckoutSlot[]>;
const emptyDelivery: Delivery = {
  slot: "",
  area: "",
  address: "",
  note: "",
  savedAddressId: "",
  fulfillment: "delivery",
};

function clockLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString(
    "en-NG",
    {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    },
  );
}

export function Checkout() {
  const router = useRouter();
  const [cart, setCart] = useState<Plate[]>([]);
  const [checkoutMeals, setCheckoutMeals] = useState<Meal[]>(meals);
  const [checkoutAddons, setCheckoutAddons] = useState<AddOn[]>(addons);
  const [walletBalance, setWalletBalance] = useState(0);
  const [ready, setReady] = useState(false);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery>>({});
  const [useCredit, setUseCredit] = useState(false);
  const [review, setReview] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<{
    name: string;
    phone: string;
  } | null>(null);
  const [now, setNow] = useState(0);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paystackReturn, setPaystackReturn] = useState<string | null>(null);
  const [claimMode, setClaimMode] = useState(false);
  const [campaignSummary, setCampaignSummary] =
    useState<CustomerCampaignSummary | null>(null);
  const [availableFeaturedSlot, setAvailableFeaturedSlot] = useState<{
    date: string;
    window: WindowName;
  } | null>(null);
  const liveAuth = isSupabaseConfigured();
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("paystack") === "return")
        setPaystackReturn(
          params.get("reference") || params.get("trxref") || "",
        );
      if (params.get("claim") === "featured") setClaimMode(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [areaCatalog, setAreaCatalog] = useState<Area[]>(areas);
  const [slotCatalog, setSlotCatalog] = useState<CheckoutSlots>(previewSlots);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadError, setLoadError] = useState("");
  const [backendReady, setBackendReady] = useState(false);
  const [storeSettings, setStoreSettings] =
    useState<StoreSettings>(defaultStoreSettings);
  const loadCustomerData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadError("Supabase is not configured.");
      setReady(true);
      setBackendReady(false);
      return;
    }
    const [
      userResult,
      areaResult,
      batchResult,
      menuResult,
      addonImagesResult,
      liveStoreSettings,
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("delivery_areas")
        .select("id,name,fee_ngn")
        .eq("active", true)
        .order("name"),
      supabase
        .from("delivery_batches")
        .select(
          "id,name,delivery_starts_at,delivery_ends_at,cutoff_time,delivery_windows!inner(window,active)",
        )
        .eq("active", true)
        .eq("delivery_windows.active", true)
        .order("delivery_starts_at"),
      supabase.rpc("get_customer_menu", {
        p_service_date: upcomingDates()[0],
        p_days: 14,
      }),
      supabase
        .from("add_on_catalog")
        .select("slug,image_url")
        .eq("active", true),
      fetchStoreSettings(),
    ]);
    if (liveStoreSettings) {
      setStoreSettings(liveStoreSettings);
    }
    if (
      areaResult.error ||
      batchResult.error ||
      menuResult.error ||
      addonImagesResult.error
    ) {
      setLoadError(
        areaResult.error?.message ??
          batchResult.error?.message ??
          menuResult.error?.message ??
          addonImagesResult.error?.message ??
          "We couldn’t load delivery options.",
      );
      setBackendReady(false);
      setReady(true);
    } else if (
      Array.isArray(areaResult.data) &&
      Array.isArray(batchResult.data) &&
      Array.isArray(menuResult.data)
    ) {
      setAreaCatalog(
        (
          areaResult.data as { id: string; name: string; fee_ngn: number }[]
        ).map((area) => ({ id: area.id, name: area.name, fee: area.fee_ngn })),
      );
      const liveSlots: CheckoutSlots = { Breakfast: [], Lunch: [], Dinner: [] };
      const batchRows = batchResult.data as unknown as {
        id: string;
        delivery_starts_at: string;
        delivery_ends_at: string;
        cutoff_time: string;
        delivery_windows: { window: string; active: boolean };
      }[];
      for (const batch of batchRows) {
        const window = (
          {
            breakfast: "Breakfast",
            lunch: "Lunch",
            dinner: "Dinner",
          } as Record<string, WindowName>
        )[batch.delivery_windows.window];
        if (!window || !batch.delivery_windows.active) continue;
        liveSlots[window].push({
          id: batch.id,
          label: `${clockLabel(batch.delivery_starts_at)}–${clockLabel(batch.delivery_ends_at)}`,
          cutoff: batch.cutoff_time.slice(0, 5),
        });
      }
      setSlotCatalog(liveSlots);
      type MenuRow = {
        service_date: string;
        slug: string;
        name: string;
        description: string;
        base_price_ngn: number;
        image_url: string;
        allergen_note: string;
        stock_limit: number;
        stock_remaining: number;
        proteins: {
          slug: string;
          name: string;
          price_ngn: number;
          stock_limit: number;
        }[];
        extras: {
          slug: string;
          name: string;
          price_ngn: number;
          category: string;
          stock_limit: number;
        }[];
      };
      const rows = menuResult.data as unknown as MenuRow[];
      const addonImages = new Map(
        (
          (addonImagesResult.data ?? []) as {
            slug: string;
            image_url: string;
          }[]
        ).map((addon) => [addon.slug, addon.image_url]),
      );
      const menuBySlug = new Map<string, Meal>();
      const addonsBySlug = new Map<string, AddOn>();
      for (const row of rows) {
        const meal = menuBySlug.get(row.slug) ?? {
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
        for (const addon of [...(row.proteins ?? []), ...(row.extras ?? [])])
          addonsBySlug.set(addon.slug, {
            id: addon.slug,
            name: addon.name,
            price: addon.price_ngn,
            stock: addon.stock_limit,
            image: addonImages.get(addon.slug) ?? "",
            category:
              "category" in addon
                ? addon.category === "drink"
                  ? "Drink"
                  : addon.category === "side"
                    ? "Side"
                    : "Protein"
                : "Protein",
          });
        meal.proteins = Array.from(
          new Set([
            ...meal.proteins,
            ...(row.proteins ?? []).map((addon) => addon.slug),
          ]),
        );
        meal.extras = Array.from(
          new Set([
            ...meal.extras,
            ...(row.extras ?? []).map((addon) => addon.slug),
          ]),
        );
        menuBySlug.set(row.slug, meal);
      }
      const liveMeals = [...menuBySlug.values()];
      const liveAddons = [...addonsBySlug.values()];
      setCheckoutMeals(liveMeals);
      setCheckoutAddons(liveAddons);

      // Determine earliest available upcoming date & open window for featured campaign meal claim
      const targetMeal = liveMeals.find(
        (m) =>
          m.id ===
          (liveStoreSettings?.featured_meal_slug ||
            defaultStoreSettings.featured_meal_slug),
      );
      let firstFeaturedSlot: { date: string; window: WindowName } | null = null;
      if (targetMeal) {
        for (const date of upcomingDates()) {
          if ((targetMeal.stockByDate?.[date] ?? 0) < 1) continue;
          const windowOrder: WindowName[] = ["Lunch", "Dinner", "Breakfast"];
          const openWindow = windowOrder.find((w) =>
            liveSlots[w].some(
              (s) => Date.parse(`${date}T${s.cutoff}:00+01:00`) > Date.now(),
            ),
          );
          if (openWindow) {
            firstFeaturedSlot = { date, window: openWindow };
            break;
          }
        }
      }
      setAvailableFeaturedSlot(firstFeaturedSlot);

      let initialCart: Plate[] = [];
      try {
        initialCart = readCart(
          localStorage.getItem("mealhr-cart-v1"),
          liveMeals,
          liveAddons,
        ).filter((plate) => upcomingDates().includes(plate.date));
      } catch {
        initialCart = [];
      }

      const urlWantsClaim =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("claim") === "featured";
      const currentSettings = liveStoreSettings ?? defaultStoreSettings;
      const user = userResult.data?.user ?? null;

      if (
        user &&
        isCampaignLive(currentSettings) &&
        currentSettings.featured_goal_enabled
      ) {
        try {
          const { data: campData } = await supabase.rpc(
            "get_customer_campaign_summary",
          );
          if (campData && typeof campData === "object") {
            const parsedCamp = campData as CustomerCampaignSummary;
            setCampaignSummary(parsedCamp);
            if (urlWantsClaim && parsedCamp.claim_status === "unlocked") {
              if (
                currentSettings.featured_claim_behavior === "consumes_credit"
              ) {
                setUseCredit(true);
              }
              if (initialCart.length === 0 && firstFeaturedSlot && targetMeal) {
                initialCart = [
                  {
                    id: `claim-${Date.now()}`,
                    mealId: targetMeal.id,
                    date: firstFeaturedSlot.date,
                    window: firstFeaturedSlot.window,
                    protein: "none",
                    extras: {},
                  },
                ];
                try {
                  localStorage.setItem(
                    "mealhr-cart-v1",
                    JSON.stringify(initialCart),
                  );
                } catch {
                  /* Cart auto-fill persists in component state if storage unavailable */
                }
              }
            }
          }
        } catch {
          /* Campaign summary RPC optional prior to migration push */
        }
      }

      setCart(initialCart);
      setReady(true);
      setBackendReady(true);
      if (liveStoreSettings) setStoreSettings(liveStoreSettings);
      setLoadError("");
    }
    const user = userResult.data?.user ?? null;
    if (!user) {
      setPreviewProfile(null);
      setSavedAddresses([]);
      setWalletBalance(0);
      return;
    }
    if (user.email) setPaymentEmail(user.email);
    const [profileResult, addressResult, walletReleaseResult, walletResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("full_name,phone_e164,email")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("id,label,area_id,address,delivery_note")
          .eq("customer_id", user.id)
          .order("created_at"),
        supabase.rpc("release_expired_customer_wallet_credits"),
        supabase
          .from("wallet_entries")
          .select("amount_ngn")
          .eq("customer_id", user.id),
      ]);
    if (
      profileResult.error ||
      addressResult.error ||
      walletReleaseResult.error ||
      walletResult.error
    )
      setLoadError(
        profileResult.error?.message ??
          addressResult.error?.message ??
          walletReleaseResult.error?.message ??
          walletResult.error?.message ??
          "We couldn’t load your saved addresses.",
      );
    setWalletBalance(
      ((walletResult.data ?? []) as { amount_ngn: number }[]).reduce(
        (sum, entry) => sum + entry.amount_ngn,
        0,
      ),
    );
    if (profileResult.data) {
      setPreviewProfile({
        name: profileResult.data.full_name,
        phone: profileResult.data.phone_e164,
      });
      setPaymentEmail(profileResult.data.email || user.email || "");
    } else if (user.email) setPaymentEmail(user.email);
    setSavedAddresses(
      (
        (addressResult.data ?? []) as {
          id: string;
          label: string;
          area_id: string;
          address: string;
          delivery_note: string;
        }[]
      ).map((address) => ({
        id: address.id,
        label: address.label,
        areaId: address.area_id,
        address: address.address,
        note: address.delivery_note,
      })),
    );
  }, []);
  useEffect(() => {
    let active = true;
    void fetchStoreSettings().then((liveSettings) => {
      if (active && liveSettings) {
        setStoreSettings(liveSettings);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!liveAuth) {
        try {
          const dates = upcomingDates();
          setCart(
            readCart(localStorage.getItem("mealhr-cart-v1")).filter((p) =>
              dates.includes(p.date),
            ),
          );
        } catch {
          /* Session storage may be unavailable. */
        }
        setReady(true);
      }
      setNow(Date.now());
    }, 0);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    const customerTimer = liveAuth
      ? setTimeout(() => {
          void loadCustomerData();
        }, 0)
      : undefined;
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      if (customerTimer) clearTimeout(customerTimer);
    };
  }, [liveAuth, loadCustomerData]);
  const groups = Array.from(
    new Set(cart.map((p) => `${p.date}|${p.window}`)),
  ).sort();
  const hasFeaturedMealInCart = cart.some(
    (p) => p.mealId === storeSettings.featured_meal_slug,
  );
  const claimUnlocked =
    claimMode &&
    isCampaignLive(storeSettings) &&
    storeSettings.featured_goal_enabled &&
    campaignSummary?.claim_status === "unlocked";
  const claimActive = claimUnlocked && hasFeaturedMealInCart;
  const bonusClaimDiscountNgn =
    claimActive && storeSettings.featured_claim_behavior === "bonus_free_claim"
      ? (checkoutMeals.find((m) => m.id === storeSettings.featured_meal_slug)
          ?.price ?? 0)
      : 0;
  const mealCost = cart.reduce(
    (sum, p) =>
      sum + (checkoutMeals.find((m) => m.id === p.mealId)?.price ?? 0),
    0,
  );
  const rawFoodTotal = cart.reduce(
    (sum, p) => sum + plateTotal(p, checkoutMeals, checkoutAddons),
    0,
  );
  const addonsCost = rawFoodTotal - mealCost;
  const foodTotal = Math.max(0, rawFoodTotal - bonusClaimDiscountNgn);
  function addFeaturedClaimPlate() {
    if (!availableFeaturedSlot) return;
    const plate: Plate = {
      id: `claim-${Date.now()}`,
      mealId: storeSettings.featured_meal_slug,
      date: availableFeaturedSlot.date,
      window: availableFeaturedSlot.window,
      protein: "none",
      extras: {},
    };
    setCart((current) => {
      const next = [...current, plate];
      try {
        localStorage.setItem("mealhr-cart-v1", JSON.stringify(next));
      } catch {
        /* ignore storage failure */
      }
      return next;
    });
    if (storeSettings.featured_claim_behavior === "consumes_credit") {
      setUseCredit(true);
    }
  }
  const getFulfillment = (key: string) => {
    if (!storeSettings.delivery_enabled && storeSettings.pickup_enabled)
      return "pickup";
    if (storeSettings.delivery_enabled && !storeSettings.pickup_enabled)
      return "delivery";
    return deliveries[key]?.fulfillment ?? "delivery";
  };
  const rawDeliveryFee = groups.reduce((sum, key) => {
    if (getFulfillment(key) === "pickup") return sum;
    return (
      sum + (areaCatalog.find((a) => a.id === deliveries[key]?.area)?.fee ?? 0)
    );
  }, 0);
  const isFreeDelivery =
    storeSettings.free_delivery_threshold_ngn > 0 &&
    foodTotal >= storeSettings.free_delivery_threshold_ngn;
  const deliveryFee = isFreeDelivery ? 0 : rawDeliveryFee;
  const meetsMinimumOrder =
    !storeSettings.min_order_amount_ngn ||
    foodTotal >= storeSettings.min_order_amount_ngn ||
    bonusClaimDiscountNgn > 0;
  const withinMaxPlates =
    !storeSettings.max_plates_per_order ||
    cart.length <= storeSettings.max_plates_per_order;
  const allAreas = groups.every((key) => {
    if (getFulfillment(key) === "pickup") return true;
    return Boolean(
      deliveries[key]?.area &&
      deliveries[key]?.address &&
      deliveries[key]?.address.trim().length >= 8,
    );
  });
  const deliveryCount = groups.filter(
    (key) => getFulfillment(key) === "delivery",
  ).length;
  const pickupCount = groups.length - deliveryCount;
  const credit = useCredit
    ? Math.min(liveAuth ? walletBalance : 1500, foodTotal + deliveryFee)
    : 0;
  const total = foodTotal + deliveryFee - credit;
  const parseCutoff = (date: string, cutoff: string) => {
    const parts = (cutoff || "").split(":");
    const h = (parts[0] || "00").padStart(2, "0");
    const m = (parts[1] || "00").padStart(2, "0");
    const s = (parts[2] || "00").padStart(2, "0");
    return Date.parse(`${date}T${h}:${m}:${s}+01:00`);
  };
  const isClosed = (date: string, cutoff: string) =>
    now > 0 && now >= parseCutoff(date, cutoff);
  const isDeliveryWindowClosed = (date: string, window: string) => {
    const available = slotCatalog[window as WindowName] ?? [];
    return (
      available.length > 0 && available.every((s) => isClosed(date, s.cutoff))
    );
  };
  function removeDeliveryGroup(groupKey: string) {
    setCart((currentCart) => {
      const nextCart = currentCart.filter(
        (plate) => `${plate.date}|${plate.window}` !== groupKey,
      );
      try {
        localStorage.setItem("mealhr-cart-v1", JSON.stringify(nextCart));
      } catch {
        /* storage unavailable */
      }
      return nextCart;
    });
    setDeliveries((current) => {
      const next = { ...current };
      delete next[groupKey];
      return next;
    });
  }
  function removeAllClosedGroups() {
    const closedKeys = new Set(
      groups.filter((key) => {
        const [date, window] = key.split("|");
        return isDeliveryWindowClosed(date, window);
      }),
    );
    if (closedKeys.size === 0) return;
    setCart((currentCart) => {
      const nextCart = currentCart.filter(
        (plate) => !closedKeys.has(`${plate.date}|${plate.window}`),
      );
      try {
        localStorage.setItem("mealhr-cart-v1", JSON.stringify(nextCart));
      } catch {
        /* storage unavailable */
      }
      return nextCart;
    });
    setDeliveries((current) => {
      const next = { ...current };
      for (const key of closedKeys) delete next[key];
      return next;
    });
  }
  const hasClosedDeliveries = groups.some((key) => {
    const [date, window] = key.split("|");
    return isDeliveryWindowClosed(date, window);
  });
  function update(key: string, patch: Partial<Delivery>) {
    setReview(false);
    setDeliveries((current) => ({
      ...current,
      [key]: { ...emptyDelivery, ...current[key], ...patch },
    }));
  }
  const validSlots = groups.every((key) => {
    const [date, window] = key.split("|");
    const slot = slotCatalog[window as WindowName].find(
      (s) => s.id === deliveries[key]?.slot,
    );
    return slot && !isClosed(date, slot.cutoff);
  });

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkoutBusy) return;
    if (!validSlots) return;
    setReview(true);
    if (!previewProfile) {
      setSignInOpen(true);
      return;
    }
    if (!liveAuth) {
      setPayment({
        ...previewProfile,
        food: foodTotal,
        credit,
        deliveries: groups.map((key) => {
          const [date, window] = key.split("|");
          const delivery = deliveries[key] ?? emptyDelivery;
          const slot = slotCatalog[window as WindowName].find(
            (s) => s.id === delivery.slot,
          )!;
          const isPickup = getFulfillment(key) === "pickup";
          const area = isPickup
            ? { name: `Pickup · ${storeSettings.pickup_station_name}`, fee: 0 }
            : (areaCatalog.find((a) => a.id === delivery.area) ?? {
                name: "ABU · Samaru campus",
                fee: 500,
              });
          return {
            date,
            window,
            time: slot.label,
            cutoff: slot.cutoff,
            area: area.name,
            address: isPickup
              ? storeSettings.pickup_station_address
              : delivery.address,
            note: delivery.note,
            plates: cart.filter((p) => `${p.date}|${p.window}` === key).length,
            fee: isPickup ? 0 : area.fee,
          };
        }),
        email: paymentEmail.trim(),
      });
      return;
    }
    if (!backendReady) {
      setLoadError(
        "Delivery options are still loading. Please try again in a moment.",
      );
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadError(
        "We couldn’t connect to your account. Please refresh and try again.",
      );
      return;
    }
    setLoadError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setLoadError("Please sign in again before continuing.");
      return;
    }
    const email = paymentEmail.trim();
    const { error: emailError } = await supabase
      .from("profiles")
      .update({ email, updated_at: new Date().toISOString() })
      .eq("id", authData.user.id);
    if (emailError) {
      setLoadError(
        `We couldn't save your email for next time: ${emailError.message}`,
      );
      return;
    }
    {
      let hasDefaultAddress = savedAddresses.length > 0;
      for (const key of groups) {
        const delivery = deliveries[key];
        if (
          !delivery ||
          getFulfillment(key) === "pickup" ||
          delivery.savedAddressId
        )
          continue;
        const area = areaCatalog.find((item) => item.id === delivery.area);
        if (!area || !delivery.address || delivery.address.trim().length < 8)
          continue;
        const { data: existingAddress, error: findAddressError } =
          await supabase
            .from("customer_addresses")
            .select("id")
            .eq("customer_id", authData.user.id)
            .eq("area_id", delivery.area)
            .eq("address", delivery.address.trim())
            .maybeSingle();
        if (findAddressError) {
          setLoadError(
            `We couldn't save your delivery address: ${findAddressError.message}`,
          );
          return;
        }
        const addressPayload = {
          customer_id: authData.user.id,
          area_id: delivery.area,
          label: area.name.slice(0, 35),
          address: delivery.address.trim(),
          delivery_note: delivery.note.trim(),
        };
        const addressSave = existingAddress
          ? await supabase
              .from("customer_addresses")
              .update({
                delivery_note: addressPayload.delivery_note,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingAddress.id)
              .eq("customer_id", authData.user.id)
          : await supabase
              .from("customer_addresses")
              .insert({ ...addressPayload, is_default: !hasDefaultAddress });
        if (addressSave.error) {
          setLoadError(
            `We couldn't save your delivery address: ${addressSave.error.message}`,
          );
          return;
        }
        if (!existingAddress) hasDefaultAddress = true;
      }
    }
    const payload = groups.map((key) => {
      const [service_date] = key.split("|");
      const delivery = deliveries[key] ?? emptyDelivery;
      const isPickup = getFulfillment(key) === "pickup";
      return {
        service_date,
        batch_id: delivery.slot,
        fulfillment_type: isPickup ? "pickup" : "delivery",
        area_id: isPickup
          ? areaCatalog[0]?.id || "00000000-0000-0000-0000-000000000000"
          : delivery.area,
        address: isPickup
          ? storeSettings.pickup_station_address
          : delivery.address,
        pickup_station_address: storeSettings.pickup_station_address,
        delivery_note: delivery.note,
        items: cart
          .filter((plate) => `${plate.date}|${plate.window}` === key)
          .map((plate) => ({
            meal_slug: plate.mealId,
            protein_slug: plate.protein,
            extras: Object.entries(plate.extras)
              .filter(([, quantity]) => quantity > 0)
              .map(([slug, quantity]) => ({ extra_slug: slug, quantity })),
          })),
      };
    });
    setCheckoutBusy(true);
    let checkoutResult: { data: unknown; error: { message: string } | null };
    try {
      checkoutResult = await supabase.rpc(
        "create_customer_checkout",
        claimActive
          ? { p_deliveries: payload, p_claim_featured_meal: true }
          : { p_deliveries: payload },
      );
    } catch {
      setLoadError(
        "We couldn’t start checkout. Check your connection and try again.",
      );
      setCheckoutBusy(false);
      return;
    }
    const { data, error } = checkoutResult;
    if (error) {
      setReview(false);
      setLoadError(error.message);
      setCheckoutBusy(false);
      return;
    }
    const reservation = data as {
      order_id: string;
      subtotal_ngn: number;
      delivery_total_ngn: number;
      total_ngn: number;
      reservation_expires_at: string;
    };
    let walletApplied = 0;
    let payableTotal = reservation.total_ngn;
    if (useCredit) {
      const { data: walletData, error: walletError } = await supabase.rpc(
        "apply_customer_wallet_credit",
        { p_order_id: reservation.order_id },
      );
      if (walletError) {
        setReview(false);
        setLoadError(walletError.message);
        setCheckoutBusy(false);
        return;
      }
      const applied = walletData as {
        wallet_applied_ngn: number;
        total_ngn: number;
      };
      walletApplied = applied.wallet_applied_ngn;
      payableTotal = applied.total_ngn;
    }
    if (payableTotal === 0) {
      const { error: completionError } = await supabase.rpc(
        "complete_customer_wallet_order",
        { p_order_id: reservation.order_id },
      );
      if (completionError) {
        setReview(false);
        setLoadError(completionError.message);
        setCheckoutBusy(false);
        return;
      }
      try {
        localStorage.removeItem("mealhr-cart-v1");
      } catch {
        /* Checkout completes even if browser storage is unavailable. */
      }
      setCheckoutBusy(false);
      router.replace("/orders");
      return;
    }
    setPayment({
      ...previewProfile,
      email,
      food: reservation.subtotal_ngn,
      credit: walletApplied,
      total: payableTotal,
      deliveryTotal: reservation.delivery_total_ngn,
      reservationId: reservation.order_id,
      reservationExpiresAt: reservation.reservation_expires_at,
      deliveries: groups.map((key) => {
        const [date, window] = key.split("|");
        const delivery = deliveries[key];
        const slot = slotCatalog[window as WindowName].find(
          (s) => s.id === delivery.slot,
        )!;
        const area = areaCatalog.find((a) => a.id === delivery.area)!;
        return {
          date,
          window,
          time: slot.label,
          cutoff: slot.cutoff,
          area: area.name,
          address: delivery.address,
          note: delivery.note,
          plates: cart.filter((p) => `${p.date}|${p.window}` === key).length,
          fee: area.fee,
        };
      }),
    });
    setCheckoutBusy(false);
  }

  if (payment && !payment.reservationId)
    return (
      <main className="checkout-shell">
        <PaymentPreview details={payment} close={() => setPayment(null)} />
      </main>
    );
  return (
    <>
      <main className="checkout-shell">
        <div className="checkout-title">
          <span className="eyebrow">A GOOD WEEK STARTS HERE</span>
          <h1>Make it yours.</h1>
          <p>Choose a time and address for each delivery.</p>
          <ol className="checkout-steps" aria-label="Checkout progress">
            <li>
              <Check size={15} /> Meals
            </li>
            <li aria-hidden="true">
              <ArrowRight size={22} />
            </li>
            <li aria-current="step">
              <span>2</span> Delivery details
            </li>
            <li aria-hidden="true">
              <ArrowRight size={22} />
            </li>
            <li>3 · Sign in & pay</li>
          </ol>
        </div>
        {!ready ? (
          <CheckoutSkeleton />
        ) : !cart.length ? (
          <section className="checkout-empty">
            <ShoppingBag size={42} weight="light" />
            {claimUnlocked ? (
              <>
                <h2>Your campaign meal goal is unlocked.</h2>
                <p>
                  {availableFeaturedSlot
                    ? `Add ${storeSettings.featured_meal_title} for ${formatDate(availableFeaturedSlot.date)} (${availableFeaturedSlot.window}) or browse the menu to redeem your reward.`
                    : `${storeSettings.featured_meal_title} does not have open portions posted yet. Browse upcoming menu days or check back once new stock is posted.`}
                </p>
                {availableFeaturedSlot ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={addFeaturedClaimPlate}
                  >
                    <Gift size={18} /> Add {storeSettings.featured_meal_title}{" "}
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <Link className="primary" href="/">
                    Explore the menu <ArrowRight size={18} />
                  </Link>
                )}
              </>
            ) : (
              <>
                <h2>Your week is still open.</h2>
                <p>Add a few meals, then come back to arrange delivery.</p>
                <Link className="primary" href="/">
                  Explore the menu <ArrowRight size={18} />
                </Link>
              </>
            )}
          </section>
        ) : (
          <form className="checkout-grid" onSubmit={submitCheckout}>
            <div className="delivery-list">
              {claimUnlocked && (
                <div
                  role="status"
                  style={{
                    margin: "0 0 18px",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "1px solid #d5e6d7",
                    background: "#f3faf4",
                    color: "#1b4325",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flex: "1 1 240px",
                    }}
                  >
                    <Gift
                      size={20}
                      weight="fill"
                      style={{ color: "#15803d", flexShrink: 0 }}
                    />
                    <div style={{ fontSize: "13px", lineHeight: 1.45 }}>
                      <strong>
                        {claimActive
                          ? storeSettings.featured_claim_behavior ===
                            "bonus_free_claim"
                            ? `Campaign prize active: 1× ${storeSettings.featured_meal_title} (₦0 base price)`
                            : `Campaign goal unlocked: Wallet credit ready for ${storeSettings.featured_meal_title}`
                          : `Featured meal reward unlocked: ${storeSettings.featured_meal_title}`}
                      </strong>
                      <div style={{ color: "#3b5941" }}>
                        {claimActive
                          ? storeSettings.featured_claim_behavior ===
                            "bonus_free_claim"
                            ? "Extra add-ons and delivery fee (or free campus pickup) still apply; your wallet balance remains untouched."
                            : "Wallet credit is pre-applied below and will count toward your campaign meal redemption."
                          : "Add the featured campaign meal to your basket to apply this reward."}
                      </div>
                    </div>
                  </div>
                  {!claimActive && availableFeaturedSlot && (
                    <button
                      type="button"
                      className="primary"
                      style={{ padding: "8px 14px", fontSize: "13px" }}
                      onClick={addFeaturedClaimPlate}
                    >
                      Add {storeSettings.featured_meal_title}
                    </button>
                  )}
                </div>
              )}
              {!storeSettings.service_active && (
                <div
                  className="admin-sticker-warning"
                  style={{
                    margin: "0 0 18px",
                    padding: "14px 16px",
                    borderRadius: "6px",
                  }}
                >
                  <strong>Kitchen Closed: </strong>
                  {storeSettings.service_paused_message}
                </div>
              )}
              {!meetsMinimumOrder && (
                <div
                  className="admin-sticker-warning"
                  style={{
                    margin: "0 0 18px",
                    padding: "14px 16px",
                    borderRadius: "6px",
                  }}
                >
                  Minimum order total is{" "}
                  {money(storeSettings.min_order_amount_ngn)}. Add{" "}
                  {money(storeSettings.min_order_amount_ngn - foodTotal)} more
                  to place your order.
                </div>
              )}
              {!withinMaxPlates && (
                <div
                  className="admin-sticker-warning"
                  style={{
                    margin: "0 0 18px",
                    padding: "14px 16px",
                    borderRadius: "6px",
                  }}
                >
                  You have {cart.length} plates in your cart. Maximum allowed
                  per checkout is {storeSettings.max_plates_per_order} plates.
                </div>
              )}
              {hasClosedDeliveries && (
                <div className="checkout-closed-alert" role="alert">
                  <div>
                    <strong>One or more delivery windows have closed</strong>
                    <p>
                      Kitchen ordering for these meals has passed. Remove them
                      below to complete your order.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-remove-all-closed"
                    onClick={removeAllClosedGroups}
                  >
                    <Trash size={15} /> Remove all closed meals
                  </button>
                </div>
              )}
              {loadError && (
                <p role="alert" className="error">
                  {loadError}
                </p>
              )}
              {groups.map((key, index) => {
                const [date, window] = key.split("|");
                const delivery = deliveries[key] ?? emptyDelivery;
                const available = slotCatalog[window as WindowName];
                const selectedSlot = available.find(
                  (s) => s.id === delivery.slot,
                );
                const area = areaCatalog.find((a) => a.id === delivery.area);
                const isWindowClosed = isDeliveryWindowClosed(date, window);
                return (
                  <section
                    className={`delivery-card ${isWindowClosed ? "delivery-card-closed" : ""}`}
                    key={key}
                    aria-labelledby={`delivery-${index}`}
                  >
                    <div className="delivery-card-heading">
                      <div>
                        <span className="eyebrow muted">
                          DELIVERY {String(index + 1).padStart(2, "0")}
                        </span>
                        <h2 id={`delivery-${index}`}>
                          {formatDate(date, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          <span>· {window}</span>
                        </h2>
                      </div>
                      <div className="delivery-heading-actions">
                        {isWindowClosed && (
                          <span className="delivery-badge-closed">Closed</span>
                        )}
                        <Link href="/" className="edit-meals-link">
                          Edit meals
                        </Link>
                      </div>
                    </div>
                    <div className="checkout-plates">
                      {cart
                        .filter((p) => `${p.date}|${p.window}` === key)
                        .map((p) => {
                          const meal = checkoutMeals.find(
                            (m) => m.id === p.mealId,
                          )!;
                          const protein = checkoutAddons.find(
                            (a) => a.id === p.protein,
                          )?.name;
                          const extras = Object.entries(p.extras)
                            .filter(([, qty]) => qty > 0)
                            .map(
                              ([id, qty]) =>
                                `${checkoutAddons.find((a) => a.id === id)?.name} × ${qty}`,
                            );
                          const options = [
                            protein ?? "No protein",
                            extras.length > 0
                              ? extras.join(" · ")
                              : "No extras",
                          ];
                          return (
                            <div className="checkout-plate" key={p.id}>
                              <Image
                                src={meal.image}
                                alt=""
                                width={64}
                                height={64}
                                unoptimized
                              />
                              <div className="checkout-plate-copy">
                                <h3>{meal.name}</h3>
                                <p>{options.join(" · ")}</p>
                              </div>
                              <strong>
                                {money(
                                  plateTotal(p, checkoutMeals, checkoutAddons),
                                )}
                              </strong>
                            </div>
                          );
                        })}
                    </div>
                    {isWindowClosed ? (
                      <div className="delivery-closed-box" role="alert">
                        <div className="delivery-closed-info">
                          <Clock size={20} className="delivery-closed-icon" />
                          <div>
                            <strong>This delivery window has closed</strong>
                            <p>
                              Kitchen ordering for{" "}
                              {formatDate(date, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}{" "}
                              · {window} has ended. Remove these plates to
                              proceed with checkout.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-remove-closed"
                          onClick={() => removeDeliveryGroup(key)}
                        >
                          <Trash size={15} /> Remove closed meals
                        </button>
                      </div>
                    ) : (
                      <>
                        {storeSettings.delivery_enabled &&
                          storeSettings.pickup_enabled && (
                            <div
                              className="fulfillment-switch"
                              role="group"
                              aria-label="Fulfillment method"
                            >
                              <button
                                type="button"
                                className={`fulfillment-option ${getFulfillment(key) !== "pickup" ? "is-selected" : ""}`}
                                onClick={() => {
                                  update(key, { fulfillment: "delivery" });
                                  setReview(false);
                                }}
                              >
                                Delivery
                              </button>
                              <button
                                type="button"
                                className={`fulfillment-option ${getFulfillment(key) === "pickup" ? "is-selected" : ""}`}
                                onClick={() => {
                                  update(key, { fulfillment: "pickup" });
                                  setReview(false);
                                }}
                              >
                                Pickup (Free)
                              </button>
                            </div>
                          )}
                        {!storeSettings.delivery_enabled &&
                          storeSettings.pickup_enabled && (
                            <div className="fulfillment-banner-pickup">
                              <span>
                                🛍️ <strong>Campus Pickup Only:</strong> Delivery
                                is temporarily paused. Orders are available for
                                free pickup at{" "}
                                {storeSettings.pickup_station_name}.
                              </span>
                            </div>
                          )}
                        {!storeSettings.delivery_enabled &&
                          !storeSettings.pickup_enabled && (
                            <div
                              className="fulfillment-banner-pickup"
                              style={{
                                background: "#fef2f2",
                                borderColor: "#fecaca",
                                color: "#991b1b",
                              }}
                            >
                              <span>
                                ⏸️{" "}
                                <strong>Fulfillment Temporarily Paused:</strong>{" "}
                                Both doorstep delivery and campus pickup are
                                currently paused.
                              </span>
                            </div>
                          )}
                        <fieldset className="delivery-times">
                          <legend>
                            <Clock size={17} />{" "}
                            {getFulfillment(key) === "pickup"
                              ? "Pickup ready window"
                              : "Delivery time"}
                          </legend>
                          <div>
                            {available.map((slot) => {
                              const closed = isClosed(date, slot.cutoff);
                              return (
                                <label
                                  key={slot.id}
                                  className={`${delivery.slot === slot.id ? "chosen" : ""} ${closed ? "closed" : ""}`}
                                >
                                  <input
                                    required
                                    type="radio"
                                    name={`time-${index}`}
                                    checked={delivery.slot === slot.id}
                                    disabled={closed}
                                    onChange={() =>
                                      update(key, { slot: slot.id })
                                    }
                                  />
                                  <span>
                                    {slot.label}
                                    {closed && <small>Ordering closed</small>}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <p>
                            {selectedSlot
                              ? `Order, cancel or change this ${getFulfillment(key) === "pickup" ? "pickup" : "delivery"} before ${selectedSlot.cutoff}. All times are in Zaria.`
                              : `Select a ${getFulfillment(key) === "pickup" ? "pickup time" : "delivery time"} to see its ordering cutoff.`}
                          </p>
                        </fieldset>
                        {getFulfillment(key) === "pickup" ? (
                          <div className="pickup-station-box">
                            <div className="pickup-station-card">
                              <div className="pickup-station-header">
                                <Storefront
                                  size={22}
                                  weight="fill"
                                  className="pickup-station-icon"
                                />
                                <div>
                                  <strong>
                                    {storeSettings.pickup_station_name}
                                  </strong>
                                  <p>{storeSettings.pickup_station_address}</p>
                                </div>
                              </div>
                              <div className="pickup-station-note">
                                <p>{storeSettings.pickup_instructions}</p>
                              </div>
                              <div className="pickup-station-policy">
                                <span>
                                  ⏱️ <strong>Collection cutoff:</strong> Held
                                  for {storeSettings.pickup_holding_minutes}{" "}
                                  mins after window closes.
                                </span>
                                <p>{storeSettings.pickup_unclaimed_policy}</p>
                                {storeSettings.pickup_delivery_reroute_enabled && (
                                  <small>
                                    💡 Delayed in lecture or hostel? You can
                                    request emergency doorstep delivery via
                                    WhatsApp dispatch.
                                  </small>
                                )}
                              </div>
                            </div>
                            <label htmlFor={`pickup-note-${index}`}>
                              Pickup note <span>(optional)</span>
                            </label>
                            <input
                              id={`pickup-note-${index}`}
                              maxLength={200}
                              placeholder="e.g. Someone else collecting for you?"
                              value={delivery.note}
                              onChange={(e) =>
                                update(key, { note: e.target.value })
                              }
                            />
                            <div className="delivery-fee">
                              <span>Fulfillment</span>
                              <strong style={{ color: "#15803d" }}>
                                Free Campus Pickup (₦0)
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="delivery-address">
                              {savedAddresses.length > 0 && (
                                <>
                                  <label htmlFor={`saved-address-${index}`}>
                                    Use a saved address
                                  </label>
                                  <select
                                    id={`saved-address-${index}`}
                                    value={delivery.savedAddressId}
                                    onChange={(e) => {
                                      const saved = savedAddresses.find(
                                        (address) =>
                                          address.id === e.target.value,
                                      );
                                      update(
                                        key,
                                        saved
                                          ? {
                                              savedAddressId: saved.id,
                                              area: saved.areaId,
                                              address: saved.address,
                                              note: saved.note,
                                            }
                                          : { savedAddressId: "" },
                                      );
                                    }}
                                  >
                                    <option value="">
                                      Enter a different address
                                    </option>
                                    {savedAddresses.map((saved) => (
                                      <option key={saved.id} value={saved.id}>
                                        {saved.label}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              )}
                              <label htmlFor={`area-${index}`}>
                                Delivery area
                              </label>
                              <select
                                id={`area-${index}`}
                                required
                                value={delivery.area}
                                onChange={(e) =>
                                  update(key, {
                                    area: e.target.value,
                                    savedAddressId: "",
                                  })
                                }
                              >
                                <option value="">Choose an area</option>
                                {areaCatalog.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} · {money(a.fee)}
                                  </option>
                                ))}
                              </select>
                              <label htmlFor={`address-${index}`}>
                                Address & landmark
                              </label>
                              <textarea
                                id={`address-${index}`}
                                required
                                minLength={8}
                                maxLength={300}
                                rows={2}
                                placeholder="Hostel, department or street. Add a nearby landmark."
                                value={delivery.address}
                                onChange={(e) =>
                                  update(key, {
                                    address: e.target.value,
                                    savedAddressId: "",
                                  })
                                }
                              />
                              <label htmlFor={`note-${index}`}>
                                Delivery note <span>(optional)</span>
                              </label>
                              <input
                                id={`note-${index}`}
                                maxLength={200}
                                placeholder="Anything that will help us find you?"
                                value={delivery.note}
                                onChange={(e) =>
                                  update(key, {
                                    note: e.target.value,
                                    savedAddressId: "",
                                  })
                                }
                              />
                              {index > 0 && (
                                <button
                                  type="button"
                                  className="copy-address"
                                  onClick={() => {
                                    const first = deliveries[groups[0]];
                                    if (first)
                                      update(key, {
                                        area: first.area,
                                        address: first.address,
                                        note: first.note,
                                        savedAddressId: first.savedAddressId,
                                      });
                                  }}
                                  disabled={!deliveries[groups[0]]?.area}
                                >
                                  Use the first delivery’s address
                                </button>
                              )}
                            </div>
                            <div className="delivery-fee">
                              <span>Delivery fee</span>
                              <strong>
                                {area ? money(area.fee) : "Choose an area"}
                              </strong>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
              {/* <div className="checkout-account-note">
                <Check size={21} />
                <div>
                  <h3>Your details, just once.</h3>
                  <p>
                    You’ll sign in or create an account with your name and phone
                    number before paying.
                  </p>
                </div>
              </div> */}
              <p className="preview-note">
                {liveAuth
                  ? "Prices, delivery fees, stock and cutoffs are checked again before payment."
                  : "Design preview · Sample delivery times, areas, fees and wallet balance. Address details stay on this page and are not submitted."}
              </p>
            </div>
            <aside className="checkout-summary" aria-label="Order summary">
              <span className="eyebrow muted">YOUR WEEK, PLANNED</span>
              <h2>Order summary</h2>
              <p className="summary-caption">
                {cart.length} {cart.length === 1 ? "plate" : "plates"} ·{" "}
                {groups.length}{" "}
                {groups.length === 1 ? "meal window" : "meal windows"}
              </p>
              <div className="summary-lines">
                <div>
                  <span>Meals</span>
                  <strong>{money(mealCost)}</strong>
                </div>
                <div>
                  <span>Proteins & extras</span>
                  <strong>{money(addonsCost)}</strong>
                </div>
                {bonusClaimDiscountNgn > 0 && (
                  <div>
                    <span>
                      Campaign prize ({storeSettings.featured_meal_title})
                    </span>
                    <strong style={{ color: "#15803d" }}>
                      −{money(bonusClaimDiscountNgn)}
                    </strong>
                  </div>
                )}
                <div>
                  <span>
                    {deliveryCount > 0 && pickupCount > 0
                      ? `Fulfillment (${deliveryCount} ${deliveryCount === 1 ? "delivery" : "deliveries"} + ${pickupCount} pickup)`
                      : deliveryCount > 0
                        ? `Delivery (${deliveryCount} ${deliveryCount === 1 ? "trip" : "trips"})`
                        : `Campus pickup (${pickupCount} ${pickupCount === 1 ? "window" : "windows"})`}
                  </span>
                  <strong
                    style={
                      isFreeDelivery || (deliveryCount === 0 && pickupCount > 0)
                        ? { color: "#15803d" }
                        : undefined
                    }
                  >
                    {isFreeDelivery
                      ? "Free delivery applied"
                      : deliveryCount === 0 && pickupCount > 0
                        ? "Free campus pickup"
                        : allAreas
                          ? money(deliveryFee)
                          : "Select details"}
                  </strong>
                </div>
              </div>
              <div className="checkout-wallet">
                <div>
                  <Wallet size={21} />
                  <h3>Wallet credit</h3>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={useCredit}
                    onChange={(e) => {
                      setUseCredit(e.target.checked);
                      setReview(false);
                    }}
                  />{" "}
                  {liveAuth ? "Use wallet credit" : "Use sample wallet credit"}
                </label>
                <p>
                  {liveAuth ? "Available balance" : "Preview balance"}:{" "}
                  {money(liveAuth ? walletBalance : 1500)}
                </p>
                {useCredit && (
                  <div className="subtotal">
                    <span>Credit applied</span>
                    <strong>−{money(credit)}</strong>
                  </div>
                )}
              </div>
              <label className="checkout-email" htmlFor="checkout-email">
                Delivery & payment email
                <input
                  id="checkout-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  disabled={checkoutBusy}
                  value={paymentEmail}
                  onChange={(event) => setPaymentEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <small>
                  For your payment receipt and order updates. Saved to your
                  account for next time.
                </small>
              </label>
              <div className="checkout-total">
                <span>
                  {allAreas ? "Total to pay" : "Total before delivery"}
                </span>
                <strong>
                  {money(
                    allAreas
                      ? total
                      : foodTotal - (useCredit ? Math.min(1500, foodTotal) : 0),
                  )}
                </strong>
              </div>
              <button
                type="submit"
                className="primary"
                disabled={
                  !validSlots ||
                  !meetsMinimumOrder ||
                  !withinMaxPlates ||
                  !storeSettings.service_active ||
                  (!storeSettings.delivery_enabled &&
                    !storeSettings.pickup_enabled) ||
                  (liveAuth && !backendReady) ||
                  checkoutBusy
                }
                aria-busy={checkoutBusy}
              >
                {checkoutBusy ? (
                  <>
                    <CircleNotch className="button-spinner" size={19} /> Opening
                    secure payment…
                  </>
                ) : (
                  <>
                    {!storeSettings.service_active
                      ? "Kitchen is currently closed"
                      : !storeSettings.delivery_enabled &&
                          !storeSettings.pickup_enabled
                        ? "Fulfillment is temporarily paused"
                        : !meetsMinimumOrder
                          ? `Min. order is ${money(storeSettings.min_order_amount_ngn)}`
                          : !withinMaxPlates
                            ? `Max ${storeSettings.max_plates_per_order} plates exceeded`
                            : previewProfile
                              ? liveAuth
                                ? `Pay securely · ${money(total)}`
                                : `Continue to payment preview · ${money(total)}`
                              : "Continue to sign in"}{" "}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
              <p className="checkout-payment-note">
                {liveAuth
                  ? "Your meals are confirmed after Paystack verifies payment."
                  : "No payment is taken in this preview."}
              </p>
              {loadError && (
                <p role="alert" className="error" style={{ marginTop: "12px" }}>
                  {loadError}
                </p>
              )}
              {review && !loadError && (
                <div className="checkout-reviewed" role="status">
                  <Check size={23} />
                  <div>
                    <strong>Your delivery details are ready.</strong>
                    <p>
                      {previewProfile
                        ? `Thanks, ${previewProfile.name}. Your details are ready. Press Pay securely to continue.`
                        : "Sign in to continue. Your order has not been placed."}
                    </p>
                  </div>
                </div>
              )}
              <p className="cancellation-note">
                Cancel before your delivery cutoff for a refund as wallet
                credit. Credit never expires and cannot be withdrawn as cash.
              </p>
              <p className="checkout-legal-notice">
                By placing your order, you agree to PreChop’s{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </p>
            </aside>
          </form>
        )}
      </main>
      {signInOpen && (
        <SignInDialog
          close={() => setSignInOpen(false)}
          complete={(profile) => {
            setPreviewProfile(profile);
            setSignInOpen(false);
            setLoadError("");
            void loadCustomerData();
          }}
        />
      )}
      {payment?.reservationId && (
        <PaymentPreview details={payment} close={() => setPayment(null)} />
      )}
      {paystackReturn !== null && (
        <PaymentReturnDialog
          reference={paystackReturn}
          close={() => {
            setPaystackReturn(null);
            window.history.replaceState(null, "", "/checkout");
          }}
        />
      )}
    </>
  );
}
