const express = require('express');
const { nanoid } = require('nanoid');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.string().optional(),
});

// POST /api/sales — ring up a sale at the till. Decrements stock atomically.
router.post('/', requireStaff, async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { items, paymentMethod } = parsed.data;
  const businessId = req.staff.businessId;

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, businessId },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      let total = 0;
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
        total += Number(product.price) * item.quantity;
      }

      const created = await tx.sale.create({
        data: {
          businessId,
          cashierId: req.staff.sub,
          total,
          paymentMethod,
          clientTxnId: nanoid(12),
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

    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sales — list recent sales for the business (for Reports)
router.get('/', requireStaff, async (req, res) => {
  const sales = await prisma.sale.findMany({
    where: { businessId: req.staff.businessId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(sales);
});

// GET /api/sales/verify/:clientTxnId — PUBLIC, no login required.
// Used when a customer scans the QR code printed on their receipt.
router.get('/verify/:clientTxnId', async (req, res) => {
  const sale = await prisma.sale.findUnique({
    where: { clientTxnId: req.params.clientTxnId },
    include: { items: { include: { product: true } }, business: true },
  });
  if (!sale) return res.status(404).json({ error: 'Receipt not found' });

  res.json({
    businessName: sale.business.name,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    createdAt: sale.createdAt,
    items: sale.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
  });
});

module.exports = router;
