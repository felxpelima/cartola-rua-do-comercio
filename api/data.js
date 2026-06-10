import { getState, setState } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

function sanitize(body) {
  const cfg = (body && body.config) || {};
  const list = Array.isArray(body && body.participants) ? body.participants : [];
  return {
    participants: list.slice(0, 1000).map((p) => ({
      id: String((p && p.id) || "p" + Math.random().toString(36).slice(2, 10)),
      nome: String((p && p.nome) || "").slice(0, 80),
      pontos: Number(p && p.pontos) || 0,
    })),
    config: {
      valorPorPessoa: Number(cfg.valorPorPessoa) || 0,
      pct1: Number(cfg.pct1) || 0,
      pct2: Number(cfg.pct2) || 0,
      pct3: Number(cfg.pct3) || 0,
      titulo: String(cfg.titulo || "Cartola Rua do Comércio").slice(0, 120),
      subtitulo: String(cfg.subtitulo || "Copa do Mundo 2026").slice(0, 120),
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
    if (!isAuthorized(req)) {
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
