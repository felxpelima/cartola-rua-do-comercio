import { signToken } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Servidor não configurado" });
  }
  const password = req.body && req.body.password;
  if (typeof password === "string" && password.length > 0 && password === process.env.ADMIN_PASSWORD) {
    return res.status(200).json({ token: signToken() });
  }
  return res.status(401).json({ error: "Senha incorreta" });
}
