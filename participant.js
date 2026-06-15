const fmtPts = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

let currentParticipant = null;
let currentState = null;
let currentLineupAthletes = new Map();

const SCOUT_META = {
  G: { label: "Gol", tone: "positive" },
  A: { label: "Assistencia", tone: "positive" },
  DS: { label: "Desarme", tone: "positive" },
  DE: { label: "Defesa", tone: "positive" },
  DP: { label: "Defesa de penalti", tone: "positive" },
  SG: { label: "Saldo de gol", tone: "positive" },
  FS: { label: "Falta sofrida", tone: "positive" },
  FF: { label: "Finalizacao fora", tone: "positive" },
  FD: { label: "Finalizacao defendida", tone: "positive" },
  FT: { label: "Finalizacao na trave", tone: "positive" },
  V: { label: "Vitoria tecnico", tone: "positive" },
  FC: { label: "Falta cometida", tone: "negative" },
  CA: { label: "Cartao amarelo", tone: "negative" },
  CV: { label: "Cartao vermelho", tone: "negative" },
  GC: { label: "Gol contra", tone: "negative" },
  GS: { label: "Gol sofrido", tone: "negative" },
  PP: { label: "Penalti perdido", tone: "negative" },
  PE: { label: "Passe errado", tone: "negative" },
  I: { label: "Impedimento", tone: "negative" },
};

