const CARTOLA_BASE_URL = "https://api.cartola.globo.com";
export const SCORING_ENGINE_VERSION = "confirmed-absence-captain-1-5-v3";
const CAPTAIN_MULTIPLIER = 1.5;
const POSITION_LABELS = {
  1: ["GOL", "Goleiro"],
  2: ["LAT", "Lateral"],
  3: ["ZAG", "Zagueiro"],
  4: ["MEI", "Meia"],
  5: ["ATA", "Atacante"],
  6: ["TEC", "Tecnico"],
};

function competitionPrefix(competition = "copa") {
  return competition === "copa" ? "/copa" : "";
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

export function cartolaUrl(path, competition = "copa") {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${CARTOLA_BASE_URL}${competitionPrefix(competition)}${cleanPath}`;
}

export async function cartolaFetch(path, options = {}) {
  const competition = options.competition || "copa";
  const timeoutMs = options.timeoutMs || 9000;
  const url = cartolaUrl(path, competition);
  const timeout = withTimeout(timeoutMs);

  try {
    const response = await fetch(url, {
      signal: timeout.controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Liga Rua do Comercio/1.0",
      },
    });

    if (response.status === 204) {
      return { url, status: response.status, data: null };
    }

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data && data.mensagem ? data.mensagem : `Cartola respondeu ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      error.url = url;
      throw error;
    }

    return { url, status: response.status, data };
  } finally {
    timeout.clear();
  }
}

