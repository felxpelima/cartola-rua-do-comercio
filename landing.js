const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const fmtBRL = (value) => (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPts = (value) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const $ = (id) => document.getElementById(id);

let firstRender = true;
let currentState = null;
let html2canvasPromise = null;

const CROWN_SVG = '<svg class="pod-crown" viewBox="0 0 24 24" fill="#f4cd6b" aria-hidden="true"><path d="M2 8l4.5 3L12 4l5.5 7L22 8l-2.2 11.2a1 1 0 0 1-1 .8H5.2a1 1 0 0 1-1-.8L2 8z"/></svg>';

function sessionFlag(key) {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function setSessionFlag(key) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
  } catch (e) {
    /* sessionStorage indisponivel */
  }
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
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

function proxiedImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname.toLowerCase();
    if (host === "s2-cartola.glbimg.com" || host.endsWith(".glbimg.com")) {
      return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
    }
  } catch (e) {
    return url;
  }
  return url;
}

function avatarMarkup(participant, cls, options = {}) {
  if (participant.escudoUrl) {
    const src = options.proxyImages ? proxiedImageUrl(participant.escudoUrl) : participant.escudoUrl;
    const loading = options.eager ? "eager" : "lazy";
    const cors = options.proxyImages ? ' crossorigin="anonymous"' : "";
    return `<span class="${cls} image-avatar"><img src="${esc(src)}" alt="" loading="${loading}"${cors} /></span>`;
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

  const labels = ["Campeão", "Vice", "Terceiro"];
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
    listEl.innerHTML = '<div class="empty"><div class="e-ico">0</div><p>A classificação ainda não foi publicada.</p></div>';
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
            ${first ? CROWN_SVG : ""}
            <div class="pod-avatar-wrap">
              ${avatarMarkup(participant, "pod-avatar")}
              <span class="pod-badge">${place}</span>
            </div>
            <div class="pod-name">${esc(teamName(participant))}</div>
            <div class="pod-meta">${esc(ownerName(participant))}${compactPlayedMarkup(participant)}</div>
          </a>
          <div class="pod-pts">${fmtPts(participant.pontos)}<span>pts</span></div>
          <div class="pod-block${firstRender ? " anim" : ""}" style="height:${heights[index]}px${firstRender ? `;animation-delay:${index * 90}ms` : ""}"><b>${place}</b></div>
        </div>`;
      })
      .join("");
    restStart = 3;
    rest = ranked.slice(3);
    if (firstRender && window.fxConfetti && !sessionFlag("fx_welcomed")) {
      setSessionFlag("fx_welcomed");
      setTimeout(() => window.fxConfetti({ y: (window.innerHeight || 700) * 0.3 }), 360);
    }
  } else {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
  }

  listEl.innerHTML = rest.map((participant, index) => rankingRow(participant, restStart + index + 1, maxPts, index, { animate: firstRender })).join("");
}

function isPartialParticipant(participant) {
  if (participant.source !== "cartola") return false;
  const starters = participant.lineup && Array.isArray(participant.lineup.starters) ? participant.lineup.starters : null;
  if (starters) {
    // Ao vivo = ainda tem titular com jogo EM ANDAMENTO (status "waiting").
    // Titular que ficou de fora e cujo jogo já acabou fica "empty" (resolvido),
    // então não mantém o time "aguardando" para sempre.
    return starters.some((athlete) => athlete.positionId !== 6 && athlete.status === "waiting");
  }
  // Fallback (sem escalação detalhada): usa jogou < escalado.
  const played = Number(participant.playedCount);
  const total = Number(participant.lineupCount);
  return Number.isFinite(played) && Number.isFinite(total) && total > 0 && played < total;
}

function roundLiveInfo(state) {
  const list = Array.isArray(state?.roundRanking) ? state.roundRanking : [];
  let liveTeams = 0;
  for (const participant of list) {
    if (isPartialParticipant(participant)) liveTeams += 1;
  }
  return { live: liveTeams > 0, liveTeams };
}

function rankingRow(participant, rank, maxPts, index = 0, options = {}) {
  const width = ((Number(participant.pontos) || 0) / maxPts) * 100;
  const partial = options.live && !options.share && isPartialParticipant(participant);
  const classes = ["row"];
  if (options.share) classes.push("share-row");
  if (options.animate) classes.push("anim");
  if (partial) classes.push("live-row");
  const ptsExtra = partial ? '<em class="pts-partial">parcial</em>' : "";
  const styleBits = [`--team-h:${hashHue(teamName(participant))}`];
  if (options.animate) styleBits.push(`animation-delay:${index * 35}ms`);
  const style = ` style="${styleBits.join(";")}"`;
  return `
    <div class="${classes.join(" ")}"${style}>
      <span class="rank">${rank}</span>
      <a class="row-profile" href="${profileHref(participant)}">
        ${avatarMarkup(participant, "row-avatar", { proxyImages: options.proxyImages, eager: options.eagerImages })}
        <div class="row-mid">
          <div class="name-line">
            <span class="name">${esc(teamName(participant))}</span>
            ${deltaMarkup(participant.delta)}
          </div>
          <div class="row-meta">${esc(ownerName(participant))}${playedMarkup(participant)}</div>
          <div class="bar"><i style="width:${width}%"></i></div>
        </div>
      </a>
      <div class="pts">${fmtPts(participant.pontos)}<span>pts</span>${ptsExtra}</div>
    </div>`;
}

function renderRoundRanking(roundRanking, live = false) {
  const list = Array.isArray(roundRanking) ? roundRanking : [];
  if (!list.length) {
    $("roundList").innerHTML = '<div class="empty compact"><p>A rodada ainda não tem pontuação sincronizada.</p></div>';
    return;
  }

  const maxPts = Math.max(1, ...list.map((participant) => Number(participant.pontos) || 0));
  $("roundList").innerHTML = list.map((participant, index) => rankingRow(participant, participant.roundRank || index + 1, maxPts, index, { animate: firstRender, live })).join("");
}

let selectedRoundId = null;

function renderLiveState(state, viewingCurrent) {
  const info = roundLiveInfo(state);
  const banner = $("liveBanner");
  if (banner) {
    const show = viewingCurrent && info.live;
    banner.hidden = !show;
    if (show) {
      const n = info.liveTeams || 0;
      $("liveBannerText").textContent =
        n > 0
          ? `Rodada em andamento — ${n} time${n > 1 ? "s" : ""} ainda em campo. Pontos parciais, atualiza sozinho.`
          : "Rodada em andamento — pontos parciais, atualiza sozinho.";
    }
  }
  // O dot da aba reflete sempre a rodada atual (mesmo olhando uma passada).
  const roundTab = document.querySelector('.tab-btn[data-tab="rodada"]');
  if (roundTab) roundTab.classList.toggle("is-live", info.live);
  return info;
}

function currentRoundId(state) {
  const id = state && state.currentRound ? state.currentRound.id : null;
  return id == null ? null : Number(id);
}

function roundsWithData(state) {
  const history = Array.isArray(state.history) ? state.history : [];
  return [...new Set(history.flatMap((h) => (h.scores || []).map((s) => Number(s.roundId))))].filter((n) => Number.isFinite(n));
}

function buildRoundRankingFor(state, roundId) {
  const history = Array.isArray(state.history) ? state.history : [];
  const byId = new Map((Array.isArray(state.participants) ? state.participants : []).map((p) => [p.id, p]));
  const entries = [];
  for (const h of history) {
    const score = (h.scores || []).find((s) => Number(s.roundId) === Number(roundId));
    if (!score) continue;
    const p = byId.get(h.participantId);
    entries.push({
      id: h.participantId,
      nome: (p && p.nome) || h.nome,
      cartolaTeamName: p && p.cartolaTeamName,
      cartolaOwnerName: p && p.cartolaOwnerName,
      escudoUrl: p && p.escudoUrl,
      pontos: Number(score.points) || 0,
      totalPoints: p ? p.totalPoints ?? p.pontos : null,
      playedCount: score.playedCount,
      lineupCount: score.lineupCount,
      source: score.source,
      delta: 0,
    });
  }
  entries.sort((a, b) => b.pontos - a.pontos || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  entries.forEach((entry, index) => {
    entry.roundRank = index + 1;
  });
  return entries;
}

function renderRoundControls(state) {
  const select = $("roundSelect");
  const wrap = $("roundSelectWrap");
  if (!select) return;
  const curId = currentRoundId(state);
  const ids = roundsWithData(state).sort((a, b) => b - a);
  if (ids.length <= 1) {
    if (wrap) wrap.hidden = true;
    return;
  }
  if (wrap) wrap.hidden = false;
  const selectedId = selectedRoundId == null ? curId : selectedRoundId;
  select.innerHTML = ids
    .map((id) => `<option value="${id}"${id === selectedId ? " selected" : ""}>${id === curId ? `Rodada ${id} (atual)` : `Rodada ${id}`}</option>`)
    .join("");
}

function renderRoundSection(state) {
  renderRoundControls(state);
  const curId = currentRoundId(state);
  const viewingId = selectedRoundId == null ? curId : selectedRoundId;
  const isCurrent = viewingId == null || viewingId === curId;
  const liveInfo = renderLiveState(state, isCurrent);
  if (isCurrent) {
    renderRoundRanking(state.roundRanking, liveInfo.live);
    renderRoundRecap(state, true);
  } else {
    renderRoundRanking(buildRoundRankingFor(state, viewingId), false);
    renderRoundRecap(state, false);
  }
}

function onRoundSelectChange() {
  const select = $("roundSelect");
  if (!select || !currentState) return;
  const val = Number(select.value);
  const curId = currentRoundId(currentState);
  selectedRoundId = Number.isFinite(val) && val !== curId ? val : null;
  renderRoundSection(currentState);
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

function mitadaLine(item) {
  const count = Number(item.mitadasCount) || 1;
  const played = playedLabel(item);
  if (item.runnerUp && Number(item.runnerUp.diff) > 0) {
    return `+${fmtPts(item.runnerUp.diff)} sobre ${teamName(item.runnerUp)}`;
  }
  if (item.runnerUp) return `Empatou com ${teamName(item.runnerUp)}`;
  if (played) return `${played} jogadores pontuaram`;
  return count > 1 ? `${count} mitadas na temporada` : "Mito da rodada";
}

function scoreSourceLabel(source) {
  if (source === "manual") return "manual";
  if (source === "mixed") return "ajustada";
  if (source === "cartola") return "Cartola";
  return "";
}

function renderMitadas(mitadas) {
  const list = Array.isArray(mitadas) ? mitadas : [];
  if (!list.length) {
    $("mitadasList").innerHTML = '<div class="empty compact"><p>As mitadas aparecem depois que uma rodada tiver pontuação salva.</p></div>';
    return;
  }

  $("mitadasList").innerHTML = list
    .map(
      (item, index) => `
      <a class="mitada-card${firstRender ? " anim" : ""}" href="/participant?id=${encodeURIComponent(item.participantId)}"${firstRender ? ` style="animation-delay:${index * 45}ms"` : ""}>
        <div class="mitada-round">
          <span>${esc(item.roundName || `Rodada ${item.roundId}`)}</span>
          <b>${Number(item.mitadasCount) > 1 ? `${Number(item.mitadasCount)}x` : "Mito"}</b>
        </div>
        <div class="mitada-main">
          ${avatarMarkup(item, "mitada-avatar")}
          <div class="mitada-copy">
            <strong>${esc(teamName(item))}</strong>
            <span>${esc(ownerName(item))}</span>
          </div>
          <div class="mitada-points">${fmtPts(item.points)}<span>pts</span></div>
        </div>
        <div class="mitada-foot">
          <span>${esc(mitadaLine(item))}</span>
          ${scoreSourceLabel(item.source) ? `<em>${esc(scoreSourceLabel(item.source))}</em>` : ""}
        </div>
      </a>`
    )
    .join("");
}

function roundShareText() {
  const cfg = currentState?.config || {};
  const highlights = Array.isArray(currentState?.highlights) ? currentState.highlights : [];
  const lines = highlights.slice(0, 5).map((item) => `${item.label}: ${item.title} - ${item.body}`);
  return [`Resenha da ${cfg.titulo || "Liga Rua do Comércio"}`, ...lines].join("\n");
}

function roundRankingShareText() {
  const cfg = currentState?.config || {};
  const roundName = currentState?.currentRound?.nome || "Rodada atual";
  const ranking = Array.isArray(currentState?.roundRanking) ? currentState.roundRanking : [];
  const lines = ranking
    .map((participant, index) => `#${participant.roundRank || index + 1} ${teamName(participant)} - ${fmtPts(participant.pontos)} pts`);
  return [`Ranking da ${roundName} - ${cfg.titulo || "Liga Rua do Comércio"}`, ...lines].join("\n");
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
  const ranking = Array.isArray(currentState?.roundRanking) ? currentState.roundRanking : [];
  if (!ranking.length) {
    $("roundShareNote").textContent = "A rodada ainda não tem ranking para gerar o card.";
    return;
  }

  const noteEl = $("roundShareNote");
  noteEl.textContent = "Montando print da tabela...";

  try {
    const canvas = await renderRoundRankingScreenshot(ranking);
    await shareCanvasOrWhatsApp(canvas, "ranking-rodada.png", "Ranking da rodada", roundRankingShareText(), noteEl);
    return;
  } catch (e) {
    console.warn("Não foi possível gerar o print da tabela.", e);
    noteEl.textContent = "Não consegui gerar o print bonito. Vou usar o card simples.";
  }

  const canvas = renderRoundRankingFallbackCanvas(ranking);
  await shareCanvasOrWhatsApp(canvas, "ranking-rodada.png", "Ranking da rodada", roundRankingShareText(), noteEl);
}

async function renderRoundRankingScreenshot(ranking) {
  const html2canvas = await loadHtml2Canvas();
  const shot = buildRoundRankingShareElement(ranking);
  document.body.appendChild(shot);

  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await waitForImages(shot);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return await html2canvas(shot, {
      backgroundColor: null,
      scale: Math.min(2, window.devicePixelRatio || 2),
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: shot.offsetWidth,
      height: shot.scrollHeight,
      windowWidth: shot.offsetWidth,
      windowHeight: shot.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    shot.remove();
  }
}

function buildRoundRankingShareElement(ranking) {
  const cfg = currentState?.config || {};
  const roundName = currentState?.currentRound?.nome || "Rodada atual";
  const updatedAt = currentState?.lastSync?.finishedAt || currentState?.lastSync?.startedAt || "";
  const maxPts = Math.max(1, ...ranking.map((participant) => Number(participant.pontos) || 0));
  const shot = document.createElement("section");
  shot.className = "share-shot round-ranking-shot";
  shot.setAttribute("aria-hidden", "true");
  shot.innerHTML = `
    <div class="share-shot-head">
      <span class="share-shot-kicker">${esc(cfg.titulo || "Liga Rua do Comércio")}</span>
      <strong>Ranking da rodada</strong>
      <div class="share-shot-meta">
        <span>${esc(roundName)}</span>
        <span>${updatedAt ? `Atualizado ${esc(formatCardDate(updatedAt))}` : `${ranking.length} participantes`}</span>
      </div>
    </div>
    <div class="share-shot-list">
      ${ranking
        .map((participant, index) =>
          rankingRow(participant, participant.roundRank || index + 1, maxPts, index, {
            share: true,
            proxyImages: true,
            eagerImages: true,
          })
        )
        .join("")}
    </div>
    <div class="share-shot-foot">
      <span>Rua do Comércio</span>
      <strong>Cartola Copa 2026</strong>
    </div>`;
  return shot;
}

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HTML2CANVAS_URL;
      script.async = true;
      script.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error("html2canvas indisponivel")));
      script.onerror = () => reject(new Error("Nao foi possivel carregar html2canvas"));
      document.head.appendChild(script);
    });
  }
  return html2canvasPromise;
}

