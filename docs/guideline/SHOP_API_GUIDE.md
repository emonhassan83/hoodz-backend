# Shop Detail Frontend Guide

This guide covers shop profile, shop products, and guest/user recently viewed behavior.

## Headers

Guest users should send:

```http
x-guest-id: guest_abc_123
```

Logged-in users should send:

```http
Authorization: Bearer <accessToken>
x-guest-id: guest_abc_123
```

## 1. Shop Details

Use this for the shop profile/about screen.

```http
GET /api/v1/users/shops/:vendorId/details?latitude=30.0444&longitude=31.2357
```

Response data:

```json
{
  "shop": {
    "_id": "vendorId",
    "name": "Urban Style",
    "profileAvatar": "...",
    "coverPhoto": "...",
    "description": "...",
    "address": "...",
    "avgRating": 4.5,
    "ratingCount": 1000,
    "followers": 5000,
    "isFollowing": false
  },
  "distance": {
    "distanceKm": 1.2,
    "distanceText": "1.2 km",
    "durationMinutes": 25,
    "durationText": "20-25 mins"
  },
  "categories": [],
  "policies": {}
}
```

Notes:

- `latitude` and `longitude` are optional.
- If location is sent, backend uses Google Distance Matrix and falls back to straight-line distance when Google fails.
- `categories` are product categories available in this shop.
- `policies` is the same vendor general settings data from `/settings/generals?vendorId=...`.

## 2. Shop Products

Use this for the Products tab.

```http
GET /api/v1/products/shop/:vendorId?page=1&limit=10
```

Response:

```json
{
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 20,
    "totalPage": 2
  },
  "data": {
    "recommends": [],
    "allProducts": []
  }
}
```

Notes:

- `recommends` is fixed max 12 products.
- `allProducts` is paginated and uses `meta`.
- Product card fields match existing product list card response.
- Logged-in users get correct `isWishlisted`; guests get `false`.

## 3. Mark Product Viewed

Use this when user opens product details.

```http
PATCH /api/v1/products/viewed/:productId
```

Notes:

- Works for guest and logged-in users.
- Guest viewed history is stored by `x-guest-id`.
- After login/signup/OTP verify, backend merges guest viewed products into user viewed products.

## 4. Recently Viewed Products

```http
GET /api/v1/products/recently-viewed?page=1&limit=10
```

Notes:

- Works for guest and logged-in users.
- Send `x-guest-id` for guest history.
- Send token after login to see merged history.

