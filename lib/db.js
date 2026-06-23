import { normalizeStoredLineupSnapshot } from "./cartola.js";
import { prisma } from "./prisma.js";

export const DEFAULT_CONFIG = {
  valorPorPessoa: 50,
  pct1: 50,
  pct2: 30,
  pct3: 20,
  titulo: "Liga Rua do Comércio",
  subtitulo: "Copa do Mundo 2026",
  ligaSlug: "cartola-rua-do-comercio",
  competition: "copa",
  temporada: 2026,
  mural: "",
};

const DEFAULT_STATE = {
  participants: [],
  config: DEFAULT_CONFIG,
  rounds: [],
  currentRound: null,
  roundRanking: [],
  history: [],
  highlights: [],
  mitadas: [],
  bets: [],
  mural: "",
  lastSync: null,
  automation: { status: "manual", message: "Aguardando configuração da automação." },
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const date = new Date(text.includes("T") ? text : `${text.replace(" ", "T")}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function publicConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    valorPorPessoa: toNumber(row.valorPorPessoa, DEFAULT_CONFIG.valorPorPessoa),
    pct1: toNumber(row.pct1, DEFAULT_CONFIG.pct1),
    pct2: toNumber(row.pct2, DEFAULT_CONFIG.pct2),
    pct3: toNumber(row.pct3, DEFAULT_CONFIG.pct3),
    titulo: row.titulo || DEFAULT_CONFIG.titulo,
    subtitulo: row.subtitulo || DEFAULT_CONFIG.subtitulo,
    ligaSlug: row.ligaSlug || DEFAULT_CONFIG.ligaSlug,
    competition: row.competition || DEFAULT_CONFIG.competition,
    temporada: toNumber(row.temporada, DEFAULT_CONFIG.temporada),
    mural: row.mural || "",
  };
}

// "Apostas em jogo": confrontos valendo um prêmio (ex.: 1 caixa de cerveja) que
// o organizador cria. Ficam num JSON dentro da AppConfig (já lida no caminho
// quente), então não custam leitura extra. Só o POST autenticado escreve.
function normalizeBets(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .slice(0, 50)
    .map((b) => {
      const scope = b && b.scope === "rounds" ? "rounds" : "season";
      const fromRound = scope === "rounds" ? Math.trunc(toNumber(b && b.fromRound)) || null : null;
      const toRound = scope === "rounds" ? Math.trunc(toNumber(b && b.toRound)) || null : null;
      return {
        id: String((b && b.id) || `b${Math.random().toString(36).slice(2, 10)}`).slice(0, 40),
        aId: String((b && b.aId) || "").slice(0, 80),
        bId: String((b && b.bId) || "").slice(0, 80),
        stake: String((b && b.stake) || "").slice(0, 120),
        scope,
        fromRound,
        toRound,
        note: b && b.note ? String(b.note).slice(0, 160) : null,
        createdAt: b && b.createdAt ? String(b.createdAt).slice(0, 40) : new Date().toISOString(),
      };
    })
    .filter((b) => b.aId && b.bId && b.aId !== b.bId && b.stake);
}

export async function setBets(bets) {
  const clean = normalizeBets(bets);
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: { bets: clean },
    create: { id: 1, ...DEFAULT_CONFIG, bets: clean },
  });
  invalidateStateCache();
  return clean;
}

async function getLegacyState() {
  const row = await prisma.estado.findUnique({ where: { id: 1 } });
  const d = row && row.data;
  if (!d) return DEFAULT_STATE;
  return {
    ...DEFAULT_STATE,
    participants: Array.isArray(d.participants) ? d.participants : [],
    config: { ...DEFAULT_CONFIG, ...(d.config || {}) },
    automation: { status: "legacy", message: "Usando armazenamento antigo em JSON." },
  };
}

async function setLegacyState(state) {
  const legacy = {
    participants: (state.participants || []).map((p) => ({
      id: String(p.id),
      nome: String(p.nome || p.cartolaTeamName || ""),
      pontos: toNumber(p.pontos ?? p.manualPoints),
    })),
    config: { ...DEFAULT_CONFIG, ...(state.config || {}) },
  };
  await prisma.estado.upsert({
    where: { id: 1 },
    update: { data: legacy },
    create: { id: 1, data: legacy },
  });
}

async function getConfig() {
  // Leitura pura no caminho quente. O upsert antigo gravava no banco a CADA
  // GET /api/data, inflando o uso de operações. Só cria a linha padrão se faltar.
  const existing = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_CONFIG },
  });
}

let legacyImportChecked = false;
async function importLegacyParticipantsIfEmpty() {
  if (legacyImportChecked) return;
  const count = await prisma.participant.count();
  if (count > 0) {
    legacyImportChecked = true;
    return;
  }
  const legacy = await getLegacyState();
  if (!legacy.participants.length) return;
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: legacy.config,
    create: { id: 1, ...legacy.config },
  });
  for (const p of legacy.participants) {
    await prisma.participant.create({
      data: {
        id: String(p.id || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        nome: String(p.nome || "").slice(0, 80),
        manualPoints: toNumber(p.pontos),
        active: true,
      },
    });
  }
  legacyImportChecked = true;
}

async function getCurrentRoundIdForManualSave() {
  const [lastSync, latestScore, latestRound] = await Promise.all([
    prisma.syncRun.findFirst({ where: { roundId: { not: null } }, orderBy: { startedAt: "desc" }, select: { roundId: true } }),
    prisma.roundScore.findFirst({ orderBy: { roundId: "desc" }, select: { roundId: true } }),
    prisma.round.findFirst({ orderBy: { id: "desc" }, select: { id: true } }),
  ]);
  return lastSync?.roundId || latestScore?.roundId || latestRound?.id || null;
}

async function upsertManualRoundScore(participant, roundId, points, cartolaTimeId) {
  const existing = await prisma.roundScore.findUnique({
    where: { participantId_roundId: { participantId: participant.id, roundId } },
  });
  const manualPoints = toNumber(points);
  const autoPoints = existing?.autoPoints ?? null;
  await prisma.round.upsert({
    where: { id: roundId },
    update: {},
    create: { id: roundId, nome: `Rodada ${roundId}` },
  });
  return prisma.roundScore.upsert({
    where: { participantId_roundId: { participantId: participant.id, roundId } },
    update: {
      cartolaTimeId,
      manualPoints,
      finalPoints: manualPoints,
      source: autoPoints != null ? "mixed" : "manual",
      syncedAt: existing?.syncedAt ?? null,
    },
    create: {
      participantId: participant.id,
      roundId,
      cartolaTimeId,
      autoPoints,
      manualPoints,
      finalPoints: manualPoints,
      source: autoPoints != null ? "mixed" : "manual",
    },
  });
}

function scoreValue(score) {
  if (!score) return 0;
  if (score.manualPoints != null) return toNumber(score.manualPoints);
  return toNumber(score.finalPoints);
}

function teamName(participant) {
  return participant?.cartolaTeamName || participant?.nome || "Time sem nome";
}

function miniParticipant(participant, current) {
  if (!participant) return null;
  return {
    id: participant.id,
    rank: participant.rank,
    nome: participant.nome,
    cartolaTeamName: participant.cartolaTeamName,
    cartolaOwnerName: participant.cartolaOwnerName,
    escudoUrl: participant.escudoUrl,
    pontos: toNumber(participant.totalPoints ?? participant.pontos),
    diff: current ? Number(Math.abs(toNumber(current.totalPoints ?? current.pontos) - toNumber(participant.totalPoints ?? participant.pontos)).toFixed(2)) : null,
  };
}

function withLineupProgress(lineup, score) {
  if (!lineup) return null;
  return {
    ...lineup,
    playedCount: score?.playedCount ?? lineup.playedCount,
    lineupCount: score?.lineupCount ?? lineup.lineupCount,
  };
}

function addHighlight(list, item) {
  if (!item || !item.title || !item.body) return;
  if (item.participantId && list.some((existing) => existing.code === item.code && existing.participantId === item.participantId)) return;
  list.push(item);
}

function buildHighlights(ranking, roundRanking) {
  const highlights = [];
  const leader = ranking[0];
  const vice = ranking[1];
  const roundLeader = roundRanking[0];
  const bestClimb = ranking.filter((p) => Number(p.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta))[0];
  const biggestFall = ranking.filter((p) => Number(p.delta) < 0).sort((a, b) => Number(a.delta) - Number(b.delta))[0];
  const bestAverage = ranking.filter((p) => p.average != null).sort((a, b) => Number(b.average) - Number(a.average))[0];
  const last = ranking.length > 1 ? ranking[ranking.length - 1] : null;

  addHighlight(highlights, leader && {
    code: "leader",
    tone: "gold",
    label: "Líder geral",
    title: teamName(leader),
    body: `Está no topo com ${toNumber(leader.totalPoints).toFixed(2)} pts.`,
    participantId: leader.id,
    value: leader.rank ? `#${leader.rank}` : "",
  });

  addHighlight(highlights, roundLeader && {
    code: "round-hero",
    tone: "green",
    label: "Mito da rodada",
    title: teamName(roundLeader),
    body: `Fez ${toNumber(roundLeader.pontos).toFixed(2)} pts na rodada.`,
    participantId: roundLeader.id,
    value: `${toNumber(roundLeader.pontos).toFixed(2)} pts`,
  });

  if (leader && vice) {
    const diff = Math.max(0, toNumber(leader.totalPoints) - toNumber(vice.totalPoints));
    addHighlight(highlights, {
      code: "chase",
      tone: "silver",
      label: "Na cola",
      title: teamName(vice),
      body: `Está a ${diff.toFixed(2)} pts do líder.`,
      participantId: vice.id,
      value: `-${diff.toFixed(2)}`,
    });
  }

  addHighlight(highlights, bestClimb && {
    code: "climb",
    tone: "green",
    label: "Arrancada",
    title: teamName(bestClimb),
    body: `Subiu ${Number(bestClimb.delta)} posição(ões) no geral.`,
    participantId: bestClimb.id,
    value: `+${Number(bestClimb.delta)}`,
  });

  addHighlight(highlights, biggestFall && {
    code: "fall",
    tone: "red",
    label: "Escorregada",
    title: teamName(biggestFall),
    body: `Caiu ${Math.abs(Number(biggestFall.delta))} posição(ões). Ainda tem jogo.`,
    participantId: biggestFall.id,
    value: `${Number(biggestFall.delta)}`,
  });

  addHighlight(highlights, bestAverage && bestAverage.id !== leader?.id && {
    code: "average",
    tone: "blue",
    label: "Regularidade",
    title: teamName(bestAverage),
    body: `Média de ${toNumber(bestAverage.average).toFixed(2)} pts por rodada.`,
    participantId: bestAverage.id,
    value: `${toNumber(bestAverage.average).toFixed(2)}`,
  });

  addHighlight(highlights, last && {
    code: "lantern",
    tone: "bronze",
    label: "Ainda dá tempo",
    title: teamName(last),
    body: `Fechando a tabela, mas uma rodada muda a resenha.`,
    participantId: last.id,
    value: `#${last.rank}`,
  });

  return highlights.slice(0, 8);
}

