(() => {
  const button = document.getElementById("backToTop");
  if (!button) return;

  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateVisibility() {
    const threshold = Math.max(360, window.innerHeight * 0.7);
    const visible = window.scrollY > threshold;
    button.classList.toggle("is-visible", visible);
    button.disabled = !visible;
  }

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility);
  updateVisibility();
})();
