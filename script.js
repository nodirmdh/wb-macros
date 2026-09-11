const STORAGE = {
  favorites: "wbMacros.favorites.v2",
  recent: "wbMacros.recent.v2",
  expanded: "wbMacros.expanded.v2",
  checklist: "wbMacros.checklist.v2",
  language: "wbMacros.language",
  theme: "wbMacros.theme",
  sidebarWidth: "wbMacros.sidebarWidth",
};

const state = {
  audience: "passenger",
  view: "all",
  language: localStorage.getItem(STORAGE.language) || "ru",
  theme: localStorage.getItem(STORAGE.theme) || "dark",
  query: "",
  activeId: "",
  favorites: readStorageArray(STORAGE.favorites),
  recent: readStorageArray(STORAGE.recent),
  expanded: readStorageArray(STORAGE.expanded),
  checklist: readStorageObject(STORAGE.checklist),
  data: normalizeData(window.WB_SUPPORT_KNOWLEDGE_V2 || {}),
  visible: [],
  resizeStartX: 0,
  resizeStartWidth: 0,
};

const el = {
  body: document.body,
  search: document.getElementById("searchInput"),
  audienceSwitch: document.getElementById("audienceSwitch"),
  languageSwitch: document.getElementById("languageSwitch"),
  themeSwitch: document.getElementById("themeSwitch"),
  quickNav: document.getElementById("quickNav"),
  tree: document.getElementById("treeRoot"),
  allCount: document.getElementById("allCount"),
  favoritesCount: document.getElementById("favoritesCount"),
  recentCount: document.getElementById("recentCount"),
  visibleCount: document.getElementById("visibleCount"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  empty: document.getElementById("emptyState"),
  content: document.getElementById("contentView"),
  themeLabel: document.getElementById("themeLabel"),
  title: document.getElementById("caseTitle"),
  description: document.getElementById("caseDescription"),
  taxonomy: document.getElementById("taxonomyLabel"),
  favorite: document.getElementById("favoriteButton"),
  roadmap: document.getElementById("roadmapGrid"),
  roadmapSection: document.getElementById("roadmapSection"),
  resetChecklist: document.getElementById("resetChecklistButton"),
  answers: document.getElementById("answersList"),
  answersCount: document.getElementById("answersCount"),
  toast: document.getElementById("toastStack"),
  mobileMenu: document.getElementById("mobileMenuButton"),
  sidebar: document.querySelector(".sidebar"),
  sidebarResize: document.getElementById("sidebarResize"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.documentElement.dataset.theme = state.theme;
  restoreSidebarWidth();
  bindEvents();
  sync();
  render();
  console.info(`[WB Macros] situations: ${state.data.situations.length}, answers: ${state.data.answersCount}`);
}

function bindEvents() {
  el.search.addEventListener("input", () => {
    state.query = el.search.value.trim();
    sync();
    render();
  });

  el.audienceSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-audience]");
    if (!button) return;
    state.audience = button.dataset.audience;
    state.activeId = "";
    sync();
    render();
  });

  el.languageSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button) return;
    state.language = button.dataset.language;
    localStorage.setItem(STORAGE.language, state.language);
    render();
  });

  el.themeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    state.theme = button.dataset.theme;
    localStorage.setItem(STORAGE.theme, state.theme);
    document.documentElement.dataset.theme = state.theme;
    renderSwitches();
  });

  el.quickNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    state.activeId = "";
    sync();
    render();
  });

  el.tree.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle]");
    const item = event.target.closest("[data-id]");
    if (toggle) {
      toggleExpanded(toggle.dataset.toggle);
      renderTree();
      return;
    }
    if (item) {
      openSituation(item.dataset.id);
    }
  });

  el.favorite.addEventListener("click", () => {
    const situation = getActiveSituation();
    if (!situation) return;
    toggleFavorite(situation.id);
  });

  el.answers.addEventListener("click", (event) => {
    const copy = event.target.closest("[data-copy]");
    const favorite = event.target.closest("[data-favorite-answer]");
    if (copy) copyAnswer(copy.dataset.copy, copy.dataset.lang || state.language);
    if (favorite) toggleFavorite(favorite.dataset.favoriteAnswer);
  });

  el.roadmap.addEventListener("change", (event) => {
    const input = event.target.closest("[data-check]");
    if (!input) return;
    state.checklist[input.dataset.check] = input.checked;
    saveObject(STORAGE.checklist, state.checklist);
  });

  el.resetChecklist.addEventListener("click", resetChecklist);
  el.mobileMenu.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  el.sidebarResize.addEventListener("pointerdown", startSidebarResize);
  window.addEventListener("resize", restoreSidebarWidth);

  document.addEventListener("keydown", handleKeys);
}

