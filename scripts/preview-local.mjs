import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { SCORING_ENGINE_VERSION, extractCartolaRoundSnapshot, getCartolaMatches, getCartolaScoredAthletes, getCartolaStatus, getCartolaTeamById, searchCartolaTeams } from "../lib/cartola.js";

const root = process.cwd();
const preferredPort = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

let state = {
  config: {
    titulo: "Liga Rua do Comércio",
    subtitulo: "Copa do Mundo 2026",
    valorPorPessoa: 50,
    pct1: 50,
    pct2: 30,
    pct3: 20,
    ligaSlug: "cartola-rua-do-comercio",
    competition: "copa",
    temporada: 2026,
    mural: "Hoje tem disputa boa: confere teu capitao, manda o print e prepara a resenha.",
  },
  currentRound: { id: 1, nome: "Rodada 1", status: "fechado" },
  lastSync: {
    status: "success",
    finishedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    message: "Rodada 1 sincronizada com sucesso no preview local.",
    updatedCount: 4,
    errorCount: 0,
    details: { errors: [] },
  },
  participants: [
    {
      id: "p1",
      nome: "UGO Comércio FC",
      pontos: 92.13,
      totalPoints: 92.13,
      currentRoundPoints: 92.13,
      average: 92.13,
      bestRound: 92.13,
      worstRound: 92.13,
      cartolaTimeId: 51345451,
      cartolaSlug: "ugo-comercio-fc",
      cartolaTeamName: "UGO Comércio FC",
      cartolaOwnerName: "Ugo",
      source: "cartola",
      rank: 1,
      delta: 2,
      badges: [{ label: "Líder da Rua" }, { label: "Mito da Rodada" }],
    },
    {
      id: "p2",
      nome: "Mercadão United",
      pontos: 81.7,
      totalPoints: 81.7,
      currentRoundPoints: 81.7,
      average: 81.7,
      bestRound: 81.7,
      worstRound: 81.7,
      cartolaTimeId: 10002,
      cartolaTeamName: "Mercadão United",
      cartolaOwnerName: "João",
      source: "cartola",
      rank: 2,
      delta: 0,
      badges: [{ label: "80+" }],
    },
    {
      id: "p3",
      nome: "Banca Central",
      pontos: 75.42,
      totalPoints: 75.42,
      currentRoundPoints: 75.42,
      average: 75.42,
      bestRound: 75.42,
      worstRound: 75.42,
      cartolaTimeId: 10003,
      cartolaTeamName: "Banca Central",
      cartolaOwnerName: "Ana",
      source: "cartola",
      rank: 3,
      delta: -1,
      badges: [],
    },
    {
      id: "p4",
      nome: "Bar do Mundial",
      pontos: 63.1,
      totalPoints: 63.1,
      currentRoundPoints: null,
      average: null,
      bestRound: null,
      worstRound: null,
      source: "manual",
      rank: 4,
      delta: 0,
      badges: [{ label: "Manual" }],
    },
  ],
  history: [
    { participantId: "p1", nome: "UGO Comércio FC", scores: [{ roundId: 1, points: 92.13, source: "cartola" }] },
    { participantId: "p2", nome: "Mercadão United", scores: [{ roundId: 1, points: 81.7, source: "cartola" }] },
    { participantId: "p3", nome: "Banca Central", scores: [{ roundId: 1, points: 75.42, source: "cartola" }] },
    { participantId: "p4", nome: "Bar do Mundial", scores: [{ roundId: 1, points: 63.1, source: "manual" }] },
  ],
};

function previewAthlete(name, positionId, positionAbbr, points, status = "scored", extras = {}) {
  return {
    id: Math.floor(Math.random() * 1000000),
    name,
    positionId,
    positionAbbr,
    position: positionAbbr,
    club: { abbr: extras.club || "RUA" },
    points,
    status,
    played: status === "scored",
    isCaptain: Boolean(extras.captain),
    isLuxuryReserve: Boolean(extras.luxury),
    kind: extras.kind || "starter",
  };
}

