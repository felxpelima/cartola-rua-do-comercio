import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRoundScoreRawPayload,
  calculateCartolaPartialPoints,
  calculateCartolaPartialSnapshot,
  cartolaUrl,
  extractCartolaRoundPoints,
  extractCartolaRoundSnapshot,
  matchHasStarted,
  matchIsFinished,
  normalizeCartolaTeam,
  normalizeLineupSnapshot,
  normalizeStoredLineupSnapshot,
  roundHasStarted,
  roundIsFinished,
} from "../lib/cartola.js";

test("cartolaUrl applies Copa prefix only for Copa competition", () => {
  assert.equal(cartolaUrl("/mercado/status", "copa"), "https://api.cartola.globo.com/copa/mercado/status");
  assert.equal(cartolaUrl("rodadas", "copa"), "https://api.cartola.globo.com/copa/rodadas");
  assert.equal(cartolaUrl("/mercado/status", "brasileirao"), "https://api.cartola.globo.com/mercado/status");
});

test("normalizeCartolaTeam maps public Cartola team fields", () => {
  const team = normalizeCartolaTeam({
    time_id: "51345451",
    slug: "ugo-comercio-fc",
    nome: "UGO Comércio FC",
    nome_cartola: "Ugo",
    url_escudo_png: "https://example.com/escudo.png",
    assinante: 1,
  });

  assert.deepEqual(team, {
    timeId: 51345451,
    slug: "ugo-comercio-fc",
    nome: "UGO Comércio FC",
    nomeCartola: "Ugo",
    escudoUrl: "https://example.com/escudo.png",
    fotoPerfil: "",
    assinante: true,
  });
});

test("extractCartolaRoundPoints returns null when Cartola has not released points", () => {
  assert.equal(extractCartolaRoundPoints({ pontos: null, pontos_campeonato: null }), null);
  assert.equal(extractCartolaRoundPoints({ pontos: "12.34" }), 12.34);
  assert.equal(extractCartolaRoundPoints({ time: { pontos: 7.89 } }), 7.89);
});

test("extractCartolaRoundPoints computes live partials from scored athletes", () => {
  const teamPayload = {
    pontos: null,
    capitao_id: 20,
    atletas: [
      { atleta_id: 10, pontos_num: 0 },
      { atleta_id: 20, pontos_num: 0 },
      { atleta_id: 30, pontos_num: 0 },
    ],
  };
  const scoredPayload = {
    atletas: {
      10: { pontuacao: 3.25 },
      20: { pontuacao: 4.5 },
      30: { pontuacao: -1 },
    },
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload), 9);
  assert.equal(extractCartolaRoundPoints(teamPayload, scoredPayload), 9);
});

test("calculateCartolaPartialPoints applies 1.5x captain multiplier for Copa scoring", () => {
  const teamPayload = {
    pontos: null,
    capitao_id: 94919,
    atletas: [
      { atleta_id: 94919, posicao_id: 4, clube_id: 2365, pontos_num: 0 },
      { atleta_id: 113735, posicao_id: 6, clube_id: 2326, pontos_num: 0 },
    ],
  };
  const scoredPayload = {
    atletas: {
      94919: { pontuacao: 6.7, entrou_em_campo: true },
      113735: { pontuacao: 0, entrou_em_campo: false },
    },
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload), 10.05);
});

test("calculateCartolaPartialPoints applies normal bench substitution by position", () => {
  const teamPayload = {
    pontos: null,
    capitao_id: 95063,
    atletas: [
      { atleta_id: 95520, posicao_id: 2, clube_id: 2360, pontos_num: 0 },
      { atleta_id: 133063, posicao_id: 3, clube_id: 2365, pontos_num: 0 },
      { atleta_id: 69513, posicao_id: 1, clube_id: 2360, pontos_num: 0 },
    ],
    reservas: [
      { atleta_id: 88312, posicao_id: 3, clube_id: 2354, pontos_num: 0 },
      { atleta_id: 127751, posicao_id: 1, clube_id: 2365, pontos_num: 0 },
    ],
  };
  const scoredPayload = {
    atletas: {
      95520: { pontuacao: 5.5, entrou_em_campo: true },
      88312: { pontuacao: 5.2, entrou_em_campo: true },
      127751: { pontuacao: -1, entrou_em_campo: true },
    },
  };
  const matchesPayload = {
    partidas: [
      { clube_casa_id: 2365, clube_visitante_id: 2354, periodo_tr: "POS_JOGO" },
      { clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" },
    ],
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload, matchesPayload), 10.7);
});