function normalizeData(raw) {
  const situations = (raw.situations || []).map((item, index) => {
    const answers = (item.answers || []).filter((answer) => answer.ru || answer.uz);
    return {
      id: item.id || `situation-${index + 1}`,
      audience: item.audience === "driver" ? "driver" : "passenger",
      category: item.category || item.path?.[0] || "Без категории",
      group: item.group || item.path?.[1] || "Общее",
      title: item.title || item.path?.[2] || `Ситуация ${index + 1}`,
      path: item.path?.length ? item.path : [item.category || "Без категории", item.group || "Общее", item.title || `Ситуация ${index + 1}`],
      description: item.description || "",
      theme: item.theme || "",
      officialTaxonomy: item.officialTaxonomy || [],
      aliases: item.aliases || [],
      tags: item.tags || [],
      roadmap: item.roadmap || {},
      answers,
      searchText: normalizeSearch([
        item.category,
        item.group,
        item.title,
        item.description,
        item.theme,
        ...(item.officialTaxonomy || []),
        ...(item.aliases || []),
        ...(item.tags || []),
        ...Object.values(item.roadmap || {}).flat(),
        ...answers.flatMap((answer) => [answer.title, answer.ru, answer.uz]),
      ].join(" ")),
    };
  }).filter((item) => item.answers.length);

  return {
    situations,
    answersCount: situations.reduce((sum, item) => sum + item.answers.length, 0),
  };
}

function sync() {
  state.visible = getVisibleSituations();
  if (!state.activeId || !state.visible.some((item) => item.id === state.activeId)) {
    state.activeId = state.visible[0]?.id || "";
  }
  const active = getActiveSituation();
  if (active && state.query && state.visible.length === 1) expandPath(active.path);
}

