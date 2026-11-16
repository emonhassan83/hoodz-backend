# Hoodz Platform: Issues and Fixes

Scope: User app, Rider app, Admin/Vendor/Agent dashboard, shared backend (`api.thehoodz.net`) and socket (`socket.thehoodz.net`).
Method: code review of the three clients. The backend source was not available, so backend points are marked "verify".
No credentials are included in this document.

Priority: P1 = security or lost orders, P2 = broken or inconsistent behavior, P3 = polish and cleanup.

---

## How the system connects

- Customer places an order in the User app. Payment is cash on delivery only.
- Vendor confirms and prepares the order in the Dashboard.
- Agent/admin finds an online rider (`rider:find-online`) and assigns the job (`job:assign`) from Unassigned Orders. The backend also pushes `job:new-request` to riders.
- Rider accepts, picks up and delivers. Rider sends GPS (`rider:location-update`); backend relays it to the customer (`order:location`).
- Delivery completes with an OTP: `job:send-delivery-otp`, then `job:verify-delivery-otp`, then `job:delivered`.
- Chat between apps and dashboard uses the same `chat:*` socket events.

---

## A. Rider app

### A1 (P1). No push notifications for new jobs
- Problem: `firebase_messaging` is commented out; the manifest has no notification permission. A rider only gets `job:new-request` while the app is open and the socket is connected. A locked screen means a missed job.
- Fix: enable `firebase_messaging`; request POST_NOTIFICATIONS on Android 13+; register the FCM token with the backend at login and go-online; backend sends a high-priority push on new job request and on assignment; handle tap to open the job.

### A2 (P1). Location tracking is foreground-only
- Problem: when the rider switches app or locks the screen, tracking stops and the customer's live map freezes.
- Fix: Android foreground service (type `location`) with a persistent "On delivery" notification; add `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION`; iOS "Always" location with background mode `location`; show the in-app prominent disclosure Google Play requires before requesting background location; keep emitting `rider:location-update` from the service while online or on a job.

### A3 (P1). No Google Maps navigation
- Problem: the job model has pickup and drop coordinates and addresses, but the app has no `url_launcher` and never opens Google Maps.
- Fix: add `url_launcher`; add a "Navigate" button on the active job. Before pickup it goes to the brand (pickup); after pickup it goes to the client (drop-off). Open Google Maps in driving mode with the coordinates; fall back to the address text, then to the browser link if Maps is not installed. Add the Android `<queries>` entry and iOS `LSApplicationQueries` (`comgooglemaps`). Offer to start navigation to the client automatically when the rider taps "Picked up".
- Dependency: A3 must ship with A2, because opening Google Maps puts the Hoodz app in the background.

### A4 (P1). A rider can stop in the middle of a delivery
- Problem: tapping Stop calls `goOffline()` directly, with no active-job check.
- Fix: block Stop while any job is accepted, picked up or on the way; show the reason. Backend must reject `rider:go-offline` while a job is active (verify).

### A5 (P1). Stop is not protected by the PIN
- Problem: Start requires the 6-digit security code (`POST /users/security-code/verify`), but Stop does not.
- Fix: show the same PIN sheet before `goOffline`; verify with the same endpoint; then go offline.

### A6 (P2). Online state can go stale
- Problem: if the app is killed or the connection drops, the app and server can disagree on whether the rider is online.
- Fix: on app start and socket reconnect, read the rider's online status from the server and sync the UI; backend heartbeat so a rider with no ping for N seconds is marked offline and excluded from `rider:find-online`; the foreground service (A2) keeps the heartbeat alive.

### A7 (P2). No lockout on wrong PINs
- Problem: nothing in the app limits attempts; a 6-digit code can be brute-forced if the server does not limit it.
- Fix: server-side limit (for example 5 attempts, then a 15-minute lock) returning a clear message (verify); the app shows remaining attempts and the cool-down timer and disables Submit while locked.

### A8 (P2). No forgot-PIN flow on the activation sheet
- Problem: a rider who forgets the code has no recovery path from the sheet.
- Fix: add "Forgot PIN?" that verifies identity (account password or email/SMS OTP) and then lets the rider set a new code.

### A9 (P3). Tokens stored in plain SharedPreferences
- Fix: move access and refresh tokens to `flutter_secure_storage`.

