require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/business');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const shopRoutes = require('./routes/shop');
const shopAIRoutes = require('./routes/shopAI');
const publicShopPage = require('./routes/publicShop');
const app = express();
// contentSecurityPolicy is off because the frontend app (served as static
// files below) loads several external CDN scripts — Chart.js, xlsx, jsPDF,
// Quagga, Paystack — which helmet's default strict CSP would otherwise block.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Serves cloud-pos-app.html (as public/index.html) at the root URL, so the
// full POS app is reachable at https://your-domain — not just the API.
app.use(express.static(path.join(__dirname, '..', 'public')));
// Basic rate limiting on auth endpoints to slow down credential stuffing.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth/login', authLimiter);
app.use('/api/customers/login', authLimiter);
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/shop', shopAIRoutes); // adds POST /api/shop/ai-assist
app.use('/shop', publicShopPage); // real page the QR code points to, e.g. https://yourdomain.com/shop/demo-store-x7f2ac
// Central error handler — keeps stack traces out of responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Cloud POS backend listening on port ${PORT}`);
});
