"use client";

import { windowClosed } from "@/lib/delivery-slots";
import Image from "next/image";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeft,
  BowlFood,
  CalendarBlank,
  Check,
  Clock,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  addons,
  addOnUsed,
  formatDate,
  meals,
  mealRemaining,
  money,
  plateTotal,
  readCart,
  upcomingDates,
  windows,
  type AddOn,
  type Meal,
  type Plate,
  type WindowName,
} from "@/lib/menu";
import type { CustomerMenu } from "@/lib/supabase/menu";
import {
  CartSkeleton,
  DateStripSkeleton,
  MealGridSkeleton,
} from "@/components/skeletons";
import {
  defaultStoreSettings,
  fetchStoreSettings,
  type StoreSettings,
} from "@/lib/settings";

function Modal({
  children,
  title,
  close,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Close dialog"
        onClick={close}
      >
        <X size={22} />
      </button>
      {children}
    </dialog>
  );
}

export function MenuApp({
  menuData,
  liveConfigured = false,
}: {
  menuData: CustomerMenu | null;
  liveConfigured?: boolean;
}) {
  const liveMenu = menuData !== null;
  const catalogMeals = useMemo(
    () => menuData?.meals ?? (liveConfigured ? [] : meals),
    [liveConfigured, menuData?.meals],
  );
  const catalogAddons = useMemo(
    () => menuData?.addons ?? (liveConfigured ? [] : addons),
    [liveConfigured, menuData?.addons],
  );

  const [dates, setDates] = useState<string[]>([]);
  const [day, setDay] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const refresh = () => setNow(Date.now());
    const initial = setTimeout(refresh, 0);
    const clock = setInterval(refresh, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(clock);
    };
  }, []);
  const [windowName, setWindowName] = useState<WindowName>("Lunch");
  const [cart, setCart] = useState<Plate[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Plate | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [storeSettings, setStoreSettings] =
    useState<StoreSettings>(defaultStoreSettings);
  useEffect(() => {
    void fetchStoreSettings().then((settings) => setStoreSettings(settings));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      const ds = upcomingDates();
      setDates(ds);
      try {
        setCart(
          readCart(
            localStorage.getItem("mealhr-cart-v1"),
            catalogMeals,
            catalogAddons,
          ).filter((p) => ds.includes(p.date)),
        );
      } catch {
        /* Browser storage can be unavailable. */
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [catalogMeals, catalogAddons]);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("mealhr-cart-v1", JSON.stringify(cart));
      } catch {
        /* The current session still works. */
      }
    }
  }, [cart, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const date = dates[day] ?? "";
  const getLiveSlotCutoffs = useCallback(
    (targetDate: string, targetWindow: WindowName, targetMealId?: string) => {
      if (!menuData) return undefined;
      if (targetMealId) {
        const mealSpecific =
          menuData.mealCutoffsBySlot[`${targetDate}|${targetWindow}|${targetMealId}`];
        if (mealSpecific) return mealSpecific;
      }
      const slotSpecific = menuData.cutoffsBySlot[`${targetDate}|${targetWindow}`];
      if (slotSpecific) return slotSpecific;
      return menuData.defaultCutoffsByWindow[targetWindow];
    },
    [menuData],
  );
  const closed = windowClosed(
    date,
    windowName,
    now,
    getLiveSlotCutoffs(date, windowName),
  );
  const total = cart.reduce(
    (sum, plate) => sum + plateTotal(plate, catalogMeals, catalogAddons),
    0,
  );
  const visibleMealIds = liveMenu
    ? (menuData?.availability[`${date}|${windowName}`] ?? [])
    : liveConfigured
      ? []
      : catalogMeals.map((meal) => meal.id);
  const visibleMeals = catalogMeals.filter(
    (meal) =>
      visibleMealIds.includes(meal.id) &&
      (!liveMenu ||
        !windowClosed(
          date,
          windowName,
          now,
          getLiveSlotCutoffs(date, windowName, meal.id),
        )),
  );
  const groups = Array.from(
    new Set(cart.map((p) => `${p.date}|${p.window}`)),
  ).sort();
  function plateSignature(plate: Plate) {
    return JSON.stringify([
      plate.mealId,
      plate.protein,
      Object.entries(plate.extras)
        .filter(([, quantity]) => quantity > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    ]);
  }
  function groupedPlates(date: string, window: string) {
    const grouped = new Map<string, Plate[]>();
    for (const plate of cart.filter(
      (item) => item.date === date && item.window === window,
    )) {
      const signature = plateSignature(plate);
      grouped.set(signature, [...(grouped.get(signature) ?? []), plate]);
    }
    return [...grouped.entries()].map(([signature, plates]) => ({
      signature,
      plates,
      plate: plates[0],
      quantity: plates.length,
    }));
  }
  function canIncreasePlate(plate: Plate) {
    return (
      mealRemaining(cart, plate.mealId, plate.date, catalogMeals) > 0 &&
      catalogAddons.every(
        (addon) =>
          addOnUsed(cart, addon.id) +
            (plate.protein === addon.id ? 1 : 0) +
            (plate.extras[addon.id] ?? 0) <=
          addon.stock,
      )
    );
  }
  function increasePlate(plate: Plate) {
    const addedPlate = { ...plate, id: crypto.randomUUID() };
    setCart((current) => {
      const canAddMeal =
        mealRemaining(current, plate.mealId, plate.date, catalogMeals) > 0;
      const canAddAddons = catalogAddons.every(
        (addon) =>
          addOnUsed(current, addon.id) +
            (plate.protein === addon.id ? 1 : 0) +
            (plate.extras[addon.id] ?? 0) <=
          addon.stock,
      );
      return canAddMeal && canAddAddons ? [...current, addedPlate] : current;
    });
  }
  function decreasePlate(plate: Plate) {
    const signature = plateSignature(plate);
    setCart((current) => {
      const matching = current.filter(
        (item) =>
          item.date === plate.date &&
          item.window === plate.window &&
          plateSignature(item) === signature,
      );
      if (matching.length <= 1) return current;
      const removeId = matching[matching.length - 1].id;
      return current.filter((item) => item.id !== removeId);
    });
  }
  function removePlateGroup(plate: Plate) {
    const signature = plateSignature(plate);
    setCart((current) =>
      current.filter(
        (item) =>
          !(
            item.date === plate.date &&
            item.window === plate.window &&
            plateSignature(item) === signature
          ),
      ),
    );
  }
  function removeAllClosedFromCart() {
    setCart((current) => {
      const next = current.filter(
        (p) =>
          !windowClosed(
            p.date,
            p.window,
            now,
            getLiveSlotCutoffs(p.date, p.window, p.mealId),
          ),
      );
      try {
        localStorage.setItem("mealhr-cart-v1", JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }
  function editPlate(plate: Plate) {
    setEditing(plate);
    setSelected(catalogMeals.find((m) => m.id === plate.mealId)!);
    setCartOpen(false);
  }
  function closeMeal() {
    setSelected(null);
    setEditing(null);
  }
  function savePlate(plate: Plate) {
    setCart((current) =>
      editing
        ? current.map((p) => (p.id === editing.id ? plate : p))
        : [...current, plate],
    );
    setNotice(
      editing
        ? "Your plate has been updated."
        : "One good meal, added to your week.",
    );
    closeMeal();
  }
  const cartContent = (
    <>
      <div className="cart-heading">
        <div>
          <h2>Your order</h2>
          <p>
            {cart.length
              ? `${cart.length} ${cart.length === 1 ? "plate" : "plates"} · ${groups.length} ${groups.length === 1 ? "meal window" : "meal windows"}`
              : "A little planning. A better week."}
          </p>
        </div>
        <div className="cart-badge-icon" aria-label={`Cart with ${cart.length} items`}>
          <ShoppingBag size={22} weight="regular" />
          <span className="cart-count-badge">{cart.length}</span>
        </div>
      </div>
      {!ready ? (
        <CartSkeleton />
      ) : cart.length === 0 ? (
        <div className="cart-empty">
          <div className="empty-cart-illustration" aria-hidden="true">
            <svg
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M31 10L34 7"
                stroke="#E58A4E"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M36 13L40 12"
                stroke="#E58A4E"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M34 18L38 19"
                stroke="#E58A4E"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M15 20L21 11C21.5 10.3 22.5 10.3 23 11L29 20"
                stroke="#9A9286"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="9" y="20" width="26" height="3" rx="1.5" fill="#9A9286" />
              <path
                d="M11 23L13.5 35C13.8 36.1 14.8 37 16 37H28C29.2 37 30.2 36.1 30.5 35L33 23"
                stroke="#9A9286"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M18 25V35"
                stroke="#9A9286"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M22 25V35"
                stroke="#9A9286"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M26 25V35"
                stroke="#9A9286"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h3>Your meal list is empty.</h3>
          <span className="sr-only">What sounds good?</span>
          <p>
            Add a meal to start planning your week’s meals.
          </p>
        </div>
      ) : (
        <div className="cart-items">
          {groups.map((key) => {
            const [d, w] = key.split("|");
            const isGroupClosed = windowClosed(
  d,
  w as WindowName,
  now,
  getLiveSlotCutoffs(d, w as WindowName),
);
            return (
              <section
                className={`cart-group ${isGroupClosed ? "cart-group-closed" : ""}`}
                key={key}
              >
                <div className="cart-group-heading">
                  <h3>
                    <CalendarBlank size={16} />
                    {formatDate(d)} · {w}
                  </h3>
                  {isGroupClosed && (
                    <span className="cart-badge-closed">Closed</span>
                  )}
                </div>
                {groupedPlates(d, w).map(({ signature, plate, quantity }) => {
                  const meal = catalogMeals.find((m) => m.id === plate.mealId)!;
                  const proteinName =
                    catalogAddons.find((a) => a.id === plate.protein)?.name ??
                    "No protein";
                  const lineLabel = `${meal.name}, ${proteinName}, ${formatDate(plate.date)} ${plate.window}`;
                  const unitPrice = plateTotal(
                    plate,
                    catalogMeals,
                    catalogAddons,
                  );
                  return (
                    <div className="cart-item" key={signature}>
                      <div className="cart-line">
                        <strong>{meal.name}</strong>
                        <span>{money(unitPrice * quantity)}</span>
                      </div>
                      <p>
                        {proteinName}
                        {Object.entries(plate.extras)
                          .filter(([, n]) => n > 0)
                          .map(
                            ([id, n]) =>
                              ` · ${catalogAddons.find((a) => a.id === id)?.name} × ${n}`,
                          )
                          .join("")}
                      </p>
                      <div className="item-actions">
                        <button onClick={() => editPlate(plate)}>
                          Edit plate
                        </button>
                        <div className="stepper cart-quantity">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${lineLabel}`}
                            disabled={quantity <= 1}
                            onClick={() => decreasePlate(plate)}
                          >
                            <Minus size={16} />
                          </button>
                          <output aria-label={`Quantity of ${lineLabel}`}>
                            {quantity}
                          </output>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${lineLabel}`}
                            disabled={!canIncreasePlate(plate)}
                            onClick={() => increasePlate(plate)}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <button
                          aria-label={`Remove ${lineLabel}`}
                          onClick={() => removePlateGroup(plate)}
                        >
                          <Trash size={15} /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      <div className="cart-bottom">
        {cart.some((p) =>
  windowClosed(
    p.date,
    p.window,
    now,
    getLiveSlotCutoffs(p.date, p.window, p.mealId),
  ),
) && (
          <div className="cart-closed-warning">
            <span>Some meals in cart have closed.</span>
            <button
              type="button"
              className="btn-clear-closed-cart"
              onClick={removeAllClosedFromCart}
            >
              Remove closed
            </button>
          </div>
        )}
        <div className="subtotal">
          <span>Meal subtotal</span>
          <strong>{money(total)}</strong>
        </div>
        <p>
          Includes proteins and extras. Delivery fees are added at checkout.
        </p>
        {cart.length ? (
          <Link className="primary" href="/checkout">
            Continue to checkout <ArrowRight size={18} />
          </Link>
        ) : (
          <button className="primary empty-state-btn" disabled>
            Add a meal to continue
          </button>
        )}
        <div className="cart-hint">
          <Clock size={14} /> Pick delivery times at checkout
        </div>
      </div>
    </>
  );
  return (
    <>
      <a href="#weekly-menu" className="skip-link">
        Skip to menu
      </a>

      <main className="shell">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">
              GOOD FOOD. ONE LESS THING TO THINK ABOUT.
            </span>
            <h1 id="hero-title">
              Your meals, planned.
              <br />
              Your day, easier.
            </h1>
            <p>
              Pre-order fresh meals for delivery
              <br className="desktop-break" /> across ABU and Sabon Gari.
            </p>
            <a href="#weekly-menu" className="hero-link">
              Find your next meal <ArrowRight size={18} />
            </a>
          </div>
          <div className="hero-photo">
            <Image
              src="/images/prechop-box-banner.png"
              alt="PreChop fresh meal box with jollof rice, chicken, and plantain"
              fill
              sizes="(max-width: 800px) 100vw, 52vw"
              priority
            />
          </div>
        </section>
        <div className="menu-layout">
          <section id="weekly-menu" className="menu-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow muted">FRESH FROM OUR KITCHEN</span>
                <h2>This week’s menu</h2>
              </div>
              <span className="week-label">
                <CalendarBlank size={15} />
                {dates.length
                  ? `${formatDate(dates[0], { day: "numeric", month: "short" })} – ${formatDate(dates[6], { day: "numeric", month: "short" })}`
                  : "Loading dates…"}
              </span>
            </div>
            {dates.length === 0 ? (
              <DateStripSkeleton />
            ) : (
              <div className="date-strip" aria-label="Choose delivery date">
                {dates.map((d, i) => (
                  <button
                    className={i === day ? "selected" : ""}
                    key={d}
                    onClick={() => setDay(i)}
                    aria-pressed={i === day}
                  >
                    <span className="date-day">{formatDate(d, { weekday: "short" })}</span>
                    <strong className="date-num">{formatDate(d, { day: "numeric" })}</strong>
                    {i === 0 && <span className="date-badge">Today</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="window-tabs" aria-label="Choose meal window">
              {windows.map((w) => (
                <button
                  aria-pressed={w === windowName}
                  className={w === windowName ? "selected" : ""}
                  onClick={() => setWindowName(w)}
                  key={w}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="menu-context">
              <span>
                <Clock size={16} /> Choose your delivery time at checkout.
              </span>
              <span>
                {closed
                  ? "Window closed"
                  : `${visibleMeals.length} ${visibleMeals.length === 1 ? "meal" : "meals"}`}
              </span>
            </div>
            {!storeSettings.service_active && (
              <section
                className="cutoff-notice"
                style={{
                  marginBottom: "24px",
                  borderColor: "#fca5a5",
                  background: "#fef2f2",
                }}
              >
                <div
                  className="cutoff-art"
                  aria-hidden="true"
                  style={{ color: "#b91c1c" }}
                >
                  <BowlFood size={66} weight="light" />
                </div>
                <span className="eyebrow" style={{ color: "#b91c1c" }}>
                  KITCHEN PAUSED
                </span>
                <h3 style={{ color: "#991b1b" }}>
                  Kitchen is temporarily closed.
                </h3>
                <p style={{ color: "#7f1d1d" }}>
                  {storeSettings.service_paused_message}
                </p>
              </section>
            )}
            <div aria-live="polite">
              {!ready ? (
                <MealGridSkeleton />
              ) : closed ? (
                <section
                  className="cutoff-notice"
                  aria-labelledby="cutoff-title"
                >
                  <div className="cutoff-art" aria-hidden="true">
                    <BowlFood size={66} weight="light" />
                    <span>
                      <Clock size={27} />
                    </span>
                  </div>
                  <span className="eyebrow">TODAY’S KITCHEN SCHEDULE</span>
                  <h3 id="cutoff-title">
                    Time’s up for {windowName.toLowerCase()} today.
                  </h3>
                  <p>
                    Orders for this meal window are closed. Plan ahead and we’ll
                    have something good for you tomorrow.
                  </p>
                  <button className="primary" onClick={() => setDay(day + 1)}>
                    Book tomorrow’s {windowName.toLowerCase()}{" "}
                    <ArrowRight size={19} />
                  </button>
                  <small>You can also choose another meal window above.</small>
                </section>
              ) : visibleMeals.length === 0 ? (
                <section className="cutoff-notice">
                  <div className="cutoff-art" aria-hidden="true">
                    <BowlFood size={66} weight="light" />
                  </div>
                  <span className="eyebrow">A LITTLE MORE PLANNING</span>
                  <h3>No {windowName.toLowerCase()} menu for this day yet.</h3>
                  <p>
                    Check another day or meal window to see what is available to
                    pre-order.
                  </p>
                </section>
              ) : (
                <div className="meal-grid">
                  {visibleMeals.map((meal) => {
                    const remaining = mealRemaining(
                      cart,
                      meal.id,
                      date,
                      catalogMeals,
                    );
                    const isAvailable = ready && remaining > 0;
                    return (
                      <article className="meal-card" key={meal.id}>
                        <button
                          type="button"
                          className="meal-photo"
                          disabled={!ready || remaining === 0}
                          aria-label={`Select ${meal.name}`}
                          onClick={() => setSelected(meal)}
                        >
                          <Image
                            src={meal.image}
                            alt={meal.name}
                            fill
                            sizes="(max-width: 600px) 94vw, (max-width: 1000px) 46vw, 420px"
                            unoptimized
                          />
                        </button>
                        <div className="meal-body">
                          <h3 className="meal-title">{meal.name}</h3>
                          <p className="meal-description">{meal.description}</p>
                          <div className="meal-footer">
                            <div className="meal-meta">
                              <strong className="meal-price">
                                {money(meal.price)}
                              </strong>
                              <span className="meal-meta-divider" aria-hidden="true" />
                              <div
                                className="meal-stock"
                                role="status"
                                aria-label={
                                  isAvailable
                                    ? `${remaining} remaining`
                                    : "Sold out"
                                }
                              >
                                <span
                                  className={`stock-dot ${isAvailable ? "" : "sold"}`}
                                  aria-hidden="true"
                                />
                                <span>
                                  {isAvailable
                                    ? `${remaining} remaining`
                                    : "Sold out"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="add-button"
                              aria-label={`Add ${meal.name}`}
                              disabled={!ready || remaining === 0}
                              onClick={() => setSelected(meal)}
                            >
                              <Plus
                                size={13}
                                weight="bold"
                                aria-hidden="true"
                              />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          <aside className="cart-panel" aria-label="Your cart">
            {cartContent}
          </aside>
        </div>
        <div className="menu-features-strip" aria-label="PreChop order benefits">
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <CalendarBlank size={26} weight="regular" />
            </div>
            <div className="feature-text">
              <h3>Plan ahead</h3>
              <p>Choose meals for different days and check out together.</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <BowlFood size={26} weight="regular" />
            </div>
            <div className="feature-text">
              <h3>Freshly prepared</h3>
              <p>Meals made to order by trusted kitchens.</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <MapPin size={26} weight="regular" />
            </div>
            <div className="feature-text">
              <h3>Delivered to you</h3>
              <p>Serving ABU, Kongo &amp; Sabon Gari, Zaria.</p>
            </div>
          </div>
        </div>
        {!liveMenu && !liveConfigured && (
          <p className="preview-note">
            Menu preview · Sample meals and prices. Orders and payments are not live yet.
          </p>
        )}
        <footer className="footer">
          <div className="footer-links">
            <Link href="/terms">Terms</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy">Privacy</Link>
          </div>
          <span className="footer-service-area">
            <MapPin size={14} weight="fill" />
            ABU Samaru, Zaria
          </span>
        </footer>
      </main>
      {cart.length > 0 && (
        <button
          className="mobile-cart primary"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingBag size={21} />
          <span>
            View cart · {cart.length} {cart.length === 1 ? "plate" : "plates"}
          </span>
          <strong>{money(total)}</strong>
          <ArrowRight size={20} />
        </button>
      )}
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={19} />
            {notice}
          </>
        )}
      </div>
      {selected && (
        <MealModal
          now={now}
          meal={selected}
          mealCatalog={catalogMeals}
          addonCatalog={catalogAddons}
          cart={cart.filter((p) => p.id !== editing?.id)}
          date={editing?.date ?? date}
          windowName={editing?.window ?? windowName}
          initial={editing}
          customCutoffs={getLiveSlotCutoffs(
            editing?.date ?? date,
            editing?.window ?? windowName,
            selected.id,
          )}
          close={closeMeal}
          save={savePlate}
        />
      )}
      {cartOpen && (
        <Modal title="Your cart" close={() => setCartOpen(false)}>
          {cartContent}
        </Modal>
      )}
    </>
  );
}

function MealModal({
  now,
  meal,
  mealCatalog,
  addonCatalog,
  cart,
  date,
  windowName,
  initial,
  customCutoffs,
  close,
  save,
}: {
  now: number;
  meal: Meal;
  mealCatalog: Meal[];
  addonCatalog: AddOn[];
  cart: Plate[];
  date: string;
  windowName: WindowName;
  initial: Plate | null;
  customCutoffs?: string[];
  close: () => void;
  save: (plate: Plate) => void;
}) {
  const [step, setStep] = useState(0);
  const [protein, setProtein] = useState(initial?.protein ?? "none");
  const [extras, setExtras] = useState<Record<string, number>>(
    initial?.extras ?? {},
  );
  const [error, setError] = useState("");
  const draft = { mealId: meal.id, protein, extras };
  const proteinPrice = addonCatalog.find((a) => a.id === protein)?.price ?? 0;
  const total = plateTotal(draft, mealCatalog, addonCatalog);
  function available(id: string) {
    return Math.max(
      0,
      (addonCatalog.find((a) => a.id === id)?.stock ?? 0) -
        addOnUsed(cart, id) -
        (protein === id ? 1 : 0),
    );
  }
  function commit() {
    if (windowClosed(date, windowName, now, customCutoffs)) {
      setError(
        "Ordering has closed for this meal window. Choose tomorrow instead.",
      );
      return;
    }
    if (
      mealRemaining(cart, meal.id, date, mealCatalog) < 1 ||
      addonCatalog.some(
        (a) =>
          addOnUsed(cart, a.id) +
            (protein === a.id ? 1 : 0) +
            (extras[a.id] ?? 0) >
          a.stock,
      )
    ) {
      setError(
        "Some items are no longer available. Please update your selection.",
      );
      return;
    }
    save({
      ...draft,
      id: initial?.id ?? crypto.randomUUID(),
      date,
      window: windowName,
    });
  }
  return (
    <Modal title={`Customise ${meal.name}`} close={close} wide>
      <div className="modal-meal-heading">
        <span className="eyebrow">
          {formatDate(date)} · {windowName}
        </span>
        <h2>{meal.name}</h2>
        <p>Base meal · {money(meal.price)}</p>
      </div>
      <details className="allergens">
        <summary>Meal details & allergens</summary>
        <p>{meal.description}</p>
        <p>{meal.allergens}</p>
      </details>
      <div
        className="modal-tabs"
        role="tablist"
        aria-label="Customise your plate"
      >
        {["Choose protein", "Add extras"].map((label, i) => (
          <button
            key={label}
            role="tab"
            id={`step-${i}`}
            aria-selected={step === i}
            tabIndex={step === i ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - step;
                setStep(next);
                document.getElementById(`step-${next}`)?.focus();
              }
            }}
            aria-controls="customisation-panel"
            onClick={() => setStep(i)}
            className={step === i ? "selected" : ""}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <section
        id="customisation-panel"
        role="tabpanel"
        aria-labelledby={`step-${step}`}
      >
        {step === 0 ? (
          <>
            <h3>Choose your protein</h3>
            <p className="modal-intro">
              Select one, or enjoy your meal without protein.
            </p>
            <fieldset className="protein-options">
              <legend className="sr-only">Protein options</legend>
              {[
                { id: "none", name: "No protein", price: 0, stock: Infinity },
                ...addonCatalog.filter((a) => meal.proteins.includes(a.id)),
              ].map((item) => {
                const left =
                  item.stock -
                  addOnUsed(cart, item.id) -
                  (extras[item.id] ?? 0);
                return (
                  <label
                    key={item.id}
                    className={`${protein === item.id ? "chosen" : ""} ${left <= 0 ? "unavailable" : ""}`}
                  >
                    <input
                      type="radio"
                      name="protein"
                      value={item.id}
                      checked={protein === item.id}
                      disabled={left <= 0}
                      onChange={() => setProtein(item.id)}
                    />
                    <span>
                      {item.name}
                      {left <= 0 && <small>Sold out</small>}
                    </span>
                    <strong>+{money(item.price)}</strong>
                  </label>
                );
              })}
            </fieldset>
          </>
        ) : (
          <>
            <div className="selected-protein">
              <span>
                <Check size={17} />{" "}
                {addonCatalog.find((a) => a.id === protein)?.name ??
                  "No protein"}{" "}
                · {money(proteinPrice)}
              </span>
              <button onClick={() => setStep(0)}>Change</button>
            </div>
            <h3>Fancy a little extra?</h3>
            <p className="modal-intro">
              Optional additions, just how you like it.
            </p>
            <div className="extra-list">
              {addonCatalog
                .filter((a) => meal.extras.includes(a.id))
                .map((a) => {
                  const qty = extras[a.id] ?? 0;
                  const left = available(a.id);
                  return (
                    <div className="extra-row" key={a.id}>
                      <div className="extra-image" aria-hidden="true">
                        <span className="extra-image-fallback">
                          <BowlFood size={25} weight="light" />
                        </span>
                        {a.image && (
                          <Image
                            src={a.image}
                            alt=""
                            fill
                            sizes="58px"
                            unoptimized
                            onError={(event) => {
                              event.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        )}
                      </div>
                      <div className="extra-details">
                        <strong>
                          {a.category === "Protein"
                            ? `Extra ${a.name.toLowerCase()}`
                            : a.name}
                        </strong>
                        <p>
                          {money(a.price)} each ·{" "}
                          {left ? `${left} available` : "Sold out"}
                        </p>
                      </div>
                      <div className="stepper">
                        <button
                          aria-label={`Remove one ${a.name.toLowerCase()}`}
                          disabled={!qty}
                          onClick={() =>
                            setExtras({ ...extras, [a.id]: qty - 1 })
                          }
                        >
                          <Minus size={17} />
                        </button>
                        <output aria-label={`${a.name} quantity`}>{qty}</output>
                        <button
                          aria-label={`Add one ${a.name.toLowerCase()}`}
                          disabled={qty >= left}
                          onClick={() =>
                            setExtras({ ...extras, [a.id]: qty + 1 })
                          }
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </section>
      <div className="modal-summary">
        <div className="subtotal">
          <span>Meal + selected protein</span>
          <span>{money(meal.price + proteinPrice)}</span>
        </div>
        {total > meal.price + proteinPrice && (
          <div className="subtotal">
            <span>Extras</span>
            <span>{money(total - meal.price - proteinPrice)}</span>
          </div>
        )}
        <div className="subtotal modal-total">
          <strong>Total for 1 plate</strong>
          <strong>{money(total)}</strong>
        </div>
        <p className="fee-note">Delivery fee calculated at checkout.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {step === 1 && (
            <button className="secondary" onClick={() => setStep(0)}>
              <ArrowLeft size={17} /> Back
            </button>
          )}
          <button
            className="primary"
            onClick={() => (step === 0 ? setStep(1) : commit())}
          >
            {step === 0
              ? "Continue to extras"
              : `${initial ? "Save changes" : "Add to cart"} · ${money(total)}`}
            <ArrowRight size={19} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