### A10 (P3). Cleanup
- Align version numbers (user `1.0.0+4`, rider `1.0.0+2`) and remove leftover debug `print` calls (for example `[Start]` logs).

---

## B. User app

### B2 (P1). Google Maps key exposed and Directions called from the phone
- Problem: the same key is in the Android manifest, iOS `AppDelegate.swift` and Dart code; the Directions API is called directly from the app.
- Fix: restrict the key by app package and SHA-1 (Android) and bundle ID (iOS), and to the needed APIs only; separate keys per platform; move Directions calls to the backend. Rotate the key if it was ever public.

### B3 (P1). No in-app account deletion
- Problem: required by Google Play and Apple. The rider app already has it; the user app does not.
- Fix: add a "Delete account" screen with confirmation (password or OTP) calling a backend delete endpoint. Backend should anonymize or delete personal data and keep order records as the law requires.

### B4 (P1). Arabic and RTL are not working properly
- Problem: an `ar` locale exists, but the app has no `flutter_localizations` delegates and no Directionality, so Arabic layout and date/number formatting are wrong.
- Fix: add `flutter_localizations` to `pubspec.yaml`; add `localizationsDelegates`, `supportedLocales`; set Directionality from the locale; test every screen mirrored.

### B5 (P2). Tokens stored in SharedPreferences
- Fix: `flutter_secure_storage`.

### B6 (P2). Release signing and repo hygiene
- Problem: release build falls back to debug signing config; a 96 MB `app-profile.apk` is committed; leftover files from another app (prayer countdown, audio player, push notification service).
- Fix: sign release only with the release keystore and fail the build otherwise; delete the APK and add it to `.gitignore`; remove unused files and packages.

### B7 (P2). Cancelled and returned order visibility
- Problem: with cash only there are no gateway refunds, but the customer has no in-app status for a cancelled or returned order.
- Fix: show the final status and any adjustment on the order details screen.

### B8 (P3). Unfinished feature areas
- Problem: points/loyalty and feed/follow appear in routes and translations.
- Fix: confirm every screen is reachable and finished, or hide it before the Apple review (placeholders get rejected).

---

## C. Dashboard (admin, vendor, agent)

### C1 (P1). Role routing is client-side only
- Problem: `middleware.js` decodes the JWT without verifying its signature, so it only hides pages.
- Fix: the backend must enforce role permissions on every endpoint (verify by logging in as a vendor and calling admin endpoints directly). In the dashboard, verify the JWT signature in middleware or fetch the session from the backend.

### C2 (P2). No live rider or job updates
- Problem: the dashboard listens only to `order:updated` and chat events. Agents cannot see rider location, job accepted, rejected or matching-exhausted without a refresh.
- Fix: listen to `job:updated`, `job:accepted`, `job:rejected`, `job:matching-exhausted`, `job:picked-up`, `job:delivered`, and add a live rider map for agents.

### C3 (P2). No alert for new orders
- Problem: no sound or browser notification, which vendors need.
- Fix: audio plus browser Notification on a new order event, with a mute toggle.

### C4 (P2). Weak security headers
- Problem: CSP allows `unsafe-inline` and `unsafe-eval`; images accept any hostname (`**`); `allowedDevOrigins: ["10.10.10.27"]` remains in config.
- Fix: use nonces or hashes for scripts, restrict `remotePatterns` to the real image hosts, and remove the dev origin from production config.

### C5 (P3). Stale audit file and dependencies
- Fix: delete or regenerate `audit.json`; run `npm audit`, then update Next.js, jodit and sharp to patched versions.

---

## D. Backend and cross-app consistency (verify with backend developer)

### D1 (P2). Order status strings differ between apps
- Problem: `cancelled` and `canceled`; `picked_up` and `picked up`; `on_the_way` and `on the way`; the dashboard also uses `prepared`, `failed` and `assigned`.
- Fix: one shared status list (a single enum document), the backend sends only those values, and each app maps them with a fallback for unknown values.

### D2 (P2). Inconsistent endpoint names
- Examples: `/withdraw` and `/withdraws`; `/faq` and `/faqs`; `/user/me` and `/users/me`; `/message` and `/messages`; `campain`, `tramsAndCondition`, `transctions`.
- Fix: do not rename in one place only. Add correctly named aliases on the backend, move all three clients to them, then retire the old paths with a deprecation period.