const SCOUT_PLURAL = {
  G: "Gols",
  A: "Assistencias",
  DS: "Desarmes",
  DE: "Defesas",
  DP: "Defesas de penalti",
  SG: "Saldos de gol",
  FS: "Faltas sofridas",
  FF: "Finalizacoes fora",
  FD: "Finalizacoes defendidas",
  FT: "Finalizacoes na trave",
  V: "Vitorias tecnico",
  FC: "Faltas cometidas",
  CA: "Cartoes amarelos",
  CV: "Cartoes vermelhos",
  GC: "Gols contra",
  GS: "Gols sofridos",
  PP: "Penaltis perdidos",
  PE: "Passes errados",
  I: "Impedimentos",
};

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function avatarBg(nome) {
  const hue = hashHue(nome || "?");
  return `linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
}

function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let m = parts[0][0];
  if (parts.length > 1) m += parts[parts.length - 1][0];
  return m.toUpperCase().slice(0, 2);
}

function teamName(participant) {
  return participant.cartolaTeamName || participant.nome || "Time sem nome";
}

function ownerName(participant) {
  return participant.cartolaOwnerName || participant.nome || "Participante";
}

function profileHref(participant) {
  return `/participant?id=${encodeURIComponent(participant.id)}`;
}

function scoreHistory(state, participant) {
  const rows = Array.isArray(state.history) ? state.history : [];
  const item = rows.find((row) => row.participantId === participant.id);
  if (item && Array.isArray(item.scores)) return item.scores;
  if (participant.currentRoundPoints != null && state.currentRound) {
    return [{ roundId: state.currentRound.id, points: participant.currentRoundPoints, source: participant.source }];
  }
  return [];
}

function renderAvatar(participant) {
  const avatar = $("profileAvatar");
  if (participant.escudoUrl) {
    avatar.classList.add("image-avatar");
    avatar.innerHTML = `<img src="${esc(participant.escudoUrl)}" alt="" loading="lazy" />`;
  } else {
    avatar.classList.remove("image-avatar");
    avatar.style.background = avatarBg(teamName(participant));
    avatar.textContent = monogram(teamName(participant));
  }
}

function renderBadges(participant) {
  const badges = Array.isArray(participant.badges) ? participant.badges : [];
  if (!badges.length) {
    $("profileBadges").innerHTML = '<div class="empty compact"><p>Sem conquistas publicadas ainda.</p></div>';
    return;
  }

  $("profileBadges").innerHTML = badges
    .map((badge) => `<div class="badge-card"><span>${esc(badge.label)}</span><strong>${esc(teamName(participant))}</strong></div>`)
    .join("");
}

function renderHistory(state, participant) {
  const history = scoreHistory(state, participant);
  if (!history.length) {
    $("profileHistory").innerHTML = '<div class="empty compact"><p>Historico aparece depois da primeira sincronizacao.</p></div>';
    return;
  }

  const max = Math.max(1, ...history.map((score) => Number(score.points) || 0));
  $("profileHistory").innerHTML = history
    .map((score) => {
      const width = ((Number(score.points) || 0) / max) * 100;
      const progress = score.playedCount != null && score.lineupCount ? `${score.playedCount}/${score.lineupCount} jogadores` : score.source || "rodada";
      return `
      <div class="history-row history-row-pro">
        <span>Rodada ${esc(score.roundId)}<em>${esc(progress)}</em></span>
        <strong>${fmtPts(score.points)} pts</strong>
        <i style="width:${width}%"></i>
      </div>`;
    })
    .join("");
}

function renderRivals(participant) {
  const rivals = participant.rivals || {};
  const cards = [
    { label: "Na mira", item: rivals.ahead, empty: "Ninguem acima" },
    { label: "No retrovisor", item: rivals.behind, empty: "Ninguem abaixo" },
  ];

  $("profileRivals").innerHTML = cards
    .map((card) => {
      if (!card.item) {
        return `<div class="rival-card glass"><span>${card.label}</span><strong>${card.empty}</strong><p>A tabela esta tranquila por aqui.</p></div>`;
      }
      return `
      <a class="rival-card glass" href="${profileHref(card.item)}">
        <span>${card.label}</span>
        <strong>#${card.item.rank} ${esc(teamName(card.item))}</strong>
        <p>${fmtPts(card.item.diff)} pts de diferenca</p>
      </a>`;
    })
    .join("");
}

function statusLabel(status) {
  if (status === "scored") return "pontuou";
  if (status === "empty") return "sem dados";
  return "aguardando";
}

function athleteKey(athlete) {
  return String(athlete.id ?? `${athlete.kind || "athlete"}-${athlete.name || "sem-nome"}`);
}

function scoutValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function scoutLabel(entry) {
  return Math.abs(Number(entry.value)) === 1 ? entry.label : SCOUT_PLURAL[entry.code] || `${entry.label}s`;
}

function scoutPhrase(entry) {
  return `${scoutValue(entry.value)} ${scoutLabel(entry).toLowerCase()}`;
}

function scoutEntries(athlete) {
  const scout = athlete?.scout && typeof athlete.scout === "object" ? athlete.scout : {};
  return Object.entries(scout)
    .map(([code, value]) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return null;
      const meta = SCOUT_META[code] || { label: code, tone: "neutral" };
      return { code, value: number, label: meta.label, tone: meta.tone };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const toneWeight = { positive: 0, neutral: 1, negative: 2 };
      return (toneWeight[a.tone] ?? 1) - (toneWeight[b.tone] ?? 1) || Math.abs(b.value) - Math.abs(a.value) || a.code.localeCompare(b.code);
    });
}

function scoutMiniChips(athlete) {
  const entries = scoutEntries(athlete).slice(0, 3);
  if (!entries.length) return "";
  return `<span class="athlete-scouts">${entries
    .map((entry) => `<span class="scout-mini tone-${esc(entry.tone)}">${esc(scoutValue(entry.value))}${esc(entry.code)}</span>`)
    .join("")}</span>`;
}

function scoutSentence(athlete, entries) {
  if (athlete.status !== "scored") return "Ainda aguardando os scouts oficiais desse jogador.";
  if (!entries.length) return "O Cartola registrou a pontuacao, mas nao enviou scouts detalhados para esse jogador.";
  const positives = entries.filter((entry) => entry.tone === "positive").slice(0, 3);
  const negatives = entries.filter((entry) => entry.tone === "negative").slice(0, 2);
  const positiveText = positives.map(scoutPhrase).join(", ");
  const negativeText = negatives.map(scoutPhrase).join(", ");
  if (positiveText && negativeText) return `Pontuou por ${positiveText}, com desconto por ${negativeText}.`;
  if (positiveText) return `Pontuou principalmente por ${positiveText}.`;
  return `A pontuacao foi afetada por ${negativeText}.`;
}

function athleteCard(athlete) {
  const tags = [];
  if (athlete.isCaptain) tags.push("capitao");
  if (athlete.isLuxuryReserve) tags.push("luxo");
  tags.push(statusLabel(athlete.status));
  const key = athleteKey(athlete);
  const photo = athlete.photoUrl
    ? `<span class="athlete-photo image" data-initials="${esc(monogram(athlete.name))}" style="background:${avatarBg(athlete.name)}"><img src="${esc(athlete.photoUrl)}" alt="" loading="lazy" /></span>`
    : `<span class="athlete-photo" style="background:${avatarBg(athlete.name)}">${esc(monogram(athlete.name))}</span>`;
  return `
    <button class="athlete-card status-${esc(athlete.status || "waiting")}" type="button" data-athlete-id="${esc(key)}" aria-label="Ver scouts de ${esc(athlete.name)}">
      ${photo}
      <div class="athlete-main">
        <span class="athlete-pos">${esc(athlete.positionAbbr || "POS")}${athlete.club?.abbr ? ` · ${esc(athlete.club.abbr)}` : ""}</span>
        <strong>${esc(athlete.name)}</strong>
        ${scoutMiniChips(athlete)}
        <em>${tags.map(esc).join(" · ")}</em>
      </div>
      <b>${athlete.points == null ? "-" : fmtPts(athlete.points)}</b>
    </button>`;
}

function renderLineup(participant) {
  const lineup = participant.lineup;
  if (!lineup || (!Array.isArray(lineup.starters) && !Array.isArray(lineup.reserves))) {
    currentLineupAthletes = new Map();
    $("lineupSummary").innerHTML = '<div class="empty compact"><p>Escalacao ainda nao disponivel para esta rodada.</p></div>';
    $("lineupPitch").innerHTML = "";
    $("benchList").innerHTML = "";
    return;
  }

  const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
  const reserves = Array.isArray(lineup.reserves) ? lineup.reserves : [];
  currentLineupAthletes = new Map([...starters, ...reserves].map((athlete) => [athleteKey(athlete), athlete]));
  const played = Number(lineup.playedCount);
  const total = Number(lineup.lineupCount);
  const progress = Number.isFinite(played) && Number.isFinite(total) && total > 0 ? `${played}/${total} jogadores pontuaram` : "Aguardando pontuacao";

  $("lineupSummary").innerHTML = `
    <div>
      <span>Formacao</span>
      <strong>${esc(lineup.formation || "Escalacao")}</strong>
    </div>
    <div>
      <span>Progresso</span>
      <strong>${esc(progress)}</strong>
    </div>
    <div>
      <span>Capitao</span>
      <strong>${esc(lineup.captainName || "-")}</strong>
    </div>`;

  const rows = [
    { label: "Ataque", items: starters.filter((athlete) => athlete.positionId === 5) },
    { label: "Meio-campo", items: starters.filter((athlete) => athlete.positionId === 4) },
    { label: "Defesa", items: starters.filter((athlete) => athlete.positionId === 2 || athlete.positionId === 3) },
    { label: "Gol", items: starters.filter((athlete) => athlete.positionId === 1) },
    { label: "Tecnico", items: starters.filter((athlete) => athlete.positionId === 6) },
  ].filter((row) => row.items.length);

  $("lineupPitch").innerHTML = rows
    .map((row) => `<div class="pitch-row"><span>${row.label}</span><div>${row.items.map(athleteCard).join("")}</div></div>`)
    .join("");

  $("benchList").innerHTML = reserves.length
    ? `<div class="bench-title">Reservas</div><div class="bench-grid">${reserves.map(athleteCard).join("")}</div>`
    : "";
}

function renderScoutPhoto(athlete) {
  const initials = monogram(athlete.name);
  const bg = avatarBg(athlete.name);
  const holder = $("scoutModalPhoto");
  holder.className = athlete.photoUrl ? "scout-modal-photo image" : "scout-modal-photo";
  holder.dataset.initials = initials;
  holder.style.background = bg;
  if (athlete.photoUrl) {
    holder.innerHTML = `<img src="${esc(athlete.photoUrl)}" alt="" loading="lazy" />`;
    return;
  }
  holder.textContent = initials;
}

function openScoutModal(athleteId) {
  const athlete = currentLineupAthletes.get(String(athleteId));
  if (!athlete) return;
  const entries = scoutEntries(athlete);
  const modal = $("scoutModal");
  renderScoutPhoto(athlete);
  $("scoutModalName").textContent = athlete.name || "Atleta";
  $("scoutModalMeta").textContent = `${athlete.position || athlete.positionAbbr || "Posicao"}${athlete.club?.abbr ? ` - ${athlete.club.abbr}` : ""}`;
  $("scoutModalStatus").textContent = [athlete.isCaptain ? "capitao" : "", athlete.isLuxuryReserve ? "reserva de luxo" : "", statusLabel(athlete.status)].filter(Boolean).join(" - ");
  $("scoutModalPoints").textContent = athlete.points == null ? "-" : fmtPts(athlete.points);
  $("scoutModalNote").textContent = scoutSentence(athlete, entries);
  $("scoutModalChips").innerHTML = entries.length
    ? entries
        .map(
          (entry) => `
            <div class="scout-chip tone-${esc(entry.tone)}">
              <strong>${esc(scoutValue(entry.value))}${esc(entry.code)}</strong>
              <span>${esc(scoutLabel(entry))}</span>
            </div>`
        )
        .join("")
    : '<div class="empty compact"><p>Sem scouts detalhados para este jogador.</p></div>';
  setScoutModalState(true);
  $("scoutCloseBtn").focus();
}

function setScoutModalState(open) {
  const modal = $("scoutModal");
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  modal.style.opacity = open ? "1" : "0";
  modal.style.visibility = open ? "visible" : "hidden";
  modal.style.pointerEvents = open ? "auto" : "none";
  document.body.classList.toggle("modal-open", open);
}

function closeScoutModal() {
  const modal = $("scoutModal");
  setScoutModalState(false);
  if (modal.contains(document.activeElement)) document.activeElement.blur();
}

function shareText(participant, state) {
  const cfg = state.config || {};
  const round = participant.currentRoundPoints == null ? "sem pontuacao na rodada" : `${fmtPts(participant.currentRoundPoints)} pts na rodada`;
  return `${teamName(participant)} (${ownerName(participant)}) na ${cfg.titulo || "Liga Rua do Comercio"}: #${participant.rank || "-"} com ${fmtPts(participant.pontos)} pts, ${round}.`;
}

