# Hoodz whole-app tester guide

Use this file on a real phone and a real browser. One person can play every role, but four people is better: customer, vendor, rider, and agent.

Write Pass or Fail next to each step. If it fails, fill the bug note at the bottom. Do not invent a workaround and mark it Pass.

## What you need

| Role | App | Where |
|---|---|---|
| Customer | Hoodz user app | Places a cash order |
| Vendor | Dashboard, vendor login | Accepts and prepares the order |
| Rider | The Hoodz Rider, version 1.0.0+4 | Picks up and delivers |
| Agent | Dashboard, agent login | Watches unassigned orders and the live map |
| Admin | Dashboard, admin login | Only for the checks marked Admin |

- Rider phone: Android or iPhone, GPS on, notifications allowed, Google Maps installed.
- Dashboard: Chrome, sound on, notifications allowed for the site.
- Use a shop that is open, and a rider account that is approved and close to that shop.
- Every order in this test is cash. There is no card, wallet, or Paymob step.
- Delivery does not use a customer OTP. The 6-digit code is only the rider Start/Stop PIN.

## Status you should see

| Step | Who sets it | Customer should understand | Rider should understand |
|---|---|---|---|
| Pending | System, when the order is placed | Waiting for the shop | No job yet |
| Accepted | Vendor | Shop accepted | No job yet |
| Preparing | Vendor | Shop is preparing. Rider is going to the shop | Go to the shop and wait |
| Out for delivery | Vendor | Ready to leave the shop | You can pick it up |
| Collected | Rider | Rider has the order | Navigate to the customer |
| On the way | Rider | Rider is coming | Navigate to the customer |
| Delivered | Rider | Done, cash paid | Job closed |
| Cancelled or Rejected | Vendor, agent, or admin | Order closed | Job closed |

Old names may still appear on old orders: Confirmed means Accepted, Processing means Preparing, Picked up means Collected.

---

## Test 1. One full order

Do this once with the rider app open, and once with the rider app locked after the rider is online.

### Customer

1. Sign in on the user app.
2. Add items from the test shop and open checkout.
3. Confirm the only payment choice is cash on delivery. Card, wallet, and any payment web page must not appear.
4. Place the order.
5. Open the order. Status is Pending.

Pass / Fail: ______

### Vendor

1. Stay on Dashboard, then Orders. Do not refresh.
2. Within a few seconds: a sound repeats, and a browser notification appears if the browser allowed it.
3. Mute the alert, then unmute it. The sound must stop and start again.
4. Accept the order. Status becomes Accepted. The sound stops.
5. Confirm no rider has the job yet. The rider phone must stay quiet.
6. Tap Preparing. Status becomes Preparing. This is the moment a rider should be offered the job.
7. Leave the page open. It should update by itself when the rider moves the order.

Pass / Fail: ______

### Rider, going to the shop

1. Open the rider app and tap Start.
2. Enter the 6-digit PIN. Wrong PIN must show how many tries are left.
3. After 5 wrong PINs, Submit stays blocked for about 15 minutes.
4. With the correct PIN, the rider goes online. Allow location when the app explains that location is shared only while online or on a delivery.
5. Android: a ongoing notification says Hoodz is online. iPhone: location can keep updating with the app in the background.
6. When the vendor taps Preparing, the nearest online rider gets one job offer. A push must arrive even if the app is locked. Tap the push. It opens that job.
7. A second nearby rider must not get the same offer at the same time. If the first rider ignores it, the next rider is offered it after about 30 seconds.
8. Accept the job. The screen says to go to the shop.
9. Tap Navigate. Google Maps opens driving directions to the shop, not the customer.
10. Collected stays blocked until the vendor marks Out for delivery.

Pass / Fail: ______

### Vendor marks it ready

1. On the vendor order, tap Out for delivery.
2. The rider screen updates without a manual refresh.
3. Rider taps the pickup button. Status becomes Collected.
4. Google Maps opens again, this time to the customer.
5. Switch to Google Maps and leave Hoodz in the background for one minute. The vendor or agent map must keep moving.

Pass / Fail: ______

### Rider delivers

1. Tap the next step so the status becomes On the way. Maps opens to the customer again.
2. Tap Navigate once more. It still goes to the customer, not back to the shop.
3. Tap Delivered. A dialog shows the cash amount, for example "I collected 120.00 EGP".
4. Cancel that dialog. The order must stay On the way.
5. Confirm the cash. Status becomes Delivered. No OTP field appears.
6. Customer order shows Delivered.
7. Vendor and agent screens update without a refresh.

