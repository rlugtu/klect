import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "ryanlugtu+klectqa@gmail.com" },
  });

  for (let i = 1; i <= 4; i++) {
    const list = await prisma.list.create({
      data: {
        name: `QA List ${i}`,
        ownerId: user.id,
        memberships: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
    const bookmarkCount = i === 1 ? 21 : 2;
    for (let b = 1; b <= bookmarkCount; b++) {
      await prisma.bookmark.create({
        data: {
          listId: list.id,
          name: `QA Bookmark ${i}-${b}`,
          urls: [`https://example.com/${i}-${b}`],
        },
      });
    }
    console.log(`Created ${list.name} with ${bookmarkCount} bookmarks`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