test("calculateCartolaPartialSnapshot counts played player slots excluding coach", () => {
  const teamPayload = {
    pontos: null,
    atletas: [
      { atleta_id: 10, posicao_id: 2, clube_id: 2360, pontos_num: 0 },
      { atleta_id: 20, posicao_id: 3, clube_id: 2365, pontos_num: 0 },
      { atleta_id: 30, posicao_id: 5, clube_id: 2323, pontos_num: 0 },
      { atleta_id: 40, posicao_id: 6, clube_id: 2323, pontos_num: 0 },
    ],
    reservas: [{ atleta_id: 50, posicao_id: 3, clube_id: 2354, pontos_num: 0 }],
  };
  const scoredPayload = {
    atletas: {
      10: { pontuacao: 2, entrou_em_campo: true },
      40: { pontuacao: 0, entrou_em_campo: false },
      50: { pontuacao: 5, entrou_em_campo: true },
    },
  };
  const matchesPayload = {
    partidas: [
      { clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" },
      { clube_casa_id: 2365, clube_visitante_id: 2354, periodo_tr: "POS_JOGO" },
      { clube_casa_id: 2323, clube_visitante_id: 2324, periodo_tr: "", status_transmissao_tr: "CRIADA" },
    ],
  };

  assert.deepEqual(calculateCartolaPartialSnapshot(teamPayload, scoredPayload, matchesPayload), {
    points: 7,
    playedCount: 2,
    lineupCount: 3,
  });
});

test("calculateCartolaPartialPoints applies luxury reserve when it beats lowest starter", () => {
  const teamPayload = {
    pontos: null,
    reserva_luxo_id: 40,
    atletas: [
      { atleta_id: 10, posicao_id: 5, pontos_num: 0 },
      { atleta_id: 20, posicao_id: 5, pontos_num: 0 },
    ],
    reservas: [{ atleta_id: 40, posicao_id: 5, pontos_num: 0 }],
  };
  const scoredPayload = {
    atletas: {
      10: { pontuacao: 2, entrou_em_campo: true },
      20: { pontuacao: 8, entrou_em_campo: true },
      40: { pontuacao: 5, entrou_em_campo: true, scout: { G: 1, FS: 2 } },
    },
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload), 13);
});

test("calculateCartolaPartialPoints does not use reserve before starter match is closed", () => {
  const teamPayload = {
    pontos: null,
    capitao_id: 10,
    atletas: [{ atleta_id: 10, posicao_id: 5, clube_id: 2323, pontos_num: 0 }],
    reservas: [{ atleta_id: 20, posicao_id: 5, clube_id: 2360, pontos_num: 0 }],
  };
  const scoredPayload = {
    atletas: {
      20: { pontuacao: 13, entrou_em_campo: true },
    },
  };
  const matchesPayload = {
    partidas: [
      { clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" },
      { clube_casa_id: 2323, clube_visitante_id: 2324, periodo_tr: "", status_transmissao_tr: "CRIADA" },
    ],
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload, matchesPayload), 0);
});

test("calculateCartolaPartialPoints does not use luxury reserve while starter position still has pending matches", () => {
  const teamPayload = {
    pontos: null,
    capitao_id: 10,
    reserva_luxo_id: 20,
    atletas: [
      { atleta_id: 10, posicao_id: 5, clube_id: 2390, pontos_num: 0 },
      { atleta_id: 11, posicao_id: 5, clube_id: 2323, pontos_num: 0 },
      { atleta_id: 12, posicao_id: 5, clube_id: 2384, pontos_num: 0 },
    ],
    reservas: [{ atleta_id: 20, posicao_id: 5, clube_id: 2360, pontos_num: 0 }],
  };
  const scoredPayload = {
    atletas: {
      20: { pontuacao: 13, entrou_em_campo: true },
    },
  };
  const matchesPayload = {
    partidas: [
      { clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" },
      { clube_casa_id: 2390, clube_visitante_id: 3184, periodo_tr: "", status_transmissao_tr: "CRIADA" },
      { clube_casa_id: 2342, clube_visitante_id: 2323, periodo_tr: "", status_transmissao_tr: "CRIADA" },
      { clube_casa_id: 2384, clube_visitante_id: 3221, periodo_tr: "", status_transmissao_tr: "CRIADA" },
    ],
  };

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload, matchesPayload), 0);
});

