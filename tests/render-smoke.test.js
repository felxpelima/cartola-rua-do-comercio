import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Smoke test: executa landing.js e participant.js num DOM stub minimo,
// com um estado de varias rodadas, para garantir que os novos blocos
// (grafico de evolucao, recordes, recap, head-to-head, capitaes, ao vivo)
// renderizam sem lancar erro de runtime.

function makeEl() {
  const classes = new Set();
  return {
    _html: "",
    textContent: "",
    value: "",
    hidden: false,
    style: {},
    dataset: {},
    className: "",
    onchange: null,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, f) => {
        const on = f === undefined ? !classes.has(c) : f;
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    focus() {},
    blur() {},
    remove() {},
    appendChild() {},
    contains() {
      return false;
    },
    querySelector() {
      return makeEl();
    },
    querySelectorAll() {
      return [];
    },
    get innerHTML() {
      return this._html;
    },
    set innerHTML(v) {
      this._html = String(v);
    },
  };
}

function setGlobal(name, value) {
  try {
    globalThis[name] = value;
    return;
  } catch (e) {
    /* fall through to defineProperty for read-only getters */
  }
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch (e) {
    /* leave the existing global in place */
  }
}

function setupDom(locationSearch) {
  const elements = new Map();
  const doc = {
    title: "",
    body: makeEl(),
    activeElement: null,
    fonts: { ready: Promise.resolve() },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeEl());
      return elements.get(id);
    },
    querySelector() {
      return makeEl();
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    createElement() {
      return makeEl();
    },
  };
  const loc = { origin: "http://localhost", href: `http://localhost/${locationSearch}`, search: locationSearch };
  const win = {
    matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }),
    location: loc,
    open() {},
    html2canvas: null,
  };
  setGlobal("window", win);
  setGlobal("document", doc);
  setGlobal("location", loc);
  setGlobal("requestAnimationFrame", (cb) => {
    cb(Date.now());
    return 0;
  });
  setGlobal("cancelAnimationFrame", () => {});
  setGlobal("setInterval", () => 0);
  return elements;
}

function richState() {
  const rounds = [1, 2, 3];
  const mk = (id, nome, pts, cartola, played, total) => ({
    id,
    nome,
    cartolaTeamName: nome,
    cartolaOwnerName: nome.split(" ")[0],
    pontos: pts.reduce((a, b) => a + b, 0),
    totalPoints: pts.reduce((a, b) => a + b, 0),
    currentRoundPoints: pts[pts.length - 1],
    average: pts.reduce((a, b) => a + b, 0) / pts.length,
    bestRound: Math.max(...pts),
    worstRound: Math.min(...pts),
    source: cartola ? "cartola" : "manual",
    cartolaTimeId: cartola ? 10000 + (Number(String(id).replace(/\D/g, "")) || 0) : null,
    playedCount: played,
    lineupCount: total,
    badges: [{ code: "lider", label: "Líder da Rua" }],
    lineup: null,
    rivals: { ahead: null, behind: null },
  });
  const p1 = mk("p1", "UGO Comércio FC", [70, 80, 92.13], true, 8, 11); // parcial -> ao vivo
  const p2 = mk("p2", "Mercadão United", [60, 90, 81.7], true, 11, 11);
  const p3 = mk("p3", "Banca Central", [88, 50, 75.42], true, 11, 11);
  p1.rank = 1;
  p2.rank = 2;
  p3.rank = 3;
  p1.delta = 1;
  p2.delta = -1;
  p3.delta = 0;
  const cap = (name, pts) => ({ name, points: pts });
  const hist = (p, vals, caps) => ({
    participantId: p.id,
    nome: p.nome,
    scores: rounds.map((r, i) => ({ roundId: r, points: vals[i], source: "cartola", playedCount: 11, lineupCount: 11, captain: caps[i] })),
  });
  return {
    config: { titulo: "Liga Rua do Comércio", subtitulo: "Copa do Mundo 2026", valorPorPessoa: 50, pct1: 50, pct2: 30, pct3: 20, mural: "" },
    currentRound: { id: 3, nome: "Rodada 3", status: "mercado_fechado" },
    lastSync: { status: "partial", finishedAt: new Date().toISOString(), startedAt: new Date().toISOString() },
    participants: [p1, p2, p3],
    roundRanking: [
      { ...p1, pontos: 92.13, roundRank: 1 },
      { ...p2, pontos: 81.7, roundRank: 2 },
      { ...p3, pontos: 75.42, roundRank: 3 },
    ],
    history: [hist(p1, [70, 80, 92.13], [cap("Maestro", 9.3), cap("Artilheiro", 12.6), cap("Ponta", 4.1)]), hist(p2, [60, 90, 81.7], [cap("Camisa 10", 7), cap("Goleiro", 6), cap("Lateral", 3)]), hist(p3, [88, 50, 75.42], [cap("Zagueiro", 5), cap("Meia", 8), cap("Centroavante", 11)])],
    mitadas: [
      { roundId: 3, roundName: "Rodada 3", participantId: "p1", nome: "UGO Comércio FC", cartolaTeamName: "UGO Comércio FC", points: 92.13, mitadasCount: 2, source: "cartola", runnerUp: null },
      { roundId: 1, roundName: "Rodada 1", participantId: "p3", nome: "Banca Central", cartolaTeamName: "Banca Central", points: 88, mitadasCount: 1, source: "cartola", runnerUp: null },
    ],
    highlights: [
      { code: "leader", tone: "gold", label: "Líder geral", title: "UGO Comércio FC", body: "Está no topo.", participantId: "p1", value: "#1" },
      { code: "round-hero", tone: "green", label: "Mito da rodada", title: "UGO Comércio FC", body: "Fez 92.13 pts.", participantId: "p1", value: "92.13 pts" },
      { code: "climb", tone: "green", label: "Arrancada", title: "UGO Comércio FC", body: "Subiu 1.", participantId: "p1", value: "+1" },
      { code: "fall", tone: "red", label: "Escorregada", title: "Mercadão United", body: "Caiu 1.", participantId: "p2", value: "-1" },
      { code: "lantern", tone: "bronze", label: "Ainda dá tempo", title: "Banca Central", body: "Fechando a tabela.", participantId: "p3", value: "#3" },
    ],
  };
}