function getVisibleSituations() {
  const query = normalizeSearch(state.query);
  return state.data.situations
    .filter((item) => item.audience === state.audience)
    .filter((item) => state.view === "favorites" ? state.favorites.includes(item.id) : true)
    .filter((item) => state.view === "recent" ? state.recent.includes(item.id) : true)
    .map((item) => ({ item, score: query ? scoreSituation(item, query) : 1 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ru"))
    .map(({ item }) => item);
}

function scoreSituation(item, query) {
  const intentId = getSearchIntentTarget(query);
  if (intentId) {
    if (item.id === intentId) return 1300;
    if (isKnownWrongNoCarsTarget(item)) return 0;
  }
  const title = normalizeSearch(item.title);
  const aliasList = item.aliases || [];
  const keywordList = item.keywords || [];
  const aliases = normalizeSearch(aliasList.join(" "));
  const keywords = normalizeSearch(keywordList.join(" "));
  const hasExactAlias = [...aliasList, ...keywordList].some((value) => normalizeSearch(value) === query);

  if (title === query) return 1000;
  if (hasExactAlias) return 950;
  if (title.includes(query)) return 700;
  if (aliases.includes(query) || keywords.includes(query)) return 600;
  if (normalizeSearch(item.group).includes(query)) return 500;
  if (normalizeSearch(item.category).includes(query)) return 420;
  if (normalizeSearch(item.theme).includes(query)) return 350;
  if (normalizeSearch(item.officialTaxonomy.join(" ")).includes(query)) return 300;
  return item.searchText.includes(query) ? 100 : 0;
}

function getSearchIntentTarget(query) {
  const priorities = [
    { id: "sit-pass-no-free-cars-drivers", queries: ["нет машины", "нет машин", "нет свободных машин", "машина не находится", "не могу найти машину", "не назначается водитель", "haydovchi topilmayapti", "mashina topilmayapti", "mashina topilmadi", "mashina yo'q", "mashina yoq", "mashina yo‘q"] },
    { id: "sit-pass-long-search-faster", queries: ["долго ищет машину", "долго ищет водителя", "поиск затянулся", "хочу быстрее", "как ускорить поиск", "долго не находится машина"] },
    { id: "sit-common-driver-not-moving", queries: ["водитель не едет", "водитель стоит", "стоит на месте", "машина стоит", "водитель не двигается"] },
    { id: "------------9-a5ee559", queries: ["водитель долго едет", "долго ждать водителя", "долго едет", "долго ждать машину", "haydovchi uzoq kelyapti", "haydovchi sekin kelyapti", "uzoq kutyapman"] },
    { id: "-------8-1a789bd", queries: ["водитель не приехал", "водитель не приезжает", "haydovchi kelmayapti", "haydovchi kelmadi"] },
    { id: "sit-pass-check-info-5-min", queries: ["проверю информацию", "проверка информации", "нужно время на проверку", "проверка бз"] },
    { id: "sit-pass-complex-check-15-min", queries: ["сложная проверка", "уточнение у св", "15 минут", "долгая проверка"] },
    { id: "sit-pass-trip-price-composition", queries: ["стоимость поездки", "из чего цена", "из чего складывается стоимость", "детализация стоимости"] },
    { id: "sit-pass-dynamic-price-changed", queries: ["динамическая цена", "цена изменилась", "сначала дороже", "почему цена меняется", "стоимость изменилась"] },
    { id: "sit-pass-multiple-rides-at-once", queries: ["несколько поездок", "заказать две машины", "две машины", "одновременно другу", "машину себе и другу"] },
    { id: "sit-pass-same-driver-assigned", queries: ["один и тот же водитель", "назначается один водитель", "мало водителей", "снова тот же водитель"] },
    { id: "sit-pass-driver-drunk-inappropriate", queries: ["водитель пьян", "водитель неадекватный", "водитель под наркотиками", "пьяный водитель"] },
    { id: "sit-pass-driver-aggression-threats", queries: ["водитель угрожает", "угрозы", "агрессия", "сильное хамство"] },
    { id: "sit-pass-physical-violence-harassment", queries: ["домогательства", "насилие", "физическое насилие", "приставания"] },
    { id: "sit-pass-dangerous-driving-traffic-violation", queries: ["опасно водит", "опасное вождение", "нарушает пдд", "превышает скорость"] },
    { id: "sit-pass-accident-during-trip", queries: ["дтп", "авария", "попали в дтп", "авария во время поездки"] },
    { id: "sit-pass-driver-rude-insults", queries: ["хамит", "оскорбляет", "хамство", "оскорбления", "грубый водитель"] },
    { id: "sit-pass-frequent-cancellations-warning", queries: ["много отмен", "предупреждение об отменах", "частые отмены предупреждение", "уведомление о большом количестве отмен"] },
  ];
  const match = priorities.find((item) => item.queries.some((value) => normalizeSearch(value) === query));
  return match?.id || "";
}

function isKnownWrongNoCarsTarget(item) {
  return item.id === "-----------------1-3e56f4c" || item.id === "sit-telegram-pass-delivery" || item.id === "sit-telegram-pass-baggage";
}

function render() {
  renderSwitches();
  renderCounters();
  renderTree();
  renderContent();
}

function renderSwitches() {
  updateButtons(el.audienceSwitch, "audience", state.audience);
  updateButtons(el.languageSwitch, "language", state.language);
  updateButtons(el.themeSwitch, "theme", state.theme);
  updateButtons(el.quickNav, "view", state.view);
}

function updateButtons(container, key, value) {
  container.querySelectorAll(`[data-${key}]`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[key] === value);
  });
}

function renderCounters() {
  const audienceItems = state.data.situations.filter((item) => item.audience === state.audience);
  el.allCount.textContent = audienceItems.length;
  el.favoritesCount.textContent = audienceItems.filter((item) => state.favorites.includes(item.id)).length;
  el.recentCount.textContent = audienceItems.filter((item) => state.recent.includes(item.id)).length;
  el.visibleCount.textContent = state.visible.length;
}

function renderTree() {
  el.tree.replaceChildren(renderTreeNodes(buildTree(state.visible)));
}

function buildTree(items) {
  const root = [];
  items.forEach((item) => {
    let level = root;
    item.path.forEach((label, index) => {
      let node = level.find((entry) => entry.label === label);
      if (!node) {
        node = { label, key: item.path.slice(0, index + 1).join(" / "), children: [], count: 0, situation: null };
        level.push(node);
      }
      node.count += 1;
      if (index === item.path.length - 1) node.situation = item;
      level = node.children;
    });
  });
  return root.sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function renderTreeNodes(nodes) {
  const fragment = document.createDocumentFragment();
  nodes.forEach((node) => {
    const wrap = document.createElement("div");
    const hasChildren = node.children.length > 0;
    const isOpen = state.expanded.includes(node.key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-item${node.situation?.id === state.activeId ? " is-active" : ""}`;
    button.title = node.key;
    if (node.situation) button.dataset.id = node.situation.id;
    if (hasChildren) button.dataset.toggle = node.key;
    button.innerHTML = `<span class="tree-label">${hasChildren ? (isOpen ? "▾" : "▸") : "•"} ${escapeHtml(node.label)}</span><span class="tree-count">${node.count}</span>`;
    wrap.appendChild(button);
    if (hasChildren && isOpen) {
      const children = document.createElement("div");
      children.className = "tree-children";
      children.appendChild(renderTreeNodes(node.children));
      wrap.appendChild(children);
    }
    fragment.appendChild(wrap);
  });
  return fragment;
}

function renderContent() {
  const situation = getActiveSituation();
  if (!situation) {
    el.empty.classList.remove("is-hidden");
    el.content.classList.add("is-hidden");
    return;
  }

  el.empty.classList.add("is-hidden");
  el.content.classList.remove("is-hidden");
  el.breadcrumbs.textContent = situation.path.join(" / ");
  el.themeLabel.textContent = situation.theme ? `Тематика обращения: ${situation.theme}` : "";
  el.title.textContent = situation.title;
  el.description.textContent = situation.description || "Готовые ответы и действия оператора по выбранной ситуации.";
  el.taxonomy.textContent = situation.officialTaxonomy.length ? `Возможная тематика: ${situation.officialTaxonomy.join(", ")}` : "";
  el.favorite.classList.toggle("is-active", state.favorites.includes(situation.id));
  el.favorite.textContent = state.favorites.includes(situation.id) ? "★" : "☆";
  renderRoadmap(situation);
  renderAnswers(situation);
}

function renderRoadmap(situation) {
  const labels = {
    askFor: "Что запросить / уточнить",
    check: "Что проверить",
    customerSteps: "Что предложить пользователю",
    operatorActions: "Действия оператора",
    doNot: "Чего не делать",
    escalation: "Когда передать / эскалировать",
  };
  const sections = Object.entries(labels)
    .map(([key, title]) => ({ key, title, items: situation.roadmap[key] || [] }))
    .filter((section) => section.items.length);

  el.roadmapSection.classList.toggle("is-hidden", !sections.length);
  el.roadmap.replaceChildren();
  sections.forEach((section) => {
    const block = document.createElement("div");
    block.className = "roadmap-block";
    block.innerHTML = `<h4>${escapeHtml(section.title)}</h4>`;
    section.items.forEach((item, index) => {
      const id = `${situation.id}:${section.key}:${index}`;
      const label = document.createElement("label");
      label.className = "roadmap-check";
      label.innerHTML = `<input type="checkbox" data-check="${escapeHtml(id)}" ${state.checklist[id] ? "checked" : ""}> <span>${escapeHtml(item)}</span>`;
      block.appendChild(label);
    });
    el.roadmap.appendChild(block);
  });
}

function renderAnswers(situation) {
  el.answersCount.textContent = situation.answers.length;
  el.answers.replaceChildren();
  situation.answers.forEach((answer) => {
    const item = document.createElement("article");
    item.className = "answer-item";
    item.innerHTML = `
      <div class="answer-head">
        <div>
          <div class="answer-stage">${escapeHtml(answer.stage || "initial")}</div>
          <h4 class="answer-title">${escapeHtml(answer.title || "Ответ")}</h4>
        </div>
      </div>
      <div class="answer-variants">
        ${renderAnswerVariant(answer, "ru", "Русский")}
        ${renderAnswerVariant(answer, "uz", "O'zbekcha")}
      </div>
      <div class="answer-actions">
        <button type="button" data-favorite-answer="${escapeHtml(situation.id)}">${state.favorites.includes(situation.id) ? "★" : "☆"}</button>
      </div>
    `;
    el.answers.appendChild(item);
  });
}

function renderAnswerVariant(answer, language, label) {
  const hasOwnText = Boolean(answer[language]);
  const text = getAnswerText(answer, language);
  const missingNote = hasOwnText ? "" : `<div class="answer-variant__empty">Перевода нет, показан доступный вариант</div>`;

  return `
    <section class="answer-variant" data-answer-language="${escapeHtml(language)}">
      <div class="answer-variant__head">
        <span class="answer-variant__lang">${escapeHtml(label)}</span>
        <button class="copy-button" type="button" data-copy="${escapeHtml(answer.id)}" data-lang="${escapeHtml(language)}">Копировать ${language.toUpperCase()}</button>
      </div>
      ${missingNote}
      <p class="answer-variant__text">${escapeHtml(text)}</p>
    </section>
  `;
}

function getAnswerText(answer, language = state.language) {
  if (language === "uz") return answer.uz || answer.ru || "";
  return answer.ru || answer.uz || "";
}

function getActiveSituation() {
  return state.data.situations.find((item) => item.id === state.activeId) || null;
}

function openSituation(id) {
  state.activeId = id;
  state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 20);
  saveArray(STORAGE.recent, state.recent);
  const situation = state.data.situations.find((item) => item.id === id);
  if (situation) expandPath(situation.path);
  document.body.classList.remove("sidebar-open");
  sync();
  render();
}

async function copyAnswer(answerId, language = state.language) {
  const situation = getActiveSituation();
  const answer = situation?.answers.find((item) => item.id === answerId);
  const text = getAnswerText(answer || {}, language);
  if (!text) return toast("Нет текста для копирования");
  const copied = await copyText(text);
  if (!copied) return toast("Не удалось скопировать");
  openSituation(situation.id);
  toast("Скопировано");
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // file:// commonly uses the textarea fallback below.
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter((item) => item !== id)
    : [id, ...state.favorites];
  saveArray(STORAGE.favorites, state.favorites);
  render();
  toast(state.favorites.includes(id) ? "Добавлено в избранное" : "Убрано из избранного");
}

function resetChecklist() {
  const situation = getActiveSituation();
  if (!situation) return;
  Object.keys(state.checklist).forEach((key) => {
    if (key.startsWith(`${situation.id}:`)) delete state.checklist[key];
  });
  saveObject(STORAGE.checklist, state.checklist);
  renderRoadmap(situation);
  toast("Чек-лист сброшен");
}

function toggleExpanded(key) {
  const isTopLevel = !key.includes(" / ");
  const isOpen = state.expanded.includes(key);

  if (isOpen) {
    state.expanded = state.expanded.filter((item) => item !== key && !item.startsWith(key + " / "));
  } else if (isTopLevel) {
    state.expanded = [key];
  } else {
    state.expanded = [...state.expanded, key];
  }

  saveArray(STORAGE.expanded, state.expanded);
}

function expandPath(path) {
  path.slice(0, -1).forEach((_, index) => {
    const key = path.slice(0, index + 1).join(" / ");
    if (!state.expanded.includes(key)) state.expanded.push(key);
  });
  saveArray(STORAGE.expanded, state.expanded);
}

function restoreSidebarWidth() {
  if (window.innerWidth <= 820) {
    document.documentElement.style.removeProperty("--sidebar");
    return;
  }
  const savedWidth = Number(localStorage.getItem(STORAGE.sidebarWidth));
  if (!savedWidth) return;
  setSidebarWidth(savedWidth, false);
}

function startSidebarResize(event) {
  if (window.innerWidth <= 820) return;
  event.preventDefault();
  state.resizeStartX = event.clientX;
  state.resizeStartWidth = el.sidebar.getBoundingClientRect().width;
  document.body.classList.add("is-resizing-sidebar");
  window.addEventListener("pointermove", resizeSidebar);
  window.addEventListener("pointerup", stopSidebarResize, { once: true });
}

function resizeSidebar(event) {
  const nextWidth = state.resizeStartWidth + event.clientX - state.resizeStartX;
  setSidebarWidth(nextWidth, true);
}

function stopSidebarResize() {
  document.body.classList.remove("is-resizing-sidebar");
  window.removeEventListener("pointermove", resizeSidebar);
}

function setSidebarWidth(width, persist) {
  const maxWidth = Math.min(600, Math.max(260, window.innerWidth - 360));
  const clampedWidth = Math.min(Math.max(width, 260), maxWidth);
  document.documentElement.style.setProperty("--sidebar", `${Math.round(clampedWidth)}px`);
  if (persist) localStorage.setItem(STORAGE.sidebarWidth, String(Math.round(clampedWidth)));
}

function handleKeys(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    el.search.focus();
    el.search.select();
  }
  if (event.key === "Escape") {
    el.search.value = "";
    state.query = "";
    document.body.classList.remove("sidebar-open");
    sync();
    render();
  }
  if (event.key === "Enter" && document.activeElement !== el.search) {
    const first = getActiveSituation()?.answers[0];
    if (first) copyAnswer(first.id);
  }
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/кешбек/g, "кэшбек")
    .replace(/бонус/g, "арбуз")
    .replace(/возврат/g, "вернули деньги назад")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  el.toast.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}

function readStorageArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readStorageObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}





