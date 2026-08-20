# ডেলিভারি সকেট ধাপ (রাইডার ও গ্রাহক)

এই নথি ব্যাখ্যা করে কীভাবে একটি অর্ডার ডেলিভারি শুরু থেকে শেষ পর্যন্ত সকেটে চলে। প্রতিটি ধাপে কে কী পাঠাবে, সার্ভার কী নামে উত্তর দেবে, এবং অ্যাপ কোন ঘটনা শুনবে—তা আলাদা করে লেখা আছে।

সকেট সংযোগের সময় `Authorization` দিয়ে লগইন করতে হবে। সংযোগ হলে সার্ভার ব্যবহারকারীকে তার নিজের কক্ষে (`userId`) বসায়। তাই নিচের ঘটনাগুলো শুনতে অতিরিক্ত কক্ষে যোগ দিতে হয় না, শুধু **অর্ডার ট্র্যাক** করার সময় `track_order` পাঠাতে হয়।

প্রতিটি পাঠানো ঘটনার উত্তর **ack** (কলব্যাক) দিয়ে আসে। যে কাজ নিজে পাঠান, তার ফল ack থেকে নিন — সেগুলো আবার `job:updated` / `order:updated` দিয়ে শোনার দরকার নেই।

```json
{
  "success": true,
  "status": 200,
  "message": "...",
  "data": {}
}
```

---

## পুরো পথ একনজরে

```txt
দোকান অর্ডার প্রস্তুত করে
        ↓
সার্ভার কাছের রাইডারদের অফার পাঠায়
        ↓
রাইডার গ্রহণ / প্রত্যাখ্যান / অথবা এজেন্ট নিজে নিয়োগ
        ↓
গ্রাহক ট্র্যাক পাতায় ঢোকে
        ↓
রাইডার পণ্য তোলে → পথে যায়
        ↓
গ্রাহকের ফোনে ওটিপি → রাইডার যাচাই করে
        ↓
ডেলিভারি সম্পন্ন → গ্রাহক রেটিং দেয়
```

---

## গ্রাহক কী করবে ও কী শুনবে

### সংযোগের পর একবার শুনুন

| শোনার নাম | কখন আসে | কী কাজে লাগে |
| :--- | :--- | :--- |
| `job:rider-assigned` | রাইডার নির্ধারিত হলে | রাইডারের নাম, ছবি দেখান |
| `job:picked-up` | রাইডার দোকান থেকে তুলেছে | «তুলে নিয়েছে» দেখান |
| `job:on-the-way` | রাইডার গ্রাহকের দিকে যাচ্ছে | «পথে আছে» দেখান |
| `job:delivered` | ডেলিভারি শেষ | সফল পর্দা |
| `ride:request-rating` | ডেলিভারির পর | রেটিং পাতা খুলুন |
| `job:otp-sent` | ওটিপি পাঠানো হয়েছে | ওটিপি অপেক্ষা |
| `job:otp-verified` | ওটিপি মিললে | ডেলিভারির আগে |

### ট্র্যাক পাতায় ঢুকলে

**পাঠান:** `track_order`

```json
{ "orderId": "অর্ডারের আইডি" }
```

Ack-এ `room`, `listen: "order:location"` এবং শেষ জানা অবস্থান আসতে পারে।

**শুনুন:** `order:location`

```json
{
  "lat": 23.791,
  "lng": 90.415,
  "speed": 35,
  "heading": 120,
  "encodedRoute": "ম্যাপের লাইন"
}
```

এই তথ্য শুধু সেই অর্ডারের কক্ষে যায় (`room_order_<অর্ডারআইডি>`), অন্য গ্রাহক পায় না।

### রেটিং দেওয়ার সময়

**পাঠান:** `ride:submit-rating`

```json
{
  "jobId": "জব আইডি",
  "rating": 5,
  "review": "ভালো সেবা",
  "files": []
}
```

শুধু সেই অর্ডারের গ্রাহকই দিতে পারেন, এবং জব `delivered` হওয়ার পর। একবারই দেওয়া যায়।

---

## রাইডার কী করবে ও কী শুনবে

### সংযোগের পর একবার শুনুন

| শোনার নাম | কখন আসে | কী কাজে লাগে |
| :--- | :--- | :--- |
| `job:new-request` | কাছাকাছি নতুন অফার | গ্রহণ/প্রত্যাখ্যান পাতা |
| `job:request-cancelled` | অফার আর নেই | অফার সরিয়ে ফেলুন |
| `job:accepted` | অন্য কেউ নিয়ে নিলে | নিজের অফার বন্ধ |
| `job:assigned` | এজেন্ট/দোকান সরাসরি নিয়োগ | নতুন জব খুলুন |
| `ride:rating-submitted` | গ্রাহক রেটিং দিলে | নতুন গড় রেটিং দেখান |

