import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCartolaPartialPoints, cartolaUrl, extractCartolaRoundPoints, normalizeCartolaTeam } from "../lib/cartola.js";

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

  assert.equal(calculateCartolaPartialPoints(teamPayload, scoredPayload), 11.25);
  assert.equal(extractCartolaRoundPoints(teamPayload, scoredPayload), 11.25);
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
      40: { pontuacao: 5, entrou_em_campo: true },
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