async function runScript(file, state, locationSearch) {
  const elements = setupDom(locationSearch);
  setGlobal("fetch", async () => ({ ok: true, json: async () => state }));
  const code = readFileSync(file, "utf8");
  // eslint-disable-next-line no-new-func
  new Function(code)();
  await new Promise((resolve) => setTimeout(resolve, 60));
  return elements;
}

const html = (els, id) => (els.get(id) ? els.get(id)._html : "");

test("landing.js renders records, recap and live state without error", async () => {
  const els = await runScript("landing.js", richState(), "");
  // Se render() tivesse lancado, o catch de load() escreveria o erro em #lista.
  assert.doesNotMatch(html(els, "lista"), /Não foi possível carregar/);
  // Com 3 participantes, os nomes vao para o podio.
  assert.match(html(els, "podium"), /UGO Comércio FC|Mercadão United|Banca Central/);
  assert.match(html(els, "records"), /Maior rodada/);
  assert.match(html(els, "records"), /Pior rodada/);
  assert.match(html(els, "roundRecap"), /Resumo da rodada/);
  assert.equal(els.get("liveBanner").hidden, false);
  assert.match(html(els, "roundList"), /pts-partial/);
  // Seletor de rodadas: 3 rodadas no historico -> aparece com a atual marcada.
  assert.equal(els.get("roundSelectWrap").hidden, false);
  assert.match(html(els, "roundSelect"), /Rodada 3 \(atual\)/);
  assert.match(html(els, "roundSelect"), /Rodada 1/);
  // Estado normal (sync "partial"): banner de manutenção escondido.
  assert.equal(els.get("maintenanceBanner").hidden, true);
});

test("landing.js shows the maintenance banner when the last sync is unavailable", async () => {
  const state = richState();
  state.lastSync = { status: "unavailable", finishedAt: new Date().toISOString() };
  const els = await runScript("landing.js", state, "");
  assert.equal(els.get("maintenanceBanner").hidden, false);
});

test("participant.js renders lineup, head-to-head picker and captains without error", async () => {
  const els = await runScript("participant.js", richState(), "?id=p1");
  // No sucesso, #profileApp nunca e tocado; so recebe texto em caso de erro.
  assert.doesNotMatch(html(els, "profileApp"), /Não foi possível carregar/);
  assert.equal(els.get("profileName").textContent, "UGO Comércio FC");
  // Duelo nao carrega confronto sozinho: mostra o seletor e o prompt.
  assert.equal(els.get("h2hSection").hidden, false);
  assert.match(html(els, "h2hSelect"), /<option/);
  assert.match(html(els, "h2hResult"), /Escolha um adversário/);
  assert.equal(els.get("captainSection").hidden, false);
  assert.match(html(els, "captainList"), /Maestro|Artilheiro/);
});

function lineupState() {
  const s = richState();
  const A = (id, name, pos, abbr, pts, o = {}) => ({
    id,
    name,
    positionId: pos,
    positionAbbr: abbr,
    position: abbr,
    club: { abbr: "RUA" },
    points: pts,
    scout: null,
    status: pts == null ? "waiting" : "scored",
    played: pts != null,
    isCaptain: !!o.cap,
    isLuxuryReserve: !!o.luxo,
    kind: "starter",
  });
  const shared = (capId) => ({
    formation: "4-3-3",
    starters: [A(1, "Goleirão", 1, "GOL", 6), A(2, "Zagueiro", 3, "ZAG", 5), A(99, "Craque Geral", 4, "MEI", 11, { cap: capId === 99 }), A(3, "Atacante", 5, "ATA", 8, { cap: capId === 3 }), A(50, "Técnico", 6, "TEC", 0)],
    reserves: [],
    captainId: capId,
    captainName: capId === 99 ? "Craque Geral" : "Atacante",
    playedCount: 4,
    lineupCount: 4,
  });
  s.participants[0].lineup = shared(99);
  s.participants[0].lineup.starters.push(A(777, "Diferencial Z", 5, "ATA", 14));
  s.participants[1].lineup = shared(3);
  s.participants[2].lineup = shared(99);
  return s;
}

test("landing.js renders Raio-X da rodada from the league lineups", async () => {
  const els = await runScript("landing.js", lineupState(), "");
  assert.equal(els.get("raiox").hidden, false);
  assert.match(html(els, "raiox"), /Mais escalado/);
  assert.match(html(els, "raiox"), /Capitão favorito/);
  assert.match(html(els, "raiox"), /Maior pontuador/);
  assert.match(html(els, "raiox"), /Diferencial certeiro/);
  assert.match(html(els, "raiox"), /Craque Geral/);
  // Premiação mostra quem leva agora.
  assert.match(html(els, "prizes"), /Como está agora/);
});

test("participant.js renders lineup cards with captain badge and best highlight", async () => {
  const els = await runScript("participant.js", lineupState(), "?id=p1");
  const pitch = html(els, "lineupPitch");
  assert.match(pitch, /athlete-card/);
  assert.match(pitch, /athlete-cap/);
  assert.match(pitch, /is-best/);
  assert.match(pitch, /Craque Geral/);
});
