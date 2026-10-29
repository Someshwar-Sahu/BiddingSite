# B2B Reverse E-Auction Platform

A specialized, low-latency B2B e-auction platform modeled after industrial procurement platforms (such as Prime Trade Auctions). It enables corporate buyers to host scheduled reverse auctions for bulk commodities, industrial materials, and equipment, allowing vetted vendors to compete in real-time down to the lowest bid.

---

## Key Features

- **Reverse Bidding Engine**: Automated calculation of maximum allowed bids based on current lowest bid ($L_1$) and decrement steps.
- **Independent Multi-Lot Support**: Host multiple distinct items (e.g., Coal in MT, Pallets in Nos) simultaneously within the same auction room with isolated state.
- **Magic Link Authentication**: One-time profile onboarding with GST/contact verification for first-time vendors, followed by 1-click frictionless entry for all future auctions.
- **Customer Spectator Mode**: Read-only live dashboard for the corporate buyer (e.g., Epack) to monitor live price drops and calculated procurement savings in real-time without interfering with bidding.
- **Dynamic Anti-Sniping with Absolute Hard Stop**: Auto-extends the clock by 2–3 minutes if a competitive bid is placed in the final minutes, capped by an absolute buffer (e.g., max 15–30 minutes) to prevent endless extension loops.
- **Automated 6-Page PDF Audit Report**: Generates an executive summary, lot breakdown, full bid log, L1/L2 standby contingency, and total procurement savings.
- **Lightweight & High Performance**: Built to deploy effortlessly on **Railway** with persistent WebSocket connections and zero sleep downtime.

---

## Documentation Index

Comprehensive engineering and operational specifications are available in the [`docs/`](./docs) directory:

1. [**System Architecture & Tech Stack**](./docs/ARCHITECTURE.md) - High-level system design, infrastructure choices, component diagrams, and Railway deployment topology.
2. [**Database Schema Specification**](./docs/DATABASE_SCHEMA.md) - Complete data models, entity relationships, indexes, and field definitions.
3. [**Auction Engine Rules & Mathematics**](./docs/AUCTION_RULES_AND_LOGIC.md) - Decrement logic, anti-sniping algorithms, hard-stop calculations, and procurement savings formulas.
4. [**User Workflows & Role Specifications**](./docs/WORKFLOWS_AND_ROLES.md) - Detailed step-by-step journeys for Super Admin, Corporate Buyer (Customer), and Vendor (Bidder).
5. [**API & WebSocket Event Specifications**](./docs/API_AND_WEBSOCKET_SPEC.md) - Complete REST endpoints and real-time WebSocket protocol contracts.
6. [**Deployment & Configuration Guide**](./docs/DEPLOYMENT_GUIDE.md) - Environment variables, Railway setup, Gmail SMTP configuration, and security guidelines.

---

## Quick Tech Stack Overview

- **Backend**: Node.js (Express / Fastify) + TypeScript
- **Real-Time Engine**: Socket.io (WebSockets with automatic fallback and room partitioning)
- **Database**: SQLite (via `better-sqlite3`) for local development / PostgreSQL for cloud scale
- **Email Service**: Nodemailer over Gmail App Password (₹0 setup for 20–30 vendors per event)
- **Report Generation**: PDFKit / Puppeteer for pixel-perfect PDF settlement reports
- **Cloud Hosting**: Railway (continuous 24/7 container execution with persistent WebSockets)

---

## Project Structure

```
BiddingSite/
├── docs/                             # Engineering and architecture specifications
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── AUCTION_RULES_AND_LOGIC.md
│   ├── WORKFLOWS_AND_ROLES.md
│   ├── API_AND_WEBSOCKET_SPEC.md
│   └── DEPLOYMENT_GUIDE.md
├── src/                              # Application source code
├── tests/                            # Unit and integration test suites
│   ├── unit/                         # Core calculation & validation tests
│   └── integration/                  # WebSocket & API lifecycle tests
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development & Collaboration Protocol

To ensure deep understanding and hands-on mastery of the codebase:

1. **Hands-On Coding**:
   - The assistant provides terminal commands, structured explanations, and production-grade code snippets.
   - The developer writes and inspects the code manually into their workspace to learn the mechanics of every component.
2. **Strict Test-Driven Discipline (TDD)**:
   - Every module (Bid Calculator, Anti-Sniping Timer, Magic Link Auth, Decrement Validator) **must** have dedicated test files before or alongside implementation.
   - **Dual Testing Standard**:
     - **Positive Tests**: Verifying the expected happy paths (e.g., valid decrement placed, timer extension triggered, L1 updated).
     - **Negative Tests**: Verifying intentional rejections and boundaries (e.g., bid > max allowed, bid from unapproved vendor, bid after hard stop, invalid decrements, concurrent duplicate bids).


