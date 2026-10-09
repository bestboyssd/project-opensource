(() => {
  const baseConfig = window.SITE_CONFIG || {};
  const grid = document.querySelector("#project-grid");
  const emptyState = document.querySelector("#empty-state");
  const emptyTitle = document.querySelector("#empty-title");
  const emptyMessage = document.querySelector("#empty-message");
  const retryButton = document.querySelector("#retry-button");
  const searchInput = document.querySelector("#search-input");
  const note = document.querySelector("#results-note");
  const loadMoreWrap = document.querySelector("#load-more-wrap");
  const filters = [...document.querySelectorAll(".filter-tab")];
  const cardLimit = 9;
  const month = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });
  let catalog = {};
  let username = "";
  let repositories = [];
  let repositoryMap = new Map();
  let activeFilter = "all";
  let visibleLimit = cardLimit;

  function sectionFromHash(hash) {
    try { return document.getElementById(decodeURIComponent(hash.replace(/^#/, ""))); }
    catch { return null; }
  }

  function localSectionFor(link) {
    try {
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search || !url.hash) return null;
      return sectionFromHash(url.hash);
    } catch { return null; }
  }

  function scrollToSection(section) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  // Keep native fragment links as a no-JavaScript fallback, but remove fragments
  // in the live site so section navigation never changes the address bar.
  if (window.location.hash) {
    const initialSection = sectionFromHash(window.location.hash);
    if (initialSection) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      requestAnimationFrame(() => scrollToSection(initialSection));
    }
  }

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    const section = localSectionFor(link);
    if (!section) return;
    event.preventDefault();
    scrollToSection(section);
  });

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const cleanText = value => typeof value === "string" ? value.trim() : "";
  const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const topicsOf = repo => (repo.topics || []).map(topic => String(topic).toLowerCase());
  const detailsOf = repo => {
    const details = (catalog.projects || {})[repo.full_name];
    return details && typeof details === "object" ? details : {};
  };
  const titleOf = repo => cleanText(detailsOf(repo).title) || repo.name.replace(/[-_]/g, " ");
  const descriptionOf = repo => cleanText(detailsOf(repo).description) || repo.description || "A little project, made to be useful. Take a look and see if it is for you.";

  function safeUrl(value, fallback = "#") {
    if (!String(value || "").trim()) return fallback;
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
    } catch { return fallback; }
  }

  function projectCategory(repo) {
    const override = detailsOf(repo).category;
    if (["web", "mobile", "tools"].includes(override)) return override;
    const topics = topicsOf(repo);
    const words = `${repo.name} ${repo.description || ""} ${topics.join(" ")}`.toLowerCase();
    if (topics.some(topic => /android|ios|mobile|flutter|react-native/.test(topic)) || /android|mobile app|ios app|flutter|react native/.test(words)) return "mobile";
    if (topics.some(topic => /web|website|webapp/.test(topic)) || /website|web app|webapp|frontend|next\.js/.test(words)) return "web";
    return "tools";
  }

  function categoryLabel(category) { return category === "web" ? "WEB APP" : category === "mobile" ? "MOBILE" : "TOOLS & MORE"; }
  function icon(name) {
    const paths = {
      github: '<path d="M12 .9a11.1 11.1 0 0 0-3.5 21.63c.55.1.76-.24.76-.53v-2.02c-3.1.68-3.76-1.31-3.76-1.31-.5-1.3-1.24-1.65-1.24-1.65-1.02-.7.08-.69.08-.69 1.12.08 1.71 1.15 1.71 1.15 1 1.72 2.62 1.23 3.26.94.1-.73.4-1.23.71-1.52-2.48-.28-5.08-1.24-5.08-5.52 0-1.22.44-2.21 1.15-2.99-.12-.28-.5-1.42.11-2.95 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.44 3.04-1.14 3.04-1.14.61 1.53.23 2.67.12 2.95.71.78 1.14 1.77 1.14 2.99 0 4.29-2.61 5.24-5.1 5.52.4.35.76 1.03.76 2.08V22c0 .3.2.64.77.53A11.1 11.1 0 0 0 12 .9Z"/>',
      download: '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 17v3h16v-3"/>',
      external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
      star: '<path d="m12 2.5 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 16.84l-5.63 2.96 1.08-6.27L2.9 9.1l6.3-.9L12 2.5Z"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.external}</svg>`;
  }

  function getVisibleRepositories() {
    const query = searchInput.value.trim().toLowerCase();
    return repositories.filter(repo => {
      const matchesCategory = activeFilter === "all" || projectCategory(repo) === activeFilter;
      const searchable = `${titleOf(repo)} ${descriptionOf(repo)} ${repo.language || ""} ${topicsOf(repo).join(" ")}`.toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }

  function cardFor(repo, index) {
    const details = detailsOf(repo);
    const category = projectCategory(repo);
    const language = repo.language || "Open source";
    const title = titleOf(repo);
    const description = descriptionOf(repo);
    const updated = month.format(new Date(repo.updated_at));
    const hue = (82 + index * 79) % 360;
    const directDownload = cleanText(details.downloadUrl);
    const topics = topicsOf(repo).filter(topic => !["portfolio", "web", "android", "mobile", "ios", "flutter"].includes(topic)).slice(0, 2);
    const tags = [category === "web" ? "Web app" : category === "mobile" ? "Mobile" : language, ...topics].slice(0, 3);
    const releaseUrl = `${safeUrl(repo.html_url)}/archive/refs/heads/${encodeURIComponent(repo.default_branch || "main")}.zip`;
    const downloadUrl = directDownload ? safeUrl(directDownload, releaseUrl) : releaseUrl;
    const website = cleanText(details.websiteUrl);
    const websiteUrl = website ? safeUrl(website) : safeUrl(repo.homepage || "");
    return `<article class="project-card" data-repository="${escapeHTML(repo.full_name)}" data-custom-download="${directDownload ? "true" : "false"}" style="--hue:${hue};--card-delay:${Math.min(index * 42, 336)}ms">
      <div class="project-cover"><span class="cover-type">${categoryLabel(category)}</span><a class="card-star" href="${escapeHTML(safeUrl(repo.html_url))}" target="_blank" rel="noreferrer" aria-label="View ${escapeHTML(title)} on GitHub">${icon("star")}<span>${repo.stargazers_count || 0}</span></a><span class="cover-icon">${escapeHTML(title.slice(0, 1))}</span><span class="cover-orbit"></span><span class="cover-spark">✳</span></div>
      <div class="project-body"><h3>${escapeHTML(title)}</h3><p class="project-description">${escapeHTML(description)}</p><div class="tag-list">${tags.map((tag, tagIndex) => `<span class="project-tag ${tagIndex === 0 ? "primary-tag" : ""}">${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="card-footer"><span class="updated-date">Updated ${escapeHTML(updated)}</span><div class="card-ctas">${websiteUrl !== "#" ? `<a class="website-action" href="${escapeHTML(websiteUrl)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHTML(title)}">${icon("external")}<span>Open</span></a>` : ""}<a class="repo-action" href="${escapeHTML(safeUrl(repo.html_url))}" target="_blank" rel="noreferrer" aria-label="View repository for ${escapeHTML(title)}">${icon("github")}</a><a class="download-action" href="${escapeHTML(downloadUrl)}" ${directDownload ? "download" : ""} aria-label="Download ${escapeHTML(title)}">${icon("download")}<span>Get app</span></a></div></div></div>
    </article>`;
  }

  function updateCounts() {
    const counts = { all: repositories.length, web: 0, mobile: 0, tools: 0 };
    repositories.forEach(repo => counts[projectCategory(repo)]++);
    Object.entries(counts).forEach(([key, value]) => {
      const node = document.querySelector(`[data-count="${key}"]`);
      if (node) node.textContent = value;
    });
    document.querySelector(".hero-total").textContent = String(repositories.length).padStart(2, "0");
  }

  function render() {
    const matches = getVisibleRepositories();
    const shown = matches.slice(0, visibleLimit);
    grid.innerHTML = shown.map(cardFor).join("");
    grid.setAttribute("aria-busy", "false");
    note.textContent = matches.length ? `SHOWING ${shown.length} OF ${matches.length} ${matches.length === 1 ? "PROJECT" : "PROJECTS"}` : "";
    loadMoreWrap.hidden = matches.length <= visibleLimit;
    emptyState.hidden = matches.length > 0;
    if (!matches.length) {
      emptyTitle.textContent = searchInput.value.trim() ? "Nothing matches that search." : "No projects in this shelf yet.";
      emptyMessage.textContent = searchInput.value.trim() ? "Try a different name or keyword." : "Check back soon for something new.";
      retryButton.hidden = true;
    }
  }

  function showError(message) {
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");
    note.textContent = "THE APP SHELF IS TAKING A BREAK";
    emptyState.hidden = false;
    retryButton.hidden = false;
    emptyTitle.textContent = "Couldn’t load the projects";
    emptyMessage.textContent = message;
  }

  function applyBranding() {
    const brandName = cleanText(catalog.brandName) || "Project Opensource";
    const words = brandName.split(/\s+/);
    document.querySelectorAll(".brand-name").forEach(node => {
      node.innerHTML = words.length > 1 ? `${escapeHTML(words[0])}<span>${escapeHTML(words.slice(1).join(" "))}</span>` : escapeHTML(brandName);
    });
    document.title = `${brandName} — Apps for your everyday`;
    document.querySelector("#hero-line-one").textContent = cleanText(catalog.heroTitle) || "Tools for the";
    document.querySelector("#hero-line-two").textContent = cleanText(catalog.heroAccent) || "things you do.";
    document.querySelector("#hero-description").textContent = cleanText(catalog.heroDescription) || "A growing collection of useful apps, thoughtful experiments, and little fixes for everyday life.";
    const profileUrl = `https://github.com/${encodeURIComponent(username)}`;
    ["#header-profile", "#about-profile", "#footer-profile"].forEach(selector => { document.querySelector(selector).href = profileUrl; });
    document.querySelector("#profile-avatar").innerHTML = `<img src="https://github.com/${encodeURIComponent(username)}.png?size=80" alt="" loading="lazy">`;
  }

  async function readCatalog() {
    const apiBase = cleanText(baseConfig.apiBaseUrl).replace(/\/$/, "");
    let fallback = {};
    try {
      const response = await fetch("catalog.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === "object" && !Array.isArray(data)) fallback = data;
      }
    } catch {}
    if (apiBase) {
      try {
        const response = await fetch(`${apiBase}/api/catalog`, { mode: "cors", cache: "no-store" });
        if (response.ok) {
          const live = await response.json();
          if (live.published && live.catalog && typeof live.catalog === "object" && !Array.isArray(live.catalog)) {
            try { localStorage.setItem("project-opensource:published-catalog", JSON.stringify(live.catalog)); } catch {}
            return live.catalog;
          }
          return fallback;
        }
      } catch {}
    }
    try {
      const cached = JSON.parse(localStorage.getItem("project-opensource:published-catalog") || "null");
      if (cached && typeof cached === "object" && !Array.isArray(cached)) return cached;
    } catch {}
    return fallback;
  }

  async function loadProjects() {
    const maxProjects = Number(baseConfig.maxProjects) || 60;
    grid.setAttribute("aria-busy", "true");
    emptyState.hidden = false;
    emptyTitle.textContent = "One moment…";
    emptyMessage.textContent = "Gathering the projects from GitHub.";
    retryButton.hidden = true;
    try {
      const snapshot = await fetch(new URL("repos.json", document.baseURI), { cache: "no-store" });
      let data;
      if (snapshot.ok) {
        data = await snapshot.json();
      } else {
        const apiBase = cleanText(baseConfig.apiBaseUrl).replace(/\/$/, "");
        const projectsUrl = apiBase
          ? `${apiBase}/api/projects?username=${encodeURIComponent(username)}`
          : `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`;
        const response = await fetch(projectsUrl, { headers: { Accept: "application/vnd.github+json" } });
        if (response.status === 404) throw new Error(`The GitHub profile “${username}” could not be found. Check config.js or the admin catalog.`);
        if (response.status === 403 || response.status === 429) throw new Error("GitHub is temporarily limiting requests. Please wait a little and try again.");
        if (!response.ok) throw new Error("GitHub is having trouble responding. Please try again shortly.");
        data = await response.json();
      }
      if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected response. Please try again shortly.");
      const siteRepo = `${username}/${cleanText(baseConfig.siteRepositoryName)}`.toLowerCase();
      const publicRepos = data.filter(repo => !repo.fork && !repo.private && repo.full_name.toLowerCase() !== siteRepo);
      const available = new Map(publicRepos.map(repo => [repo.full_name.toLowerCase(), repo]));
      let chosen;
      if (Array.isArray(catalog.featuredRepos)) {
        chosen = catalog.featuredRepos.map(name => available.get(String(name).toLowerCase())).filter(Boolean);
      } else {
        const tagged = publicRepos.filter(repo => topicsOf(repo).includes("portfolio"));
        chosen = tagged.length ? tagged : publicRepos;
      }
      repositories = chosen.slice(0, maxProjects);
      repositoryMap = new Map(repositories.map(repo => [repo.full_name, repo]));
      updateCounts();
      render();
    } catch (error) {
      showError(error instanceof TypeError ? "A network error stopped GitHub from loading. Check your connection and try again." : error.message);
    }
  }

  function recordPageVisit() {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
    const apiBase = cleanText(baseConfig.apiBaseUrl);
    if (!apiBase) return;
    fetch(`${apiBase.replace(/\/$/, "")}/api/track`, { method: "POST", mode: "cors", keepalive: true }).catch(() => {});
  }

  document.addEventListener("click", async event => {
    const link = event.target.closest(".download-action");
    if (!link || link.closest(".project-card")?.dataset.customDownload === "true") return;
    const repo = repositoryMap.get(link.closest(".project-card")?.dataset.repository);
    if (!repo) return;
    event.preventDefault();
    link.classList.add("downloading");
    const label = link.querySelector("span");
    const oldText = label.textContent;
    label.textContent = "Getting…";
    const archive = `${safeUrl(repo.html_url)}/archive/refs/heads/${encodeURIComponent(repo.default_branch || "main")}.zip`;
    try {
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (response.ok) {
        const release = await response.json();
        const asset = release.assets?.find(item => item.browser_download_url);
        if (asset) { window.location.assign(safeUrl(asset.browser_download_url, archive)); return; }
      }
      window.location.assign(archive);
    } catch { window.location.assign(archive); }
    finally { link.classList.remove("downloading"); label.textContent = oldText; }
  });

  filters.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    visibleLimit = cardLimit;
    filters.forEach(item => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    render();
  }));
  searchInput.addEventListener("input", () => { visibleLimit = cardLimit; render(); });
  searchInput.addEventListener("keydown", event => { if (event.key === "Escape") { searchInput.value = ""; render(); } });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) { event.preventDefault(); searchInput.focus(); }
  });
  document.querySelector("#load-more").addEventListener("click", () => { visibleLimit += cardLimit; render(); });
  retryButton.addEventListener("click", loadProjects);

  (async () => {
    catalog = await readCatalog();
    username = String(catalog.githubUsername || baseConfig.githubUsername || "").trim().replace(/^@/, "");
    applyBranding();
    if (!username) { showError("Add a GitHub username in config.js or the admin catalog to connect your projects."); retryButton.hidden = true; return; }
    recordPageVisit();
    await loadProjects();
  })();
})();
