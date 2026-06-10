import { PrismaClient } from "@prisma/client";

// Reaproveita a mesma instância entre invocações "quentes" da função,
// evitando abrir conexões demais no ambiente serverless.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
