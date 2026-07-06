import "server-only";
import { prisma } from "@/lib/db";

/** All of the user's tags with their assigned colors (for colored pills). */
export async function getUserTags(
  userId: string,
): Promise<{ name: string; color: string }[]> {
  return prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { name: true, color: true },
  });
}
