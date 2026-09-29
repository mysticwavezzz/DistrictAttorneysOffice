import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + opts.windowMs);
  const hashedKey = createHash("sha256").update(key).digest("hex");
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${hashedKey}, 1, ${resetAt})
    ON CONFLICT("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"
  `);
  const count = rows[0]?.count ?? opts.limit + 1;
  return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count) };
}

export async function releaseRateLimit(key: string): Promise<void> {
  const hashedKey = createHash("sha256").update(key).digest("hex");
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitBucket" WHERE "key" = ${hashedKey} AND "count" <= 1
  `);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RateLimitBucket" SET "count" = "count" - 1 WHERE "key" = ${hashedKey} AND "count" > 1
  `);
}
