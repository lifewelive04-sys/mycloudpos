const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { signCustomerToken } = require('../lib/jwt');
const { requireCustomer } = require('../middleware/auth');
const router = express.Router();
const signupSchema = z.object({
  slug: z.string(), // business slug from the shop link, e.g. ?shop=slug
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});
// POST /api/customers/signup — this is the step after "Install" in the
// simulated app-install screen: a shopper creates an account tied to the
// specific business whose shop link/QR code they scanned.
router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { slug, fullName, email, phone, password } = parsed.data;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return res.status(404).json({ error: 'Store not found' });
  const existing = await prisma.customer.findUnique({
    where: { businessId_email: { businessId: business.id, email } },
  });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists for this store' });
  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await prisma.customer.create({
    data: { businessId: business.id, fullName, email, phone, passwordHash },
  });
  const token = signCustomerToken(customer);
  res.status(201).json({
    token,
    customer: { id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, address: customer.address },
    business: { slug: business.slug, name: business.name },
  });
});
const loginSchema = z.object({
  slug: z.string(),
  email: z.string().email(),
  password: z.string().min(1),
});
// POST /api/customers/login — returning shopper signs back into a specific store
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { slug, email, password } = parsed.data;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return res.status(404).json({ error: 'Store not found' });
  const customer = await prisma.customer.findUnique({
    where: { businessId_email: { businessId: business.id, email } },
  });
  if (!customer) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, customer.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signCustomerToken(customer);
  res.json({
    token,
    customer: { id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, address: customer.address },
    business: { slug: business.slug, name: business.name },
  });
});
// GET /api/customers/me — used on app open to check "is this shopper already
// signed in on this device" (skips the install/signup screen if so), and to
// pre-fill the delivery/profile forms with what's already on file.
router.get('/me', requireCustomer, async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customer.sub } });
  if (!customer) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: customer.id,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    latitude: customer.latitude,
    longitude: customer.longitude,
  });
});
const profileUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
// PATCH /api/customers/me — shopper updates their own name/phone/address, or
// saves their delivery address + GPS coordinates so it auto-fills next time.
router.patch('/me', requireCustomer, async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.update({
    where: { id: req.customer.sub },
    data: parsed.data,
  });
  res.json({
    id: customer.id,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    latitude: customer.latitude,
    longitude: customer.longitude,
  });
});
module.exports = router;
