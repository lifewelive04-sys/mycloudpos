# Cloud POS — Backend (Node.js + Express + PostgreSQL)

A real, persistent backend for the Cloud POS app. Replaces the in-browser
"fake backend" with actual server-side auth, a real database, and public
endpoints that make the "Share your shop" QR code work for real customers.

## What's included (v1 foundation)

- **Auth**: business registration + staff login (owner/manager/cashier), JWT-based
- **Products/inventory**: full CRUD, scoped per business
- **Sales (POS)**: ring up a sale, atomically decrements stock, generates a
  receipt ID for QR verification
- **Customers**: online-shop signup/login, scoped per business (this is the
  step that happens after the simulated "Install" screen)
- **Online store**: public storefront endpoint (`/api/shop/:slug`) anyone can
  hit without logging in, real "share link" endpoint for the QR code, and
  order placement for signed-in customers
- **Business profile / staff list**: Settings page endpoints

## Not yet included (next phases)

Suppliers, Reports/analytics endpoints, Backups, Audit log, Admin panel.
The current schema and route structure make these straightforward to add
the same way — say the word and I'll build them next.

## 1. Local setup

```bash
cd pos-backend
npm install
cp .env.example .env      # then edit .env with real secrets
docker compose up -d      # starts a local Postgres on :5432
npx prisma migrate dev --name init
npm run seed               # optional demo data: owner@demo-store.test / password123
npm run dev
```

The API is now running at `http://localhost:4000`. Try:

```bash
curl http://localhost:4000/health
```

## 2. Deploying for real (so the QR code actually works)

The QR/share-link problem you hit ("store link isn't available") happens
because the old version encoded whatever URL was in your browser bar — which
doesn't mean anything to your customer's phone if you're running the file
locally.

Once this backend is deployed somewhere public (Render, Railway, a VPS,
Fly.io, etc.) and you set `PUBLIC_APP_URL` in `.env` to your real domain,
`GET /api/shop/meta/share-link` returns a real, working URL like:

```
https://yourdomain.com/shop/demo-store-x7f2ac
```

That's what should be encoded into the QR code and copy-link box — not
`window.location.href` from the browser tab. See the "Frontend integration"
section below for the one function that needs to change in the existing
HTML file.

## 3. Environment variables

See `.env.example`. At minimum for production, set:
- `DATABASE_URL` — your real Postgres connection string
- `JWT_STAFF_SECRET` / `JWT_CUSTOMER_SECRET` — long random strings (`openssl rand -hex 32`)
- `PUBLIC_APP_URL` — your real public domain
- `CORS_ORIGIN` — your frontend's real domain (not `*`, once in production)

## 4. API overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | none | Create a business + owner account |
| POST | `/api/auth/login` | none | Staff login |
| POST | `/api/auth/staff` | owner/manager | Create a cashier/manager account |
| GET | `/api/auth/me` | staff | Current staff user + business |
| GET/POST/PATCH/DELETE | `/api/products` | staff | Inventory CRUD |
| POST | `/api/sales` | staff | Ring up a sale, decrement stock |
| GET | `/api/sales` | staff | Recent sales (for Reports) |
| GET | `/api/sales/verify/:clientTxnId` | none | Public receipt QR verification |
| POST | `/api/customers/signup` | none | Shopper signup (post-"Install" step) |
| POST | `/api/customers/login` | none | Shopper login |
| GET | `/api/customers/me` | customer | "Am I already signed in on this device" |
| GET | `/api/shop/:slug` | none | Public storefront: business info + products |
| GET | `/api/shop/meta/share-link` | staff | Real public shop URL + slug for the QR code |
| POST | `/api/shop/order/place` | customer | Place an order |
| GET | `/api/shop/order/mine` | customer | A shopper's own order history |
| GET/PATCH | `/api/business` | staff | Store profile (Settings page) |
| GET | `/api/business/staff` | owner/manager | Staff list |

## 5. Frontend integration — done (v1 slice)

`cloud-pos-app.html` now has a **"Connect to a live backend"** panel under
Online Store → Online Store Settings, right below "Share your shop". It:

1. Takes your deployed backend's public URL (e.g. `https://your-app.onrender.com`)
2. Creates (or logs into) a real account on that backend
3. Once connected, the Share-your-shop link and QR code automatically switch
   to the real, public URL — `https://your-app.onrender.com/shop/your-slug`
   — which any device can open, including a customer's phone
4. A "Push my products now" button copies your visible in-shop products
   over to the live backend so the storefront isn't empty when you test it

**Why the original QR failed:** the rest of the app stores everything in
that browser's own IndexedDB/localStorage. Opening the shop link on a
different device (like scanning it with a phone) hits a database that has
never heard of your business — hence "This store link isn't available."
The live backend fixes this by putting the data on one shared server
instead of scattering it across every device that opens the app.

**Still local-only (not yet synced to the live backend):** sales/POS
transactions, suppliers, reports, staff logins other than the owner, and
edits made after the initial "push products" — those still only live in
this browser until wired up the same way. Say the word if you want any of
those connected next.

### To actually test the QR on your phone
1. Deploy this backend somewhere public (Render/Railway free tier is fine)
2. Set its real URL as `PUBLIC_APP_URL` in its `.env`
3. Open `cloud-pos-app.html`, go to Online Store → Online Store Settings
4. Under "Connect to a live backend," paste that backend's URL, set an
   owner email + password, click Connect
5. Click "Push my products now"
6. Scan the QR — it now opens a real page on the internet, on any device