Pass / Fail: ______

### Rider stops

1. After the job is Delivered, tap Stop.
2. The same PIN sheet appears. Stop does not happen before the PIN is accepted.
3. Enter the PIN. The rider goes offline. The Android "Hoodz is online" notification goes away.
4. This rider must not receive another job until Start is used again.

Pass / Fail: ______

---

## Test 2. Vendor forgot to mark ready

1. Place a new cash order. Vendor: Accept, then Preparing. Do not tap Out for delivery.
2. Rider accepts and arrives at the shop.
3. The normal pickup button must fail or stay blocked.
4. Tap "Vendor forgot to mark ready", then confirm pickup.
5. The order becomes Collected, and Maps opens to the customer.
6. The rest of the delivery works as in Test 1.

Pass / Fail: ______

---

## Test 3. Rider cannot disappear during a job

1. Rider has an accepted, collected, or on-the-way job.
2. Tap Stop and enter the correct PIN.
3. The app must stay online and explain that the job is still active.
4. Kill the app, turn the phone off and on, and open the app again.
5. The rider is still on that job, or the app asks for the PIN and returns online onto that job. The job must not be offered to someone else.

Pass / Fail: ______

---

## Test 4. Forgot PIN

1. On the Start or Stop sheet, tap Forgot PIN?
2. Enter the account password and a new 6-digit code.
3. The sheet closes back to the dashboard, not to a dead end.
4. Start works with the new PIN. The old PIN does not.

Pass / Fail: ______

---

## Test 5. Vendor does not answer

1. Place a cash order.
2. Vendor does nothing for 3 minutes. Leave the dashboard open.
3. The order stays Pending. It is not cancelled by itself.
4. The agent account gets a notice that the vendor has not accepted.
5. Agent opens Unassigned Orders, or the order list, and can see that order.

Pass / Fail: ______

---

## Test 6. Cash rules

1. Checkout never offers card, wallet, or an online payment page.
2. Rider delivery always shows the amount to collect before Delivered.
3. Deliver a few cash orders and do not deposit the cash.
4. When the rider's undeposited cash reaches 2000 EGP, that rider must not be offered a new job and must not be assignable by an agent.
5. Rider can still open the cash deposit screen and upload a Fawry receipt.
6. After an admin or agent approves the deposit, the rider can receive jobs again.

Pass / Fail: ______

---

## Test 7. Cancel and reject

1. Place an order and leave it Pending. Vendor or admin cancels or rejects it.
2. Customer sees the order closed. No rider is offered it.
3. Repeat after Preparing, while a rider is holding the offer or has accepted.
4. The rider loses the job, and Maps is no longer required for it.
5. A delivered order cannot be moved backward by the vendor.

Pass / Fail: ______

---

## Test 8. Agent and admin

1. Log in as agent. Open Unassigned Orders.
2. When matching finds nobody, the order appears here without a refresh.
3. Tap Track. A map shows the rider while the rider is on the job.
4. Manually assign an online rider who is under the cash limit. That rider gets the job.
5. Assigning a rider who is offline, or over 2000 EGP cash, must be refused.
6. Log in as vendor. Open an admin page such as Accounts Details or KYC Verification by changing the address bar. The page must not open.
7. Log in as admin. Order Details can move an order only through the vendor steps: Accept, Preparing, Out for delivery. Admin must not tap Collected, On the way, or Delivered for the rider.

Pass / Fail: ______

---

## Test 9. Rider account screens

1. Profile opens Privacy Policy and shows the policy text.
2. Arabic language turns the rider app layout to right-to-left. Switch back to English.
3. Chat with the customer from the job screen. A message arrives on the other side without a refresh.
4. Log out and log in again. The rider stays signed in only after a real login. Old session must not leak to the next account on the same phone.

Pass / Fail: ______

---

## Test 10. Dashboard language and alert

1. Vendor switches the dashboard to Arabic. Orders, Accept, Preparing, and Out for delivery are readable.
2. Place one more order. The sound still repeats until Accept.
3. Refresh the browser during Preparing. The order is still there and the buttons match the status.

Pass / Fail: ______

---

## Bug note

Copy this block once per failure.

```
Test number:
Step:
Role (customer / vendor / rider / agent / admin):
Phone or browser:
App version:
What you did:
What you expected:
What happened:
Order id:
Screenshot or screen recording:
```

## Sign-off

| Tester name | Date | Phone | Tests run | Result |
|---|---|---|---|---|
| | | | 1 to 10 | Pass / Fail |

Do not mark the build ready if Test 1, Test 3, or Test 6 fails.
