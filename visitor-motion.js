(() => {
  "use strict";

  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const selectors = [
    "main > section:not(.hero)",
    "main > .status-strip",
    ".site-footer",
    ".goal-card",
    ".community-card",
    ".post-card",
    ".faq-list summary"
  ];

  const elements = [...new Set(
    selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
  )];

  if (!elements.length) return;

  elements.forEach((element, index) => {
    element.classList.add("motion-reveal");
    element.style.setProperty("--motion-order", String(index % 8));
  });

  document.body.classList.add("visitor-motion-ready");

  if (!("IntersectionObserver" in window)) {
    elements.forEach(element => element.classList.add("motion-in"));
    document.querySelectorAll(".faq-list details[open] > p").forEach(el => el.classList.add("motion-in"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      entry.target.classList.toggle("motion-in", entry.isIntersecting);
    });
  }, {
    threshold: 0.10,
    rootMargin: "0px 0px -35px 0px"
  });

  const observe = element => {
    if (!element) return;
    element.classList.add("motion-reveal");
    observer.observe(element);
  };

  elements.forEach(observe);

  document.querySelectorAll(".faq-list details").forEach(details => {
    details.addEventListener("toggle", () => {
      const answer = details.querySelector(":scope > p");
      if (details.open) {
        observe(answer);
      } else if (answer) {
        answer.classList.remove("motion-in");
      }
    });
    if (details.open) observe(details.querySelector(":scope > p"));
  });
})();
