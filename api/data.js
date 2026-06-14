import { getState, setState } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

function text(value, fallback = "", max = 120) {
  return String(value == null ? fallback : value).slice(0, max);
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cartolaId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function safeAuthorized(req) {
  try {
    return isAuthorized(req);
  } catch (e) {
    return false;
  }
}

function sanitize(body) {
  const cfg = (body && body.config) || {};
  const list = Array.isArray(body && body.participants) ? body.participants : [];

  return {
    participants: list.slice(0, 1000).map((p) => ({
      id: text((p && p.id) || "p" + Math.random().toString(36).slice(2, 10), "", 80),
      nome: text((p && (p.nome || p.cartolaTeamName)) || "", "", 80),
      apelido: p && p.apelido ? text(p.apelido, "", 40) : null,
      pontos: number(p && (p.pontos ?? p.manualPoints)),
      manualPoints: number(p && (p.manualPoints ?? p.pontos)),
      currentRoundPoints: nullableNumber(p && p.currentRoundPoints),
      manualOverride: Boolean(p && p.manualOverride),
      cartolaTimeId: cartolaId(p && p.cartolaTimeId),
      cartolaSlug: p && p.cartolaSlug ? text(p.cartolaSlug, "", 120) : null,
      cartolaTeamName: p && p.cartolaTeamName ? text(p.cartolaTeamName, "", 100) : null,
      cartolaOwnerName: p && p.cartolaOwnerName ? text(p.cartolaOwnerName, "", 100) : null,
      escudoUrl: p && p.escudoUrl ? text(p.escudoUrl, "", 500) : null,
    })),
    config: {
      valorPorPessoa: number(cfg.valorPorPessoa),
      pct1: number(cfg.pct1),
      pct2: number(cfg.pct2),
      pct3: number(cfg.pct3),
      titulo: text(cfg.titulo || "Liga Rua do Comércio", "", 120),
      subtitulo: text(cfg.subtitulo || "Copa do Mundo 2026", "", 120),
      ligaSlug: text(cfg.ligaSlug || "cartola-rua-do-comercio", "", 120),
      competition: cfg.competition === "brasileirao" ? "brasileirao" : "copa",
      temporada: Math.trunc(number(cfg.temporada, 2026)),
      mural: text(cfg.mural || "", "", 280),
    },
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const state = await getState();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(state);
    } catch (e) {
      return res.status(500).json({ error: "Erro ao ler os dados" });
    }
  }

  if (req.method === "POST") {
    if (!safeAuthorized(req)) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const clean = sanitize(req.body || {});
      await setState(clean);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao salvar" });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
