/* ==========================================================================
   IN KIND STUDIOS — content data
   Everything swappable lives here: edit these arrays, the page re-renders.
   ========================================================================== */

// SECTION 2 — Our best bits (6–8 cards; 16:9 video placeholders)
const PROJECTS = [
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 01 (16:9)", tags: ["Brand Films", "Social First"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 02 (16:9)", tags: ["Education", "Interviews"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 03 (16:9)", tags: ["Food & Drink", "Brand Films", "Social First"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 04 (16:9)", tags: ["Art & Lifestyle", "Brand Films"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 05 (16:9)", tags: ["Education", "Social First", "Interviews"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 06 (16:9)", tags: ["Art & Lifestyle", "Food & Drink"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 07 (16:9)", tags: ["Brand Films", "Interviews"] },
  { title: "[Client] | [Film Title]", media: "VIDEO — PROJECT 08 (16:9)", tags: ["Social First", "Education"] },
];

// SECTION 5 — Client logo marquee (10–12 placeholders)
const LOGOS = [
  "CLIENT LOGO 01", "CLIENT LOGO 02", "CLIENT LOGO 03", "CLIENT LOGO 04",
  "CLIENT LOGO 05", "CLIENT LOGO 06", "CLIENT LOGO 07", "CLIENT LOGO 08",
  "CLIENT LOGO 09", "CLIENT LOGO 10", "CLIENT LOGO 11", "CLIENT LOGO 12",
];

// SECTION 6 — Values (punchy title + one sentence each)
const VALUES = [
  { title: "We <em>Give</em> First", body: "Generosity is our starting point — more ideas, more care, more time than the brief strictly asked for." },
  { title: "We're <em>All</em> In", body: "When we take on your story we treat it like our own, from the first call to the final cut." },
  { title: "We <em>Listen</em> Hard", body: "Good films start with good listening, so we take real time to understand you before we pick up a camera." },
  { title: "We Give <em>Back</em>", body: "Kindness comes back around — we reinvest in our community, our crew and the city we call home." },
];

// SECTION 7 — Core team (portrait placeholders, 4:5)
const TEAM = [
  { name: "Amy", role: "Creative Producer" },
  { name: "Blessing", role: "Videographer" },
  { name: "Django", role: "Creative Filmmaker" },
  { name: "Phillipe", role: "Apprentice" },
  { name: "Oli", role: "Videographer" },
  { name: "Jamie", role: "Photographer" },
  { name: "Dazo", role: "Production Assistant" },
  { name: "Michael", role: "Operations Director" },
];

// SECTION 7b — Our friends (freelancers & collaborators, circular placeholders)
const FRIENDS = [
  "FRIEND 01", "FRIEND 02", "FRIEND 03", "FRIEND 04", "FRIEND 05", "FRIEND 06",
  "FRIEND 07", "FRIEND 08", "FRIEND 09", "FRIEND 10", "FRIEND 11", "FRIEND 12",
];

/* ==========================================================================
   Render helpers — no need to touch below this line when swapping content
   ========================================================================== */

function phMarkup(label, { video = false, dark = false } = {}) {
  return `
    <div class="ph ${video ? "ph--video" : ""} ${dark ? "ph--dark" : ""}">
      <div class="ph__label">
        ${video ? '<div class="ph__play" aria-hidden="true"></div>' : ""}
        <span class="mono-note">${label}</span>
      </div>
    </div>`;
}

function renderProjects() {
  const grid = document.getElementById("project-grid");
  grid.innerHTML = PROJECTS.map((p, i) => `
    <a class="project-card reveal" href="#" aria-label="${p.title}" data-cursor="view" style="--rd: ${(i % 2) * 110}ms;">
      <div class="project-card__media">${phMarkup(p.media, { video: true })}</div>
      <div class="project-card__meta">
        <span class="project-card__index">${String(i + 1).padStart(2, "0")}</span>
        <h3 class="project-card__title">${p.title}</h3>
        <div class="tag-row">${p.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
    </a>`).join("");
}

function renderLogos() {
  const track = document.getElementById("logo-track");
  const chips = LOGOS.map((l) => `<div class="logo-chip">${l}</div>`).join("");
  track.innerHTML = chips + chips; // duplicated for a seamless loop
}

function renderValues() {
  const grid = document.getElementById("values-grid");
  grid.innerHTML = VALUES.map((v) => `
    <div class="value-card reveal">
      <h3>${v.title}</h3>
      <p>${v.body}</p>
    </div>`).join("");
}

function renderTeam() {
  const grid = document.getElementById("team-grid");
  grid.innerHTML = TEAM.map((m) => `
    <div class="team-card reveal">
      <div class="team-card__media">${phMarkup(`PHOTO — ${m.name.toUpperCase()} (4:5)`)}</div>
      <div>
        <h3>${m.name}</h3>
        <p>${m.role}</p>
      </div>
    </div>`).join("");
}

function renderFriends() {
  const grid = document.getElementById("friends-grid");
  grid.innerHTML = FRIENDS.map((f, i) => `
    <div class="friend reveal">
      <div class="friend__media">${phMarkup(f)}</div>
      <span>[Name ${String(i + 1).padStart(2, "0")}]</span>
    </div>`).join("");
}

function buildTicker(el) {
  const word = el.dataset.word;
  const chunk = () => {
    const c = document.createElement("div");
    c.className = "ticker__chunk";
    for (let i = 0; i < 6; i++) {
      const parts = word.split(" ");
      const last = parts.pop();
      c.insertAdjacentHTML("beforeend", `<span>${parts.join(" ")}&nbsp;<em>${last}</em></span><span class="ticker__dot"></span>`);
    }
    return c;
  };
  const track = document.createElement("div");
  track.className = "ticker__track";
  track.appendChild(chunk());
  track.appendChild(chunk()); // duplicate for seamless loop
  el.appendChild(track);
}

/* ---------- behaviours ---------- */

function initStickyNav() {
  const sticky = document.getElementById("sticky-nav");
  const hero = document.getElementById("hero");
  const obs = new IntersectionObserver(
    // visible only once the hero has been scrolled PAST (not during the intro above it)
    ([entry]) => sticky.classList.toggle(
      "is-visible",
      !entry.isIntersecting && entry.boundingClientRect.top < 0
    ),
    { rootMargin: "-80px 0px 0px 0px" }
  );
  obs.observe(hero);
}

function initMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  document.querySelectorAll("[data-menu-open]").forEach((b) =>
    b.addEventListener("click", () => menu.classList.add("is-open")));
  menu.querySelectorAll("a, [data-menu-close]").forEach((el) =>
    el.addEventListener("click", () => menu.classList.remove("is-open")));
}

function initReveals() {
  // scroll-driven (not IntersectionObserver) so reveals work even in
  // embedded/throttled contexts where IO callbacks are delayed
  const pending = new Set(document.querySelectorAll(".reveal"));
  function check() {
    const vh = window.innerHeight;
    pending.forEach((el) => {
      const r = el.getBoundingClientRect();
      // in view OR already scrolled past (e.g. deep anchor jumps)
      if (r.top < vh * 0.88) {
        el.classList.add("is-in");
        pending.delete(el);
      }
    });
    if (!pending.size) {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    }
  }
  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check, { passive: true });
  const revealTimer = setInterval(function () {
    check();
    if (!pending.size) clearInterval(revealTimer);
  }, 450); /* belt-and-braces for contexts with throttled scroll/IO delivery */
  check();
}

function initNewsletter() {
  const form = document.getElementById("newsletter-form");
  const success = document.getElementById("form-success");
  const error = document.getElementById("form-error");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = form.querySelector("input").value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    success.classList.toggle("is-visible", valid);
    error.classList.toggle("is-visible", !valid);
    if (valid) form.reset();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderProjects();
  renderLogos();
  renderValues();
  renderTeam();
  renderFriends();
  document.querySelectorAll(".ticker").forEach(buildTicker);
  initStickyNav();
  initMobileMenu();
  initReveals();
  initNewsletter();
});