export function buildRanking(participants, scores, currentRoundId) {
  const scoresByParticipant = new Map();
  for (const score of scores) {
    const list = scoresByParticipant.get(score.participantId) || [];
    list.push(score);
    scoresByParticipant.set(score.participantId, list);
  }

  const totalAtRound = (participantId, roundLimit) => {
    const list = scoresByParticipant.get(participantId) || [];
    return list
      .filter((score) => roundLimit == null || score.roundId <= roundLimit)
      .reduce((sum, score) => sum + scoreValue(score), 0);
  };

  const current = participants.map((participant) => {
    const list = (scoresByParticipant.get(participant.id) || []).sort((a, b) => a.roundId - b.roundId);
    const scoreTotal = list.reduce((sum, score) => sum + scoreValue(score), 0);
    const totalPoints = list.length ? scoreTotal : toNumber(participant.manualPoints);
    const bestRound = list.length ? Math.max(...list.map(scoreValue)) : null;
    const worstRound = list.length ? Math.min(...list.map(scoreValue)) : null;
    const average = list.length ? totalPoints / list.length : null;
    const currentRoundScore = currentRoundId ? list.find((s) => s.roundId === currentRoundId) : null;
    const lineup = withLineupProgress(currentRoundScore?.raw ? normalizeStoredLineupSnapshot(currentRoundScore.raw) : null, currentRoundScore);

    return {
      id: participant.id,
      nome: participant.nome,
      apelido: participant.apelido,
      cartolaTimeId: participant.cartolaTimeId,
      cartolaSlug: participant.cartolaSlug,
      cartolaTeamName: participant.cartolaTeamName,
      cartolaOwnerName: participant.cartolaOwnerName,
      escudoUrl: participant.escudoUrl,
      manualPoints: toNumber(participant.manualPoints),
      pontos: totalPoints,
      totalPoints,
      currentRoundPoints: currentRoundScore ? scoreValue(currentRoundScore) : null,
      source: currentRoundScore ? currentRoundScore.source : participant.cartolaTimeId ? "cartola" : "manual",
      playedCount: currentRoundScore?.playedCount ?? null,
      lineupCount: currentRoundScore?.lineupCount ?? null,
      bestRound,
      worstRound,
      average,
      lineup,
      rivals: { ahead: null, behind: null },
      active: participant.active,
      badges: [],
    };
  });

  current.sort((a, b) => b.totalPoints - a.totalPoints || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  current.forEach((p, index) => {
    p.rank = index + 1;
  });

  current.forEach((p, index) => {
    p.rivals = {
      ahead: miniParticipant(current[index - 1], p),
      behind: miniParticipant(current[index + 1], p),
    };
  });

  if (currentRoundId) {
    const previous = [...participants]
      .map((participant) => ({ id: participant.id, name: String(participant.nome || ""), points: totalAtRound(participant.id, currentRoundId - 1) }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "pt-BR"));
    const previousRank = new Map(previous.map((p, index) => [p.id, index + 1]));
    current.forEach((p) => {
      const oldRank = previousRank.get(p.id);
      p.delta = oldRank ? oldRank - p.rank : 0;
    });
  } else {
    current.forEach((p) => {
      p.delta = 0;
    });
  }

  const roundRanking = currentRoundId
    ? current
        .filter((p) => p.currentRoundPoints != null)
        .sort((a, b) => b.currentRoundPoints - a.currentRoundPoints || a.rank - b.rank)
        .map((p, index) => ({ ...p, roundRank: index + 1, pontos: p.currentRoundPoints }))
    : [];

  if (current[0]) current[0].badges.push({ code: "lider", label: "Líder da Rua" });
  if (roundRanking[0]) {
    const leader = current.find((p) => p.id === roundRanking[0].id);
    if (leader) leader.badges.push({ code: "mito-rodada", label: "Mito da Rodada" });
  }
  for (const p of current) {
    if (p.bestRound != null && p.bestRound >= 80) p.badges.push({ code: "oitentou", label: "80+" });
    if (p.delta >= 3) p.badges.push({ code: "arrancada", label: `Subiu ${p.delta}` });
  }

  return { ranking: current, roundRanking };
}

function captainFromRaw(raw) {
  if (!raw) return null;
  try {
    const lineup = normalizeStoredLineupSnapshot(raw);
    if (!lineup) return null;
    const cap = [...(lineup.starters || []), ...(lineup.reserves || [])].find((a) => a.isCaptain);
    if (!cap && !lineup.captainName) return null;
    return {
      name: (cap && cap.name) || lineup.captainName || "",
      points: cap && cap.points != null ? Number(cap.points) : null,
    };
  } catch (e) {
    return null;
  }
}

function buildHistory(participants, scores) {
  const byParticipant = new Map(participants.map((p) => [p.id, { participantId: p.id, nome: p.nome, scores: [] }]));
  for (const score of scores) {
    const row = byParticipant.get(score.participantId);
    if (!row) continue;
    row.scores.push({
      roundId: score.roundId,
      points: scoreValue(score),
      source: score.source,
      playedCount: score.playedCount,
      lineupCount: score.lineupCount,
      syncedAt: score.syncedAt,
      captain: captainFromRaw(score.raw),
    });
  }
  return [...byParticipant.values()].map((item) => ({
    ...item,
    scores: item.scores.sort((a, b) => a.roundId - b.roundId),
  }));
}

export function buildMitadas(participants, rounds, scores) {
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  const scoresByRound = new Map();

  for (const score of scores) {
    const participant = participantsById.get(score.participantId);
    if (!participant) continue;
    const list = scoresByRound.get(score.roundId) || [];
    list.push({ participant, score, points: scoreValue(score) });
    scoresByRound.set(score.roundId, list);
  }

  const winners = [...scoresByRound.entries()]
    .map(([roundId, entries]) => {
      const ordered = entries.sort((a, b) => b.points - a.points || teamName(a.participant).localeCompare(teamName(b.participant), "pt-BR"));
      const winner = ordered[0];
      if (!winner) return null;
      const runnerUp = ordered[1] || null;
      const round = roundsById.get(roundId) || { id: roundId, nome: `Rodada ${roundId}` };
      return { roundId, round, winner, runnerUp };
    })
    .filter(Boolean)
    .sort((a, b) => a.roundId - b.roundId);

  const countByParticipant = new Map();
  for (const item of winners) {
    countByParticipant.set(item.winner.participant.id, (countByParticipant.get(item.winner.participant.id) || 0) + 1);
  }

  return winners
    .sort((a, b) => b.roundId - a.roundId)
    .map((item) => {
      const winner = item.winner;
      const participant = winner.participant;
      const runnerUp = item.runnerUp;
      return {
        roundId: item.roundId,
        roundName: item.round?.nome || `Rodada ${item.roundId}`,
        roundStatus: item.round?.status || "",
        syncedAt: winner.score.syncedAt || item.round?.syncedAt || null,
        participantId: participant.id,
        nome: participant.nome,
        cartolaTeamName: participant.cartolaTeamName,
        cartolaOwnerName: participant.cartolaOwnerName,
        escudoUrl: participant.escudoUrl,
        points: Number(winner.points.toFixed(2)),
        source: winner.score.source,
        playedCount: winner.score.playedCount ?? null,
        lineupCount: winner.score.lineupCount ?? null,
        mitadasCount: countByParticipant.get(participant.id) || 1,
        runnerUp: runnerUp
          ? {
              participantId: runnerUp.participant.id,
              nome: runnerUp.participant.nome,
              cartolaTeamName: runnerUp.participant.cartolaTeamName,
              cartolaOwnerName: runnerUp.participant.cartolaOwnerName,
              escudoUrl: runnerUp.participant.escudoUrl,
              points: Number(runnerUp.points.toFixed(2)),
              diff: Number(Math.max(0, winner.points - runnerUp.points).toFixed(2)),
            }
          : null,
      };
    });
}

async function getModernState() {
  await importLegacyParticipantsIfEmpty();
  const [configRow, participants, allParticipants, rounds, scores, lastSync] = await Promise.all([
    getConfig(),
    prisma.participant.findMany({ where: { active: true }, orderBy: [{ nome: "asc" }] }),
    prisma.participant.findMany({ orderBy: [{ nome: "asc" }] }),
    prisma.round.findMany({ orderBy: [{ id: "asc" }] }),
    prisma.roundScore.findMany({ orderBy: [{ roundId: "asc" }] }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const currentRoundId =
    lastSync?.roundId ||
    scores.reduce((max, score) => Math.max(max, score.roundId), 0) ||
    rounds.reduce((max, round) => Math.max(max, round.id), 0) ||
    null;
  const currentRound = currentRoundId ? rounds.find((r) => r.id === currentRoundId) || { id: currentRoundId } : null;
  const { ranking, roundRanking } = buildRanking(participants, scores, currentRoundId);
  const config = publicConfig(configRow);

  return {
    participants: ranking,
    config,
    mural: config.mural || "",
    rounds: rounds.map((r) => ({
      id: r.id,
      nome: r.nome || `Rodada ${r.id}`,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status,
      totalGames: r.totalGames,
      validGames: r.validGames,
      syncedAt: r.syncedAt,
    })),
    currentRound: currentRound
      ? {
          id: currentRound.id,
          nome: currentRound.nome || `Rodada ${currentRound.id}`,
          startsAt: currentRound.startsAt,
          endsAt: currentRound.endsAt,
          status: currentRound.status,
        }
      : null,
    roundRanking,
    history: buildHistory(allParticipants, scores),
    highlights: buildHighlights(ranking, roundRanking),
    mitadas: buildMitadas(allParticipants, rounds, scores),
    bets: normalizeBets(configRow?.bets),
    lastSync,
    automation: {
      status: lastSync ? lastSync.status : participants.some((p) => p.cartolaTimeId) ? "ready" : "manual",
      message: lastSync?.message || "Vincule os times do Cartola e sincronize pelo painel.",
    },
  };
}

// Cache em memória do estado público, reaproveitado entre invocações "quentes"
// da função serverless. Antes, cada GET montava ~6 queries; com a home fazendo
// polling isso drenava a cota do banco. O TTL curto mantém a liga "ao vivo".
let stateCache = null;
const STATE_CACHE_TTL_MS = 15000;

export function invalidateStateCache() {
  stateCache = null;
}

export async function getState({ fresh = false } = {}) {
  if (!fresh && stateCache && Date.now() - stateCache.at < STATE_CACHE_TTL_MS) {
    return stateCache.data;
  }
  try {
    const data = await getModernState();
    stateCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return getLegacyState();
  }
}

export async function setState(state) {
  try {
    const cfg = { ...DEFAULT_CONFIG, ...(state.config || {}) };
    const incoming = Array.isArray(state.participants) ? state.participants : [];
    const activeIds = [];
    const seenCartolaTimeIds = new Set();
    const currentRoundId = await getCurrentRoundIdForManualSave();

    await prisma.appConfig.upsert({
      where: { id: 1 },
      update: cfg,
      create: { id: 1, ...cfg },
    });

    for (const p of incoming) {
      const id = String(p.id || `p${Math.random().toString(36).slice(2, 10)}`);
      let cartolaTimeId = p.cartolaTimeId ? toNumber(p.cartolaTimeId) : null;
      if (cartolaTimeId && seenCartolaTimeIds.has(cartolaTimeId)) {
        cartolaTimeId = null;
      }
      if (cartolaTimeId) seenCartolaTimeIds.add(cartolaTimeId);

      activeIds.push(id);
      const participant = await prisma.participant.upsert({
        where: { id },
        update: {
          nome: String(p.nome || p.cartolaTeamName || "").slice(0, 80),
          apelido: p.apelido ? String(p.apelido).slice(0, 40) : null,
          cartolaTimeId,
          cartolaSlug: p.cartolaSlug ? String(p.cartolaSlug).slice(0, 120) : null,
          cartolaTeamName: p.cartolaTeamName ? String(p.cartolaTeamName).slice(0, 100) : null,
          cartolaOwnerName: p.cartolaOwnerName ? String(p.cartolaOwnerName).slice(0, 100) : null,
          escudoUrl: p.escudoUrl ? String(p.escudoUrl).slice(0, 500) : null,
          manualPoints: toNumber(p.manualPoints ?? p.pontos),
          active: true,
        },
        create: {
          id,
          nome: String(p.nome || p.cartolaTeamName || "").slice(0, 80),
          apelido: p.apelido ? String(p.apelido).slice(0, 40) : null,
          cartolaTimeId,
          cartolaSlug: p.cartolaSlug ? String(p.cartolaSlug).slice(0, 120) : null,
          cartolaTeamName: p.cartolaTeamName ? String(p.cartolaTeamName).slice(0, 100) : null,
          cartolaOwnerName: p.cartolaOwnerName ? String(p.cartolaOwnerName).slice(0, 100) : null,
          escudoUrl: p.escudoUrl ? String(p.escudoUrl).slice(0, 500) : null,
          manualPoints: toNumber(p.manualPoints ?? p.pontos),
          active: true,
        },
      });

      if ((p.manualOverride || !cartolaTimeId) && p.currentRoundPoints != null && currentRoundId) {
        await upsertManualRoundScore(participant, currentRoundId, p.currentRoundPoints, cartolaTimeId);
      }
    }

    await prisma.participant.updateMany({
      where: activeIds.length ? { id: { notIn: activeIds } } : {},
      data: { active: false, cartolaTimeId: null },
    });

    await setLegacyState({ participants: incoming, config: cfg });
  } catch (e) {
    await setLegacyState(state);
  } finally {
    // Salvou: descarta o cache pra próxima leitura refletir o novo estado.
    invalidateStateCache();
  }
}

export async function getParticipantsForSync() {
  return prisma.participant.findMany({
    where: { active: true, cartolaTimeId: { not: null } },
    orderBy: [{ nome: "asc" }],
  });
}

export async function upsertRoundsFromCartola(rounds, matchesPayload, statusPayload) {
  const matches = Array.isArray(matchesPayload?.partidas) ? matchesPayload.partidas : [];
  const matchesByRound = new Map([[toNumber(matchesPayload?.rodada), matches]]);
  for (const round of rounds) {
    const roundId = toNumber(round.rodada_id);
    if (!roundId) continue;
    const roundMatches = matchesByRound.get(roundId) || [];
    await prisma.round.upsert({
      where: { id: roundId },
      update: {
        nome: round.nome_rodada || `Rodada ${roundId}`,
        startsAt: toDate(round.inicio),
        endsAt: toDate(round.fim),
        status: statusPayload?.rodada_atual === roundId ? String(statusPayload.status_mercado ?? "") : undefined,
        totalGames: roundMatches.length || undefined,
        validGames: roundMatches.length ? roundMatches.filter((m) => m.valida).length : undefined,
        syncedAt: new Date(),
      },
      create: {
        id: roundId,
        nome: round.nome_rodada || `Rodada ${roundId}`,
        startsAt: toDate(round.inicio),
        endsAt: toDate(round.fim),
        status: statusPayload?.rodada_atual === roundId ? String(statusPayload.status_mercado ?? "") : null,
        totalGames: roundMatches.length || null,
        validGames: roundMatches.length ? roundMatches.filter((m) => m.valida).length : null,
        syncedAt: new Date(),
      },
    });
  }
}

export async function createSyncRun(data) {
  return prisma.syncRun.create({ data });
}

// Mantém os SyncRun mais recentes (o último alimenta o "atualizado em" e o
// banner do site, então o topo NUNCA é apagado) e drena o histórico bruto antigo.
const SYNC_RUN_KEEP = 200;
const RAW_PAYLOAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function pruneSyncArtifacts() {
  try {
    const cutoff = await prisma.syncRun.findFirst({
      orderBy: { startedAt: "desc" },
      skip: SYNC_RUN_KEEP,
      select: { startedAt: true },
    });
    if (cutoff) {
      await prisma.syncRun.deleteMany({ where: { startedAt: { lt: cutoff.startedAt } } });
    }
    await prisma.rawCartolaPayload.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RAW_PAYLOAD_MAX_AGE_MS) } },
    });
  } catch (e) {
    // Limpeza é best-effort: nunca derruba o sync por causa da poda.
  }
}

