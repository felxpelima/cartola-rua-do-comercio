// Re-sincroniza a pontuação de UMA rodada (RoundScore) direto do Cartola, usando
// o mesmo motor de pontuação do sync normal (lib/cartola + lib/db). Serve para
// corrigir uma rodada já consolidada que foi gravada errada — por exemplo, a
// rodada que herdou o `pontos` defasado da rodada anterior (snapshot da rodada
// passada devolvido pelo /time/id numa janela após o fim dos jogos).
//
// Diferente do clear-round-scores.mjs, NÃO apaga nada: regrava os pontos certos.
// Respeita overrides manuais (manualPoints continua valendo, igual ao sync).
//
// Uso:  node scripts/resync-round.mjs <roundId> [competition]
// Ex.:  node scripts/resync-round.mjs 3            (copa, padrão)
//       node scripts/resync-round.mjs 3 brasileirao
//
// Precisa do DATABASE_URL apontando para o banco certo (ex.: `npx vercel env pull .env`).

import {
  buildRoundScoreRawPayload,
  extractCartolaRoundSnapshot,
  getCartolaMatches,
  getCartolaScoredAthletes,
  getCartolaTeamById,
} from "../lib/cartola.js";
import { getParticipantsForSync, upsertRoundScore } from "../lib/db.js";
import { prisma } from "../lib/prisma.js";

const roundId = Number(process.argv[2]);
const competition = process.argv[3] === "brasileirao" ? "brasileirao" : "copa";

if (!Number.isFinite(roundId) || roundId <= 0) {
  console.error("Uso: node scripts/resync-round.mjs <roundId> [competition]");
  console.error("Ex.: node scripts/resync-round.mjs 3");
  process.exit(1);
}

const matches = await getCartolaMatches(competition);
let scored = null;
try {
  scored = await getCartolaScoredAthletes(competition);
} catch (e) {
  scored = null;
}
// Só usa a parcial se o /atletas/pontuados for desta rodada (numa rodada passada
// ele costuma trazer a rodada corrente; aí a parcial não vale e usamos o oficial).
const scoredRound = Number(scored?.rodada ?? scored?.rodada_id);
const scoredForRound = !Number.isFinite(scoredRound) || scoredRound === roundId ? scored : null;

const participants = await getParticipantsForSync();
console.log(`Re-sincronizando rodada ${roundId} (${competition}) para ${participants.length} time(s)...\n`);

let fixed = 0;
let unchanged = 0;
let skipped = 0;

for (const participant of participants) {
  try {
    const payload = await getCartolaTeamById(participant.cartolaTimeId, roundId, competition, { timeoutMs: 9000 });
    const snapshot = extractCartolaRoundSnapshot(payload, scoredForRound, matches, roundId);
    const points = snapshot?.points ?? null;
    if (points == null) {
      skipped += 1;
      console.log(`  pulado  ${participant.nome} (${participant.cartolaTimeId}) — sem pontos confiáveis nesta rodada.`);
      continue;
    }

    const before = await prisma.roundScore.findUnique({
      where: { participantId_roundId: { participantId: participant.id, roundId } },
      select: { finalPoints: true, autoPoints: true },
    });
    const rawPayload = buildRoundScoreRawPayload(payload, scoredForRound, matches);
    await upsertRoundScore(participant, roundId, rawPayload, points, snapshot);

    const prev = before?.autoPoints ?? before?.finalPoints ?? null;
    if (prev != null && Math.abs(Number(prev) - points) > 0.005) {
      fixed += 1;
      console.log(`  CORRIGIDO ${participant.nome} (${participant.cartolaTimeId}): ${prev} -> ${points}`);
    } else {
      unchanged += 1;
    }
  } catch (e) {
    skipped += 1;
    console.log(`  erro    ${participant.nome} (${participant.cartolaTimeId}): ${e.message || e}`);
  }
}

console.log(`\n✅ Rodada ${roundId}: ${fixed} corrigido(s), ${unchanged} sem mudança, ${skipped} pulado(s).`);
console.log("Os totais atualizam na próxima vez que a página pública recarregar (cache de ~15s/60s).");

await prisma.$disconnect();