function previewLineup(seed = 0) {
  const starters = [
    previewAthlete("Muralha FC", 1, "GOL", 6.4),
    previewAthlete("Lateral da Feira", 2, "LAT", 4.2),
    previewAthlete("Zagueiro Central", 3, "ZAG", 7.1),
    previewAthlete("Xerife da Rua", 3, "ZAG", null, "waiting"),
    previewAthlete("Avenida Esquerda", 2, "LAT", 3.8),
    previewAthlete("Maestro", 4, "MEI", 9.3, "scored", { captain: seed % 2 === 0 }),
    previewAthlete("Camisa Dez", 4, "MEI", 5.5),
    previewAthlete("Volante", 4, "MEI", null, "waiting"),
    previewAthlete("Artilheiro", 5, "ATA", 12.6, "scored", { captain: seed % 2 === 1 }),
    previewAthlete("Ponta Rapido", 5, "ATA", 2.1),
    previewAthlete("Centroavante", 5, "ATA", null, "empty"),
    previewAthlete("Professor", 6, "TEC", 0),
  ];
  const reserves = [
    previewAthlete("Reserva Quente", 5, "ATA", 8.2, "scored", { kind: "reserve", luxury: true }),
    previewAthlete("Banco Seguro", 4, "MEI", null, "waiting", { kind: "reserve" }),
  ];
  return {
    formation: "4-3-3",
    starters,
    reserves,
    captainName: starters.find((athlete) => athlete.isCaptain)?.name || "",
    luxuryReserveName: "Reserva Quente",
    playedCount: starters.filter((athlete) => athlete.positionId !== 6 && athlete.status === "scored").length,
    lineupCount: starters.filter((athlete) => athlete.positionId !== 6).length,
  };
}

function refreshDerived() {
  const ranked = [...state.participants].sort((a, b) => Number(b.pontos || 0) - Number(a.pontos || 0));
  state.participants = ranked.map((p, index) => ({
    ...p,
    rank: index + 1,
    totalPoints: Number(p.totalPoints ?? p.pontos) || 0,
    pontos: Number(p.pontos ?? p.totalPoints) || 0,
    lineup: p.lineup || (p.cartolaTimeId ? previewLineup(index) : null),
  }));
  state.participants = state.participants.map((p, index, list) => ({
    ...p,
    rivals: {
      ahead: list[index - 1] ? { ...list[index - 1], diff: Math.abs(Number(p.pontos || 0) - Number(list[index - 1].pontos || 0)) } : null,
      behind: list[index + 1] ? { ...list[index + 1], diff: Math.abs(Number(p.pontos || 0) - Number(list[index + 1].pontos || 0)) } : null,
    },
  }));
  state.roundRanking = state.participants
    .filter((p) => p.currentRoundPoints != null)
    .sort((a, b) => Number(b.currentRoundPoints || 0) - Number(a.currentRoundPoints || 0))
    .map((p, index) => ({ ...p, pontos: p.currentRoundPoints, roundRank: index + 1 }));
  const leader = state.participants[0];
  const roundLeader = state.roundRanking[0];
  state.mural = state.config.mural || "";
  state.highlights = [
    leader && { code: "leader", tone: "gold", label: "Lider geral", title: leader.cartolaTeamName || leader.nome, body: `Esta no topo com ${Number(leader.pontos || 0).toFixed(2)} pts.`, participantId: leader.id, value: `#${leader.rank}` },
    roundLeader && { code: "round-hero", tone: "green", label: "Mito da rodada", title: roundLeader.cartolaTeamName || roundLeader.nome, body: `Fez ${Number(roundLeader.pontos || 0).toFixed(2)} pts na rodada.`, participantId: roundLeader.id, value: `${Number(roundLeader.pontos || 0).toFixed(2)} pts` },
    state.participants[1] && { code: "chase", tone: "silver", label: "Na cola", title: state.participants[1].cartolaTeamName || state.participants[1].nome, body: "A disputa pelo topo esta viva.", participantId: state.participants[1].id, value: "#2" },
    state.participants[3] && { code: "lantern", tone: "bronze", label: "Ainda da tempo", title: state.participants[3].cartolaTeamName || state.participants[3].nome, body: "Uma rodada boa muda tudo.", participantId: state.participants[3].id, value: "#4" },
  ].filter(Boolean);
}

