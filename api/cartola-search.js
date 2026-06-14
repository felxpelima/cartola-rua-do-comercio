import { isAuthorized } from "../lib/auth.js";
import { searchCartolaTeams } from "../lib/cartola.js";

function safeAuthorized(req) {
  try {
    return isAuthorized(req);
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  if (!safeAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const q = String(req.query.q || "").trim();
  const competition = req.query.competition === "brasileirao" ? "brasileirao" : "copa";

  if (q.length < 2) {
    return res.status(200).json({ teams: [] });
  }

  try {
    const teams = await searchCartolaTeams(q, competition);
    return res.status(200).json({ teams });
  } catch (e) {
    return res.status(502).json({
      error: "Não foi possível buscar times no Cartola agora.",
      detail: e.message || "Erro externo",
    });
  }
}
