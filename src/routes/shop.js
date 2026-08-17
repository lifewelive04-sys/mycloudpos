const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireStaff } = require('../middleware/auth');
const { requireCustomer } = require('../middleware/auth');

const router = express.Router();

// GET /api/shop/orders/business — STAFF-ONLY. Real orders placed by real
// customers through the live storefront, for the owner/manager's Orders
// page. Placed above the "/:slug" route further down isn't required since
// this path has two segments and "/:slug" only ever matches one — but it's
// kept near the top for clarity.
router.get('/orders/business', requireStaff, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { businessId: req.staff.businessId },
    include: {
      customer: { select: { fullName: true, phone: true, email: true } },
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

// GET /api/shop/:slug — PUBLIC. Storefront info + products for a shop link/QR scan.
// This is what the customer's phone loads first when it hits the real,
// publicly-hosted share link (e.g. https://yourapp.com/shop/:slug).
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { slug: true, name: true, logoUrl: true, currency: true },
  });
  if (!business) return res.status(404).json({ error: 'Store not found' });

  const products = await prisma.product.findMany({
    where: { business: { slug: req.params.slug }, inShop: true },
    select: { id: true, name: true, category: true, price: true, image: true, stock: true },
    orderBy: { name: 'asc' },
  });

  res.json({ business, products });
});

// GET /api/shop-link — for the logged-in owner/manager's "Share your shop" box.
// Returns the real, public URL + slug to encode into the QR code — this is
// the fix for the QR pointing at a file:// or unreachable local address.
router.get('/meta/share-link', requireStaff, async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.staff.businessId },
    select: { slug: true, name: true },
  });
  const baseUrl = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    slug: business.slug,
    name: business.name,
    shopUrl: `${baseUrl}/shop/${business.slug}`,
  });
});

const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

const orderSchema = z.object({
  slug: z.string(),
  items: z.array(orderItemSchema).min(1),
  fulfillment: z.string().optional(),
});

// POST /api/shop/order — a signed-in customer places an order from the storefront
router.post('/order/place', requireCustomer, async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { slug, items, fulfillment } = parsed.data;

  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business || business.id !== req.customer.businessId) {
    return res.status(403).json({ error: 'Customer does not belong to this store' });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, businessId: business.id },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      let total = 0;
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        total += Number(product.price) * item.quantity;
      }

      const created = await tx.order.create({
        data: {
          businessId: business.id,
          customerId: req.customer.sub,
          total,
          fulfillment,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: productMap.get(item.productId).price,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/shop/order/mine — a signed-in customer's own order history
router.get('/order/mine', requireCustomer, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.customer.sub },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

module.exports = router;
