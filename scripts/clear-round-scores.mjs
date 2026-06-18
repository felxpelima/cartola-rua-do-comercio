// Apaga as pontuações (RoundScore) de uma rodada específica.
// Útil para limpar dados gravados errado (ex.: rodada que ainda não começou e
// recebeu pontos duplicados da rodada anterior). NÃO apaga participantes nem o
// histórico das outras rodadas — só os scores da rodada informada.
//
// Uso:  node scripts/clear-round-scores.mjs <roundId>
// Ex.:  node scripts/clear-round-scores.mjs 2
//
// Precisa do DATABASE_URL apontando para o banco certo (ex.: `npx vercel env pull .env`).

import { prisma } from "../lib/prisma.js";

const roundId = Number(process.argv[2]);

if (!Number.isFinite(roundId) || roundId <= 0) {
  console.error("Uso: node scripts/clear-round-scores.mjs <roundId>");
  console.error("Ex.: node scripts/clear-round-scores.mjs 2   (apaga as pontuações da rodada 2)");
  process.exit(1);
}

const before = await prisma.roundScore.count({ where: { roundId } });
console.log(`Rodada ${roundId}: ${before} pontuação(ões) encontrada(s).`);

if (before === 0) {
  console.log("Nada para apagar. Saindo.");
  await prisma.$disconnect();
  process.exit(0);
}

const result = await prisma.roundScore.deleteMany({ where: { roundId } });
console.log(`✅ Removidas ${result.count} pontuação(ões) da rodada ${roundId}.`);
console.log("Os totais voltam ao normal na próxima vez que a página pública carregar.");

await prisma.$disconnect();