function waitForImages(root) {
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
          setTimeout(done, 3500);
        })
    )
  );
}

function renderRoundRankingFallbackCanvas(ranking) {
  const canvas = document.createElement("canvas");
  const width = 900;
  const rowHeight = 106;
  const headerHeight = 190;
  const footerHeight = 58;
  const height = headerHeight + ranking.length * rowHeight + footerHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const cfg = currentState?.config || {};
  const roundName = currentState?.currentRound?.nome || "Rodada atual";
  const updatedAt = currentState?.lastSync?.finishedAt || currentState?.lastSync?.startedAt || "";

  ctx.fillStyle = "#f6f8f7";
  ctx.fillRect(0, 0, width, height);

  const headerGradient = ctx.createLinearGradient(0, 0, width, headerHeight);
  headerGradient.addColorStop(0, "#08351f");
  headerGradient.addColorStop(1, "#16a34a");
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(790, 36, 190, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4cd6b";
  ctx.font = "800 28px Arial";
  ctx.fillText(cfg.titulo || "Liga Rua do Comércio", 42, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 58px Arial";
  ctx.fillText("Ranking da rodada", 42, 115);
  ctx.font = "700 28px Arial";
  ctx.fillText(roundName, 42, 154);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 20px Arial";
  const updateLabel = updatedAt ? `Atualizado ${formatCardDate(updatedAt)}` : `${ranking.length} participantes`;
  ctx.fillText(updateLabel, 620, 154);

  ranking.forEach((participant, index) => drawRoundRankingRow(ctx, participant, index, 0, headerHeight + index * rowHeight, width, rowHeight));

  ctx.fillStyle = "#e9efec";
  ctx.fillRect(0, height - footerHeight, width, footerHeight);
  ctx.fillStyle = "#607268";
  ctx.font = "700 20px Arial";
  ctx.fillText("Compartilhado pela Liga Rua do Comércio", 42, height - 22);
  ctx.textAlign = "right";
  ctx.fillText("Cartola Copa 2026", width - 42, height - 22);
  ctx.textAlign = "left";

  return canvas;
}

function formatCardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function drawRoundRankingRow(ctx, participant, index, x, y, width, height) {
  const rank = participant.roundRank || index + 1;
  const top = y;
  const highlighted = index === 0;

  ctx.fillStyle = highlighted ? "#dff7e9" : "#ffffff";
  ctx.fillRect(x, top, width, height);
  ctx.fillStyle = "#e6ece8";
  ctx.fillRect(0, top + height - 1, width, 1);

  ctx.fillStyle = highlighted ? "#16a34a" : "#8ca09a";
  ctx.font = "800 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(String(rank), 34, top + 48);
  const delta = Number(participant.delta) || 0;
  ctx.font = "800 16px Arial";
  ctx.fillStyle = delta > 0 ? "#16a34a" : delta < 0 ? "#e05252" : "#9aa8a1";
  ctx.fillText(delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "=", 34, top + 72);
  ctx.textAlign = "left";

  drawCardAvatar(ctx, participant, 82, top + 53, 34);

  const nameX = 132;
  ctx.fillStyle = "#18352b";
  ctx.font = "900 25px Arial";
  drawTextFit(ctx, teamName(participant), nameX, top + 34, 360);
  ctx.fillStyle = "#65776f";
  ctx.font = "600 20px Arial";
  drawTextFit(ctx, ownerName(participant), nameX, top + 60, 330);

  const captain = participant.lineup?.captainName || "";
  if (captain) {
    ctx.fillStyle = "#8ba49a";
    ctx.font = "600 18px Arial";
    drawTextFit(ctx, `c ${captain}`, nameX, top + 86, 330);
  }

  const played = playedLabel(participant);
  ctx.textAlign = "right";
  ctx.fillStyle = "#17342a";
  ctx.font = "900 28px Arial";
  ctx.fillText(fmtPts(participant.pontos), width - 40, top + 38);
  ctx.fillStyle = "#697b74";
  ctx.font = "700 19px Arial";
  ctx.fillText(`${fmtPts(participant.totalPoints ?? participant.pontos)} geral`, width - 40, top + 64);
  ctx.fillStyle = "#2584c7";
  ctx.font = "900 20px Arial";
  ctx.fillText(played || "-", width - 40, top + 90);
  ctx.textAlign = "left";
}

function drawCardAvatar(ctx, participant, cx, cy, radius) {
  const hue = hashHue(teamName(participant));
  const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  gradient.addColorStop(0, `hsl(${hue} 68% 58%)`);
  gradient.addColorStop(1, `hsl(${(hue + 42) % 360} 72% 38%)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d9e1dd";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(monogram(teamName(participant)), cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawTextFit(ctx, text, x, y, maxWidth) {
  let output = String(text || "");
  if (ctx.measureText(output).width <= maxWidth) {
    ctx.fillText(output, x, y);
    return;
  }
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(`${output}...`, x, y);
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

function renderRecords(state) {
  const head = $("recordsHead");
  const box = $("records");
  if (!box) return;
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const history = Array.isArray(state.history) ? state.history : [];
  const nameById = new Map(participants.map((p) => [p.id, teamName(p)]));
  // Rodada em andamento tem pontuacao parcial (baixa): nao deve virar recorde
  // de "pior rodada". Ela entra nos recordes so depois de fechar.
  const excludeRoundId = roundLiveInfo(state).live ? currentRoundId(state) : null;
  const allScores = [];
  for (const h of history) {
    for (const s of h.scores || []) {
      if (excludeRoundId != null && Number(s.roundId) === excludeRoundId) continue;
      allScores.push({ nome: nameById.get(h.participantId) || h.nome, roundId: s.roundId, points: Number(s.points) || 0 });
    }
  }
  if (!allScores.length || participants.length < 2) {
    if (head) head.hidden = true;
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const records = [];
  const best = allScores.reduce((a, b) => (b.points > a.points ? b : a));
  records.push({ label: "Maior rodada", value: `${fmtPts(best.points)} pts`, name: `${best.nome} · R${best.roundId}`, tone: "gold" });
  const worst = allScores.reduce((a, b) => (b.points < a.points ? b : a));
  records.push({ label: "Pior rodada", value: `${fmtPts(worst.points)} pts`, name: `${worst.nome} · R${worst.roundId}`, tone: "red" });
  const withAvg = participants.filter((p) => p.average != null);
  if (withAvg.length) {
    const bestAvg = withAvg.reduce((a, b) => (Number(b.average) > Number(a.average) ? b : a));
    records.push({ label: "Melhor média", value: `${fmtPts(bestAvg.average)} pts`, name: teamName(bestAvg), tone: "green" });
  }
  const mitadas = Array.isArray(state.mitadas) ? state.mitadas : [];
  if (mitadas.length) {
    const topMito = mitadas.reduce((a, b) => (Number(b.mitadasCount) > Number(a.mitadasCount) ? b : a));
    records.push({ label: "Mais mitadas", value: `${Number(topMito.mitadasCount) || 1}x`, name: teamName(topMito), tone: "green" });
  }
  const leader = participants[0];
  if (leader) records.push({ label: "Maior total", value: `${fmtPts(leader.totalPoints ?? leader.pontos)} pts`, name: teamName(leader), tone: "gold" });

  box.innerHTML = records
    .map(
      (r) => `
      <div class="record-card tone-${esc(r.tone)}">
        <span>${esc(r.label)}</span>
        <strong>${esc(r.value)}</strong>
        <em>${esc(r.name)}</em>
      </div>`
    )
    .join("");
  if (head) head.hidden = false;
  box.hidden = false;
}

function renderRoundRecap(state, show = true) {
  const box = $("roundRecap");
  if (!box) return;
  if (!show) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const highlights = Array.isArray(state.highlights) ? state.highlights : [];
  const roundRanking = Array.isArray(state.roundRanking) ? state.roundRanking : [];
  const byCode = (code) => highlights.find((h) => h.code === code);
  const roundName = state?.currentRound?.nome || "Rodada atual";
  const parts = [];
  const hero = byCode("round-hero");
  if (hero) parts.push(`<b>${esc(hero.title)}</b> mitou com ${esc(hero.value || "a maior pontuação")}.`);
  const climb = byCode("climb");
  if (climb) parts.push(`<b>${esc(climb.title)}</b> foi quem mais subiu (${esc(climb.value || "")}).`);
  const fall = byCode("fall");
  if (fall) parts.push(`<b>${esc(fall.title)}</b> escorregou na tabela (${esc(fall.value || "")}).`);
  const lantern = byCode("lantern");
  if (lantern) parts.push(`Lanterna iluminada: <b>${esc(lantern.title)}</b>.`);
  if (!roundRanking.length || !parts.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<span class="recap-kicker">Resumo da rodada</span><strong>${esc(roundName)}</strong><p>${parts.join(" ")}</p>`;
  box.hidden = false;
}

let prevRoundLeaderId = null;
let mitouTimer = null;

function showMitouAlert(name, pts) {
  const el = $("mitouAlert");
  if (!el) return;
  el.innerHTML = `<span class="mitou-pip"></span><strong>MITOU!</strong> <span>${esc(name)} · ${fmtPts(pts)} pts</span>`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  if (window.fxConfetti) window.fxConfetti({ y: 100, count: 64 });
  clearTimeout(mitouTimer);
  mitouTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => {
      el.hidden = true;
    }, 420);
  }, 4200);
}

