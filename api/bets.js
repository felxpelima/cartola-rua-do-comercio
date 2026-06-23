import { setBets } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

function safeAuthorized(req) {
  try {
    return isAuthorized(req);
  } catch (e) {
    return false;
  }
}

// Apostas em jogo são criadas/removidas só pelo organizador. O público lê a lista
// pelo /api/data (vem junto do estado), então aqui só existe o POST autenticado
// que grava a lista inteira (o front manda o array atualizado ao adicionar/remover).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (!safeAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  try {
    const bets = Array.isArray(req.body && req.body.bets) ? req.body.bets : [];
    const saved = await setBets(bets);
    return res.status(200).json({ ok: true, bets: saved });
  } catch (e) {
    return res.status(500).json({ error: "Erro ao salvar apostas" });
  }
}