test("matchHasStarted treats only pre-game matches as not started", () => {
  // Pré-jogo: nenhum sinal de início.
  assert.equal(matchHasStarted({ periodo_tr: "PRE_JOGO", status_transmissao_tr: "CRIADA" }), false);
  assert.equal(matchHasStarted({ periodo_tr: "", status_transmissao_tr: "AGENDADA", status_cronometro_tr: "PROGRAMADO" }), false);
  assert.equal(matchHasStarted({}), false);
  // Em andamento ou encerrada.
  assert.equal(matchHasStarted({ periodo_tr: "PRIMEIRO_TEMPO" }), true);
  assert.equal(matchHasStarted({ status_transmissao_tr: "EM_ANDAMENTO" }), true);
  assert.equal(matchHasStarted({ status_cronometro_tr: "ENCERRADO" }), true);
  assert.equal(matchHasStarted({ placar_oficial_mandante: 0, placar_oficial_visitante: 0 }), true);
});

test("roundHasStarted blocks scoring until a match of the requested round kicks off", () => {
  const notStarted = {
    rodada: 2,
    partidas: [
      { clube_casa_id: 1, clube_visitante_id: 2, periodo_tr: "PRE_JOGO", status_transmissao_tr: "CRIADA" },
      { clube_casa_id: 3, clube_visitante_id: 4, periodo_tr: "", status_transmissao_tr: "AGENDADA" },
    ],
  };
  assert.equal(roundHasStarted(notStarted, 2), false);

  const started = {
    rodada: 2,
    partidas: [
      { clube_casa_id: 1, clube_visitante_id: 2, periodo_tr: "PRE_JOGO" },
      { clube_casa_id: 3, clube_visitante_id: 4, periodo_tr: "SEGUNDO_TEMPO" },
    ],
  };
  assert.equal(roundHasStarted(started, 2), true);
});

test("roundHasStarted returns null when it cannot tell (no matches or different round)", () => {
  assert.equal(roundHasStarted(null, 2), null);
  assert.equal(roundHasStarted({ rodada: 2, partidas: [] }, 2), null);
  // Partidas de outra rodada (ex.: admin re-sincronizando rodada passada): não bloqueia.
  assert.equal(roundHasStarted({ rodada: 5, partidas: [{ periodo_tr: "PRE_JOGO" }] }, 2), null);
  // Sem roundId informado, ainda dá pra responder com base nas partidas.
  assert.equal(roundHasStarted({ rodada: 2, partidas: [{ periodo_tr: "PRE_JOGO" }] }), false);
});

test("matchIsFinished only trusts end-of-game signals, not live scoreboard", () => {
  assert.equal(matchIsFinished({ periodo_tr: "POS_JOGO" }), true);
  assert.equal(matchIsFinished({ status_transmissao_tr: "ENCERRADA" }), true);
  assert.equal(matchIsFinished({ status_cronometro_tr: "ENCERRADO" }), true);
  // Em andamento (placar ao vivo não conta como encerrada).
  assert.equal(matchIsFinished({ periodo_tr: "SEGUNDO_TEMPO", placar_oficial_mandante: 1, placar_oficial_visitante: 0 }), false);
  assert.equal(matchIsFinished({ periodo_tr: "PRE_JOGO" }), false);
});

test("roundIsFinished is true only when every match of the round has ended", () => {
  const live = {
    rodada: 2,
    partidas: [
      { periodo_tr: "POS_JOGO" },
      { periodo_tr: "SEGUNDO_TEMPO" },
    ],
  };
  assert.equal(roundIsFinished(live, 2), false);
  const done = {
    rodada: 2,
    partidas: [{ periodo_tr: "POS_JOGO" }, { status_transmissao_tr: "ENCERRADA" }],
  };
  assert.equal(roundIsFinished(done, 2), true);
  assert.equal(roundIsFinished(null, 2), null);
  assert.equal(roundIsFinished({ rodada: 5, partidas: [{ periodo_tr: "SEGUNDO_TEMPO" }] }, 2), null);
});

