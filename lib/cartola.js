const CARTOLA_BASE_URL = "https://api.cartola.globo.com";
export const SCORING_ENGINE_VERSION = "confirmed-absence-v2";

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

  const total = starters.reduce((sum, item) => sum + item.points + (item.captainSlot ? item.points : 0), 0);

  return hasPartialSource ? Number(total.toFixed(2)) : null;
}

export function extractCartolaRoundPoints(payload = {}, scoredPayload = null, matchesPayload = null) {
  const value = payload.pontos ?? payload.pontuacao ?? payload.time?.pontos;
  const points = numericOrNull(value);
  if (points != null) return points;
  return scoredPayload ? calculateCartolaPartialPoints(payload, scoredPayload, matchesPayload) : null;
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
