/*******************************************************
 * script.js — ORBIT Landing (Apple-like) — ES2024+
 * Production-ready, vanilla JS, single-file ES module pattern
 *******************************************************/

/* ===========================
   Utilities (public-safe)
=========================== */

/**
 * Debounce a function.
 * @template {(...args:any[])=>any} T
 * @param {T} fn
 * @param {number} wait
 * @returns {T}
 */
function debounce(fn, wait = 250) {
  /** @type {number|undefined} */
  let t;
  // @ts-ignore
  return function debounced(...args) {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle a function.
 * @template {(...args:any[])=>any} T
 * @param {T} fn
 * @param {number} wait
 * @returns {T}
 */
function throttle(fn, wait = 200) {
  let last = 0;
  /** @type {number|undefined} */
  let timer;
  // @ts-ignore
  return function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      window.clearTimeout(timer);
      fn.apply(this, args);
    } else if (!timer) {
      timer = window.setTimeout(() => {
        timer = undefined;
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Escape HTML for safe insertion.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Safe JSON parse.
 * @template T
 * @param {string|null} raw
 * @param {T} fallback
 * @returns {T}
 */
function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return /** @type {T} */ (JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * Smoothly scroll to an element.
 * @param {Element|null} el
 */
function smoothScrollTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Create an element with optional className and attributes.
 * @param {string} tag
 * @param {{className?:string, attrs?:Record<string,string>, text?:string}=} opts
 * @returns {HTMLElement}
 */
function h(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  }
  return el;
}

/**
 * Derive a user-friendly error message.
 * @param {unknown} err
 * @returns {string}
 */
function toUserMessage(err) {
  if (err instanceof DOMException && err.name === "AbortError") return "Operación cancelada.";
  if (err instanceof TypeError) return "Error de red. Revisa tu conexión e inténtalo de nuevo.";
  if (err && typeof err === "object" && "message" in err) {
    const msg = String(/** @type {any} */ (err).message || "");
    return msg.length ? msg : "Ocurrió un error inesperado.";
  }
  return "Ocurrió un error inesperado.";
}

/* ===========================
   Storage
=========================== */

const Storage = (() => {
  const KEY = "orbit_landing_v1";

  /**
   * Load persisted state.
   * @returns {{
   *   lead?: { name:string, email:string, company?:string, message?:string, createdAt:number },
   *   theme?: "light"|"dark"|"system",
   *   lastCta?: string,
   *   dismissedBanner?: boolean
   * }}
   */
  function load() {
    return safeJsonParse(localStorage.getItem(KEY), {});
  }

  /**
   * Save persisted state.
   * @param {ReturnType<typeof load>} data
   */
  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  /**
   * Patch persisted state.
   * @param {Partial<ReturnType<typeof load>>} patch
   */
  function patch(patch) {
    const current = load();
    const next = { ...current, ...patch };
    save(next);
  }

  /**
   * Clear persisted state.
   */
  function clear() {
    localStorage.removeItem(KEY);
  }

  return { load, save, patch, clear };
})();

/* ===========================
   Reactive Store
=========================== */

const Store = (() => {
  /**
   * @typedef {{
   *  ui: {
   *    loading: boolean,
   *    toast: { type:"success"|"error"|"info", message:string, id:number } | null,
   *    modalOpen: boolean,
   *    modalView: "contact"|"agents"|"privacy"|"none",
   *    banner: { visible: boolean }
   *  },
   *  form: {
   *    values: { name:string, email:string, company:string, message:string },
   *    touched: Record<string, boolean>,
   *    errors: Record<string, string>
   *  },
   *  content: {
   *    search: string,
   *    agents: Array<{ id:string, name:string, role:string, tagline:string, skills:string[], featured:boolean }>,
   *    filteredAgents: Array<{ id:string, name:string, role:string, tagline:string, skills:string[], featured:boolean }>,
   *  },
   *  prefs: {
   *    theme: "light"|"dark"|"system"
   *  }
   * }} State
   */

  /** @type {State} */
  let state = {
    ui: {
      loading: false,
      toast: null,
      modalOpen: false,
      modalView: "none",
      banner: { visible: true },
    },
    form: {
      values: { name: "", email: "", company: "", message: "" },
      touched: {},
      errors: {},
    },
    content: {
      search: "",
      agents: [],
      filteredAgents: [],
    },
    prefs: {
      theme: "system",
    },
  };

  /** @type {Set<(s:State, prev:State)=>void>} */
  const listeners = new Set();

  /**
   * Get current state (immutable).
   * @returns {State}
   */
  function get() {
    return state;
  }

  /**
   * Set state with patch or updater function.
   * @param {Partial<State> | ((s:State)=>State)} patch
   */
  function set(patch) {
    const prev = state;
    const next = typeof patch === "function" ? patch(state) : deepMerge(state, patch);
    state = next;
    for (const l of listeners) l(state, prev);
  }

  /**
   * Subscribe to store changes.
   * @param {(s:State, prev:State)=>void} fn
   * @returns {()=>void}
   */
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * Deep merge for plain objects.
   * @param {any} target
   * @param {any} patch
   */
  function deepMerge(target, patch) {
    const out = structuredClone(target);
    if (!patch || typeof patch !== "object") return out;
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] ?? {}, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  return { get, set, subscribe };
})();

/* ===========================
   Selectors & DOM helpers
=========================== */

const DOM = (() => {
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const cache = {
    root: document.documentElement,
    body: document.body,

    // Generic sections
    header: qs("header"),
    main: qs("main"),
    footer: qs("footer"),

    // Nav
    nav: qs("[data-nav]") || qs("nav"),
    navToggle: qs("[data-nav-toggle]"),
    navMenu: qs("[data-nav-menu]"),

    // Banner/notice
    banner: qs("[data-banner]") || qs(".banner") || qs(".notice"),

    // Hero CTA
    ctaButtons: qsa("[data-cta]"),

    // Modal
    modal: qs("[data-modal]") || qs(".modal"),
    modalOverlay: qs("[data-modal-overlay]") || qs(".modal__overlay"),
    modalClose: qs("[data-modal-close]") || qs(".modal__close"),
    modalContent: qs("[data-modal-content]") || qs(".modal__content"),

    // Toast
    toast: qs("[data-toast]") || qs(".toast"),

    // Contact form
    contactForm: qs("[data-contact-form]") || qs("form"),
    nameInput: qs('input[name="name"], input[data-field="name"]'),
    emailInput: qs('input[name="email"], input[type="email"], input[data-field="email"]'),
    companyInput: qs('input[name="company"], input[data-field="company"]'),
    messageInput: qs('textarea[name="message"], textarea[data-field="message"]'),
    formSubmit: qs('[type="submit"]'),

    // Agents section
    agentsWrap: qs("[data-agents]") || qs("#agents") || qs(".agents"),
    agentsGrid: qs("[data-agents-grid]") || qs(".agents__grid") || qs(".grid"),
    agentsSearch: qs('[data-agents-search], input[type="search"]'),
    agentsEmpty: qs("[data-agents-empty]") || qs(".agents__empty"),

    // Lazy images
    lazyImages: qsa('img[data-src], img[loading="lazy"]'),

    // Skeletons
    skeletonAreas: qsa("[data-skeleton]"),
  };

  /**
   * Ensure a toast container exists.
   * @returns {HTMLElement}
   */
  function ensureToast() {
    if (cache.toast) return cache.toast;
    const t = h("div", { className: "toast", attrs: { "data-toast": "1", role: "status", "aria-live": "polite" } });
    cache.body.appendChild(t);
    cache.toast = t;
    return t;
  }

  /**
   * Ensure a modal exists.
   * @returns {{modal:HTMLElement, overlay:HTMLElement, content:HTMLElement, closeBtn:HTMLElement}}
   */
  function ensureModal() {
    if (cache.modal && cache.modalContent && cache.modalClose && cache.modalOverlay) {
      return { modal: cache.modal, overlay: cache.modalOverlay, content: cache.modalContent, closeBtn: cache.modalClose };
    }

    const modal = h("div", { className: "modal", attrs: { "data-modal": "1", role: "dialog", "aria-modal": "true", "aria-hidden": "true" } });
    const overlay = h("div", { className: "modal__overlay", attrs: { "data-modal-overlay": "1" } });
    const panel = h("div", { className: "modal__panel" });
    const closeBtn = h("button", { className: "modal__close", attrs: { "data-modal-close": "1", type: "button", "aria-label": "Cerrar" }, text: "×" });
    const content = h("div", { className: "modal__content", attrs: { "data-modal-content": "1" } });

    panel.appendChild(closeBtn);
    panel.appendChild(content);
    modal.appendChild(overlay);
    modal.appendChild(panel);
    cache.body.appendChild(modal);

    cache.modal = modal;
    cache.modalOverlay = overlay;
    cache.modalClose = closeBtn;
    cache.modalContent = content;

    return { modal, overlay, content, closeBtn };
  }

  return { qs, qsa, cache, ensureToast, ensureModal };
})();

/* ===========================
   Validation
=========================== */

const Validation = (() => {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  /**
   * Validate contact form values.
   * @param {{name:string,email:string,company:string,message:string}} values
   * @returns {Record<string,string>}
   */
  function validate(values) {
    /** @type {Record<string,string>} */
    const errors = {};
    const name = values.name?.trim() ?? "";
    const email = values.email?.trim() ?? "";
    const company = values.company?.trim() ?? "";
    const message = values.message?.trim() ?? "";

    if (!name) errors.name = "Tu nombre es requerido.";
    else if (name.length < 2) errors.name = "Escribe un nombre válido.";

    if (!email) errors.email = "Tu email es requerido.";
    else if (!emailRe.test(email)) errors.email = "Escribe un email válido.";

    if (company && company.length < 2) errors.company = "Escribe un nombre de empresa válido.";

    if (!message) errors.message = "Cuéntanos qué necesitas construir.";
    else if (message.length < 10) errors.message = "Agrega un poco más de detalle (mín. 10 caracteres).";
    else if (message.length > 1000) errors.message = "El mensaje es demasiado largo (máx. 1000 caracteres).";

    return errors;
  }

  return { validate };
})();

/* ===========================
   UI Rendering
=========================== */

const UI = (() => {
  /**
   * Render toast message.
   * @param {ReturnType<typeof Store.get>} state
   */
  function renderToast(state) {
    const toastEl = DOM.ensureToast();
    const t = state.ui.toast;

    if (!t) {
      toastEl.innerHTML = "";
      toastEl.setAttribute("aria-hidden", "true");
      toastEl.classList.remove("is-visible", "is-error", "is-success", "is-info");
      return;
    }

    toastEl.setAttribute("aria-hidden", "false");
    toastEl.classList.add("is-visible");
    toastEl.classList.toggle("is-error", t.type === "error");
    toastEl.classList.toggle("is-success", t.type === "success");
    toastEl.classList.toggle("is-info", t.type === "info");

    toastEl.innerHTML = `
      <div class="toast__inner" data-toast-inner>
        <div class="toast__message">${escapeHtml(t.message)}</div>
        <button class="toast__close" type="button" data-action="toast:close" aria-label="Cerrar">Cerrar</button>
      </div>
    `;
  }

  /**
   * Render modal state and content.
   * @param {ReturnType<typeof Store.get>} state
   */
  function renderModal(state) {
    const { modal, content } = DOM.ensureModal();
    const open = state.ui.modalOpen;

    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");

    if (!open) {
      content.innerHTML = "";
      return;
    }

    const view = state.ui.modalView;
    content.innerHTML = getModalMarkup(view, state);
  }

  /**
   * Get modal markup.
   * @param {"contact"|"agents"|"privacy"|"none"} view
   * @param {ReturnType<typeof Store.get>} state
   * @returns {string}
   */
  function getModalMarkup(view, state) {
    if (view === "privacy") {
      return `
        <h2 class="modal__title">Privacidad</h2>
        <p class="modal__text">
          Tu información se usa únicamente para responder a tu solicitud.
          Puedes pedir la eliminación de tus datos cuando quieras.
        </p>
        <div class="modal__actions">
          <button type="button" class="btn" data-action="modal:close">Entendido</button>
        </div>
      `;
    }

    if (view === "agents") {
      const featured = state.content.agents.filter(a => a.featured).slice(0, 6);
      const cards = featured.length
        ? featured.map(a => agentCardMarkup(a)).join("")
        : `<div class="empty">Aún no hay agentes destacados.</div>`;

      return `
        <h2 class="modal__title">ORBIT — Equipo de agentes</h2>
        <p class="modal__text">
          Un equipo autónomo especializado en construir productos: investigación, UX, frontend, backend, QA y despliegue.
          Diseñado para moverse rápido sin perder calidad.
        </p>
        <div class="agents-modal__grid">${cards}</div>
        <div class="modal__actions">
          <button type="button" class="btn btn--primary" data-action="cta:open-contact">Hablar con ORBIT</button>
          <button type="button" class="btn" data-action="modal:close">Cerrar</button>
        </div>
      `;
    }

    // contact default
    const { values, errors, touched } = state.form;
    const err = (k) => (touched[k] && errors[k]) ? `<div class="field__error" data-error-for="${k}">${escapeHtml(errors[k])}</div>` : "";
    const invalid = (k) => (touched[k] && errors[k]) ? `aria-invalid="true"` : `aria-invalid="false"`;

    return `
      <h2 class="modal__title">Cuéntame tu idea</h2>
      <p class="modal__text">Responde en menos de 60 segundos. ORBIT te sugiere el camino más rápido hacia un MVP.</p>

      <form class="form" data-contact-form="1" novalidate>
        <div class="field">
          <label class="field__label" for="orbit_name">Nombre</label>
          <input id="orbit_name" class="field__input" name="name" type="text" autocomplete="name"
            value="${escapeHtml(values.name)}" ${invalid("name")} placeholder="Tu nombre" />
          ${err("name")}
        </div>

        <div class="field">
          <label class="field__label" for="orbit_email">Email</label>
          <input id="orbit_email" class="field__input" name="email" type="email" autocomplete="email"
            value="${escapeHtml(values.email)}" ${invalid("email")} placeholder="tucorreo@dominio.com" />
          ${err("email")}
        </div>

        <div class="field">
          <label class="field__label" for="orbit_company">Empresa (opcional)</label>
          <input id="orbit_company" class="field__input" name="company" type="text" autocomplete="organization"
            value="${escapeHtml(values.company)}" ${invalid("company")} placeholder="Tu empresa" />
          ${err("company")}
        </div>

        <div class="field">
          <label class="field__label" for="orbit_message">Qué quieres construir</label>
          <textarea id="orbit_message" class="field__input" name="message" rows="5"
            ${invalid("message")} placeholder="Ej: una app para reservas, pagos y notificaciones...">${escapeHtml(values.message)}</textarea>
          ${err("message")}
        </div>

        <div class="form__actions">
          <button class="btn btn--primary" type="submit" data-action="contact:submit">
            ${state.ui.loading ? `Enviando...` : `Enviar`}
          </button>
          <button class="btn" type="button" data-action="modal:close">Cancelar</button>
          <button class="btn btn--ghost" type="button" data-action="modal:open-privacy">Privacidad</button>
        </div>
      </form>
    `;
  }

  /**
   * Render agents list (if present in DOM).
   * @param {ReturnType<typeof Store.get>} state
   */
  function renderAgents(state) {
    const grid = DOM.cache.agentsGrid;
    if (!grid) return;

    const list = state.content.filteredAgents;
    if (state.ui.loading && !list.length) {
      grid.innerHTML = agentsSkeletonMarkup(6);
      DOM.cache.agentsEmpty?.classList.add("is-hidden");
      return;
    }

    if (!list.length) {
      grid.innerHTML = "";
      DOM.cache.agentsEmpty?.classList.remove("is-hidden");
      if (!DOM.cache.agentsEmpty) {
        const p = h("p", { className: "agents__empty", attrs: { "data-agents-empty": "1" }, text: "Sin resultados." });
        grid.parentElement?.appendChild(p);
        DOM.cache.agentsEmpty = p;
      } else {
        DOM.cache.agentsEmpty.textContent = "Sin resultados.";
      }
      return;
    }

    DOM.cache.agentsEmpty?.classList.add("is-hidden");
    grid.innerHTML = list.map(agentCardMarkup).join("");
  }

  /**
   * Render banner if exists.
   * @param {ReturnType<typeof Store.get>} state
   */
  function renderBanner(state) {
    const b = DOM.cache.banner;
    if (!b) return;
    b.classList.toggle("is-hidden", !state.ui.banner.visible);
  }

  /**
   * Render theme.
   * @param {ReturnType<typeof Store.get>} state
   */
  function renderTheme(state) {
    const pref = state.prefs.theme;
    DOM.cache.root.dataset.theme = pref;
    const isDark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);

    DOM.cache.root.classList.toggle("theme-dark", !!isDark);
    DOM.cache.root.classList.toggle("theme-light", !isDark);
  }

  /**
   * Agent card markup.
   * @param {{ id:string, name:string, role:string, tagline:string, skills:string[], featured:boolean }} a
   * @returns {string}
   */
  function agentCardMarkup(a) {
    const badges = (a.skills ?? []).slice(0, 5).map(s => `<span class="badge">${escapeHtml(s)}</span>`).join("");
    return `
      <article class="card agent" data-agent-id="${escapeHtml(a.id)}" tabindex="0" role="button" aria-label="Ver agente ${escapeHtml(a.name)}">
        <div class="agent__top">
          <div class="agent__name">${escapeHtml(a.name)}</div>
          <div class="agent__role">${escapeHtml(a.role)}</div>
        </div>
        <div class="agent__tagline">${escapeHtml(a.tagline)}</div>
        <div class="agent__skills">${badges}</div>
        <div class="agent__cta">
          <button class="btn btn--small" type="button" data-action="cta:open-contact" data-cta-context="agent:${escapeHtml(a.id)}">Contactar</button>
        </div>
      </article>
    `;
  }

  /**
   * Skeleton markup for agents.
   * @param {number} n
   * @returns {string}
   */
  function agentsSkeletonMarkup(n) {
    return Array.from({ length: n }, () => `
      <div class="card agent is-skeleton" aria-hidden="true">
        <div class="sk sk--line"></div>
        <div class="sk sk--line sk--short"></div>
        <div class="sk sk--block"></div>
        <div class="sk sk--chips"></div>
      </div>
    `).join("");
  }

  return { renderToast, renderModal, renderAgents, renderBanner, renderTheme };
})();

/* ===========================
   Data / Async (simulated API)
=========================== */

const Api = (() => {
  /**
   * Simulate fetching agents data.
   * @param {{signal:AbortSignal}} opts
   * @returns {Promise<Array<{ id:string, name:string, role:string, tagline:string, skills:string[], featured:boolean }>>}
   */
  async function fetchAgents(opts) {
    // Simulate network delay
    await new Promise((res, rej) => {
      const t = window.setTimeout(res, 600);
      opts.signal.addEventListener("abort", () => {
        window.clearTimeout(t);
        rej(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });

    return [
      { id: "orbit-strategy", name: "ORBIT Strategy", role: "Producto & Roadmap", tagline: "Define el MVP, scope y métricas para lanzar con claridad.", skills: ["MVP", "Roadmap", "OKRs", "Prioridad"], featured: true },
      { id: "orbit-ux", name: "ORBIT UX", role: "UX/UI", tagline: "Interfaces limpias, sistema de diseño y prototipos listos para dev.", skills: ["UX", "UI", "Design System", "Prototipo"], featured: true },
      { id: "orbit-fe", name: "ORBIT Frontend", role: "Web/App", tagline: "Frontend moderno, rápido, accesible y escalable.", skills: ["ES2024", "Accesibilidad", "Performance", "SPA"], featured: true },
      { id: "orbit-be", name: "ORBIT Backend", role: "API & Datos", tagline: "APIs robustas, auth, pagos e integraciones.", skills: ["APIs", "Auth", "Pagos", "Integraciones"], featured: true },
      { id: "orbit-qa", name: "ORBIT QA", role: "Calidad", tagline: "Pruebas, casos críticos y estabilidad antes de release.", skills: ["QA", "E2E", "Regresión", "Bugs"], featured: false },
      { id: "orbit-ship", name: "ORBIT Ship", role: "Deploy & Observability", tagline: "Entrega continua, monitoreo y mejora iterativa.", skills: ["CI/CD", "Deploy", "Logs", "Monitoring"], featured: false },
    ];
  }

  /**
   * Simulate sending a lead.
   * @param {{name:string,email:string,company:string,message:string}} payload
   * @param {{signal:AbortSignal}} opts
   * @returns {Promise<{ok:true, id:string}>}
   */
  async function sendLead(payload, opts) {
    await new Promise((res, rej) => {
      const t = window.setTimeout(res, 900);
      opts.signal.addEventListener("abort", () => {
        window.clearTimeout(t);
        rej(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });

    // Minimal server-like validation
    if (!payload.email.includes("@")) {
      throw new Error("Email inválido.");
    }

    return { ok: true, id: `lead_${Math.random().toString(16).slice(2)}` };
  }

  return { fetchAgents, sendLead };
})();

/* ===========================
   App Controller
=========================== */

const App = (() => {
  /** @type {AbortController|null} */
  let agentsAbort = null;

  /** @type {AbortController|null} */
  let leadAbort = null;

  /** @type {(()=>void)[]} */
  let cleanups = [];

  /** @type {IntersectionObserver|null} */
  let io = null;

  /** @type {HTMLElement|null} */
  let lastFocusedEl = null;

  /**
   * Initialize app.
   * @public
   */
  async function init() {
    hydrateFromStorage();
    wireGlobalEvents();
    setupLazyLoading();
    setupSmoothAnchors();
    setupKeyboardNavigation();
    await loadAgents();
    renderAll();
  }

  function renderAll() {
    const s = Store.get();
    UI.renderTheme(s);
    UI.renderBanner(s);
    UI.renderAgents(s);
    UI.renderModal(s);
    UI.renderToast(s);
  }

  function hydrateFromStorage() {
    const persisted = Storage.load();
    const theme = persisted.theme ?? "system";
    const dismissed = persisted.dismissedBanner ?? false;
    const lead = persisted.lead;

    Store.set(s => {
      const next = structuredClone(s);
      next.prefs.theme = theme;
      next.ui.banner.visible = !dismissed;
      if (lead) {
        next.form.values = {
          name: lead.name ?? "",
          email: lead.email ?? "",
          company: lead.company ?? "",
          message: lead.message ?? "",
        };
      }
      return next;
    });
  }

  function wireGlobalEvents() {
    const unsub = Store.subscribe((state, prev) => {
      // Render only what's needed
      if (state.prefs.theme !== prev.prefs.theme) UI.renderTheme(state);
      if (state.ui.banner.visible !== prev.ui.banner.visible) UI.renderBanner(state);

      if (state.content.filteredAgents !== prev.content.filteredAgents || state.ui.loading !== prev.ui.loading) {
        UI.renderAgents(state);
      }

      if (state.ui.modalOpen !== prev.ui.modalOpen || state.ui.modalView !== prev.ui.modalView || state.form !== prev.form || state.ui.loading !== prev.ui.loading) {
        UI.renderModal(state);
      }

      if (state.ui.toast?.id !== prev.ui.toast?.id) UI.renderToast(state);
    });
    cleanups.push(unsub);

    const onDocClick = (e) => {
      const t = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
      if (!t) return;

      const actionEl = t.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-action") ?? "";
        handleAction(action, actionEl, e);
        return;
      }

      const ctaEl = t.closest("[data-cta]");
      if (ctaEl) {
        const v = ctaEl.getAttribute("data-cta") ?? "contact";
        handleCta(v, ctaEl);
        return;
      }

      // Agent card click opens contact
      const agentCard = t.closest("[data-agent-id]");
      if (agentCard && agentCard instanceof HTMLElement) {
        openModal("agents");
        return;
      }
    };

    document.addEventListener("click", onDocClick, { passive: true });
    cleanups.push(() => document.removeEventListener("click", onDocClick));

    const onInput = (e) => {
      const el = /** @type {HTMLInputElement|HTMLTextAreaElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
      if (!el) return;

      if (el.matches('[data-agents-search], input[type="search"]')) {
        debouncedSearch(el.value);
        return;
      }

      if (el.closest("[data-contact-form]") || el.closest("form")) {
        if (el.name === "name" || el.name === "email" || el.name === "company" || el.name === "message") {
          updateFormValue(el.name, el.value, { touch: true, validate: true });
        }
      }
    };
    document.addEventListener("input", onInput, { passive: true });
    cleanups.push(() => document.removeEventListener("input", onInput));

    const onSubmit = (e) => {
      const form = /** @type {HTMLFormElement|null} */ (e.target instanceof HTMLFormElement ? e.target : null);
      if (!form) return;
      if (!form.matches("[data-contact-form], form")) return;

      // Only intercept if it contains the expected fields
      const hasEmail = form.querySelector('input[name="email"], input[type="email"], input[data-field="email"]');
      if (!hasEmail) return;

      e.preventDefault();
      submitContactForm(form);
    };
    document.addEventListener("submit", onSubmit);
    cleanups.push(() => document.removeEventListener("submit", onSubmit));

    const onScroll = throttle(() => {
      // hook for header effects if desired; keep minimal
      const y = window.scrollY || 0;
      DOM.cache.root.classList.toggle("is-scrolled", y > 8);
    }, 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    // Close toast automatically
    let toastTimer = 0;
    const unsubToast = Store.subscribe((s, prev) => {
      if (s.ui.toast?.id && s.ui.toast?.id !== prev.ui.toast?.id) {
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          Store.set({ ui: { toast: null } });
        }, 4500);
      }
    });
    cleanups.push(unsubToast);
    cleanups.push(() => window.clearTimeout(toastTimer));
  }

  const debouncedSearch = debounce((q) => {
    Store.set({ content: { search: q } });
    applyAgentsFilter();
  }, 200);

  async function loadAgents() {
    try {
      agentsAbort?.abort();
      agentsAbort = new AbortController();

      Store.set({ ui: { loading: true } });

      const agents = await Api.fetchAgents({ signal: agentsAbort.signal });
      Store.set(s => {
        const next = structuredClone(s);
        next.content.agents = agents;
        next.content.filteredAgents = agents;
        next.ui.loading = false;
        return next;
      });
    } catch (err) {
      Store.set({ ui: { loading: false, toast: { type: "error", message: toUserMessage(err), id: Date.now() } } });
    }
  }

  function applyAgentsFilter() {
    const { search, agents } = Store.get().content;
    const q = (search ?? "").trim().toLowerCase();

    const filtered = !q
      ? agents
      : agents.filter(a => {
          const hay = `${a.name} ${a.role} ${a.tagline} ${(a.skills ?? []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        });

    Store.set({ content: { filteredAgents: filtered } });
  }

  /**
   * Update form state.
   * @param {string} key
   * @param {string} value
   * @param {{touch?:boolean, validate?:boolean}=} opts
   */
  function updateFormValue(key, value, opts = {}) {
    Store.set(s => {
      const next = structuredClone(s);
      next.form.values = { ...next.form.values, [key]: value };
      if (opts.touch) next.form.touched = { ...next.form.touched, [key]: true };
      if (opts.validate) next.form.errors = Validation.validate(next.form.values);
      return next;
    });
  }

  /**
   * Submit contact form.
   * @param {HTMLFormElement} form
   */
  async function submitContactForm(form) {
    // Mark touched all fields
    Store.set(s => {
      const next = structuredClone(s);
      next.form.touched = { name: true, email: true, company: true, message: true };
      next.form.errors = Validation.validate(next.form.values);
      return next;
    });

    const { values, errors } = Store.get().form;
    if (Object.keys(errors).length) {
      Store.set({ ui: { toast: { type: "error", message: "Revisa los campos marcados.", id: Date.now() } } });
      focusFirstInvalid(form);
      return;
    }

    try {
      leadAbort?.abort();
      leadAbort = new AbortController();

      Store.set({ ui: { loading: true } });

      const payload = structuredClone(values);
      const res = await Api.sendLead(payload, { signal: leadAbort.signal });

      if (res?.ok) {
        Storage.patch({
          lead: { ...payload, createdAt: Date.now() },
          lastCta: "contact",
        });

        Store.set(s => {
          const next = structuredClone(s);
          next.ui.loading = false;
          next.ui.toast = { type: "success", message: "Listo. Te responderé pronto con los siguientes pasos.", id: Date.now() };
          next.ui.modalOpen = false;
          next.ui.modalView = "none";
          return next;
        });
      } else {
        throw new Error("No se pudo enviar. Inténtalo de nuevo.");
      }
    } catch (err) {
      Store.set({ ui: { loading: false, toast: { type: "error", message: toUserMessage(err), id: Date.now() } } });
    }
  }

  /**
   * Focus first invalid field.
   * @param {HTMLFormElement} form
   */
  function focusFirstInvalid(form) {
    const s = Store.get();
    const order = ["name", "email", "company", "message"];
    for (const k of order) {
      if (s.form.errors?.[k]) {
        const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
        if (el instanceof HTMLElement) {
          el.focus();
          break;
        }
      }
    }
  }

  /**
   * Handle data-action events.
   * @param {string} action
   * @param {HTMLElement} el
   * @param {Event} e
   */
  function handleAction(action, el, e) {
    if (action === "toast:close") {
      Store.set({ ui: { toast: null } });
      return;
    }

    if (action === "banner:dismiss") {
      Store.set({ ui: { banner: { visible: false } } });
      Storage.patch({ dismissedBanner: true });
      return;
    }

    if (action === "modal:close") {
      closeModal();
      return;
    }

    if (action === "modal:open-privacy") {
      openModal("privacy");
      return;
    }

    if (action === "cta:open-contact") {
      const ctx = el.getAttribute("data-cta-context") ?? el.getAttribute("data-context") ?? "cta";
      Storage.patch({ lastCta: ctx });
      openModal("contact");
      return;
    }

    if (action === "cta:open-agents") {
      openModal("agents");
      return;
    }

    if (action === "theme:toggle") {
      toggleTheme();
      return;
    }

    if (action === "nav:toggle") {
      toggleNav();
      return;
    }

    // anchor-like
    if (action.startsWith("scroll:")) {
      const id = action.slice("scroll:".length);
      const target = document.getElementById(id) || DOM.qs(`#${CSS.escape(id)}`);
      smoothScrollTo(target);
      return;
    }
  }

  /**
   * Handle CTA clicks.
   * @param {string} value
   * @param {HTMLElement} el
   */
  function handleCta(value, el) {
    const v = (value || "").toLowerCase();
    const ctx = el.getAttribute("data-cta-context") ?? el.getAttribute("data-context") ?? v;
    Storage.patch({ lastCta: ctx });

    if (v === "agents") openModal("agents");
    else if (v === "privacy") openModal("privacy");
    else openModal("contact");
  }

  function toggleTheme() {
    const current = Store.get().prefs.theme;
    const next = current === "system" ? "dark" : current === "dark" ? "light" : "system";
    Store.set({ prefs: { theme: next } });
    Storage.patch({ theme: next });
  }

  function toggleNav() {
    const btn = DOM.cache.navToggle || DOM.qs("[data-nav-toggle]");
    const menu = DOM.cache.navMenu || DOM.qs("[data-nav-menu]");
    if (!(btn instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;

    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", expanded ? "false" : "true");
    menu.classList.toggle("is-open", !expanded);
  }

  /**
   * Open modal.
   * @param {"contact"|"agents"|"privacy"} view
   */
  function openModal(view) {
    lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    Store.set({ ui: { modalOpen: true, modalView: view } });

    // Focus management after render
    queueMicrotask(() => {
      const { modal } = DOM.ensureModal();
      const focusable = modal.querySelector('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
      if (focusable instanceof HTMLElement) focusable.focus();
      trapFocus(modal);
    });
  }

  function closeModal() {
    Store.set({ ui: { modalOpen: false, modalView: "none" } });
    releaseFocusTrap();
    queueMicrotask(() => lastFocusedEl?.focus?.());
  }

  /** @type {((e:KeyboardEvent)=>void)|null} */
  let focusTrapHandler = null;

  /**
   * Trap focus within container.
   * @param {HTMLElement} container
   */
  function trapFocus(container) {
    releaseFocusTrap();

    focusTrapHandler = (e) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(container.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
        .filter(el => el instanceof HTMLElement && !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"))
        .map(el => /** @type {HTMLElement} */ (el));

      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", focusTrapHandler);
  }

  function releaseFocusTrap() {
    if (focusTrapHandler) {
      document.removeEventListener("keydown", focusTrapHandler);
      focusTrapHandler = null;
    }
  }

  function setupKeyboardNavigation() {
    const onKeyDown = (e) => {
      const s = Store.get();

      if (e.key === "Escape") {
        if (s.ui.modalOpen) {
          e.preventDefault();
          closeModal();
        }
      }

      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches("[data-agent-id]")) {
          e.preventDefault();
          openModal("contact");
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
  }

  function setupSmoothAnchors() {
    const onClick = (e) => {
      const a = /** @type {HTMLAnchorElement|null} */ (e.target instanceof HTMLElement ? e.target.closest('a[href^="#"]') : null);
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("#") || href === "#") return;
      const id = href.slice(1);
      const el = document.getElementById(id);
      if (!el) return;

      e.preventDefault();
      smoothScrollTo(el);
    };

    document.addEventListener("click", onClick);
    cleanups.push(() => document.removeEventListener("click", onClick));
  }

  function setupLazyLoading() {
    // images with data-src
    const imgs = Array.from(document.querySelectorAll("img[data-src]"));
    if (!imgs.length) return;

    io?.disconnect();
    io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (!(img instanceof HTMLImageElement)) continue;
        const src = img.getAttribute("data-src");
        if (src) {
          img.src = src;
          img.removeAttribute("data-src");
        }
        io?.unobserve(img);
      }
    }, { rootMargin: "200px 0px" });

    for (const img of imgs) io.observe(img);
    cleanups.push(() => io?.disconnect());
  }

  /**
   * Destroy app (cleanup listeners & aborts).
   * @public
   */
  function destroy() {
    agentsAbort?.abort();
    leadAbort?.abort();
    releaseFocusTrap();
    for (const fn of cleanups.splice(0)) {
      try { fn(); } catch { /* noop */ }
    }
  }

  return { init, destroy };
})();

/* ===========================
   Boot
=========================== */

(() => {
  const ready = () => App.init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }

  // Optional: cleanup on pagehide
  window.addEventListener("pagehide", () => App.destroy(), { once: true });
})();