---

## ধাপ ১ — রাইডার অনলাইন

**কে পাঠাবে:** রাইডার  
**পাঠানোর নাম:** `rider:go-online`

শর্ত: অ্যাকাউন্ট সক্রিয়, কেওয়াইসি অনুমোদিত, নিরাপত্তা কোড দিয়ে রাইডার মোড চালু।

```json
{
  "lat": 23.791,
  "lng": 90.415,
  "heading": 90
}
```

`latitude` / `longitude` দিলেও চলবে।

**সার্ভার কী করে:** এই স্থান `lastAvailable`-এ সংরক্ষণ করে, রাইডারকে অনলাইন করে। ফল **ack**-এ আসে।

---

## ধাপ ২ — দোকান অর্ডার প্রস্তুত করে (এই ধাপ সকেট নয়)

দোকান এপিআই দিয়ে অর্ডার `processing` করে। তখন সার্ভার জব তৈরি করে, অবস্থা `matching`, এবং কাছের রাইডারদের অফার পাঠায়।

**রাইডার শুনুন:** `job:new-request` (পুরো জব অবজেক্ট)

এখানে জবের অবস্থা `matching`, `requestedRider`-এ সেই রাইডার থাকবে।

সময় শেষ হলে বা নতুন রাউন্ডে বাদ পড়লে **শুনুন:** `job:request-cancelled`

কেউ না নিলে এজেন্ট **শুনুন:** `job:matching-exhausted`

---

## ধাপ ৩ক — রাইডার অফার গ্রহণ

**পাঠানোর নাম:** `job:accept`

```json
{ "jobId": "জব আইডি" }
```

**সার্ভার কী করে:**
- জবের অবস্থা `accepted`
- অর্ডারের অবস্থা `rider_assigned`
- রাইডার সেট হয়, `requestedRider` খালি হয়

**গ্রাহক শুনুন:** `job:rider-assigned`  
**অন্য অফার পাওয়া রাইডার শুনুন:** `job:accepted`, `job:request-cancelled`  
গ্রহণকারী রাইডারের ফল **ack**-এ।

---

## ধাপ ৩খ — রাইডার অফার ফিরিয়ে দেয়

**পাঠানোর নাম:** `job:reject`

```json
{
  "jobId": "জব আইডি",
  "reason": "দূরে আছি"
}
```

**সার্ভার কী করে:** শুধু সেই রাইডারকে `requestedRider` থেকে সরায়। জব `rejected` হয় না। অন্যরা এখনও নিতে পারে।

**যে রাইডার ফিরিয়ে দিয়েছেন:** ফল **ack**-এ; আলাদা ইভেন্ট নেই।

---

## ধাপ ৩গ — দোকান/এজেন্ট নিজে রাইডার বসায়

**কে পাঠাবে:** দোকান, প্রশাসক, এজেন্ট  
**পাঠানোর নাম:** `job:assign`

আগে কাছের রাইডার দেখতে চাইলে:

**পাঠানোর নাম:** `rider:find-online`

```json
{
  "orderId": "অর্ডার আইডি",
  "radiusKm": 10
}
```

উত্তর শুধু ack-এ আসে, আলাদা শোনার ঘটনা নেই।

নিয়োগ:

```json
{
  "orderId": "অর্ডার আইডি",
  "riderId": "রাইডার আইডি"
}
```

**সার্ভার কী করে:** জব `assigned`, অর্ডার `rider_assigned`, `requestedRider` খালি।

**নিয়োগ পাওয়া রাইডার শুনুন:** `job:assigned`  
**গ্রাহক শুনুন:** `job:rider-assigned`  
এজেন্টের ফল **ack**-এ।

এরপর রাইডার আবার `job:accept` দিয়ে গ্রহণ করবে; তখন জব `accepted` হয়।

---

## ধাপ ৪ — গ্রাহক মানচিত্রে ট্র্যাক করে

ধাপ «গ্রাহক কী করবে»-এর `track_order` দেখুন। রাইডার যতবার স্থান পাঠাবে, গ্রাহক `order:location` পাবে।

---

## ধাপ ৫ — রাইডার চলতে চলতে স্থান পাঠায়

**পাঠানোর নাম:** `rider:location-update`

