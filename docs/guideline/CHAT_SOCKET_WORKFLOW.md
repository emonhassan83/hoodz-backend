# চ্যাট সকেট ধাপ

সকেট সংযোগের সময় লগইন থাকতে হবে। সংযোগ হলে সার্ভার ব্যবহারকারীকে তার নিজের কক্ষে (`userId`) বসায়। চ্যাট খুলতে আগে HTTP দিয়ে চ্যাট তৈরি/নেওয়া যায় (`POST /chats`, `GET /chats`)।

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

| শোনার নাম | কখন আসে | কী কাজে লাগে |
| :--- | :--- | :--- |
| `chat:list` | তালিকা চাইলে, বা নতুন/পড়া মেসেজের পর | ইনবক্স হালনাগাদ |
| `chat:new-message` | কেউ মেসেজ পাঠালে | কথোপকথনে যোগ করুন |
| `chat:message-updated` | মেসেজ সম্পাদনা | পুরনো লেখা বদলান |
| `chat:message-deleted` | মেসেজ মুছে গেলে | সেই মেসেজ সরান |
| `chat:seen` | অন্যজন পড়েছে | পঠিত চিহ্ন |
| `chat:typing` | অন্যজন লিখছে | «লিখছে» দেখান |
| `chat:stop-typing` | লেখা থামলে | «লিখছে» সরান |
| `notification:unread-count` | না-পড়া সংখ্যা বদলালে | ব্যাজ |
| `ai:message` | এআই উত্তর | পণ্য সাজেশনসহ উত্তর |

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

কাস্টমার/রাইডারের জন্য `customer_support` ও `staff_support` একটি চ্যাট বা `null`। অর্ডার সাপোর্ট অর্ডার অনুযায়ী একাধিক। এজেন্ট/প্রশাসকের ইনবক্সে সাপোর্ট চ্যাট অ্যারে আসে।

Ack-এ একই অবজেক্ট থাকে। HTTP: `GET /chats`

---

## ধাপ ২ — মেসেজ পাঠান

**পাঠান:** `chat:send-message`

```json
{
  "chatId": "চ্যাট আইডি",
  "text": "আসসালামু আলাইকুম",
  "files": []
}
```

`text` বা `files`-এর অন্তত একটি লাগবে। চ্যাটে অংশগ্রহণকারী বা প্রশাসক পাঠাতে পারেন।

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

ইনবক্স (`chat:my-list` / `GET /chats`) এআই চ্যাট দেখায় না। সেখানে থাকে:

- `customer_support`: একটি চ্যাট বা শূন্য
- `staff_support`: একটি চ্যাট বা শূন্য
- `order_support`: অর্ডার অনুযায়ী একাধিক

এজেন্ট/প্রশাসকের ইনবক্সে সাপোর্ট চ্যাট তালিকা আকারে আসে।

---

## হ্যান্ডলার তালিকা

| হ্যান্ডলার | পাঠানোর নাম | পাঠানো তথ্য | সার্ভার যা শোনায় |
| :--- | :--- | :--- | :--- |
| `myChatList` | `chat:my-list` | — | `chat:list` |
| `sendMessage` | `chat:send-message` | `chatId`, `text?`, `files?` | `chat:new-message`, `chat:list`, `notification:unread-count` |
| `seen` | `chat:seen` | `chatId` | `chat:seen`, `chat:list`, `notification:unread-count` |
| `editMessage` | `chat:edit-message` | `messageId`, `text?`, `files?` | `chat:message-updated` |
| `deleteMessage` | `chat:delete-message` | `messageId` | `chat:message-deleted` |
| `typing` | `chat:typing` | `chatId` | `chat:typing` (অন্যজন) |
| `stopTyping` | `chat:stop-typing` | `chatId` | `chat:stop-typing` (অন্যজন) |
| `aiSendMessage` | `ai:send-message` | `message` | `ai:message`, `chat:new-message` |

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
socket.emit('chat:send-message', { chatId, text }, (ack) => {});
```