### D3 (P1). Server-side checks for rider and job rules
- Verify and enforce on the server: PIN attempt limit (A7), no go-offline during an active job (A4), only the assigned rider can change a job's status, delivery OTP verified before `job:delivered`, rider heartbeat timeout (A6).

### D4 (P2). Payment flow ownership
- The backend owns payment state. With cash only, an order is paid when the rider marks Delivered with the collected amount; deposits (rider cash remittance) are recorded and approved server-side; the apps only display status.

---

## E. Store and release checklist

- Privacy policy URL live and linked in both apps and in the Play and App Store listings.
- Data safety form (Play) and App Privacy details (Apple) match what the apps actually collect, including background location for riders.
- Sign in with Apple if Google login is offered on iOS.
- Play background-location declaration and prominent disclosure for the rider app.
- 1024x1024 app icon; screenshots per device size.
- Closed testing with 12 testers for 14 days if the Play account is a new personal account.
- Vodafone SMS OTP finished and tested before relying on SMS flows.

---

## Suggested order of work

1. Security: B2, C1, D3.
2. Rider reliability: A1, A2, A3, A4, A5, A6.
3. Store requirements: B3, B4, section E.
4. Rider PIN hardening: A7, A8.
5. Dashboard live features: C2, C3.
6. Consistency and cleanup: D1, D2, A9, A10, B5, B6, B7, B8, C4, C5.

## Test checklist (real devices)

- Rider: go online with PIN; receive a job with the app locked; navigate to the brand, then the client; confirm the customer map keeps moving while Google Maps is open; try to stop mid-delivery (must be blocked); stop with PIN after delivery; wrong PIN five times (must lock).
- User: place a cash order (no online option must appear anywhere); Arabic mode on every screen; delete account.
- Dashboard: log in as vendor and try admin URLs and admin API calls (must be denied); new-order alert; assign a rider and watch job events live.

---

## F. Intended order flow vs. what the code does

Intended flow (from the owner):
1. Customer places the order. The vendor gets a notification with the order on the dashboard.
2. Vendor marks it Accepted, then Preparing.
3. Riders in the area get the job one by one from a queue. The rider is assigned automatically, only after the vendor has accepted and the order is in the Preparing stage.
4. The assigned rider heads to the brand while it prepares the order, picks it up, and marks Collected, then On the way. The brand marks Out for delivery / Ready for delivery.
5. The rider navigates to the client with Google Maps, delivers with NO OTP, collects the cash, and marks Delivered.

### F1 (P1). Delivery OTP is still required in the code
- Problem: the rider app sends and verifies a delivery OTP (`job:send-delivery-otp`, `job:verify-delivery-otp`) before it can call `job:delivered` (see `delivery_details_controller.dart`). The user app also listens for `job:otp-sent` and `job:otp-verified`. This contradicts the no-OTP delivery rule, and riders will be blocked at the door.
- Fix: remove the OTP step from the rider delivery screen so "Delivered" calls `job:delivered` directly; remove the OTP listeners and UI in the user app; backend must stop requiring a verified OTP for `job:delivered` (verify). Keep the rider's 6-digit security code for Start/Stop only; it is a different feature.
- Replacement control: since OTP is gone, require proof for cash orders (see F3), and keep a delivery timestamp and rider GPS at the moment of "Delivered" so disputes can be checked. Optionally add a photo at the door.

### F2 (P1). Dispatch must only start after vendor accepts and order is Preparing
- Problem: the rider job queue (`job:new-request`, `job:matching-exhausted`) is server-side. The clients cannot enforce the trigger.
- Fix (backend, verify): create the dispatch job only on the transition to Preparing (not on order creation or Accepted); offer the job to one rider at a time with a timeout (for example 30 seconds), then the next nearest; emit `job:matching-exhausted` when none accept; on exhaustion alert the agent and show the order in Unassigned Orders (the existing manual `rider:find-online` and `job:assign` page). If the vendor cancels or rejects, cancel the open job and send `job:request-cancelled` to the rider holding it.

