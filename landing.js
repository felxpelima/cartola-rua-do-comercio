const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtBRL = (value) => (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPts = (value) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const $ = (id) => document.getElementById(id);

let firstRender = true;
let currentState = null;

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function teamName(participant) {
  return participant.cartolaTeamName || participant.nome || "Time sem nome";
}

function ownerName(participant) {
  return participant.cartolaOwnerName || participant.nome || "Participante";
}

function avatarBg(nome) {
  const hue = hashHue(nome || "?");
  return `background:linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
}

function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let result = parts[0][0];
  if (parts.length > 1) result += parts[parts.length - 1][0];
  return result.toUpperCase().slice(0, 2);
}

function avatarMarkup(participant, cls) {
  if (participant.escudoUrl) {
    return `<span class="${cls} image-avatar"><img src="${esc(participant.escudoUrl)}" alt="" loading="lazy" /></span>`;
  }
  const name = teamName(participant);
  return `<span class="${cls}" style="${avatarBg(name)}">${esc(monogram(name))}</span>`;
}

function profileHref(participant) {
  return `/participant?id=${encodeURIComponent(participant.id)}`;
}

function countUp(el, to, formatter, duration = 900) {
  if (!el) return;
  if (REDUCED) {
    el.textContent = formatter(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(to * eased);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = formatter(to);
  }
  requestAnimationFrame(frame);
}

function deltaMarkup(delta) {
  const value = Number(delta) || 0;
  if (value > 0) return `<span class="delta up">+${value}</span>`;
  if (value < 0) return `<span class="delta down">${value}</span>`;
  return '<span class="delta flat">=</span>';
}

function playedLabel(participant) {
  const played = Number(participant.playedCount);
  const total = Number(participant.lineupCount);
  if (!Number.isFinite(played) || !Number.isFinite(total) || total <= 0) return "";
  return `${played}/${total}`;
}

function playedMarkup(participant) {
  const label = playedLabel(participant);
  return label ? ` <span class="played-count">${label} jogaram</span>` : "";
}

function compactPlayedMarkup(participant) {
  const label = playedLabel(participant);
  return label ? ` <span class="played-count">${label}</span>` : "";
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    });
  });
}

function renderPrizes(config, participants) {
  const count = participants.length;
  const entryValue = Number(config.valorPorPessoa) || 0;
  const total = count * entryValue;
  const percentages = [Number(config.pct1) || 0, Number(config.pct2) || 0, Number(config.pct3) || 0];
  const maxPct = Math.max(1, ...percentages);

  if (firstRender) countUp($("total"), total, fmtBRL);
  else $("total").textContent = fmtBRL(total);
  $("chipN").textContent = count;
  $("chipValor").textContent = fmtBRL(entryValue);

  const labels = ["Campeao", "Vice", "Terceiro"];
  $("prizes").innerHTML = [0, 1, 2]
    .map(
      (index) => `
      <div class="prize-card glass m${index + 1}">
        <div class="blob"></div>
        <div class="prize-top">
          <div class="medal">${index + 1}</div>
          <div class="prize-place">${index + 1} lugar<small>${labels[index]}</small></div>
        </div>
        <div class="prize-value" data-val="${(total * percentages[index]) / 100}">${fmtBRL((total * percentages[index]) / 100)}</div>
        <div class="prize-foot">
          <span class="prize-pct">${percentages[index]}% do bolao</span>
          <span class="pct-bar"><i style="width:${(percentages[index] / maxPct) * 100}%"></i></span>
        </div>
      </div>`
    )
    .join("");
  if (firstRender) $("prizes").querySelectorAll(".prize-value").forEach((el) => countUp(el, Number(el.dataset.val), fmtBRL));
}

function renderRanking(participants) {
  const ranked = [...participants].sort((a, b) => (Number(b.pontos) || 0) - (Number(a.pontos) || 0));
  const podiumEl = $("podium");
  const listEl = $("lista");
  const maxPts = Math.max(1, ...ranked.map((participant) => Number(participant.pontos) || 0));

  if (participants.length === 0) {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
    listEl.innerHTML = '<div class="empty"><div class="e-ico">0</div><p>A classificacao ainda nao foi publicada.</p></div>';
    return;
  }

  let restStart = 0;
  let rest = ranked;

  if (participants.length >= 3) {
    const order = [ranked[1], ranked[0], ranked[2]];
    const places = [2, 1, 3];
    const heights = [92, 128, 78];
    podiumEl.style.display = "flex";
    podiumEl.innerHTML = order
      .map((participant, index) => {
        const place = places[index];
        const first = place === 1;
        return `
        <div class="podium-col m${place} ${first ? "first" : ""}">
          <a class="pod-profile" href="${profileHref(participant)}">
            <div class="pod-avatar-wrap">
              ${avatarMarkup(participant, "pod-avatar")}
              <span class="pod-badge">${place}</span>
            </div>
            <div class="pod-name">${esc(teamName(participant))}</div>
            <div class="pod-meta">${esc(ownerName(participant))}${compactPlayedMarkup(participant)}</div>
          </a>
          <div class="pod-pts">${fmtPts(participant.pontos)}<span>pts</span></div>
          <div class="pod-block" style="height:${heights[index]}px;animation-delay:${index * 90}ms"><b>${place}</b></div>
        </div>`;
      })
      .join("");
    restStart = 3;
    rest = ranked.slice(3);
  } else {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
  }

  listEl.innerHTML = rest.map((participant, index) => rankingRow(participant, restStart + index + 1, maxPts, index)).join("");
}

function rankingRow(participant, rank, maxPts, index = 0) {
  const width = ((Number(participant.pontos) || 0) / maxPts) * 100;
  return `
    <div class="row" style="animation-delay:${index * 35}ms">
      <span class="rank">${rank}</span>
      <a class="row-profile" href="${profileHref(participant)}">
        ${avatarMarkup(participant, "row-avatar")}
        <div class="row-mid">
          <div class="name-line">
            <span class="name">${esc(teamName(participant))}</span>
            ${deltaMarkup(participant.delta)}
          </div>
          <div class="row-meta">${esc(ownerName(participant))}${playedMarkup(participant)}</div>
          <div class="bar"><i style="width:${width}%"></i></div>
        </div>
      </a>
      <div class="pts">${fmtPts(participant.pontos)}<span>pts</span></div>
    </div>`;
}

function renderRoundRanking(roundRanking) {
  const list = Array.isArray(roundRanking) ? roundRanking : [];
  if (!list.length) {
    $("roundList").innerHTML = '<div class="empty compact"><p>A rodada ainda nao tem pontuacao sincronizada.</p></div>';
    return;
  }

  const maxPts = Math.max(1, ...list.map((participant) => Number(participant.pontos) || 0));
  $("roundList").innerHTML = list.map((participant, index) => rankingRow(participant, participant.roundRank || index + 1, maxPts, index)).join("");
}

function renderBadges(participants) {
  const badges = [];
  for (const participant of participants) {
    for (const badge of participant.badges || []) {
      if (badge.code === "manual") continue;
      badges.push({ participant: teamName(participant), label: badge.label, code: badge.code });
    }
  }

  if (!badges.length) {
    $("badgeList").innerHTML = '<div class="empty compact"><p>As conquistas aparecem depois das primeiras rodadas.</p></div>';
    return;
  }

  $("badgeList").innerHTML = badges
    .slice(0, 12)
    .map((badge) => `<div class="badge-card"><span>${esc(badge.label)}</span><strong>${esc(badge.participant)}</strong></div>`)
    .join("");
}

function renderHighlights(highlights) {
  const list = Array.isArray(highlights) ? highlights : [];
  if (!list.length) {
    $("highlights").innerHTML = '<div class="empty compact"><p>Os destaques aparecem depois da primeira rodada.</p></div>';
    return;
  }

  $("highlights").innerHTML = list
    .map(
      (item) => `
      <a class="highlight-card tone-${esc(item.tone || "gold")}" href="${item.participantId ? `/participant?id=${encodeURIComponent(item.participantId)}` : "#"}">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.body)}</p>
        ${item.value ? `<em>${esc(item.value)}</em>` : ""}
      </a>`
    )
    .join("");
}

function renderSearchResults() {
  if (!currentState || !$("participantSearch") || !$("searchResults")) return;
  const query = normalizeText($("participantSearch").value);
  const participants = Array.isArray(currentState.participants) ? currentState.participants : [];
  if (!query) {
    $("searchResults").innerHTML = "";
    return;
  }

  const matches = participants
    .filter((participant) => normalizeText(`${participant.nome} ${participant.cartolaTeamName} ${participant.cartolaOwnerName}`).includes(query))
    .slice(0, 8);

  if (!matches.length) {
    $("searchResults").innerHTML = '<div class="empty compact"><p>Ninguem encontrado com esse termo.</p></div>';
    return;
  }

  $("searchResults").innerHTML = matches
    .map(
      (participant) => `
      <a class="search-result" href="${profileHref(participant)}">
        ${avatarMarkup(participant, "row-avatar")}
        <span><strong>#${participant.rank || "-"} ${esc(teamName(participant))}</strong><em>${esc(ownerName(participant))}</em></span>
        <b>${fmtPts(participant.pontos)}</b>
      </a>`
    )
    .join("");
}

function roundShareText() {
  const cfg = currentState?.config || {};
  const highlights = Array.isArray(currentState?.highlights) ? currentState.highlights : [];
  const lines = highlights.slice(0, 5).map((item) => `${item.label}: ${item.title} - ${item.body}`);
  return [`Resenha da ${cfg.titulo || "Liga Rua do Comercio"}`, ...lines].join("\n");
}

function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function shareRound() {
  const text = roundShareText();
  $("roundShareNote").textContent = "Abrindo WhatsApp...";
  openWhatsApp(text);
}

async function downloadRoundCard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const cfg = currentState?.config || {};
  const highlights = Array.isArray(currentState?.highlights) ? currentState.highlights.slice(0, 5) : [];
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#07150e");
  gradient.addColorStop(1, "#040d09");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4cd6b";
  ctx.font = "700 44px Arial";
  ctx.fillText(cfg.titulo || "Liga Rua do Comercio", 72, 116);
  ctx.fillStyle = "#eef5f0";
  ctx.font = "900 92px Arial";
  ctx.fillText("Resenha", 72, 220);
  ctx.font = "700 42px Arial";
  highlights.forEach((item, index) => {
    const y = 340 + index * 172;
    ctx.fillStyle = "#2fe08c";
    ctx.fillText(item.label || "Destaque", 72, y);
    ctx.fillStyle = "#eef5f0";
    ctx.fillText(item.title || "", 72, y + 54);
    ctx.fillStyle = "#9bb3a6";
    ctx.font = "500 32px Arial";
    wrapCanvasText(ctx, item.body || "", 72, y + 100, 920, 38);
    ctx.font = "700 42px Arial";
  });
  ctx.fillStyle = "#9bb3a6";
  ctx.font = "500 28px Arial";
  ctx.fillText("cartola-rua-do-comercio", 72, 1280);
  await shareCanvasOrWhatsApp(canvas, "resenha-rodada.png", "Card da rodada", roundShareText(), $("roundShareNote"));
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function shareCanvasOrWhatsApp(canvas, filename, title, text, noteEl) {
  const blob = await canvasToBlob(canvas);
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    try {
      noteEl.textContent = "Escolha o WhatsApp para enviar o card.";
      await navigator.share({ title, text, files: [file] });
      noteEl.textContent = "Card compartilhado.";
      return;
    } catch (e) {
      if (e.name === "AbortError") {
        noteEl.textContent = "Compartilhamento cancelado.";
        return;
      }
    }
  }

  downloadCanvas(canvas, filename);
  openWhatsApp(text);
  noteEl.textContent = "Baixei o card e abri o WhatsApp com a legenda.";
}

function render(state) {
  currentState = state;
  const config = state.config || {};
  const participants = Array.isArray(state.participants) ? state.participants : [];

  $("titulo").textContent = config.titulo || "Liga Rua do Comercio";
  $("subtitulo").textContent = config.subtitulo || "Copa do Mundo 2026";
  $("footer").innerHTML = 'Atualizado pelo organizador <span class="dot">-</span> ' + esc(config.titulo || "");
  document.title = (config.titulo || "Liga Rua do Comercio") + " · " + (config.subtitulo || "");

  renderPrizes(config, participants);
  renderRanking(participants);
  renderRoundRanking(state.roundRanking);
  renderHighlights(state.highlights);
  renderBadges(participants);
  renderSearchResults();

  firstRender = false;
}

async function load() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error("erro");
    render(await response.json());
  } catch (e) {
    $("lista").innerHTML = '<div class="empty"><div class="e-ico">!</div><p>Nao foi possivel carregar os dados agora. Tente recarregar a pagina.</p></div>';
  }
}

bindTabs();
if ($("participantSearch")) $("participantSearch").addEventListener("input", renderSearchResults);
$("shareRoundBtn").addEventListener("click", shareRound);
$("roundCardBtn").addEventListener("click", downloadRoundCard);
load();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load();
});
setInterval(load, 60000);