function renderShareCard(participant, state) {
  $("profileShareTitle").textContent = `${teamName(participant)} esta em #${participant.rank || "-"}`;
  $("profileShareText").textContent = shareText(participant, state);
}

function render(state) {
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const requestedId = new URLSearchParams(location.search).get("id");
  const participant = participants.find((p) => p.id === requestedId) || participants[0];
  currentParticipant = participant;
  currentState = state;

  const cfg = state.config || {};
  $("profileFooter").textContent = cfg.titulo || "Liga Rua do Comercio";
  document.title = participant ? `${teamName(participant)} · ${cfg.titulo || "Liga Rua do Comercio"}` : cfg.titulo || "Liga Rua do Comercio";

  if (!participant) {
    $("profileApp").innerHTML = '<div class="empty"><p>Nenhum participante publicado ainda.</p></div>';
    return;
  }

  renderAvatar(participant);
  $("profileRank").textContent = participant.rank ? `#${participant.rank}` : "#";
  $("profileName").textContent = teamName(participant);
  $("profileTeam").textContent = ownerName(participant);
  $("profileTotal").textContent = fmtPts(participant.totalPoints ?? participant.pontos);
  $("profileRound").textContent = participant.currentRoundPoints == null ? "-" : fmtPts(participant.currentRoundPoints);
  $("profileAverage").textContent = participant.average == null ? "-" : fmtPts(participant.average);
  $("profileBest").textContent = participant.bestRound == null ? "-" : fmtPts(participant.bestRound);
  renderRivals(participant);
  renderLineup(participant);
  renderBadges(participant);
  renderHistory(state, participant);
  renderShareCard(participant, state);
}