function checkMitou(state) {
  const list = Array.isArray(state.roundRanking) ? state.roundRanking : [];
  const leader = list[0] || null;
  const leaderId = leader ? leader.id : null;
  if (!firstRender && prevRoundLeaderId && leaderId && leaderId !== prevRoundLeaderId) {
    showMitouAlert(teamName(leader), leader.pontos);
  }
  if (leaderId) prevRoundLeaderId = leaderId;
}

function renderMaintenance(state) {
  const banner = $("maintenanceBanner");
  if (!banner) return;
  // "unavailable" é o status que o sync grava quando o Cartola está em manutenção
  // ou fora do ar. Assim que uma sync voltar a dar certo, o status muda e o banner
  // some sozinho. (status_mercado "4" = manutenção, como sinal extra.)
  const maintenance = state?.lastSync?.status === "unavailable" || String(state?.currentRound?.status ?? "") === "4";
  banner.hidden = !maintenance;
}

function render(state) {
  currentState = state;
  const config = state.config || {};
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const muralText = String(state.mural || config.mural || "").trim();

  $("titulo").textContent = config.titulo || "Liga Rua do Comércio";
  $("subtitulo").textContent = config.subtitulo || "Copa do Mundo 2026";
  $("footer").innerHTML = 'Atualizado pelo organizador <span class="dot">-</span> ' + esc(config.titulo || "");
  document.title = (config.titulo || "Liga Rua do Comércio") + " · " + (config.subtitulo || "");

  $("roundMural").hidden = !muralText;
  $("roundMuralText").textContent = muralText;

  renderMaintenance(state);
  renderPrizes(config, participants);
  renderRanking(participants);
  renderRoundSection(state);
  checkMitou(state);
  renderHighlights(state.highlights);
  renderMitadas(state.mitadas);
  renderRecords(state);
  renderBadges(participants);

  firstRender = false;
}

async function load() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error("erro");
    render(await response.json());
  } catch (e) {
    $("lista").innerHTML = '<div class="empty"><div class="e-ico">!</div><p>Não foi possível carregar os dados agora. Tente recarregar a página.</p></div>';
  }
}

bindTabs();
if ($("roundSelect")) $("roundSelect").addEventListener("change", onRoundSelectChange);
$("shareRoundBtn").addEventListener("click", shareRound);
$("roundCardBtn").addEventListener("click", downloadRoundCard);
load();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load();
});
setInterval(load, 60000);
