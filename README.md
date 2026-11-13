# PreChop

Meal preorder web app for ABU and Sabon Gari, Zaria.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Requires Node.js 22.18 or newer for the test command.

## Current implementation

- Spacious responsive menu with orange accents, serif headings and food photography.
- Seven delivery dates and Breakfast, Lunch, Dinner selection.
- Two-step customisation: individually priced protein or no protein, then optional extras with quantities.
- Separate plate configurations, editing, removal and browser-local cart persistence.
- Cart grouped by date and meal window, with a review dialog and linked checkout page.
- Checkout preview with configurable sample batches, cutoff checks, separate delivery addresses, area fees and sample wallet credit.
- Keyboard-accessible native dialogs, radio choices and tab controls.

The customer menu loads meals, prices, options and date-specific portion counts from Supabase when configured. Phone sign-in uses Supabase Auth OTP; customer profiles and saved addresses use Supabase with row-level security. The TextBee send-SMS hook is in `supabase/functions/send-sms-hook` and requires deployment and Auth Hook configuration before real SMS can be sent. Checkout, payment, orders, wallet, refunds and saved-address checkout submission are still previews; they do not create transactions or reserve stock.

Payments, authentication, real wallet balances, actual orders and admin pages are not connected. Checkout addresses are held only in page memory and are not submitted or persisted. The relevant navigation dialogs state this explicitly. No payment or order is submitted.

## Validation

```sh
npm run lint
npm test
npm run test:browser
npm run build
```

Browser tests use installed Microsoft Edge and start an isolated production server on port 3102. Run npm run build before npm run test:browser. Screenshots are saved to the ignored `test-results` folder.

## Main files

- `src/components/menu-app.tsx`: menu, customisation dialogs and cart.
- `src/lib/menu.ts`: sample menu, pricing, stock and cart validation.
- `src/app/globals.css`: responsive visual styling.
- `public/images`: generated food photography.

## Supabase customer menu setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings. The publishable key is protected by row-level security; never put a service-role key in a `NEXT_PUBLIC_` variable.
3. Run the migrations in `supabase/migrations/` sequentially in the Supabase SQL Editor:
   - `202609300001_customer_core.sql`
   - `202609300002_customer_address_defaults.sql`
   - `202610010001_customer_orders_paystack.sql`
   - `202610050001_kitchen_and_deliveries.sql`
   - `202610060001_admin_dashboard_rpcs.sql`
   - `202610060002_order_detail_view.sql`
   - `202610060003_abandoned_payments.sql`
   - `202610060004_fix_admin_dashboard_aggregates.sql`
   - `202610060005_fix_today_deliveries_filter.sql`
   - `202610060006_admin_operations_and_fixes.sql` (Order status sync, Admin refund & delivery resolution, Multi-batch meal association)
   - `202610060007_full_control_app_settings.sql` (Full-control store operations, emergency kitchen pause, custom contacts, free delivery threshold, and ordering constraints)
   - `202610060008_audit_logs_and_site_analytics.sql` (Comprehensive admin audit trail and privacy-first daily visitor & order analytics)
   - `202610060009_campaign_active_enforcement.sql` (Strict campaign active state enforcement for referral attribution and reward generation)
4. Enable phone sign-in in Supabase Auth. To deliver OTP through TextBee, deploy `supabase/functions/send-sms-hook` with the Supabase CLI. Set `TEXTBEE_API_KEY` and `SEND_SMS_HOOK_SECRET` as Edge Function secrets. In **Authentication → Hooks**, configure **Send SMS** as an HTTP hook pointing to `https://<project-ref>.supabase.co/functions/v1/send-sms-hook` with the matching signing secret. The function verifies Supabase's signed webhook before forwarding the OTP to TextBee. Keep both values out of browser-visible environment variables.
5. Transactional customer updates (order confirmation, kitchen preparation sticker codes, dispatch, cancellations) use `src/lib/notifications.ts` via TextBee SMS and direct WhatsApp links.
6. Restart `npm run dev` and test with a phone you control. Supabase's Send SMS hook replaces its built-in SMS sender, and TextBee needs an online Android device attached to deliver messages.

The migrations seed starter meals, options, delivery areas, breakfast batches and a 14-day menu. Checkout can select a different saved address for each delivery. Checkout payment, actual orders, stock reservation, order tracking and wallet actions seamlessly connect to Supabase and Paystack when credentials are provided, or operate in high-fidelity preview mode when offline.

## Next implementation

Next, build trusted order creation, stock reservation and payment verification. Then connect order changes, cancellations, delivery tracking and wallet credits to the customer pages. Add admin tools for meal, stock, batch and order management. Deploy the Next.js app to Cloudflare Workers after server functionality is in place.

## Sign-in design preview
Checkout opens a phone, verification-code and name dialog. Use code 123456 to try the flow. Resend cooldown, code expiry and input errors are demonstrated locally. No SMS is sent, no account is created, and no authenticated session is established. Closing or completing the dialog preserves checkout details in memory. Refreshing the page clears those delivery and profile details. Body text is now 16px, with most supporting copy at 14–15px.

## Payment design preview
After the sign-in preview, choose Pay on checkout. Payment starts directly and displays processing and confirmation on the page, without a review modal. Payments are simulated. Confirmation includes a basic delivery-status preview; no sticker codes are allocated. No Paystack request, wallet mutation, order creation or inventory reservation occurs. The cart remains available. The simulator rechecks delivery cutoffs before each attempt.

## Orders and tracking design preview
Open /orders or choose Orders from the menu. The page uses clearly labelled sample deliveries independent of checkout. Upcoming, Delivered and Cancelled filters, delivery progress, illustrative plate codes, same-area address editing and cancellation dialogs are available. Only confirmed deliveries before cutoff can be edited or cancelled. Sample codes 1001–1004 illustrate the sticker display; they are not allocated inventory or production IDs. Changes are in memory and reset on refresh. Wallet refunds and payment confirmations are illustrative. WhatsApp support awaits the actual business number.

## Wallet design preview
Open /wallet or choose Wallet from the menu. A standalone sample ledger totals NGN 1,500 and shows refunds, credit used, transaction details and balances after each entry. Filters and an empty-wallet preview are available. Wallet credit never expires and cannot be withdrawn; it can cover meals, extras and delivery. The sample ledger is independent of checkout and cancellation previews, and no real balances or refunds are changed.

## Account and saved addresses design preview
Open /account or choose Account in the menu. The sample profile supports name editing and a simulated phone-change verification using code 123456. Add, edit, delete and set a default delivery address. Deleting the default chooses the next saved address; the first newly added address becomes default when the list is empty. Changes remain in page memory and reset on refresh. They are not connected to authentication, checkout or existing orders. No SMS is sent.

## Menu refinements
The navbar remains visible while scrolling, and returning to Menu starts at the top. A compact mobile hero prioritises the weekly menu. Menu and checkout share sample batch cutoffs in Africa/Lagos time. Once all batches in a meal window close, the menu shows an illustrated notice and a button selecting tomorrow for the same meal window.