### F3 (P1). Cash handling
- The rider model already has a cash-on-delivery payment method and the rider wallet shows "Collected" money and cash deposits via Fawry. Confirm these rules:
  - COD orders: Delivered must only be allowed after the rider confirms the amount collected (show the amount to collect on the delivery screen). 
  - The backend adds the collected amount to the rider's cash-in-hand, blocks new jobs when it passes a limit until the rider deposits it, and records the deposit with the receipt for admin approval.
  - Vendor payout and rider commission are calculated from the Delivered status, so a wrong Delivered tap changes money. Add an admin-only reversal with an audit log.

### F4 (P2). Two people change status: brand and rider
- Problem: the vendor marks "Out for delivery / Ready for delivery" while the rider marks "Collected" and "On the way". These can disagree or arrive in the wrong order. "Out for delivery" does not appear as a status name in the vendor dashboard code; the dashboard has `prepared`, `picked_up`, `on_the_way`.
- Fix: one state machine on the backend with allowed transitions and one owner per transition: Vendor: Accepted, Preparing, Ready. Rider: Collected (only after Ready, or allow with a warning if the vendor forgot), On the way, Delivered. Customer sees one friendly label per state. Reject out-of-order requests and tell the client why. Align the names with D1.

### F5 (P2). Rider waits for the brand
- Problem: the rider arrives while the order is still being prepared.
- Fix: show the rider the vendor's estimated prep time and the Ready status live; start the rider's job early enough that arrival is close to ready time; notify the rider when the vendor taps Ready; track the waiting time at the brand for payment disputes.

### F6 (P2). Navigation per stage
- This is A3: before Collected, Navigate points to the brand; after Collected, it points to the client. It should open automatically when the rider taps Collected / On the way.

### F7 (P2). Vendor needs a reliable new-order alert
- This is C3. Vendors accept from the dashboard, so a missed alert means a late order. Add a repeating sound until the order is accepted, plus an auto-reject or escalate-to-agent timer if the vendor does not respond within a set time (for example 3 minutes).

---

## G. Owner decisions (these override earlier items where they conflict)

### G1. Cash on delivery only, no online payments for now
Decision: every order is paid in cash to the rider at delivery. No Paymob, no card, no wallet payment, no customer top-up.

User app:
- Remove or hide every online payment option at checkout. The only method is "Cash on delivery".
- Remove or hide the Paymob webview (`payment_webview_screen.dart`), card payment widgets (`play_with_card.dart`), customer wallet and top-up screens, and the payment-details screens that depend on them. Hide rather than delete the code if online payment may return later, and turn it off with one server-side setting.
- No payment is decided on the phone anymore, so nothing in the user app can mark an order as paid.
- Remove payment-related permissions or SDKs that are no longer used. The Play Data safety form and the App Store privacy answers become simpler: no card or payment data collected. Update them to match.

Rider app:
- Every job is cash. The delivery screen shows the amount to collect and requires the rider to confirm "I collected X EGP" before Delivered.
- Keep the rider wallet's "Collected" total and the cash deposit flow (Fawry deposit with receipt upload): this is how the rider hands the cash to the company. Confirm with the owner that this stays.

Dashboard and backend:
- Disable online payment creation on the API (reject any non-cash payment method), so an old app version cannot create an online order.
- Hide or disable the dashboard pages that only serve online payments (customer top-ups, `/payments` gateway records, `/refunds` for card refunds). Keep deposits for rider cash remittance and vendor payouts.
- Refunds: with cash there is no gateway refund. Define the rule for a cancelled or returned order (for example the rider returns the goods and no cash is taken). Record it as an order adjustment.
- Cash risk controls (backend, verify): a cash-in-hand limit per rider that blocks new jobs until a deposit is approved; a daily reconciliation report per rider (cash collected vs cash deposited); an audit log for any change to a delivered order's amount.
- Cash-only increases no-show and fake-order risk. Suggested controls: phone verification before the first order, a limit on cash order value for new customers, and a block list for customers with repeated failed deliveries.

### G2. Order statuses: "Preparing" is set by the vendor and explains where the rider is
Status sequence (one owner per step):