test("extractCartolaRoundSnapshot ignores stale official points while the round is in progress", () => {
  // Cenário do bug: rodada 2 acabou de começar. O Cartola devolve em
  // /time/id/{id}/2 o `pontos` OFICIAL da rodada 1 (45.5), mas a rodada 2 mal
  // começou — a parcial desta rodada é ~0. Não pode herdar os 45.5.
  const teamPayload = {
    pontos: 45.5,
    atletas: [{ atleta_id: 10, posicao_id: 5, clube_id: 2360, pontos_num: 0 }],
  };
  const scoredPayload = { rodada: 2, atletas: { 10: { pontuacao: 1.2, entrou_em_campo: true } } };
  const matchesPayload = { rodada: 2, partidas: [{ clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "PRIMEIRO_TEMPO" }] };

  const snapshot = extractCartolaRoundSnapshot(teamPayload, scoredPayload, matchesPayload);
  assert.equal(snapshot.points, 1.2);
});

test("extractCartolaRoundSnapshot trusts official points once the round has finished", () => {
  const teamPayload = {
    pontos: 45.5,
    atletas: [{ atleta_id: 10, posicao_id: 5, clube_id: 2360, pontos_num: 0 }],
  };
  const scoredPayload = { rodada: 2, atletas: { 10: { pontuacao: 44, entrou_em_campo: true } } };
  const matchesPayload = { rodada: 2, partidas: [{ clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" }] };

  const snapshot = extractCartolaRoundSnapshot(teamPayload, scoredPayload, matchesPayload);
  assert.equal(snapshot.points, 45.5);
});

test("extractCartolaRoundSnapshot rejects stale official points from a previous round snapshot", () => {
  // Bug real (BITELO F C, rodada 3): ao pedir /time/id/{id}/3 numa janela após o
  // fim dos jogos, o Cartola devolveu o snapshot da rodada 2 inteiro — inclusive
  // `pontos` (159.8) e `rodada_atual` (2). As partidas correntes já eram da
  // rodada 4 (nada permite afirmar "em andamento" pela rodada 3). Sem checar a
  // rodada do payload, gravávamos os 159.8 da rodada 2 na rodada 3.
  const teamPayload = {
    pontos: 159.7998046875,
    rodada_atual: 2,
    atletas: [{ atleta_id: 10, posicao_id: 5, clube_id: 2360, pontos_num: 0 }],
  };
  const scoredPayload = { rodada: 3, atletas: { 10: { pontuacao: 12.4, entrou_em_campo: true } } };
  const matchesPayload = { rodada: 4, partidas: [{ clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "PRE_JOGO" }] };

  // Pedindo a rodada 3: o `pontos` oficial é da rodada 2 → descartado, usa a parcial.
  const snapshot = extractCartolaRoundSnapshot(teamPayload, scoredPayload, matchesPayload, 3);
  assert.equal(snapshot.points, 12.4);

  // Sem parcial disponível, não inventa: devolve null para o sync pular o time.
  assert.equal(extractCartolaRoundSnapshot(teamPayload, null, matchesPayload, 3), null);

  // Quando o payload É da rodada pedida e ela encerrou, confia no oficial.
  const consolidated = { pontos: 124.580078125, rodada_atual: 3, atletas: teamPayload.atletas };
  const finished = { rodada: 3, partidas: [{ clube_casa_id: 2360, clube_visitante_id: 2358, periodo_tr: "POS_JOGO" }] };
  assert.equal(extractCartolaRoundSnapshot(consolidated, null, finished, 3).points, 124.580078125);
});

test("normalizeLineupSnapshot exposes starters, reserves, captain and partial status", () => {
  const teamPayload = {
    capitao_id: 20,
    reserva_luxo_id: 90,
    clubes: {
      1: { abreviacao: "BRA", nome_fantasia: "Brasil", escudos: { "45x45": "https://example.com/bra.png" } },
      2: { abreviacao: "ARG" },
    },
    atletas: [
      { atleta_id: 10, apelido: "Goleiro", posicao_id: 1, clube_id: 1 },
      { atleta_id: 20, apelido: "Capitao", posicao_id: 4, clube_id: 1 },
      { atleta_id: 30, apelido: "Zagueiro", posicao_id: 3, clube_id: 2 },
      { atleta_id: 40, apelido: "Atacante", posicao_id: 5, clube_id: 2, pontos_num: 5, foto: "https://s.sde.globo.com/media/person_role/2026/05/19/photo_FORMATO_abc.png" },
      { atleta_id: 50, apelido: "Tecnico", posicao_id: 6, clube_id: 1 },
    ],
    reservas: [{ atleta_id: 90, apelido: "Reserva Luxo", posicao_id: 5, clube_id: 1 }],
  };
  const scoredPayload = {
    atletas: {
      10: { pontuacao: 4, entrou_em_campo: true },
      20: { pontuacao: 8, entrou_em_campo: true },
      40: { pontuacao: 5, entrou_em_campo: true, scout: { G: 1, FS: 2 } },
    },
  };
  const matchesPayload = {
    partidas: [{ clube_casa_id: 2, clube_visitante_id: 3, periodo_tr: "POS_JOGO" }],
  };

  const lineup = normalizeLineupSnapshot(teamPayload, scoredPayload, matchesPayload);
  assert.equal(lineup.formation, "1-1-1");
  assert.equal(lineup.captainName, "Capitao");
  assert.equal(lineup.luxuryReserveName, "Reserva Luxo");
  assert.equal(lineup.starters.length, 5);
  assert.equal(lineup.reserves[0].isLuxuryReserve, true);
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Capitao").isCaptain, true);
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Zagueiro").status, "empty");
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Atacante").status, "scored");
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Atacante").photoUrl, "https://s.sde.globo.com/media/person_role/2026/05/19/photo_220x220_abc.png");
  assert.deepEqual(lineup.starters.find((athlete) => athlete.name === "Atacante").scout, { G: 1, FS: 2 });
  assert.equal(lineup.playedCount, 3);
  assert.equal(lineup.lineupCount, 4);
});

test("stored lineup snapshot keeps individual scored athlete points", () => {
  const teamPayload = {
    capitao_id: 20,
    atletas: [
      { atleta_id: 10, apelido: "Goleiro", posicao_id: 1, clube_id: 1, pontos_num: 0 },
      { atleta_id: 20, apelido: "Capitao", posicao_id: 4, clube_id: 1, pontos_num: 0 },
      { atleta_id: 30, apelido: "Sem Pontos", posicao_id: 5, clube_id: 2, pontos_num: 0 },
    ],
    reservas: [{ atleta_id: 90, apelido: "Reserva", posicao_id: 5, clube_id: 1, pontos_num: 0 }],
  };
  const scoredPayload = {
    rodada: 1,
    atletas: {
      10: { pontuacao: 4.4, entrou_em_campo: true },
      20: { pontuacao: 8.1, entrou_em_campo: true, scout: { A: 1, DS: 2 } },
      999: { pontuacao: 20, entrou_em_campo: true },
    },
  };
  const matchesPayload = {
    rodada: 1,
    partidas: [{ clube_casa_id: 2, clube_visitante_id: 3, periodo_tr: "POS_JOGO" }],
  };

  const raw = buildRoundScoreRawPayload(teamPayload, scoredPayload, matchesPayload);
  assert.deepEqual(Object.keys(raw.__lineupScoredAthletes.atletas).sort(), ["10", "20"]);
  assert.equal(raw.__lineupScoredAthletes.atletas["999"], undefined);

  const lineup = normalizeStoredLineupSnapshot(raw);
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Goleiro").points, 4.4);
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Capitao").points, 8.1);
  assert.deepEqual(lineup.starters.find((athlete) => athlete.name === "Capitao").scout, { A: 1, DS: 2 });
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Sem Pontos").points, null);
  assert.equal(lineup.starters.find((athlete) => athlete.name === "Sem Pontos").status, "empty");
});