refreshDerived();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

function roundFromRequest(url, body, status) {
  const requested = Number(url.searchParams.get("roundId") || url.searchParams.get("round") || (body && body.roundId));
  if (Number.isFinite(requested) && requested > 0) return Math.trunc(requested);
  const current = Number(status.rodada_atual);
  return Number.isFinite(current) && current > 0 ? Math.trunc(current) : state.currentRound?.id || 1;
}

function upsertPreviewHistory(participant, roundId, points, source = "cartola", progress = {}) {
  let history = state.history.find((item) => item.participantId === participant.id);
  if (!history) {
    history = { participantId: participant.id, nome: participant.nome, scores: [] };
    state.history.push(history);
  }

  const existing = history.scores.find((score) => Number(score.roundId) === Number(roundId));
  const score = {
    roundId,
    points,
    source,
    playedCount: progress.playedCount ?? null,
    lineupCount: progress.lineupCount ?? null,
    syncedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, score);
  else history.scores.push(score);

  const total = history.scores.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  participant.pontos = total;
  participant.totalPoints = total;
  participant.currentRoundPoints = points;
  participant.playedCount = progress.playedCount ?? null;
  participant.lineupCount = progress.lineupCount ?? null;
  participant.source = source;
  participant.average = history.scores.length ? total / history.scores.length : null;
  participant.bestRound = history.scores.length ? Math.max(...history.scores.map((item) => Number(item.points) || 0)) : null;
  participant.worstRound = history.scores.length ? Math.min(...history.scores.map((item) => Number(item.points) || 0)) : null;
}

