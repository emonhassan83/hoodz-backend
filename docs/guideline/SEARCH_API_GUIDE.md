# Search API Frontend Guide

This guide explains product search suggestions, guest search history, popular categories, and featured vendors.

## Base Setup

Base URL:

```txt
{{url}}/api/v1/search
```

Guest users must send a stable device/session id:

```http
x-guest-id: guest_abc_123
```

Logged-in users should send both headers when available:

```http
Authorization: Bearer <accessToken>
x-guest-id: guest_abc_123
```

If both are sent, backend uses the logged-in user for history. During login/signup/OTP verification, backend merges guest history into user history.

## 1. Search Screen Initial Data

Use this when the user opens the search screen.

```http
GET /api/v1/search?page=1&limit=10
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Search history fetched successfully",
  "data": {
    "popularCategories": [],
    "featuredVendors": [],
    "searchHistory": []
  },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPage": 0
  }
}
```

Notes:

- `popularCategories` is fixed max 10.
- `featuredVendors` is fixed max 5.
- Pagination applies only to `searchHistory`.

## 2. Product Search Suggestions

Use this when user types in the search input. This endpoint is only for suggestion dropdown data.

```http
GET /api/v1/search/data?searchTerm=serum
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Search data fetched successfully",
  "data": {
    "suggestions": [
      {
        "query": "Zayn & Myza Foaming Face Wash",
        "resultCount": 1
      }
    ]
  }
}
```

Notes:

- This endpoint does not return product cards/details.
- Suggestion click should not navigate to single product details.
- Suggestion click should open product listing using `/products?searchTerm=<query>`.

## 3. Save Search History

Call this when user submits a typed search, clicks a suggestion, or taps previous history.

```http
POST /api/v1/search
```

Manual typed search:

```json
{
  "query": "serum",
  "source": "manual"
}
```

Suggestion click:

```json
{
  "query": "Zayn & Myza Foaming Face Wash",
  "source": "suggestion"
}
```

Notes:

- Guest history saves only when `x-guest-id` is present.
- Same query updates `lastSearchedAt`; it does not duplicate history.

## 4. Suggestion Click Flow

1. Fetch suggestions:

```http
GET /api/v1/search/data?searchTerm=serum
```

2. Save clicked suggestion:

```http
POST /api/v1/search
```

```json
{
  "query": "Zayn & Myza Foaming Face Wash",
  "source": "suggestion"
}
```

3. Open product listing:

```http
GET /api/v1/products?searchTerm=Zayn%20%26%20Myza%20Foaming%20Face%20Wash
```

## 5. Delete History

Delete one history item:

```http
DELETE /api/v1/search/:historyId
```

Clear all actor history:

```http
DELETE /api/v1/search
```

## 6. Guest To Logged-In Merge

Frontend must keep sending the same `x-guest-id` during:

```txt
signupWithEmail
signupWithPhone
registerWithGoogle
registerWithApple
loginWithEmail
OTP verify
```

After successful auth, backend merges guest history into user history and removes the guest copy.