export function normalizeCartolaTeam(team = {}) {
  return {
    timeId: Number(team.time_id) || null,
    slug: team.slug || "",
    nome: team.nome || "",
    nomeCartola: team.nome_cartola || "",
    escudoUrl: team.url_escudo_png || team.url_escudo_svg || "",
    fotoPerfil: team.foto_perfil || "",
    assinante: Boolean(team.assinante),
  };
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function athleteId(athlete = {}) {
  return Number(athlete.atleta_id || athlete.id) || null;
}

function athleteName(athlete = {}) {
  return athlete.apelido || athlete.nome || athlete.name || (athleteId(athlete) ? `Atleta ${athleteId(athlete)}` : "Atleta");
}

function athletePhotoUrl(athlete = {}) {
  const url = athlete.foto || athlete.foto_perfil || athlete.url_foto || "";
  return String(url).replace("_FORMATO_", "_220x220_");
}

function lineupAthleteIds(teamPayload = {}) {
  return [...(Array.isArray(teamPayload.atletas) ? teamPayload.atletas : []), ...(Array.isArray(teamPayload.reservas) ? teamPayload.reservas : [])]
    .map(athleteId)
    .filter(Boolean);
}

function scopedScoredAthletes(teamPayload = {}, scoredPayload = null) {
  const scoredAthletes = scoredPayload && typeof scoredPayload.atletas === "object" ? scoredPayload.atletas : null;
  if (!scoredAthletes) return null;
  const atletas = {};
  for (const id of lineupAthleteIds(teamPayload)) {
    const scored = scoredAthletes[String(id)];
    if (scored) atletas[String(id)] = scored;
  }
  return Object.keys(atletas).length
    ? {
        rodada: scoredPayload.rodada ?? scoredPayload.rodada_id ?? null,
        atletas,
      }
    : null;
}

function compactMatchesPayload(matchesPayload = null) {
  const matches = Array.isArray(matchesPayload?.partidas) ? matchesPayload.partidas : [];
  if (!matches.length) return null;
  return {
    rodada: matchesPayload.rodada ?? matchesPayload.rodada_id ?? null,
    partidas: matches.map((match) => ({
      clube_casa_id: match.clube_casa_id,
      clube_visitante_id: match.clube_visitante_id,
      periodo_tr: match.periodo_tr,
      status_transmissao_tr: match.status_transmissao_tr,
      status_cronometro_tr: match.status_cronometro_tr,
      placar_oficial_mandante: match.placar_oficial_mandante,
      placar_oficial_visitante: match.placar_oficial_visitante,
    })),
  };
}

export function buildRoundScoreRawPayload(teamPayload = {}, scoredPayload = null, matchesPayload = null) {
  const raw = { ...(teamPayload || {}) };
  const scored = scopedScoredAthletes(teamPayload, scoredPayload);
  const matches = compactMatchesPayload(matchesPayload);
  if (scored) raw.__lineupScoredAthletes = scored;
  if (matches) raw.__lineupMatches = matches;
  return raw;
}

function positionMeta(positionId) {
  const meta = POSITION_LABELS[Number(positionId)] || ["POS", "Posicao"];
  return { abbr: meta[0], name: meta[1] };
}

function clubMeta(payload = {}, clubId) {
  const id = Number(clubId);
  const club = id && payload.clubes && typeof payload.clubes === "object" ? payload.clubes[String(id)] : null;
  return {
    id: id || null,
    name: club?.nome_fantasia || club?.abreviacao || club?.nome || "",
    abbr: club?.abreviacao || "",
    badgeUrl: club?.escudos?.["45x45"] || club?.escudos?.["60x60"] || club?.escudos?.["30x30"] || "",
  };
}

function normalizeLineupAthlete(athlete, payload, scoredAthletes, matchesPayload, kind, captainId, luxuryReserveId) {
  const id = athleteId(athlete);
  const positionId = Number(athlete.posicao_id) || null;
  const scored = id && scoredAthletes ? scoredAthletes[String(id)] : null;
  const hasScoredSource = Boolean(scoredAthletes);
  const points = hasScoredSource ? numericOrNull(scored?.pontuacao) : numericOrNull(athlete.pontos_num ?? athlete.pontos);
  const played = scored ? scored.entrou_em_campo === true || positionId === 6 : !hasScoredSource && athlete.entrou_em_campo === true;
  const matchClosed = clubMatchFinished(matchesPayload, athlete.clube_id);
  const hasScore = hasScoredSource ? scored != null : points != null;
  const status = hasScore ? "scored" : matchClosed ? "empty" : "waiting";
  const pos = positionMeta(positionId);

  return {
    id,
    name: athleteName(athlete),
    photoUrl: athletePhotoUrl(athlete),
    positionId,
    position: pos.name,
    positionAbbr: pos.abbr,
    club: clubMeta(payload, athlete.clube_id),
    points,
    scout: scored?.scout && typeof scored.scout === "object" ? scored.scout : null,
    status,
    played,
    isCaptain: Boolean(captainId && id === captainId),
    isLuxuryReserve: Boolean(luxuryReserveId && id === luxuryReserveId),
    kind,
  };
}

export function normalizeLineupSnapshot(teamPayload = {}, scoredPayload = null, matchesPayload = null) {
  const startersPayload = Array.isArray(teamPayload.atletas) ? teamPayload.atletas : [];
  const reservesPayload = Array.isArray(teamPayload.reservas) ? teamPayload.reservas : [];
  if (!startersPayload.length && !reservesPayload.length) return null;

  const scoredAthletes = scoredPayload && typeof scoredPayload.atletas === "object" ? scoredPayload.atletas : null;
  const captainId = Number(teamPayload.capitao_id) || null;
  const luxuryReserveId = Number(teamPayload.reserva_luxo_id) || null;
  const starters = startersPayload.map((athlete) => normalizeLineupAthlete(athlete, teamPayload, scoredAthletes, matchesPayload, "starter", captainId, luxuryReserveId));
  const reserves = reservesPayload.map((athlete) => normalizeLineupAthlete(athlete, teamPayload, scoredAthletes, matchesPayload, "reserve", captainId, luxuryReserveId));
  const playerSlots = starters.filter((athlete) => athlete.positionId !== 6);
  const scoredCount = playerSlots.filter((athlete) => athlete.status === "scored").length;
  const defenders = starters.filter((athlete) => athlete.positionId === 2 || athlete.positionId === 3).length;
  const midfielders = starters.filter((athlete) => athlete.positionId === 4).length;
  const attackers = starters.filter((athlete) => athlete.positionId === 5).length;
  const formation = [defenders, midfielders, attackers].filter((value) => value > 0).join("-") || "Escalacao";
  const captain = [...starters, ...reserves].find((athlete) => athlete.isCaptain) || null;
  const luxuryReserve = reserves.find((athlete) => athlete.isLuxuryReserve) || null;

  return {
    formation,
    starters,
    reserves,
    captainId,
    captainName: captain?.name || "",
    luxuryReserveId,
    luxuryReserveName: luxuryReserve?.name || "",
    playedCount: scoredCount,
    lineupCount: playerSlots.length || null,
  };
}

export function normalizeStoredLineupSnapshot(rawPayload = {}) {
  if (!rawPayload) return null;
  return normalizeLineupSnapshot(rawPayload, rawPayload.__lineupScoredAthletes || null, rawPayload.__lineupMatches || null);
}

function clubMatchFinished(matchesPayload, clubId) {
  const id = Number(clubId);
  if (!id) return false;
  const matches = Array.isArray(matchesPayload?.partidas) ? matchesPayload.partidas : [];
  const match = matches.find((item) => Number(item.clube_casa_id) === id || Number(item.clube_visitante_id) === id);
  if (!match) return false;
  return (
    match.periodo_tr === "POS_JOGO" ||
    match.status_transmissao_tr === "ENCERRADA" ||
    match.status_cronometro_tr === "ENCERRADO" ||
    (match.placar_oficial_mandante != null && match.placar_oficial_visitante != null)
  );
}

export function calculateCartolaPartialPoints(teamPayload = {}, scoredPayload = {}, matchesPayload = null) {
  return calculateCartolaPartialSnapshot(teamPayload, scoredPayload, matchesPayload)?.points ?? null;
}

export function calculateCartolaPartialSnapshot(teamPayload = {}, scoredPayload = {}, matchesPayload = null) {
  const scoredAthletes = scoredPayload && typeof scoredPayload.atletas === "object" ? scoredPayload.atletas : null;
  const lineup = Array.isArray(teamPayload.atletas) ? teamPayload.atletas : [];
  const reserves = Array.isArray(teamPayload.reservas) ? teamPayload.reservas : [];
  if (!scoredAthletes || !lineup.length) return null;

  let hasPartialSource = false;
  const captainId = Number(teamPayload.capitao_id) || null;
  const luxuryReserveId = Number(teamPayload.reserva_luxo_id) || null;

  const buildEntry = (athlete, kind) => {
    const athleteId = Number(athlete.atleta_id || athlete.id);
    const scored = scoredAthletes[String(athleteId)];
    const points = numericOrNull(scored?.pontuacao ?? athlete.pontos_num) ?? 0;
    if (scored || athlete.pontos_num != null) hasPartialSource = true;
    return {
      athlete,
      athleteId,
      kind,
      positionId: Number(athlete.posicao_id) || null,
      clubId: Number(athlete.clube_id) || null,
      points,
      played: scored ? scored.entrou_em_campo === true || Number(athlete.posicao_id) === 6 : false,
      absenceConfirmed: !scored && clubMatchFinished(matchesPayload, athlete.clube_id),
      hasScore: Boolean(scored) || athlete.pontos_num != null,
      captainSlot: captainId && athleteId === captainId,
      used: false,
    };
  };

  const starters = lineup.map((athlete) => buildEntry(athlete, "starter"));
  const bench = reserves.map((athlete) => buildEntry(athlete, "reserve"));

  for (const reserve of bench) {
    if (reserve.athleteId === luxuryReserveId) continue;
    if (!reserve.played || reserve.points <= 0) continue;
    const starter = starters.find((item) => item.positionId === reserve.positionId && item.absenceConfirmed && !item.used);
    if (!starter) continue;
    starter.points = reserve.points;
    starter.played = true;
    starter.absenceConfirmed = false;
    starter.used = true;
    reserve.used = true;
  }

  const luxuryReserve = bench.find((item) => item.athleteId === luxuryReserveId && !item.used);
  if (luxuryReserve && luxuryReserve.played) {
    const samePosition = starters.filter((item) => item.positionId === luxuryReserve.positionId);
    const absentStarter = samePosition.find((item) => item.absenceConfirmed && !item.used);

    if (absentStarter) {
      if (luxuryReserve.played && luxuryReserve.points > 0) {
        absentStarter.points = luxuryReserve.points;
        absentStarter.played = true;
        absentStarter.absenceConfirmed = false;
        absentStarter.used = true;
        luxuryReserve.used = true;
      }
    } else if (samePosition.length && samePosition.every((item) => item.played)) {
      const lowest = [...samePosition].sort((a, b) => a.points - b.points || (b.captainSlot ? 1 : 0))[0];
      if (lowest && luxuryReserve.points > lowest.points) {
        lowest.points = luxuryReserve.points;
        lowest.used = true;
        luxuryReserve.used = true;
      }
    }
  }

  const total = starters.reduce((sum, item) => sum + item.points * (item.captainSlot ? CAPTAIN_MULTIPLIER : 1), 0);
  const playerSlots = starters.filter((item) => item.positionId !== 6);
  const playedCount = playerSlots.filter((item) => item.played).length;

  return hasPartialSource
    ? {
        points: Number(total.toFixed(2)),
        playedCount,
        lineupCount: playerSlots.length || null,
      }
    : null;
}

export function extractCartolaRoundPoints(payload = {}, scoredPayload = null, matchesPayload = null) {
  return extractCartolaRoundSnapshot(payload, scoredPayload, matchesPayload)?.points ?? null;
}

export function extractCartolaRoundSnapshot(payload = {}, scoredPayload = null, matchesPayload = null) {
  const value = payload.pontos ?? payload.pontuacao ?? payload.time?.pontos;
  const points = numericOrNull(value);
  const partial = scoredPayload ? calculateCartolaPartialSnapshot(payload, scoredPayload, matchesPayload) : null;
  if (points != null) {
    return {
      points,
      playedCount: partial?.playedCount ?? null,
      lineupCount: partial?.lineupCount ?? null,
    };
  }
  return partial;
}

export async function searchCartolaTeams(query, competition = "copa") {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const result = await cartolaFetch(`/times?q=${encodeURIComponent(q)}`, { competition });
  return Array.isArray(result.data) ? result.data.map(normalizeCartolaTeam).filter((t) => t.timeId) : [];
}

export async function getCartolaStatus(competition = "copa") {
  const result = await cartolaFetch("/mercado/status", { competition });
  return result.data || {};
}

export async function getCartolaRounds(competition = "copa") {
  const result = await cartolaFetch("/rodadas", { competition });
  return Array.isArray(result.data) ? result.data : [];
}

export async function getCartolaMatches(competition = "copa") {
  const result = await cartolaFetch("/partidas", { competition });
  return result.data || {};
}

export async function getCartolaScoredAthletes(competition = "copa") {
  const result = await cartolaFetch("/atletas/pontuados", { competition });
  return result.data || {};
}

export async function getCartolaTeamById(timeId, roundId, competition = "copa", options = {}) {
  const id = Number(timeId);
  if (!id) throw new Error("timeId inválido");
  const suffix = roundId ? `/${Number(roundId)}` : "";
  const result = await cartolaFetch(`/time/id/${id}${suffix}`, { competition, ...options });
  return result.data || {};
}
