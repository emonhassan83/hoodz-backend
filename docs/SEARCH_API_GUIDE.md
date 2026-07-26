# Search API Frontend Guide

This guide explains how the frontend should use product search, suggestions, guest search history, popular categories, and featured vendors.

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

If both are sent, backend uses the logged-in user for history. During login/signup/OTP verification, backend merges the guest history into the user history.

## 1. Search Screen Initial Data

Use this when the user opens the search screen.

```http
GET /api/v1/search?page=1&limit=10
```

Headers:

```http
x-guest-id: guest_abc_123
Authorization: Bearer <optional>
```

Returns:

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

Frontend usage:

- `popularCategories`: show max 10 category chips/cards.
- `featuredVendors`: show max 5 featured vendors.
- `searchHistory`: show recent search strings.

## 2. Product Search Suggestions

Use this when user types in the search input. This endpoint is only for suggestion dropdown data.

```http
GET /api/v1/search/data?searchTerm=serum
```

Supported query params:

```txt
searchTerm=serum
category=<categoryId>
brand=Zayn
collectionType=women
size=M
color=Black
minPrice=100
maxPrice=2000
inStock=true
sortBy=relevance | latest | priceLowToHigh | priceHighToLow
```

Example:

```http
GET /api/v1/search/data?searchTerm=serum&brand=Zayn&sortBy=latest
```

Returns:

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

Frontend usage:

- Show `suggestions` below the search input.
- This endpoint does not return product cards/details.
- Do not navigate suggestion click to product details.
- Suggestion click should open grouped product results using the clicked suggestion query.

## 3. Save Search History

Call this when:

- User submits a typed search.
- User clicks a suggestion.
- User taps a previous history item and searches again.

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

Headers:

```http
x-guest-id: guest_abc_123
Authorization: Bearer <optional>
```

Important:

- Guest history saves only if `x-guest-id` is present.
- Same query does not create duplicate history.
- Backend updates `lastSearchedAt` for repeat searches.

## 4. Suggestion Click Flow

Example user searches `serum`.

Step 1: Fetch suggestions.

```http
GET /api/v1/search/data?searchTerm=serum
```

Step 2: User clicks suggestion `Zayn & Myza Foaming Face Wash`.

Save it:

```http
POST /api/v1/search
```

```json
{
  "query": "Zayn & Myza Foaming Face Wash",
  "source": "suggestion"
}
```

Step 3: Navigate to product listing/group result screen.

```http
GET /api/v1/products?searchTerm=Zayn%20%26%20Myza%20Foaming%20Face%20Wash
```

Use a product listing/search result screen for this query, not a single product details page.

## 5. Delete One Search History Item

```http
DELETE /api/v1/search/:historyId
```

Headers:

```http
x-guest-id: guest_abc_123
Authorization: Bearer <optional>
```

Use this when user removes one recent search item.

## 6. Clear All Search History

```http
DELETE /api/v1/search
```

Headers:

```http
x-guest-id: guest_abc_123
Authorization: Bearer <optional>
```

Use this when user taps clear all history.

## 7. Guest To Logged-In Merge

Frontend must keep the same `x-guest-id` before and after login/signup.

Send it during:

```txt
signupWithEmail
signupWithPhone
registerWithGoogle
registerWithApple
loginWithEmail
OTP verify
```

Example:

```http
POST /api/v1/auth/login-with-email
Authorization: none
x-guest-id: guest_abc_123
```

After successful login/signup, backend merges guest history into the user history and removes the guest copy.

## Recommended Frontend Flow

1. Generate `x-guest-id` on first app launch/install.
2. Store it in secure/local storage.
3. Send `x-guest-id` with all search and auth requests.
4. Search screen open: call `GET /search`.
5. User types: call `GET /search/data?searchTerm=...`.
6. User submits/clicks suggestion: call `POST /search`.
7. Suggestion click: open product listing with the suggestion as `searchTerm`.
8. Login/signup: keep sending same `x-guest-id`.
