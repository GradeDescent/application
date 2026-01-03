import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const now = new Date();
  const rates = [
    { metric: 'vision_page', unitPriceMicrodollars: 5000n },
    { metric: 'split_tex', unitPriceMicrodollars: 10000n },
    { metric: 'grade_problem', unitPriceMicrodollars: 3000n },
  ];

  for (const rate of rates) {
    const existing = await prisma.rateCard.findFirst({
      where: {
        metric: rate.metric,
        active: true,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!existing) {
      await prisma.rateCard.create({
        data: {
          metric: rate.metric,
          unitPriceMicrodollars: rate.unitPriceMicrodollars,
          active: true,
          effectiveFrom: now,
        },
      });
    }
  }
}

await main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