async function syncPreviewCartola(url, body = {}) {
  const competition = one(url.searchParams.get("competition")) === "brasileirao" || body.competition === "brasileirao" ? "brasileirao" : "copa";
  const status = await getCartolaStatus(competition);
  const roundId = roundFromRequest(url, body, status);
  const linked = state.participants.filter((participant) => participant.cartolaTimeId);
  let scoredAthletes = null;
  let matches = null;

  try {
    scoredAthletes = await getCartolaScoredAthletes(competition);
  } catch (e) {
    scoredAthletes = null;
  }

  try {
    matches = await getCartolaMatches(competition);
  } catch (e) {
    matches = null;
  }

  state.currentRound = {
    id: roundId,
    nome: status.nome_rodada || `Rodada ${roundId}`,
    status: String(status.status_mercado ?? ""),
  };

  if (!linked.length) {
    state.lastSync = {
      status: "empty",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: "Nenhum participante vinculado a um time do Cartola.",
      updatedCount: 0,
      errorCount: 0,
      details: { roundId, participants: 0, errors: [], skipped: [] },
    };
    return state.lastSync;
  }

  const results = [];
  for (const participant of linked) {
    try {
      const payload = await getCartolaTeamById(participant.cartolaTimeId, roundId, competition, { timeoutMs: 10000 });
      const snapshot = extractCartolaRoundSnapshot(payload, scoredAthletes, matches);
      const points = snapshot?.points ?? null;
      if (points == null) {
        results.push({
          ok: false,
          skipped: true,
          participantId: participant.id,
          cartolaTimeId: participant.cartolaTimeId,
          error: `Cartola ainda não liberou pontos para este time na rodada ${roundId}.`,
        });
        continue;
      }

      const team = payload.time || {};
      participant.cartolaTeamName = team.nome || participant.cartolaTeamName;
      participant.cartolaOwnerName = team.nome_cartola || participant.cartolaOwnerName;
      participant.escudoUrl = team.url_escudo_png || team.url_escudo_svg || participant.escudoUrl;
      participant.patrimonio = payload.patrimonio ?? participant.patrimonio;
      upsertPreviewHistory(participant, roundId, points, "cartola", snapshot);
      results.push({
        ok: true,
        participantId: participant.id,
        cartolaTimeId: participant.cartolaTimeId,
        points,
        playedCount: snapshot?.playedCount ?? null,
        lineupCount: snapshot?.lineupCount ?? null,
      });
    } catch (e) {
      results.push({
        ok: false,
        participantId: participant.id,
        cartolaTimeId: participant.cartolaTimeId,
        error: e.message || "Erro ao consultar time",
        status: e.status || null,
      });
    }
  }

  const updatedCount = results.filter((result) => result.ok).length;
  const skipped = results.filter((result) => result.skipped);
  const errors = results.filter((result) => !result.ok && !result.skipped);
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

  state.lastSync = {
    status: finalStatus,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    message,
    updatedCount,
    errorCount: errors.length,
    details: {
      roundId,
      scoringEngine: SCORING_ENGINE_VERSION,
      participants: linked.length,
      updated: results.filter((result) => result.ok).map((result) => ({
        participantId: result.participantId,
        cartolaTimeId: result.cartolaTimeId,
        points: result.points,
        playedCount: result.playedCount,
        lineupCount: result.lineupCount,
      })),
      errors: errors.slice(0, 20),
      skipped: skipped.slice(0, 20),
    },
  };

  refreshDerived();
  return state.lastSync;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/data" && req.method === "GET") {
    refreshDerived();
    json(res, 200, state);
    return true;
  }

  if (url.pathname === "/api/data" && req.method === "POST") {
    const body = await readBody(req);
    state.config = { ...state.config, ...(body.config || {}) };
    state.participants = Array.isArray(body.participants)
      ? body.participants.map((p) => {
          const currentRoundPoints = p.currentRoundPoints == null ? null : Number(p.currentRoundPoints) || 0;
          const pontos = Number(p.pontos ?? currentRoundPoints ?? p.manualPoints) || 0;
          return {
            ...p,
            pontos,
            totalPoints: pontos,
            currentRoundPoints,
            manualPoints: Number(p.manualPoints) || 0,
          };
        })
      : state.participants;
    state.history = state.participants.map((p) => ({
      participantId: p.id,
      nome: p.nome,
      scores: [
        {
          roundId: state.currentRound.id,
          points: Number(p.currentRoundPoints ?? p.pontos ?? p.manualPoints) || 0,
          source: p.cartolaTimeId && p.currentRoundPoints != null ? "cartola" : "manual",
        },
      ],
    }));
    refreshDerived();
    json(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    json(res, 200, { token: "preview-token" });
    return true;
  }

  if (url.pathname === "/api/cartola-search" && req.method === "GET") {
    const q = String(url.searchParams.get("q") || "time").trim();
    try {
      const teams = await searchCartolaTeams(q, "copa");
      json(res, 200, { teams });
    } catch (e) {
      json(res, 502, {
        error: "Não foi possível buscar times no Cartola agora.",
        detail: e.message || "Erro externo",
      });
    }
    return true;
  }

  if (url.pathname === "/api/sync-cartola" && ["GET", "POST"].includes(req.method)) {
    const body = req.method === "POST" ? await readBody(req) : {};
    const sync = await syncPreviewCartola(url, body);
    json(res, sync.status === "error" ? 502 : 200, { ok: sync.status !== "error", sync });
    return true;
  }

  return false;
}

async function serveStatic(res, pathname) {
  const file = pathname === "/" ? "index.html" : pathname === "/admin" ? "admin.html" : pathname === "/participant" ? "participant.html" : pathname.slice(1);
  try {
    const data = await readFile(join(root, file));
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}`);
  try {
    if (await handleApi(req, res, url)) return;
    await serveStatic(res, url.pathname);
  } catch (e) {
    json(res, 500, { error: e.message || "Erro no preview local" });
  }
});

function listen(port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(port);
    });
  });
}

let port = preferredPort;
for (;;) {
  try {
    await listen(port);
    break;
  } catch (e) {
    if (e.code !== "EADDRINUSE" || port > preferredPort + 20) throw e;
    port += 1;
  }
}

console.log(`Liga Rua do Comércio local: http://${host}:${port}`);
console.log("Admin preview: qualquer senha entra. Pressione Ctrl+C para encerrar.");
