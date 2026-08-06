const express = require('express');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { signStaffToken } = require('../lib/jwt');
const { requireStaff, requireRole } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

// POST /api/auth/register — create a new business + its owner account
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { businessName, ownerName, email, password, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${nanoid(6)}`;

  const business = await prisma.business.create({
    data: {
      slug,
      name: businessName,
      ownerName,
      phone,
      users: {
        create: {
          name: ownerName,
          email,
          passwordHash,
          role: 'OWNER',
        },
      },
    },
    include: { users: true },
  });

  const owner = business.users[0];
  const token = signStaffToken(owner);
  res.status(201).json({
    token,
    business: { id: business.id, slug: business.slug, name: business.name },
    user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login — staff login (owner/manager/cashier)
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email }, include: { business: true } });
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signStaffToken(user);
  res.json({
    token,
    business: { id: user.business.id, slug: user.business.slug, name: user.business.name },
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['MANAGER', 'CASHIER']),
});

// POST /api/auth/staff — owner/manager creates another staff account for their business
router.post('/staff', requireStaff, requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, businessId: req.staff.businessId },
  });

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// GET /api/auth/me — current staff user + business
router.get('/me', requireStaff, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.staff.sub },
    include: { business: true },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    business: { id: user.business.id, slug: user.business.slug, name: user.business.name },
  });
});

module.exports = router;
