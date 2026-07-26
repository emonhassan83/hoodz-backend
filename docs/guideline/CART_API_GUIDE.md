# Cart API Frontend Guide

This guide explains how cart works for both guest users and logged-in users.

## Base Setup

Base URL:

```txt
{{url}}/api/v1/cart
```

Guest users must send:

```http
x-guest-id: guest_abc_123
```

Logged-in users should send both headers when available:

```http
Authorization: Bearer <accessToken>
x-guest-id: guest_abc_123
```

If both are sent, backend uses the logged-in user cart. During login/signup/OTP verification, backend merges the guest cart into the user cart.

Existing databases should run the cart index migration once after this feature is deployed:

```bash
pnpm run migrate:cart-guest-indexes
```

## 1. Get Cart

```http
GET /api/v1/cart
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Cart fetched successfully",
  "data": {
    "items": [],
    "totalItems": 0,
    "subTotal": 0
  }
}
```

## 2. Add Product To Cart

```http
POST /api/v1/cart/add
```

Single-stock product:

```json
{
  "productId": "67f3690e0fd47ade715ea650",
  "quantity": 1
}
```

Color-only product:

```json
{
  "productId": "67f3690e0fd47ade715ea650",
  "color": {
    "code": "#000000",
    "name": "Black"
  },
  "quantity": 1
}
```

Size-color product:

```json
{
  "productId": "67f3690e0fd47ade715ea650",
  "size": "M",
  "color": {
    "code": "#000000",
    "name": "Black"
  },
  "quantity": 1
}
```

Behavior:

- If same `productId + size + color.code` already exists, backend increments quantity.
- Backend validates inventory type and stock.
- Frontend does not send price; backend calculates latest price.

## 3. Update Cart Item Quantity

```http
PUT /api/v1/cart/update
```

```json
{
  "productId": "67f3690e0fd47ade715ea650",
  "size": "M",
  "color": {
    "code": "#000000",
    "name": "Black"
  },
  "quantity": 3
}
```

Behavior:

- `quantity` is the final quantity, not increment/decrement delta.
- For minus button, frontend should calculate next quantity and send it.
- If quantity becomes zero, call remove API instead.

## 4. Remove One Cart Item

```http
DELETE /api/v1/cart/remove
```

```json
{
  "productId": "67f3690e0fd47ade715ea650",
  "size": "M",
  "color": {
    "code": "#000000",
    "name": "Black"
  }
}
```

Behavior:

- Removes only the matching `productId + size + color.code` item.
- Other variants of the same product remain in cart.

## 5. Clear Cart

```http
DELETE /api/v1/cart/clear
```

Behavior:

- Removes all items from the current user/guest cart.

## 6. Guest To Logged-In Merge

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

Merge behavior:

- Guest cart items are moved into user cart.
- If same product variant already exists in user cart, quantities are added together.
- Guest cart copy is removed after merge.
- User sees the same cart products after login/signup.

## Recommended Frontend Flow

1. Generate `x-guest-id` on first app launch/install.
2. Store it in local/secure storage.
3. Send `x-guest-id` with all cart and auth requests.
4. Guest can add/update/remove/clear cart without login.
5. On login/signup, continue sending same `x-guest-id`.
6. After login/signup success, call `GET /cart` to show merged cart.
