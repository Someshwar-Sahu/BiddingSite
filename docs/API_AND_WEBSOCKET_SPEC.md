# API & WebSocket Protocol Specification

## 1. REST API Endpoints

### 1.1. Authentication & Onboarding
- **`GET /api/auth/verify`**
  - Query: `?token={magic_token}`
  - Returns user profile, assigned role (`vendor` or `customer_observer`), and sets HTTP-only session cookie.
  - Response: `{ status: 'success', role: 'vendor', vendor_status: 'approved', user: { ... } }`

- **`POST /api/auth/register-profile`**
  - For first-time vendors completing registration.
  - Body: `{ token, company_name, gstin, contact_person, phone }`
  - Response: `{ status: 'pending_approval', message: 'Profile submitted for admin verification.' }`

---

### 1.2. Auction & Lot Management
- **`POST /api/auctions`** (Admin only)
  - Creates a new scheduled auction event with configuration parameters.
  - Body:
    ```json
    {
      "id": "PTA-EPACKPetro-07",
      "title": "Epack Petrochem Procurement Event",
      "customer_org_id": "org_epack",
      "scheduled_start": "2026-10-28T15:37:00+05:30",
      "duration_minutes": 45,
      "anti_sniping_minutes": 2,
      "extension_step_minutes": 3,
      "max_buffer_minutes": 30
    }
    ```

- **`POST /api/auctions/:id/lots`** (Admin only)
  - Adds a lot/product to the auction.
  - Body:
    ```json
    {
      "lot_number": 1,
      "product_name": "Imported Coal _Epackpetro-07",
      "category": "Non-PCB",
      "quantity": 500,
      "uom": "MT",
      "start_price": 13490.00,
      "reserve_price": 13500.00,
      "bid_decrement": 10.00
    }
    ```

- **`GET /api/auctions/:id/room-state`**
  - Fetches complete current state of an auction (lots, current lowest bids, remaining duration).

---

### 1.3. Invites & Direct Sharing
- **`POST /api/auctions/:id/invites`** (Admin only)
  - Dispatches invites to a list of vendor emails and generates observer tokens.
  - Body: `{ vendor_ids: ["vnd_01", "vnd_02"], send_email: true }`
  - Response: Array of generated access links and pre-formatted WhatsApp share strings.

---

### 1.4. Post-Auction Reports
- **`GET /api/auctions/:id/report`**
  - Returns the JSON outcome summary, $L_1$ winners, $L_2$ standbys, outbid counts, and total savings.
- **`GET /api/reports/:id/download`**
  - Streams the official generated 6-page PDF binary file (`application/pdf`).

---

## 2. Real-Time WebSocket Protocol (Socket.io)

### 2.1. Client $\rightarrow$ Server Events

| Event Name | Payload | Description |
| :--- | :--- | :--- |
| `join_room` | `{ auction_id: string, token: string }` | Client joins the WebSocket room and initializes session. |
| `submit_bid` | `{ lot_id: string, amount: number }` | Vendor attempts to place a bid. |
| `sync_clock` | `{ client_time: number }` | Request to synchronize local timer with server NTP clock. |

---

### 2.2. Server $\rightarrow$ Client Events

#### `room_joined`
Emitted immediately upon successful room connection.
```json
{
  "auction_id": "PTA-EPACKPetro-07",
  "status": "live",
  "role": "vendor",
  "server_time": 1730198220000,
  "end_time": 1730200920000,
  "lots": [
    {
      "id": "lot_coal",
      "product_name": "Imported Coal",
      "current_lowest_bid": 10720.00,
      "max_allowed_bid": 10710.00,
      "your_current_bid": 10720.00,
      "is_your_l1": true
    }
  ]
}
```

#### `bid_placed`
Broadcast to **all participants** in the room when a valid bid updates the lowest price.
```json
{
  "lot_id": "lot_coal",
  "amount": 10710.00,
  "new_max_allowed_bid": 10700.00,
  "timestamp": 1730198450000
}
```

#### `outbid_alert`
Emitted **only to the specific vendor** who held the previous $L_1$ and has now been overtaken.
```json
{
  "lot_id": "lot_coal",
  "new_lowest_bid": 10710.00,
  "message": "You have been outbid on Imported Coal! Next max bid is ₹10,700."
}
```

#### `clock_tick`
Broadcast every 1 second to maintain synchronized countdown displays.
```json
{
  "remaining_seconds": 2445,
  "is_extended": false,
  "hard_stop_remaining_seconds": 4245
}
```

#### `auction_extended`
Broadcast when an anti-sniping extension is triggered.
```json
{
  "lot_id": "lot_coal",
  "extended_by_minutes": 3,
  "new_end_time": 1730201100000,
  "reason": "Competitive bid placed in the final 2 minutes."
}
```

#### `lot_closed`
Broadcast when a specific lot reaches its closing deadline.
```json
{
  "lot_id": "lot_coal",
  "winning_bid": 10720.00,
  "reserve_met": true,
  "status": "closed"
}
```

#### `error_message`
Emitted directly to a client when a bid submission is rejected.
```json
{
  "code": "INVALID_BID_AMOUNT",
  "message": "Bid of ₹10,730 exceeds current maximum allowed bid of ₹10,710."
}
```

