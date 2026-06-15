const ALLOWED_HOSTS = ["glbimg.com", "s2-cartola.glbimg.com"];

function allowedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
    return allowed ? url : null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const target = allowedUrl(req.query && req.query.url);
  if (!target) {
    return res.status(400).json({ error: "URL de imagem invalida" });
  }

  try {
    const upstream = await fetch(target.href, {
      headers: {
        "User-Agent": "cartola-rua-do-comercio/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Imagem nao encontrada" });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return res.status(415).json({ error: "URL nao aponta para uma imagem" });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.setHeader("Content-Type", contentType);
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(502).json({ error: "Nao foi possivel carregar a imagem" });
  }
}
