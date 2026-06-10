import jwt from "jsonwebtoken";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado.");
  return s;
}

export function signToken() {
  return jwt.sign({ role: "admin" }, secret(), { expiresIn: "7d" });
}

export function isAuthorized(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return false;
  try {
    jwt.verify(token, secret());
    return true;
  } catch (e) {
    return false;
  }
}
