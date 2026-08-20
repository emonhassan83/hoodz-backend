# চ্যাট সকেট ধাপ

সকেট সংযোগের সময় লগইন থাকতে হবে। সংযোগ হলে সার্ভার ব্যবহারকারীকে তার নিজের কক্ষে (`userId`) বসায়। চ্যাট খুলতে আগে HTTP দিয়ে চ্যাট তৈরি/নেওয়া যায় (`POST /chat`, `GET /chat`)।

প্রতিটি পাঠানো ঘটনার উত্তর ack (কলব্যাক) দিয়ে আসে:

```json
{
  "success": true,
  "status": 200,
  "message": "...",
  "data": {}
}
```

---

## পুরো পথ

```txt
চ্যাট তৈরি / তালিকা নাও
        ↓
ইনবক্স খুলুন (chat:my-list)
        ↓
মেসেজ পাঠান · পড়ুন · সম্পাদনা · মুছুন
        ↓
টাইপ করছেন জানান
        ↓
এআই চ্যাটে প্রশ্ন করুন (শুধু নিজের সহায়ক চ্যাট)
```

---

## সংযোগের পর শুনুন


| শোনার নাম                   | কখন আসে                               | কী কাজে লাগে        |
| --------------------------- | ------------------------------------- | ------------------- |
| `chat:list`                 | তালিকা চাইলে, বা নতুন/পড়া মেসেজের পর | ইনবক্স হালনাগাদ     |
| `chat:new-message`          | কেউ মেসেজ পাঠালে                      | কথোপকথনে যোগ করুন   |
| `chat:message-updated`      | মেসেজ সম্পাদনা                        | পুরনো লেখা বদলান    |
| `chat:message-deleted`      | মেসেজ মুছে গেলে                       | সেই মেসেজ সরান      |
| `chat:seen`                 | অন্যজন পড়েছে                         | পঠিত চিহ্ন          |
| `chat:typing`               | অন্যজন লিখছে                          | «লিখছে» দেখান       |
| `chat:stop-typing`          | লেখা থামলে                            | «লিখছে» সরান        |
| `notification:unread-count` | না-পড়া সংখ্যা বদলালে                 | ব্যাজ               |
| `ai:message`                | এআই উত্তর                             | পণ্য সাজেশনসহ উত্তর |


---



## ধাপ ১ — ইনবক্স

**পাঠান:** `chat:my-list`  
তথ্য লাগে না।

**সার্ভার যা শোনায়:** `chat:list` — এআই চ্যাট বাদ দিয়ে গ্রুপ করা ইনবক্স:

```json
{
  "customer_support": { "_id": "...", "type": "customer_support" },
  "staff_support": null,
  "order_support": [{ "_id": "...", "type": "order_support", "order": {} }]
}
```

কাস্টমার/রাইডারের জন্য `customer_support` ও `staff_support` একটি চ্যাট বা `null`। অর্ডার সাপোর্ট অর্ডার অনুযায়ী একাধিক। `single_chat` ইনবক্সে আসে না। এজেন্ট/প্রশাসকের ইনবক্সে সাপোর্ট চ্যাট অ্যারে আসে।

Ack-এ একই অবজেক্ট থাকে। HTTP: `GET /chat`

---



## চ্যাট তৈরি — HTTP `POST /chat`

ডুপ্লিকেট হলে নতুন চ্যাট হয় না; আগেরটাই ফেরত আসে।

**কাস্টমার সাপোর্ট** (ইউজারপ্রতি একটি):

```json
{ "type": "customer_support" }
```

**স্টাফ সাপোর্ট** (ভেন্ডর/রাইডারপ্রতি একটি):

```json
{ "type": "staff_support" }
```

**অর্ডার সাপোর্ট** (একই `order` হলে একই চ্যাট):

```json
{
  "type": "order_support",
  "order": "অর্ডার আইডি"
}
```

**সরাসরি চ্যাট** (কাস্টমার ↔ রাইডার, রাইডার ↔ কাস্টমার, শপ/ভেন্ডরের সাথে)। দুইজনের জন্য একটিই চ্যাট; আগে থাকলে সেটাই ফেরত। `participant` মডিউলে দুজনই যোগ হয়।

```json
{
  "type": "single_chat",
  "participant": "অন্যজনের ইউজার আইডি"
}
```

`participent` ফিল্ডও একই কাজে চলে।

প্রোফাইলে আগে থেকে চ্যাট আছে কি না: `GET /users/:userId` → `hasCustomerSupport`, `hasStaffSupport`।  
অর্ডারে আগে থেকে সাপোর্ট চ্যাট আছে কি না: `GET /orders/:orderId` → `hasOrderSupports`।

---



## ধাপ ২ — মেসেজ পাঠান

**পাঠান:** `chat:send-message`

কাস্টমার/স্টাফ সাপোর্টে `chatId` লাগে না। অর্ডার সাপোর্টে `order` দিলেই হয়। সরাসরি চ্যাটে অন্যজনের আইডি দিলেই হয়। এজেন্ট অন্যের সাপোর্ট চ্যাটে পাঠাতে `chatId` ব্যবহার করবে।

কাস্টমার সাপোর্ট:

```json
{
  "type": "customer_support",
  "text": "আসসালামু আলাইকুম",
  "files": []
}
```

স্টাফ সাপোর্ট:

```json
{
  "type": "staff_support",
  "text": "আসসালামু আলাইকুম"
}
```

অর্ডার সাপোর্ট:

```json
{
  "type": "order_support",
  "order": "অর্ডার আইডি",
  "text": "অর্ডার নিয়ে কথা"
}
```

সরাসরি চ্যাট — দুজন অংশগ্রহণকারী মিলিয়ে চ্যাট খোঁজা হয়; না থাকলে তৈরি হয়:

```json
{
  "type": "single_chat",
  "participant": "অন্যজনের ইউজার আইডি",
  "text": "",
  "files": []
}
```

চ্যাট আইডি জানা থাকলে:

```json
{
  "chatId": "চ্যাট আইডি",
  "text": "আসসালামু আলাইকুম",
  "files": []
}
```

`text` বা `files`-এর অন্তত একটি লাগবে। চ্যাট না থাকলে সার্ভার সিঙ্গলটন/অর্ডার চ্যাট তৈরি করে, থাকলে সেটাই ব্যবহার করে।

**সবাই শুনুন:** `chat:new-message` (মেসেজ অবজেক্ট)  
তারপর: `chat:list`, `notification:unread-count` `{ chatId, unreadCount }`

---



## ধাপ ৩ — পড়া হয়েছে

**পাঠান:** `chat:seen`

```json
{ "chatId": "চ্যাট আইডি" }
```

অন্যের না-পড়া মেসেজ পঠিত হয়।

**সবাই শুনুন:** `chat:seen`

```json
{
  "chatId": "চ্যাট আইডি",
  "seenBy": "যে পড়েছে",
  "seenAt": "সময়"
}
```

তারপর: `chat:list`, `notification:unread-count`

---



## ধাপ ৪ — সম্পাদনা

**পাঠান:** `chat:edit-message`

```json
{
  "messageId": "মেসেজ আইডি",
  "text": "নতুন লেখা",
  "files": []
}
```

শুধু নিজের মেসেজ।

**সবাই শুনুন:** `chat:message-updated`

---



## ধাপ ৫ — মুছে ফেলা

**পাঠান:** `chat:delete-message`

```json
{ "messageId": "মেসেজ আইডি" }
```

শুধু নিজের মেসেজ।

**সবাই শুনুন:** `chat:message-deleted`

```json
{
  "messageId": "...",
  "chatId": "...",
  "deletedBy": "...",
  "deletedAt": "..."
}
```

---



## ধাপ ৬ — লিখছেন

**পাঠান:** `chat:typing`

```json
{ "chatId": "চ্যাট আইডি" }
```

**অন্যজন শুনুন:** `chat:typing`

```json
{
  "chatId": "...",
  "userId": "...",
  "name": "...",
  "profileAvatar": null,
  "isTyping": true,
  "timestamp": "..."
}
```

থামলে **পাঠান:** `chat:stop-typing` — একই `chatId`  
**অন্যজন শুনুন:** `chat:stop-typing` (`isTyping: false`)

---



## ধাপ ৭ — এআই সহায়ক

প্রতি ব্যবহারকারীর এআই চ্যাট একটিই। সকেটে চ্যাট আইডি পাঠাতে হয় না; না থাকলে সার্ভার তৈরি করে।

**পাঠান:** `ai:send-message`

```json
{ "message": "লাল শাড়ি চাই" }
```

শুধু জেমিনি ব্যবহার হয়।

**আপনি শুনুন:** `ai:message`  
এবং দুবার `chat:new-message` — নিজের মেসেজ, তারপর এআই মেসেজ।

পুরনো কথা পড়তে HTTP: `GET /messages/ai-assistant`

ইনবক্স (`chat:my-list` / `GET /chat`) এআই চ্যাট ও `single_chat` দেখায় না। সেখানে থাকে:

- `customer_support`: একটি চ্যাট বা শূন্য
- `staff_support`: একটি চ্যাট বা শূন্য
- `order_support`: অর্ডার অনুযায়ী একাধিক

এজেন্ট/প্রশাসকের ইনবক্সে সাপোর্ট চ্যাট তালিকা আকারে আসে।

---



## হ্যান্ডলার তালিকা


| হ্যান্ডলার      | পাঠানোর নাম           | পাঠানো তথ্য                                                          | সার্ভার যা শোনায়                                            |
| --------------- | --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `myChatList`    | `chat:my-list`        | —                                                                    | `chat:list`                                                  |
| `sendMessage`   | `chat:send-message`   | `type?` + `order?` / `participant?` অথবা `chatId`, `text?`, `files?` | `chat:new-message`, `chat:list`, `notification:unread-count` |
| `seen`          | `chat:seen`           | `chatId`                                                             | `chat:seen`, `chat:list`, `notification:unread-count`        |
| `editMessage`   | `chat:edit-message`   | `messageId`, `text?`, `files?`                                       | `chat:message-updated`                                       |
| `deleteMessage` | `chat:delete-message` | `messageId`                                                          | `chat:message-deleted`                                       |
| `typing`        | `chat:typing`         | `chatId`                                                             | `chat:typing` (অন্যজন)                                       |
| `stopTyping`    | `chat:stop-typing`    | `chatId`                                                             | `chat:stop-typing` (অন্যজন)                                  |
| `aiSendMessage` | `ai:send-message`     | `message`                                                            | `ai:message`, `chat:new-message`                             |


---



## অ্যাপে শোনা

```js
socket.on('chat:list', (chats) => {});
socket.on('chat:new-message', (message) => {});
socket.on('chat:message-updated', (message) => {});
socket.on('chat:message-deleted', (data) => {});
socket.on('chat:seen', (data) => {});
socket.on('chat:typing', (data) => {});
socket.on('chat:stop-typing', (data) => {});
socket.on('notification:unread-count', (data) => {});
socket.on('ai:message', (data) => {});

socket.emit('chat:my-list', {}, (ack) => {});
socket.emit('chat:send-message', { type: 'customer_support', text }, (ack) => {});
socket.emit('chat:send-message', { type: 'order_support', order, text }, (ack) => {});
socket.emit('chat:send-message', { type: 'single_chat', participant, text, files }, (ack) => {});
```