```json
{
  "lat": 23.791,
  "lng": 90.415,
  "speed": 35,
  "heading": 120,
  "encodedRoute": "ম্যাপের লাইন"
}
```

`jobId` দিলেও চলে; না দিলে সক্রিয় জব ধরে নেওয়া হয়।

Ack-এ একই আকারের তথ্য ফেরে। গ্রাহক আলাদা করে ack পায় না; তারা `order:location` শোনে।

---

## ধাপ ৬ — দোকান থেকে পণ্য তোলা

**পাঠানোর নাম:** `job:pickup`

```json
{ "jobId": "জব আইডি" }
```

জব আগে `accepted` থাকতে হবে।

**সার্ভার কী করে:** জব `picked_up`, অর্ডার `picked_up`

**গ্রাহক শুনুন:** `job:picked-up`  
রাইডারের ফল **ack**-এ। ট্র্যাক পাতায় থাকলে একই ঘটনা সেই কক্ষেও যায়।

---

## ধাপ ৭ — গ্রাহকের দিকে রওনা

**পাঠানোর নাম:** `job:on-the-way`

```json
{ "jobId": "জব আইডি" }
```

জব আগে `picked_up` থাকতে হবে।

**সার্ভার কী করে:** জব `on_the_way`, অর্ডার `on_the_way`

**গ্রাহক শুনুন:** `job:on-the-way`  
রাইডারের ফল **ack**-এ।

---

## ধাপ ৮ — গ্রাহকের ফোনে ওটিপি

**কে পাঠাবে:** রাইডার (দোকান/প্রশাসকও পাঠাতে পারে)  
**পাঠানোর নাম:** `job:send-delivery-otp`

```json
{ "jobId": "জব আইডি" }
```

জব `on_the_way` বা আগে থেকে `otp_sent` থাকতে হবে। ওটিপি রেডিসে **৬ মিনিট** থাকে। উৎপাদন পরিবেশে গ্রাহকের ফোনে এসএমএস যায়।

Ack (উন্নয়ন পরিবেশ):

```json
{
  "verificationToken": "টোকেন",
  "otp": "123456",
  "mock": true
}
```

Ack (উৎপাদন পরিবেশ):

```json
{
  "verificationToken": "টোকেন",
  "otp": null,
  "mock": false
}
```

**গ্রাহক শুনুন:** `job:otp-sent`  
রাইডারের ফল **ack**-এ।

---

## ধাপ ৯ — ওটিপি মিলিয়ে দেখা

**পাঠানোর নাম:** `job:verify-delivery-otp`

```json
{
  "jobId": "জব আইডি",
  "otp": "123456",
  "verificationToken": "আগের ধাপের টোকেন"
}
```

সার্ভার রেডিস থেকে ওটিপি মিলায়। সফল হলে জবে `hasDeliveryOtpVerified: true`।

**গ্রাহক শুনুন:** `job:otp-verified`  
রাইডারের ফল **ack**-এ।

---

## ধাপ ১০ — ডেলিভারি সম্পন্ন

**পাঠানোর নাম:** `job:delivered`

```json
{ "jobId": "জব আইডি" }
```

শর্ত: ওটিপি আগে যাচাই করা।

**সার্ভার কী করে:** জব `delivered`, অর্ডার `delivered`। নগদ হলে জমা মুলতবি হতে পারে।

**গ্রাহক শুনুন:** `job:delivered`, `ride:request-rating`  
নগদ হলে দোকান/এজেন্ট **শুনুন:** `deposit:pending` (রাইডার ack থেকে পায়)  
রাইডারের ফল **ack**-এ।

`ride:request-rating`-এর উদাহরণ:

```json
{
  "jobId": "জব আইডি",
  "jobPublicId": "ছোট আইডি",
  "rider": {},
  "order": {}
}
```

---

## ধাপ ১১ — গ্রাহক রেটিং দেয়

**পাঠানোর নাম:** `ride:submit-rating` (উপরে গ্রাহক অংশ দেখুন)

**সার্ভার কী করে:** পর্যালোচনা তৈরি, রাইডারের গড় রেটিং ও রেটিং সংখ্যা হালনাগাদ।

**রাইডার শুনুন:** `ride:rating-submitted` (পর্যালোচনা অবজেক্ট; `author.avgRating`, `author.ratingCount` সহ)

---

## ধাপ ১২ — রাইডার অফলাইন

**পাঠানোর নাম:** `rider:go-offline`

