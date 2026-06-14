import { isAuthorized } from "../lib/auth.js";
import {
  SCORING_ENGINE_VERSION,
  extractCartolaRoundSnapshot,
  getCartolaMatches,
  getCartolaRounds,
  getCartolaScoredAthletes,
  getCartolaStatus,
  getCartolaTeamById,
} from "../lib/cartola.js";
import {
  createSyncRun,
  finishSyncRun,
  getParticipantsForSync,
  saveRawPayload,
  upsertRoundScore,
  upsertRoundsFromCartola,
} from "../lib/db.js";

function safeAuthorized(req) {
  try {
    return isAuthorized(req);
  } catch (e) {
    return false;
  }
}

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

function hasCronSecret(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = one(req.query.secret) || req.headers["x-cron-secret"] || req.headers["X-Cron-Secret"];
  return provided === expected;
}

function canRun(req) {
  return safeAuthorized(req) || hasCronSecret(req);
}

async function runPool(items, limit, worker) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

function roundFromRequest(req, status) {
  const requested = Number(one(req.query.roundId) || one(req.query.round) || (req.body && req.body.roundId));
  if (Number.isFinite(requested) && requested > 0) return Math.trunc(requested);
  const current = Number(status.rodada_atual);
  return Number.isFinite(current) && current > 0 ? Math.trunc(current) : null;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Método não permitido" });
  }

  if (!canRun(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const competition = one(req.query.competition) === "brasileirao" ? "brasileirao" : "copa";
  let run = null;

  try {
    run = await createSyncRun({
      competition,
      status: "running",
      message: "Sincronização iniciada.",
    });

    const [status, rounds, matches] = await Promise.all([
      getCartolaStatus(competition),
      getCartolaRounds(competition),
      getCartolaMatches(competition),
    ]);

    const roundId = roundFromRequest(req, status);
    if (!roundId) {
      throw new Error("O Cartola não informou a rodada atual.");
    }

    await Promise.all([
      saveRawPayload("/mercado/status", `${competition}:status`, 200, status),
      saveRawPayload("/rodadas", `${competition}:rounds`, 200, rounds),
      saveRawPayload("/partidas", `${competition}:matches:${roundId}`, 200, matches),
      upsertRoundsFromCartola(rounds, matches, status),
    ]);

    let scoredAthletes = null;
    try {
      scoredAthletes = await getCartolaScoredAthletes(competition);
      await saveRawPayload("/atletas/pontuados", `${competition}:scored-athletes:${roundId}`, 200, scoredAthletes);
    } catch (e) {
      await saveRawPayload("/atletas/pontuados", `${competition}:scored-athletes:${roundId}:error`, e.status || 0, {
        message: e.message || "Erro ao consultar atletas pontuados",
        payload: e.payload || null,
      });
    }

    const participants = await getParticipantsForSync();
    if (!participants.length) {
      const finished = await finishSyncRun(run.id, {
        status: "empty",
        roundId,
        message: "Nenhum participante vinculado a um time do Cartola.",
        details: { roundId, participants: 0 },
      });
      return res.status(200).json({ ok: true, sync: finished });
    }

    const results = await runPool(participants, 4, async (participant) => {
      const endpoint = `/time/id/${participant.cartolaTimeId}/${roundId}`;
      try {
        const payload = await getCartolaTeamById(participant.cartolaTimeId, roundId, competition, { timeoutMs: 7000 });
        await saveRawPayload(endpoint, `${competition}:team:${participant.cartolaTimeId}:round:${roundId}`, 200, payload);
        const snapshot = extractCartolaRoundSnapshot(payload, scoredAthletes, matches);
        const points = snapshot?.points ?? null;
        if (points == null) {
          return {
            ok: false,
            skipped: true,
            participantId: participant.id,
            cartolaTimeId: participant.cartolaTimeId,
            error: `Cartola ainda não liberou pontos para este time na rodada ${roundId}.`,
          };
        }
        await upsertRoundScore(participant, roundId, payload, points, snapshot);
        return {
          ok: true,
          participantId: participant.id,
          cartolaTimeId: participant.cartolaTimeId,
          points,
          playedCount: snapshot?.playedCount ?? null,
          lineupCount: snapshot?.lineupCount ?? null,
        };
      } catch (e) {
        await saveRawPayload(endpoint, `${competition}:team:${participant.cartolaTimeId}:round:${roundId}:error`, e.status || 0, {
          message: e.message || "Erro ao consultar time",
          payload: e.payload || null,
        });
        return {
          ok: false,
          participantId: participant.id,
          cartolaTimeId: participant.cartolaTimeId,
          error: e.message || "Erro ao consultar time",
          status: e.status || null,
        };
      }
    });

    const updatedCount = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => r.skipped);
    const errors = results.filter((r) => !r.ok && !r.skipped);
    const finalStatus = errors.length
      ? updatedCount
        ? "partial"
        : "error"
      : skipped.length
        ? updatedCount
          ? "partial"
          : "pending_points"
        : "success";
    const message =
      finalStatus === "success"
        ? `Rodada ${roundId} sincronizada com sucesso.`
        : finalStatus === "pending_points"
          ? `O Cartola ainda não liberou pontuação da rodada ${roundId}. Tente novamente mais tarde.`
        : finalStatus === "partial"
          ? `Rodada ${roundId} sincronizada parcialmente. ${updatedCount} atualizado(s), ${skipped.length} sem pontos e ${errors.length} erro(s).`
          : `Não foi possível sincronizar a rodada ${roundId}.`;

    const finished = await finishSyncRun(run.id, {
      status: finalStatus,
      roundId,
      message,
      updatedCount,
      errorCount: errors.length,
      details: {
        roundId,
        scoringEngine: SCORING_ENGINE_VERSION,
        participants: participants.length,
        updated: results.filter((r) => r.ok).map((r) => ({
          participantId: r.participantId,
          cartolaTimeId: r.cartolaTimeId,
          points: r.points,
          playedCount: r.playedCount,
          lineupCount: r.lineupCount,
        })),
        errors: errors.slice(0, 20),
        skipped: skipped.slice(0, 20),
      },
    });

    return res.status(finalStatus === "error" ? 502 : 200).json({ ok: finalStatus !== "error", sync: finished });
  } catch (e) {
    if (run) {
      await finishSyncRun(run.id, {
        status: "error",
        message: e.message || "Erro durante a sincronização.",
        details: { error: e.message || "Erro desconhecido" },
        errorCount: 1,
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Erro ao sincronizar com o Cartola.",
      detail: e.message || "Erro desconhecido",
    });
  }
}
