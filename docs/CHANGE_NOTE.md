# Hoodz change note

Dates: 16–17 November 2026

This file lists what changed in the backend, the dashboard, and the rider apps from `modifiation_list.md`. The customer app (`hoodz_user`) is not on this machine, so nothing was changed there.

The same rider changes are in both folders:

- `/Users/samim/Samim/v2/hoodzzz/Hoodz_Mobile_App`
- `/Users/samim/Samim/v2/hoodzzz/hoodz`

---

## 1. How an order works now

Orders are cash on delivery only. New card, wallet, and Paymob payments are off.

Each status has one owner:

| Status | Who sets it |
|---|---|
| Pending | System, when the order is placed |
| Accepted | Vendor |
| Preparing | Vendor. Rider search starts here |
| Out for delivery | Vendor. The order is ready |
| Collected | Rider. Picked up from the shop |
| On the way | Rider. Going to the customer |
| Delivered | Rider. Cash collected, job finished |
| Cancelled / Rejected | Vendor, agent, or admin |

Old orders can still use the old names: Confirmed = Accepted, Processing = Preparing, Picked up = Collected.

Delivery no longer needs an OTP. The 6-digit PIN is only for rider Start and Stop.

---

## 2. Backend

Project: `hoodz-backend`  
Commits: `ef676e7` (Hoodz issue fixes), `14096c5` (done all modify)  
Not committed yet: card refund disabled in `walletTransaction.services.ts`

### Payment

- The API rejects any payment method that is not cash.
- Paymob webhooks and the return page no longer mark an order paid.
- Customer wallet top-up is disabled. The `/saved-cards` and `/top-up` routes are off.
- A refund to a card now returns 410: "Refund to card is disabled." That last change is not committed yet. It was also the error that blocked the production build. `server/dist/server.js` builds successfully now.

### Orders and jobs

- New statuses: `accepted`, `preparing`, `out_for_delivery`, `collected`, `rejected`.
- The server rejects a status change that skips a step.
- A rider is offered the job only after the vendor sets Preparing. Not at Pending or Accepted.
- One nearby rider is offered the job at a time. If they do not take it, the next rider is offered it after about 30 seconds.
- If a vendor does not accept within 3 minutes, the order stays pending. Agents and admins are notified. The order is not auto-cancelled.
- Pickup is blocked until the order is `out_for_delivery`. Sending `vendorForgot: true` allows pickup, and that override is logged.
- Delivered requires `cashCollected: true`. Delivery GPS is stored.
- A change to a delivered order's status or amount is written to `orderAuditLog`.

### Rider rules

- Five wrong PINs lock the rider for 15 minutes. The message says how many attempts are left.
- `rider:go-offline` is rejected while a job is active.
- A rider with no heartbeat for 90 seconds is removed from the online list.
- New jobs stop when undeposited cash passes 2000 EGP.
- `PATCH /users/fcm-token` saves the push token.
- `GET /users/me` exists so the dashboard can check the session.
- Job-offer pushes are high priority.

### `.env`

Root `.env` was committed by mistake and then removed from the rewritten `done all modify` commit. The copy on your Mac is still there. GitHub can keep the old commit until it is overwritten on the remote and its cache expires, so rotate the keys that were in that file.

`*.claude-bak-20261116` files are backups of the old code. They are not part of the running app.

---

## 3. Dashboard

Project: `hoodz-app-admin-agent-vendor-dashbaord`  
Commits: `be79398` (modify), `b014182` (modify done)

- Vendor order buttons are Accept, then Preparing, then Out for delivery. Admin no longer sets the rider steps Collected, On the way, or Delivered.
- A new order plays a sound until it is accepted. There is a mute button and a browser notification.
- Order and job socket events refresh the lists without a manual reload.
- Agent Unassigned Orders has a Track button and a live rider map.
- The login token is checked. If the JWT secret is set, the signature is verified. Otherwise the dashboard calls `GET /users/me`.
- A vendor cannot open admin pages.
- Admin menu items Wallet Transactions and All Transaction were removed. Rider deposits and vendor payouts stay.
- English and Arabic labels match the new statuses.
- Images are limited to the DigitalOcean Space host. `unsafe-eval` is off in production. `audit.json` was deleted.
- The wallet transactions page shows a cash-only message.

---

## 4. Rider apps

Both apps are version `1.0.0+4`.

`hoodz` commits: `c8615ab`, `6f19ab7`  
`Hoodz_Mobile_App` commit: `83ccdb7` (this commit also includes the app icon, Firebase config, chat, wallet, and deposit screens)

Behavior changes:

- Start and Stop both ask for the 6-digit PIN.
- Forgot PIN asks for the account password and sets a new PIN.
- Navigate opens Google Maps. Before pickup it goes to the shop. After pickup it goes to the customer.
- Tapping Collected or On the way opens Maps.
- Delivered asks "I collected X EGP" first. The OTP screen is not shown.
- "Vendor forgot to mark ready" sends `vendorForgot: true`.
- Location keeps updating in the background while the rider is online. The app shows a disclosure before that permission. Android shows an ongoing notification.
- Push notifications are on. The token is sent at login and when going online. Tapping a push opens the job.
- If the socket drops, the app tries to go online again.
- The access token and user id are stored with `flutter_secure_storage`. An old SharedPreferences session is moved over on the next launch.
- The profile screen already had a privacy policy entry.
- New packages: `url_launcher`, `firebase_messaging`, `flutter_local_notifications`, `flutter_secure_storage`.

---

## 5. Not done in this code

- Customer checkout, Paymob screens, RTL, and delete account. That app folder is not on this machine.
- Play Console and App Store forms, screenshots, and the 12 testers. That is store work. The test script is `docs/WHOLE_APP_TESTER_GUIDE.md`.
- Google or Apple sign-in was not built. The rider app only has unused URL constants.
- Orders have no preparation-time field, so the rider app does not show a ready time.
- Next.js, jodit, and sharp were not force-upgraded.

---

## 6. Commit map

| Place | Commit | Name |
|---|---|---|
| Backend | `ef676e7` | modified: Hoodz issue fixes |
| Backend | `14096c5` | done all modify |
| Backend | not committed | card refund disabled |
| Dashboard | `be79398` | modify |
| Dashboard | `b014182` | modify done |
| Rider `hoodz` | `c8615ab` | modification |
| Rider `hoodz` | `6f19ab7` | solve rider |
| Rider `Hoodz_Mobile_App` | `83ccdb7` | modify |
