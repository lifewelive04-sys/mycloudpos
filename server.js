// ================================================================
// Cloud POS — real shared backend ("pos-backend")
//
// Referenced by the console (cloud-pos-app.html) in two places:
//  1. Online Store Settings > "Connect to a live backend" —
//     window.RealBackend calls POST /api/auth/register,
//     POST /api/auth/login, GET/POST/PATCH /api/products.
//  2. The public "/shop/:slug" link/QR code — the console's own
//     bootPublicShop()/loadLiveShop() detects that path, fetches
//     GET /api/shop/:slug for real business+product data, and posts
//     orders to POST /api/shop/:slug/orders. This makes the exact
//     same storefront UI the owner sees work for real customers on
//     their own devices, not just the owner's own browser.
//
// This single server does double duty: it serves the console itself
// (so shop owners can just open this URL directly, no separate
// hosting needed) AND the API + public shop pages, all from one
// origin — avoiding CORS entirely.
//
// Storage: a single JSON file (data/db.json) via lowdb. Zero-config
// so it runs immediately on Railway. IMPORTANT: Railway's default
// filesystem is ephemeral — the file resets on every redeploy. For
// real production use, attach a Railway Volume (Settings > Volumes,
// mount at /data) so data survives deploys. See README.md.
// ================================================================

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const adapter = new FileSync(DB_PATH);
const db = low(adapter);
db.defaults({ businesses: [], products: [], orders: [] }).write();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    '[pos-backend] WARNING: JWT_SECRET is not set. Using an insecure ' +
    'built-in fallback — set a real JWT_SECRET environment variable ' +
    'before using this with real customer data.'
  );
}
const SECRET = JWT_SECRET || 'dev-only-insecure-secret-change-me';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // generous — product photos can be data URLs

function newId() { return crypto.randomUUID(); }

function slugify(name) {
  const base = (name || 'shop').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'shop';
  let slug = base, i = 1;
  const taken = new Set(db.get('businesses').map((b) => b.slug).value());
  while (taken.has(slug)) slug = `${base}-${++i}`;
  return slug;
}

