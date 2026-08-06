const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(requireStaff);

// GET /api/products — list all products for the logged-in staff's business
router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { businessId: req.staff.businessId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(products);
});

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().optional(),
  image: z.string().url().optional(),
  inShop: z.boolean().optional(),
});

// POST /api/products — create a product
router.post('/', async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await prisma.product.create({
    data: { ...parsed.data, businessId: req.staff.businessId },
  });
  res.status(201).json(product);
});

// PATCH /api/products/:id — update a product (price, stock, name, inShop toggle, etc.)
router.patch('/:id', async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.staff.businessId },
  });
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.staff.businessId },
  });
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  await prisma.product.delete({ where: { id: existing.id } });
  res.status(204).end();
});

module.exports = router;
