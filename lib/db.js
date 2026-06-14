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
};

const DEFAULT_STATE = {
  participants: [],
  config: DEFAULT_CONFIG,
  rounds: [],
  currentRound: null,
  roundRanking: [],
  history: [],
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
  };
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
  return prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_CONFIG },
  });
}

async function importLegacyParticipantsIfEmpty() {
  const count = await prisma.participant.count();
  if (count > 0) return;
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
}

function scoreValue(score) {
  if (!score) return 0;
  if (score.manualPoints != null) return toNumber(score.manualPoints);
  return toNumber(score.finalPoints);
}

function buildRanking(participants, scores, currentRoundId) {
  const scoresByParticipant = new Map();
  for (const score of scores) {
    const list = scoresByParticipant.get(score.participantId) || [];
    list.push(score);
    scoresByParticipant.set(score.participantId, list);
  }

  const totalAtRound = (participantId, roundLimit) => {
    const list = scoresByParticipant.get(participantId) || [];
    return list
      .filter((score) => !roundLimit || score.roundId <= roundLimit)
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
      bestRound,
      worstRound,
      average,
      active: participant.active,
      badges: [],
    };
  });

  current.sort((a, b) => b.totalPoints - a.totalPoints || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  current.forEach((p, index) => {
    p.rank = index + 1;
  });

  if (currentRoundId && currentRoundId > 1) {
    const previous = [...participants]
      .map((participant) => ({ id: participant.id, points: totalAtRound(participant.id, currentRoundId - 1) }))
      .sort((a, b) => b.points - a.points);
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

function buildHistory(participants, scores) {
  const byParticipant = new Map(participants.map((p) => [p.id, { participantId: p.id, nome: p.nome, scores: [] }]));
  for (const score of scores) {
    const row = byParticipant.get(score.participantId);
    if (!row) continue;
    row.scores.push({
      roundId: score.roundId,
      points: scoreValue(score),
      source: score.source,
      syncedAt: score.syncedAt,
    });
  }
  return [...byParticipant.values()].map((item) => ({
    ...item,
    scores: item.scores.sort((a, b) => a.roundId - b.roundId),
  }));
}

async function getModernState() {
  await importLegacyParticipantsIfEmpty();
  const [configRow, participants, rounds, scores, lastSync] = await Promise.all([
    getConfig(),
    prisma.participant.findMany({ where: { active: true }, orderBy: [{ nome: "asc" }] }),
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

  return {
    participants: ranking,
    config: publicConfig(configRow),
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
    history: buildHistory(participants, scores),
    lastSync,
    automation: {
      status: lastSync ? lastSync.status : participants.some((p) => p.cartolaTimeId) ? "ready" : "manual",
      message: lastSync?.message || "Vincule os times do Cartola e sincronize pelo painel.",
    },
  };
}

export async function getState() {
  try {
    return await getModernState();
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
      await prisma.participant.upsert({
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
    }

    await prisma.participant.updateMany({
      where: activeIds.length ? { id: { notIn: activeIds } } : {},
      data: { active: false, cartolaTimeId: null },
    });

    await setLegacyState({ participants: incoming, config: cfg });
  } catch (e) {
    await setLegacyState(state);
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

export async function finishSyncRun(id, data) {
  return prisma.syncRun.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
}

export async function saveRawPayload(endpoint, cacheKey, status, payload) {
  return prisma.rawCartolaPayload.create({
    data: { endpoint, cacheKey, status, payload: payload || {} },
  });
}

export async function upsertRoundScore(participant, roundId, cartolaPayload, resolvedAutoPoints = null) {
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
      raw: cartolaPayload || {},
      syncedAt: new Date(),
    },
  });
}