```json
{
  "lat": 23.791,
  "lng": 90.415
}
```

শর্ত: সক্রিয় অ্যাকাউন্ট, অনুমোদিত কেওয়াইসি।  
**সার্ভার কী করে:** এই স্থান `lastAvailable`-এ রাখে, `hasRiderActivateMode` বন্ধ করে। ফল **ack**-এ।

সকেট কেটে গেলেও `hasRiderActivateMode` বন্ধ হয়। তখন স্থান বাধ্যতামূলক নয়।

---

## হ্যান্ডলার অনুযায়ী দ্রুত তালিকা

| হ্যান্ডলার | কে পাঠাবে | পাঠানোর নাম | পাঠানো তথ্য | সার্ভার যা শোনায় |
| :--- | :--- | :--- | :--- | :--- |
| `riderGoOnline` | রাইডার | `rider:go-online` | `lat`, `lng` | শুধু ack |
| `riderGoOffline` | রাইডার | `rider:go-offline` | `lat`, `lng` | শুধু ack |
| `riderLocationUpdate` | রাইডার | `rider:location-update` | `lat`, `lng`, `speed`, `heading`, `encodedRoute` | গ্রাহক: `order:location` |
| `findOnlineRider` | দোকান/এজেন্ট | `rider:find-online` | `orderId`, `radiusKm?` | শুধু ack |
| `jobAssign` | দোকান/এজেন্ট | `job:assign` | `orderId`, `riderId` | রাইডার: `job:assigned` · গ্রাহক: `job:rider-assigned` |
| `jobAccept` | রাইডার | `job:accept` | `jobId` | গ্রাহক: `job:rider-assigned` · অন্য রাইডার: `job:accepted`, `job:request-cancelled` |
| `jobReject` | রাইডার | `job:reject` | `jobId`, `reason?` | শুধু ack |
| `trackOrder` | গ্রাহক | `track_order` | `orderId` | পরে `order:location` |
| `jobPickUp` | রাইডার | `job:pickup` | `jobId` | গ্রাহক: `job:picked-up` |
| `jobOnTheWay` | রাইডার | `job:on-the-way` | `jobId` | গ্রাহক: `job:on-the-way` |
| `sendDeliveryOtp` | রাইডার | `job:send-delivery-otp` | `jobId` | গ্রাহক: `job:otp-sent` · otp ack-এ |
| `verifyDeliveryOtp` | রাইডার | `job:verify-delivery-otp` | `jobId`, `otp`, `verificationToken?` | গ্রাহক: `job:otp-verified` |
| `markAsDelivered` | রাইডার | `job:delivered` | `jobId` | গ্রাহক: `job:delivered`, `ride:request-rating` |
| `ratingSubmit` | গ্রাহক | `ride:submit-rating` | `jobId`, `rating`, `review`, `files?` | রাইডার: `ride:rating-submitted` |

---

## জব ও অর্ডারের অবস্থা পাশাপাশি

| ধাপ | জব | অর্ডার |
| :--- | :--- | :--- |
| ম্যাচিং শুরু | `matching` | `processing` |
| সরাসরি নিয়োগ | `assigned` | `rider_assigned` |
| রাইডার গ্রহণ | `accepted` | `rider_assigned` |
| পণ্য তোলা | `picked_up` | `picked_up` |
| পথে | `on_the_way` | `on_the_way` |
| ওটিপি পাঠানো | `otp_sent` | `on_the_way` |
| ডেলিভারি | `delivered` | `delivered` |

একজন রাইডার ফিরিয়ে দিলে জব `rejected` হয় না। অন্য রাইডার নিতে পারে, অথবা এজেন্ট নিয়োগ করতে পারে।

---

## অ্যাপে শোনা শুরু করার ছোট উদাহরণ

গ্রাহক:

```js
socket.on('job:rider-assigned', (job) => {});
socket.on('order:location', (data) => {});
socket.on('job:picked-up', (data) => {});
socket.on('job:on-the-way', (data) => {});
socket.on('job:otp-sent', (data) => {});
socket.on('job:otp-verified', (data) => {});
socket.on('job:delivered', (data) => {});
socket.on('ride:request-rating', (data) => {});
socket.emit('track_order', { orderId }, (ack) => {});
```

রাইডার:

```js
socket.on('job:new-request', (job) => {});
socket.on('job:assigned', (job) => {});
socket.on('job:request-cancelled', (job) => {});
socket.on('ride:rating-submitted', (review) => {});
socket.emit('rider:go-online', { lat, lng }, (ack) => {});
```