| Step | Status | Set by | What it means for the others |
|---|---|---|---|
| 1 | Pending | System | Customer placed the order; the vendor is notified on the dashboard |
| 2 | Accepted | Vendor | Vendor will make the order |
| 3 | Preparing | Vendor | The brand is preparing. This triggers dispatch. The rider is assigned automatically, goes to the brand location and waits there while the brand finishes |
| 4 | Out for delivery (ready) | Vendor | Order is ready and handed over; the rider can leave |
| 5 | Collected | Rider | Rider has picked the order up from the brand |
| 6 | On the way | Rider | Rider is navigating to the client with Google Maps |
| 7 | Delivered | Rider | Cash collected, order complete |
| - | Cancelled / Rejected | Vendor, agent or admin | Closes the order and any open rider job |

Requirements:
- The customer app shows friendly text for each status. For Preparing: "The brand is preparing your order. Your rider is on the way to the brand."
- The rider app shows, for Preparing: "Go to the brand and wait for the order." Show the brand's address with a Navigate button (A3) and the vendor's estimated prep time. The rider's Collected button stays disabled until the vendor marks Out for delivery, or the rider uses a "Vendor forgot to mark" override that is logged.
- Dispatch starts only when the vendor sets Preparing (F2), never at Pending or Accepted.
- The backend enforces the order of the steps and rejects out-of-order changes. Use one list of status names in all three apps (D1).

### Updated order of work
1. Cash-only change in all three apps and the backend (G1, G3).
2. Remove delivery OTP (F1).
3. Status state machine and dispatch trigger (G2, F2, F4).
4. Rider reliability: A1 to A6.
5. Store requirements and security: B2, B3, B4, C1, D3, section E.
6. Dashboard live features and cleanup: C2, C3, then the P3 items.

### G3. Remove Paymob completely (checklist for the developers)

Paymob is only used in the two Flutter apps and the backend. The dashboard code has no Paymob references.

User app (`hoodz_user`):
- `lib/features/user/orders/presentation/pages/check_out_screen.dart`: remove the payment method choices `card` and `wallet` (around lines 207 and 355 to 361) and the branch that opens the Paymob payment screen; send `paymentMethod: 'cod'` (use the exact value the backend expects for cash).
- `lib/features/user/payment/presentation/pages/payment_webview_screen.dart` and `lib/core/services/others/payment_webview_service.dart`: delete.
- `lib/features/user/payment/presentation/pages/wallet_buttomsheet.dart` and `lib/features/user/payment/data/models/wallet_transaction_model.dart`: delete the customer top-up flow (or hide it behind a disabled flag).
- `lib/features/user/orders/presentation/widgets/play_with_card.dart` and `payment_method_screen.dart` (route `/payment-method` in `app_routes.dart` and `app_pages.dart`): remove, or reduce the screen to a read-only "Cash on delivery" line.
- `lib/features/user/orders/presentation/controllers/order_details_controller.dart`: the payment label logic for wallet and card should always show "Cash on delivery".
- Translations (`en_us_translation.dart`, `ar_ar_translation.dart`, `english_arabic_translations.json`, `strings_enum.dart`): remove unused Paymob, card and wallet strings.
- `pubspec.yaml`: remove `webview_flutter` if nothing else uses it, then run `flutter pub get` and `flutter analyze` to catch leftovers.

Rider app (`hoodz`):
- `lib/features/rider/payment/presentation/pages/wallet_buttomsheet.dart` and the Paymob entries in `assets/translations/en.json` and `ar.json`: remove any Paymob or card top-up option from the rider wallet. The rider's cash deposit through a Fawry kiosk (with receipt upload) is not Paymob and stays, unless the owner says otherwise.

Backend and accounts:
- Disable the Paymob integration: remove the checkout, callback and webhook routes, and reject any order whose payment method is not cash.
- Remove the Paymob keys from the server environment and from the deployment info document. Treat the existing keys as exposed because they were shared in a document: revoke or rotate them in the Paymob dashboard, then delete the merchant integration if it will not be used.
- Stop the Paymob webhook URL in the Paymob dashboard so no stale callback can mark an order paid.
- Data migration: orders already paid online keep their stored payment records. Make sure the order screens still display those correctly (read-only) for history, and that refunds for them are handled manually by the owner.

Release notes:
- Update the Play Data safety form and the App Store privacy answers: no payment information collected.
- Ship the new app versions before the backend stops accepting online orders, or keep a force-update check, so older installs do not hit a broken checkout.
