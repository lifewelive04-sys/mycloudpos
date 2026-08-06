const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const business = await prisma.business.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      slug: 'demo-store',
      name: 'Demo Store',
      ownerName: 'Ama Owusu',
      currency: 'GHS',
      users: {
        create: {
          name: 'Ama Owusu',
          email: 'owner@demo-store.test',
          passwordHash,
          role: 'OWNER',
        },
      },
      products: {
        create: [
          { name: 'Bottled Water 500ml', category: 'Drinks', price: 5, cost: 3, stock: 100 },
          { name: 'Meat Pie', category: 'Snacks', price: 15, cost: 8, stock: 40 },
          { name: 'Rice 5kg Bag', category: 'Groceries', price: 90, cost: 70, stock: 20 },
        ],
      },
    },
  });

  console.log('Seeded demo business:', business.slug);
  console.log('Login with: owner@demo-store.test / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
