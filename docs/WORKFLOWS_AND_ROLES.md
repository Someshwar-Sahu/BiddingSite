# User Roles & End-to-End Workflows

## 1. Stakeholder Roles & Access Matrix

| Feature / Action | Super Admin | Customer Admin (Epack) | Customer Observer | Vendor (Bidder) |
| :--- | :---: | :---: | :---: | :---: |
| **Create Auction & Lots** | Yes | Yes (Draft / Request) | No | No |
| **Add & Invite Vendors** | Yes | Yes | No | No |
| **View Magic Links / WhatsApp Backup** | Yes | Yes | No | No |
| **Watch Live Price Drops ($L_1$)** | Yes | Yes | Yes | Yes |
| **Place Bids / Decrement Price** | No | No | **No (Disabled)** | **Yes** |
| **View Real-Time Total Savings** | Yes | Yes | Yes | No (Hidden) |
| **Pause / Extend / Abort Auction** | Yes | Emergency Request | No | No |
| **Download Official 6-Page PDF** | Yes | Yes | Yes | Winner Summary Only |

---

## 2. End-to-End Lifecycle Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Epack)
    actor Admin as Super Admin
    actor Vendor as Vendor (Bidder)
    participant Platform as Auction Platform

    Note over Customer,Admin: Phase 1: Planning & Setup
    Customer->>Admin: Submits Lot specs (Coal 500 MT, Pallets 5000 Nos) & known vendor list
    Admin->>Platform: Creates Auction PTA-EPACKPetro-07, configures Lots, Reserve Prices, Decrements
    Admin->>Platform: Enters vendor emails & phones
    Platform-->>Admin: Generates Magic Tokens for all vendors + Observer Token for Customer

    Note over Platform,Vendor: Phase 2: Invitations & Onboarding
    Platform->>Vendor: Dispatches Email Invite (Nodemailer) with unique link
    Admin->>Vendor: (Optional) 1-Click WhatsApp share fallback
    alt First-Time Vendor
        Vendor->>Platform: Clicks link -> Lands on Quick Profile Setup
        Vendor->>Platform: Submits Legal Entity Name, GSTIN, Contact Person
        Admin->>Platform: Clicks "Approve Vendor"
    else Returning Vendor
        Vendor->>Platform: Clicks link -> Instant Recognition (Zero Form Friction)
    end

    Note over Vendor,Platform: Phase 3: Waiting Room (Pre-Auction)
    Vendor->>Platform: Visits link hours/days early
    Platform-->>Vendor: Displays "Scheduled Event", Live Countdown, Registered Entity, Audio Test Button

    Note over Customer,Platform: Phase 4: Live Auction Execution
    Platform->>Platform: Server Clock reaches Start Time -> State switches to LIVE
    Customer->>Platform: Opens Observer Link -> Sees Real-time Savings & Lowest Price Drops
    loop During 60 Minutes
        Vendor->>Platform: Submits Decrement Bid (Socket.io)
        Platform->>Platform: Validates Bid <= Max Allowed
        Platform->>Customer: Broadcasts new L1 price and recalculated savings
        Platform->>Vendor: Emits subtle ding sound; alerts previous L1 they were outbid
    end

    Note over Platform,Admin: Phase 5: Anti-Sniping & Closure
    opt Bid in last 2 minutes
        Platform->>Platform: Extends clock by 3 mins (within 30-min buffer cap)
    end
    Platform->>Platform: Clock reaches zero / Hard stop reached -> State switches to ENDED
    Platform->>Platform: Triggers PDF Worker -> Generates 6-Page Settlement Report
    Platform-->>Customer: PDF available for instant download
    Platform-->>Admin: PDF archived & signed
```

---

## 3. Detailed Screen Specifications

### 3.1. Customer Observer Mode (Spectator Dashboard)
- **Header**: `[ OBSERVING: PTA-EPACKPetro-07 ]` with large synchronized countdown timer.
- **Top Metrics Strip**:
  - Total Target / Reserve Value: ₹1,42,50,000
  - Current Contract Value: ₹1,10,35,000
  - **Live Savings Generated**: **₹32,15,000 (22.5% Reduction)**
- **Lot Table**:
  - Displays Product Name, Quantity/UOM, Reserve Price, Current Lowest Bid ($L_1$), Number of Bids.
  - All input fields, stepper controls, and `Submit` buttons are completely removed to prevent accidental bids or conflict of interest.

### 3.2. Vendor Live Bidding Room
- **Header**: Current Auction ID, Connected Status Indicator (`🟢 Live Connection`), Countdown Timer, and Audio Mute Toggle (`🔊 / 🔇`).
- **Product Rows**:
  - **Pallets**: Lowest Bid [ ₹1,340 ] | Your Bid [ ₹1,340 - L1 Active! ]
  - Stepper Input with pre-filled default: `Max: INR 1,335`
  - Quick `-` and `+` decrement buttons.
  - Dark Blue `Submit` button with instant haptic/visual confirmation.
- **Audio Feedback**:
  - Quiet high-frequency chime for incoming lower bids.
  - Distinct double-tone alert if the vendor's active $L_1$ status is overtaken.

### 3.3. Admin Command Dashboard
- Complete bird's-eye view of all active lots, vendor connection status (Online/Offline), and socket health.
- **Fail-Safe Controls**:
  - `[ +5 Min Emergency Extension ]` button.
  - `[ Pause Auction ]` button (freezes timer for technical troubleshooting).
  - Vendor list showing email delivery status, first access timestamp, and direct `[ WhatsApp Link ]` copy button.