export async function finishSyncRun(id, data) {
  const run = await prisma.syncRun.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
  // Sincronizou: o estado público mudou, então invalida o cache em memória.
  invalidateStateCache();
  // Poda amostral: ~5% das execuções limpam o acúmulo sem somar custo em todas.
  if (Math.random() < 0.05) await pruneSyncArtifacts();
  return run;
}

export async function saveRawPayload(endpoint, cacheKey, status, payload) {
  // Arquivo bruto da API do Cartola. NINGUÉM lê esta tabela no app: o snapshot
  // por participante fica em RoundScore.raw e o resumo do sync em SyncRun.details.
  // Era 1 escrita por payload a cada sync (N+4 numa rodada ao vivo) e a tabela
  // crescia sem teto — um dreno enorme com o cron de 5 min. Desligado por padrão;
  // ligue ARCHIVE_RAW_PAYLOADS=1 só quando precisar depurar uma sincronização.
  if (process.env.ARCHIVE_RAW_PAYLOADS !== "1") return null;
  return prisma.rawCartolaPayload.create({
    data: { endpoint, cacheKey, status, payload: payload || {} },
  });
}

export async function upsertRoundScore(participant, roundId, cartolaPayload, resolvedAutoPoints = null, progress = {}) {
  const autoPoints = resolvedAutoPoints != null ? toNumber(resolvedAutoPoints) : cartolaPayload?.pontos != null ? toNumber(cartolaPayload.pontos) : null;
  const existing = await prisma.roundScore.findUnique({
    where: { participantId_roundId: { participantId: participant.id, roundId } },
  });
  const manualPoints = existing?.manualPoints ?? null;
  const finalPoints = manualPoints != null ? manualPoints : autoPoints ?? 0;
  const source = manualPoints != null && autoPoints != null ? "mixed" : manualPoints != null ? "manual" : "cartola";

  return prisma.roundScore.upsert({
    where: { participantId_roundId: { participantId: participant.id, roundId } },
    update: {
      cartolaTimeId: participant.cartolaTimeId,
      autoPoints,
      finalPoints,
      source,
      pontosCampeonato: cartolaPayload?.pontos_campeonato != null ? toNumber(cartolaPayload.pontos_campeonato) : null,
      patrimonio: cartolaPayload?.patrimonio != null ? toNumber(cartolaPayload.patrimonio) : null,
      playedCount: progress?.playedCount == null ? null : toNumber(progress.playedCount),
      lineupCount: progress?.lineupCount == null ? null : toNumber(progress.lineupCount),
      raw: cartolaPayload || {},
      syncedAt: new Date(),
    },
    create: {
      participantId: participant.id,
      roundId,
      cartolaTimeId: participant.cartolaTimeId,
      autoPoints,
      manualPoints,
      finalPoints,
      source,
      pontosCampeonato: cartolaPayload?.pontos_campeonato != null ? toNumber(cartolaPayload.pontos_campeonato) : null,
      patrimonio: cartolaPayload?.patrimonio != null ? toNumber(cartolaPayload.patrimonio) : null,
      playedCount: progress?.playedCount == null ? null : toNumber(progress.playedCount),
      lineupCount: progress?.lineupCount == null ? null : toNumber(progress.lineupCount),
      raw: cartolaPayload || {},
      syncedAt: new Date(),
    },
  });
}
