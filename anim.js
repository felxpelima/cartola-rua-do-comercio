// Motor de animacao compartilhado (home + perfil). Vanilla, zero dependencia.
// Respeita prefers-reduced-motion: degrada para estatico.
(() => {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Scroll reveal ----------
  // Apenas elementos estruturais estaticos (nunca substituidos via innerHTML),
  // para o reveal acontecer uma vez e nao repetir no refresh de 60s.
  const REVEAL_SELECTOR = ".section-head, .pot-card, .chart-card, .profile-hero, .profile-stat-grid";
  function setupReveal() {
    const targets = Array.from(document.querySelectorAll(REVEAL_SELECTOR));
    if (!targets.length) return;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }
    targets.forEach((el) => el.classList.add("reveal-armed"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" }
    );
    targets.forEach((el) => io.observe(el));
  }

  // ---------- Confete ----------
  let canvas = null;
  let ctx = null;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "fx-confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize, { passive: true });
  }
  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.fxConfetti = function fxConfetti(opts = {}) {
    if (reduced) return;
    ensureCanvas();
    const colors = ["#f4cd6b", "#2fe08c", "#ffffff", "#e0b24a", "#54f0a6"];
    const cx = opts.x != null ? opts.x : window.innerWidth / 2;
    const cy = opts.y != null ? opts.y : window.innerHeight * 0.26;
    const count = opts.count || 96;
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7.5;
      parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4.5,
        g: 0.15 + Math.random() * 0.13,
        s: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        color: colors[(Math.random() * colors.length) | 0],
        life: 1,
      });
    }
    let frame = 0;
    function tick() {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.008;
        if (p.life <= 0 || p.y > canvas.height + 24) continue;
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (alive && frame < 260) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(tick);
  };

  // ---------- Parallax sutil no fundo ----------
  function setupParallax() {
    if (reduced) return;
    const beams = document.querySelector(".bg-beams");
    const pitch = document.querySelector(".bg-pitch");
    if (!beams && !pitch) return;
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY || 0;
          if (beams) beams.style.transform = `translate3d(0, ${y * 0.08}px, 0)`;
          if (pitch) pitch.style.transform = `translate3d(0, ${y * 0.04}px, 0)`;
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  // ---------- Tilt 3D sutil nos cards (desktop) ----------
  function setupTilt() {
    if (reduced) return;
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const SEL = ".prize-card, .highlight-card, .mitada-card, .record-card";
    const MAX = 5;
    let active = null;
    function reset() {
      if (!active) return;
      active.style.transform = "";
      active.style.transition = "";
      active = null;
    }
    document.addEventListener(
      "pointermove",
      (e) => {
        const card = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (card !== active) reset();
        if (!card) return;
        active = card;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = "transform 0.08s ease";
        card.style.transform = `perspective(720px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-3px)`;
      },
      { passive: true }
    );
    document.addEventListener("pointerdown", reset, { passive: true });
    window.addEventListener("scroll", reset, { passive: true });
  }

  function init() {
    setupReveal();
    setupParallax();
    setupTilt();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