function signToken(business) {
  return jwt.sign({ businessId: business.id }, SECRET, { expiresIn: '90d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });
  try {
    const payload = jwt.verify(token, SECRET);
    const business = db.get('businesses').find({ id: payload.businessId }).value();
    if (!business) return res.status(401).json({ error: 'Business not found.' });
    req.business = business;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function publicBusiness(b) {
  return { id: b.id, name: b.name, slug: b.slug, logo: b.logo || null, status: b.status || 'Open' };
}
// Shape expected by the console's ShopView (see mapProductForOnlineStore
// and the state.products.filter(p=>p.visible!==false) calls throughout).
function publicProduct(p) {
  return {
    id: p.id, name: p.name, category: p.category || 'Other',
    price: p.price, stock: p.stock, image: p.image || null,
    description: p.description || '', visible: p.inShop !== false,
    createdAt: p.createdAt,
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------
// Auth (owner console — window.RealBackend)
// ---------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const { businessName, ownerName, email, password } = req.body || {};
  if (!businessName || !email || !password) {
    return res.status(400).json({ error: 'businessName, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const existing = db.get('businesses').find({ email: cleanEmail }).value();
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists. Try logging in instead.' });
  }
  const business = {
    id: newId(), name: businessName, slug: slugify(businessName),
    ownerName: ownerName || 'Owner', email: cleanEmail,
    passwordHash: bcrypt.hashSync(String(password), 10),
    logo: null, visible: true, acceptingOrders: true, status: 'Open',
    createdAt: new Date().toISOString(),
  };
  db.get('businesses').push(business).write();
  const token = signToken(business);
  res.status(201).json({ token, business: publicBusiness(business) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const business = db.get('businesses').find({ email: cleanEmail }).value();
  if (!business || !bcrypt.compareSync(String(password), business.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const token = signToken(business);
  res.json({ token, business: publicBusiness(business) });
});

// ---------------------------------------------------------------
// Products (owner-only, authenticated — window.RealBackend.pushProducts)
// ---------------------------------------------------------------
app.get('/api/products', requireAuth, (req, res) => {
  res.json(db.get('products').filter({ businessId: req.business.id }).value());
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, price, stock, category, inShop, image, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Product name is required.' });
  const product = {
    id: newId(), businessId: req.business.id, name,
    price: Number(price) || 0, stock: Number(stock) || 0,
    category: category || 'Other', inShop: inShop !== false,
    image: image || null, description: description || '',
    createdAt: new Date().toISOString(),
  };
  db.get('products').push(product).write();
  res.status(201).json(product);
});

app.patch('/api/products/:id', requireAuth, (req, res) => {
  const product = db.get('products').find({ id: req.params.id, businessId: req.business.id }).value();
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const { name, price, stock, category, inShop, image, description } = req.body || {};
  const updated = {
    ...product,
    ...(name !== undefined ? { name } : {}),
    ...(price !== undefined ? { price: Number(price) || 0 } : {}),
    ...(stock !== undefined ? { stock: Number(stock) || 0 } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(inShop !== undefined ? { inShop: !!inShop } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(description !== undefined ? { description } : {}),
  };
  db.get('products').find({ id: req.params.id }).assign(updated).write();
  res.json(updated);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  db.get('products').remove({ id: req.params.id, businessId: req.business.id }).write();
  res.status(204).end();
});

// ---------------------------------------------------------------
// Owner-only: orders placed by customers on the live storefront
// ---------------------------------------------------------------
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.get('orders').filter({ businessId: req.business.id })
    .sortBy((o) => o.createdAt).reverse().value();
  res.json(orders);
});

app.patch('/api/orders/:id', requireAuth, (req, res) => {
  const order = db.get('orders').find({ id: req.params.id, businessId: req.business.id }).value();
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const { status } = req.body || {};
  if (status) db.get('orders').find({ id: req.params.id }).assign({ status }).write();
  res.json(db.get('orders').find({ id: req.params.id }).value());
});

// ---------------------------------------------------------------
// PUBLIC live shop — no auth. This is what the console's own
// loadLiveShop()/checkout code calls when a customer opens /shop/:slug.
// ---------------------------------------------------------------
app.get('/api/shop/:slug', (req, res) => {
  const business = db.get('businesses').find({ slug: req.params.slug }).value();
  if (!business) return res.status(404).json({ error: 'This store link isn\u2019t available.' });
  if (!business.visible) return res.status(404).json({ error: 'This store link isn\u2019t available.' });
  const products = db.get('products').filter({ businessId: business.id }).value();
  res.json({ business: publicBusiness(business), products: products.map(publicProduct) });
});

app.post('/api/shop/:slug/orders', (req, res) => {
  const business = db.get('businesses').find({ slug: req.params.slug }).value();
  if (!business) return res.status(404).json({ error: 'This store link isn\u2019t available.' });
  if (!business.acceptingOrders) return res.status(400).json({ error: 'This shop is not accepting orders right now.' });

  const { items, customer, method, notes } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cart is empty.' });
  if (!customer || !customer.name || !customer.phone) {
    return res.status(400).json({ error: 'Customer name and phone are required.' });
  }

  // Re-validate against real stock/price server-side — never trust the
  // numbers the client sent for the actual charge.
  const resolvedItems = [];
  for (const ci of items) {
    const product = db.get('products').find({ id: ci.productId, businessId: business.id }).value();
    if (!product) return res.status(400).json({ error: `Product ${ci.productId} not found.` });
    const qty = Number(ci.qty) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Invalid quantity.' });
    if (product.stock < qty) {
      return res.status(409).json({ error: `${product.name} only has ${product.stock} left in stock.` });
    }
    resolvedItems.push({ productId: product.id, name: product.name, price: product.price, qty });
  }
  resolvedItems.forEach((i) => {
    const product = db.get('products').find({ id: i.productId }).value();
    db.get('products').find({ id: i.productId }).assign({ stock: Math.max(0, product.stock - i.qty) }).write();
  });

  const total = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const order = {
    id: newId().slice(0, 8).toUpperCase(),
    businessId: business.id,
    items: resolvedItems,
    customer,
    method: method || 'delivery',
    notes: notes || '',
    total,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  db.get('orders').push(order).write();
  res.status(201).json({ order });
});

// ---------------------------------------------------------------
// Static frontend — serves the Cloud POS console itself, so one
// Railway service hosts both the app and this API at the same origin.
// ---------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// A shop link looks like /shop/:slug — serve the same console there so
// the browser boots the app; the app's own client-side script (see
// bootPublicShop/loadLiveShop in cloud-pos-app.html) detects that path
// and fetches GET /api/shop/:slug for live data.
app.get('/shop/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Anything else falls back to the app shell too (client-side routing
// uses #hash tabs, so this only matters for a bare "/" and unknown
// paths). Express 5 requires a named wildcard instead of a bare '*'.
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[pos-backend] listening on port ${PORT}`);
});