async function load() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error("Erro ao carregar");
    render(await r.json());
  } catch (e) {
    $("profileApp").innerHTML = '<div class="empty"><p>Nao foi possivel carregar o perfil agora.</p></div>';
  }
}

async function shareProfile() {
  if (!currentParticipant || !currentState) return;
  const text = shareText(currentParticipant, currentState);
  $("shareProfileNote").textContent = "Abrindo WhatsApp...";
  openWhatsApp(text);
}

async function downloadProfileCard() {
  if (!currentParticipant || !currentState) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#07150e");
  gradient.addColorStop(1, "#040d09");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4cd6b";
  ctx.font = "700 42px Arial";
  ctx.fillText(currentState.config?.titulo || "Liga Rua do Comercio", 72, 112);
  ctx.fillStyle = "#eef5f0";
  ctx.font = "900 82px Arial";
  wrapCanvasText(ctx, teamName(currentParticipant), 72, 230, 900, 88);
  ctx.fillStyle = "#2fe08c";
  ctx.font = "800 56px Arial";
  ctx.fillText(`#${currentParticipant.rank || "-"}  ${fmtPts(currentParticipant.pontos)} pts`, 72, 470);
  ctx.fillStyle = "#eef5f0";
  ctx.font = "700 40px Arial";
  ctx.fillText(`Rodada: ${currentParticipant.currentRoundPoints == null ? "-" : fmtPts(currentParticipant.currentRoundPoints)} pts`, 72, 560);
  ctx.fillText(`Media: ${currentParticipant.average == null ? "-" : fmtPts(currentParticipant.average)} pts`, 72, 622);
  ctx.fillText(`Melhor: ${currentParticipant.bestRound == null ? "-" : fmtPts(currentParticipant.bestRound)} pts`, 72, 684);
  ctx.fillStyle = "#9bb3a6";
  ctx.font = "500 34px Arial";
  wrapCanvasText(ctx, shareText(currentParticipant, currentState), 72, 820, 920, 48);
  ctx.fillStyle = "#f4cd6b";
  ctx.font = "700 34px Arial";
  ctx.fillText("A Copa e mundial. A resenha e local.", 72, 1240);
  const filename = `${teamName(currentParticipant).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "participante"}-card.png`;
  await shareCanvasOrWhatsApp(canvas, filename, `Card de ${teamName(currentParticipant)}`, shareText(currentParticipant, currentState), $("shareProfileNote"));
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

function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
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

$("shareProfileBtn").addEventListener("click", shareProfile);
$("profileCardBtn").addEventListener("click", downloadProfileCard);
$("scoutCloseBtn").addEventListener("click", closeScoutModal);
$("scoutModal").addEventListener("click", (event) => {
  if (event.target.id === "scoutModal") closeScoutModal();
});
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const card = target?.closest(".athlete-card[data-athlete-id]");
  if (card) {
    event.preventDefault();
    openScoutModal(card.dataset.athleteId);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("scoutModal").classList.contains("is-open")) closeScoutModal();
});
document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const holder = image.closest(".athlete-photo, .scout-modal-photo");
    if (!holder) return;
    holder.classList.add("fallback");
    holder.textContent = holder.dataset.initials || "?";
  },
  true
);
load();
