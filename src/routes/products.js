const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const cloudinary = require('../lib/cloudinary');
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
// POST /api/products/upload-image — takes a base64 data URI from the POS's
// camera/file-upload feature, uploads it to Cloudinary, and returns the
// resulting hosted URL. Keeps actual photo bytes out of Postgres and out of
// the browser's local IndexedDB cache — important once a business has
// thousands of products, where storing full photos inline would bloat both.
router.post('/upload-image', async (req, res) => {
  const schema = z.object({ image: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({ error: 'Image hosting is not configured on this server yet.' });
  }
  try {
    const result = await cloudinary.uploader.upload(parsed.data.image, {
      folder: `chabama/${req.staff.businessId}`,
      resource_type: 'image',
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    res.status(502).json({ error: 'Image upload failed. Please try again.' });
  }
});
const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().optional(),
  // Real hosted URLs only — the client uploads photos to Cloudinary first
  // (via POST /upload-image above) and sends the resulting URL here, so raw
  // base64 photo data never gets stored directly in this table.
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
