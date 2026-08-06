const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireStaff, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireStaff);

// GET /api/business — the logged-in staff member's business profile
router.get('/', async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.staff.businessId } });
  res.json(business);
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  ownerName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional(),
  currency: z.string().optional(),
});

// PATCH /api/business — owner/manager updates store profile (name, logo, currency, etc.)
router.patch('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const business = await prisma.business.update({
    where: { id: req.staff.businessId },
    data: parsed.data,
  });
  res.json(business);
});

// GET /api/business/staff — owner/manager views the staff list
router.get('/staff', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { businessId: req.staff.businessId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  res.json(staff);
});

module.exports = router;
