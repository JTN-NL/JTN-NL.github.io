/* app.js
  Changes in this version:
  - Removed Favorites entirely (UI + parsing + filters + badges).
  - Optimizer is now 2 dropdowns: Side + Mode.
  - Removed “choose target” dropdown.
  - Shows ONE result set (for the selected side).
  - Still loads maxima.json on startup; if maxima fails, optimizer is disabled (per your requirement).
*/

const ItemType = {
  1: "Armor",
  2: "Weapon",
  3: "Helmet",
  4: "Artifact",
  5: "Looks",
  6: "Hero",
};

const ComOfBV = {
  1: "Castellan",
  2: "Commander",
};

/*
  Effects mapping: paste your full mapping here.
  Unknown effect codes render as "Unknown effect (CODE)" and never crash.
*/
const Effects = {
  10005: "wall protection",
  10006: "gate protection",
  10109: "melee unit strength when attacking",
  10111: "range unit strength when attacking",
  110: "wall protection",
  111: "gate protection",
  112: "moat protection",
  108: "melee unit strength when attacking",
  109: "range unit strength when attacking",
};

const PAGE_SIZE = 50;            // Why: keep DOM small and fast for thousands of items
const MAX_EFFECTS_COMPACT = 4;   // Why: list rows stay readable; details shows full list
const LOCAL_SEARCH_SWAPS = 1;    // Why: quick small improvement without brute force

/*
  Optimizer presets:
  Why keywords: maxima.json structure and effect-code mapping may be unknown; keyword matching is resilient.
  You can tune these phrases later to match your exact effect naming.
*/
const OPT_PRESETS = {
  Commander: {
    PVP:    ["melee", "range", "unit strength", "wall", "gate", "moat", "protection"],
    Nomad:  ["nomad"],
    Beri:   ["berimond", "beri"],
    Samurai:["samurai"],
  },
  Castellan: {
    PVP: ["melee", "range", "unit strength", "wall", "gate", "moat", "protection"],
    NPC: ["npc"],
  }
};

const state = {
  maxima: null,
  maximaLoaded: false,

  items: [],
  filtered: [],

  filters: {
    side: "all",
    types: new Set(Object.values(ItemType)),
    search: "",
  },

  page: 1,

  // last optimizer result (single-side)
  lastResult: null, // { side, mode, keywords, result }
};

const $ = (id) => document.getElementById(id);

const dom = {
  statusMaxima: $("statusMaxima"),
  statusInv: $("statusInv"),
  statusCount: $("statusCount"),

  errorBox: $("errorBox"),
  infoBox: $("infoBox"),

  fileInput: $("fileInput"),
  btnReset: $("btnReset"),

  countTotal: $("countTotal"),
  countCommander: $("countCommander"),
  countCastellan: $("countCastellan"),
  countsByType: $("countsByType"),

  typeChecks: $("typeChecks"),
  searchBox: $("searchBox"),
  btnApply: $("btnApply"),
  btnClearFilters: $("btnClearFilters"),

  list: $("list"),
  shownCount: $("shownCount"),
  filteredCount: $("filteredCount"),
  btnPrev: $("btnPrev"),
  btnNext: $("btnNext"),
  pageNow: $("pageNow"),
  pageTotal: $("pageTotal"),

  // Optimizer
  optSide: $("optSide"),
  optMode: $("optMode"),
  btnCompute: $("btnCompute"),
  optWarnings: $("optWarnings"),
  maximaKeys: $("maximaKeys"),
  resultSingle: $("resultSingle"),
  btnExport: $("btnExport"),
};

function setPill(el, kind, text) {
  el.classList.remove("pill--ok", "pill--bad", "pill--warn");
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function showError(msg) {
  dom.errorBox.hidden = false;
  dom.errorBox.textContent = msg;
}
function clearError() {
  dom.errorBox.hidden = true;
  dom.errorBox.textContent = "";
}

function showInfo(msg) {
  dom.infoBox.hidden = false;
  dom.infoBox.textContent = msg;
}
function clearInfo() {
  dom.infoBox.hidden = true;
  dom.infoBox.textContent = "";
}

function showOptWarning(msg) {
  dom.optWarnings.hidden = false;
  dom.optWarnings.textContent = msg;
}
function clearOptWarning() {
  dom.optWarnings.hidden = true;
  dom.optWarnings.textContent = "";
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeWhitespace(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function effectNameFor(code) {
  const name = Effects[code];
  return name ? String(name) : `Unknown effect (${code})`;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatValue(v) {
  const n = safeNumber(v);
  const abs = Math.abs(n);
  if (abs >= 1000) return String(Math.round(n));
  if (abs >= 100) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/* ------------------------ MAXIMA LOADING ------------------------ */
async function loadMaxima() {
  try {
    const res = await fetch("./maxima.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    state.maxima = json;
    state.maximaLoaded = true;
    setPill(dom.statusMaxima, "pill--ok", "loaded");

    populateMaximaDebug(json);
    refreshOptimizerUIEnabled();
  } catch (e) {
    state.maxima = null;
    state.maximaLoaded = false;
    setPill(dom.statusMaxima, "pill--bad", "failed");
    showError(`Failed to load maxima.json. Optimizer disabled, uploader still works. Details: ${e?.message || e}`);
    populateMaximaDebug(null);
    refreshOptimizerUIEnabled();
  }
}

function extractMaximaKeys(maxima) {
  const keysSet = new Set();
  const lines = [];

  const addKeysFromObj = (obj, prefix = "") => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) keysSet.add(prefix ? `${prefix}.${k}` : k);
  };

  if (maxima && typeof maxima === "object") {
    if (!Array.isArray(maxima)) {
      addKeysFromObj(maxima);
      if (maxima.max && typeof maxima.max === "object") addKeysFromObj(maxima.max, "max");
      if (maxima.maxima && typeof maxima.maxima === "object") addKeysFromObj(maxima.maxima, "maxima");
    } else {
      const limit = Math.min(maxima.length, 200);
      for (let i = 0; i < limit; i++) keysSet.add(`idx:${i}`);
    }
  }

  lines.push("maxima.json summary:");
  lines.push(`type: ${Array.isArray(maxima) ? "array" : typeof maxima}`);
  if (maxima && typeof maxima === "object" && !Array.isArray(maxima)) {
    const topKeys = Object.keys(maxima);
    lines.push(`top-level keys: ${topKeys.slice(0, 200).join(", ")}${topKeys.length > 200 ? " …" : ""}`);
  }
  lines.push("");
  lines.push("Detected keys (debug):");
  const keys = Array.from(keysSet).sort((a, b) => a.localeCompare(b));
  lines.push(keys.join("\n"));

  return { keys, text: lines.join("\n") };
}

function populateMaximaDebug(maxima) {
  const { text } = extractMaximaKeys(maxima);
  dom.maximaKeys.value = text;
}

/* ------------------------ INVENTORY PARSING ------------------------ */
function normalizeInventory(json) {
  const raw = json && typeof json === "object" ? json.I : null;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid inventory format: expected top-level key "I" as an array.');
  }

  const out = [];
  let unknownEffectsCount = 0;

  for (let idx = 0; idx < raw.length; idx++) {
    const row = raw[idx];
    if (!Array.isArray(row)) continue;

    // index 0 is ID (sensitive) -> never read, never store, never render
    const typeId = safeNumber(row[1]);
    const sideId = safeNumber(row[2]);

    const typeName = ItemType[typeId] || `Unknown type (${typeId || "?"})`;
    const sideName = ComOfBV[sideId] || `Unknown side (${sideId || "?"})`;

    const effectsRaw = row[5];
    const effects = [];

    if (Array.isArray(effectsRaw)) {
      for (const e of effectsRaw) {
        if (!Array.isArray(e) || e.length < 1) continue;
        const code = safeNumber(e[0]);
        const valArr = e[2];
        const value = Array.isArray(valArr) ? safeNumber(valArr[0]) : safeNumber(valArr);

        const name = effectNameFor(code);
        if (name.startsWith("Unknown effect")) unknownEffectsCount++;

        effects.push({ code, name, value });
      }
    }

    out.push({
      typeId,
      typeName,
      sideId,
      sideName,
      effects,
    });
  }

  return { items: out, unknownEffectsCount, rawCount: raw.length };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("FileReader failed."));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsText(file);
  });
}

/* ------------------------ FILTERING ------------------------ */
function readSideFilter() {
  const checked = document.querySelector('input[name="side"]:checked');
  state.filters.side = checked ? checked.value : "all";
}

function applyFilters() {
  const { side, types, search } = state.filters;
  const q = normalizeWhitespace(search).toLowerCase();

  const filtered = [];
  for (const it of state.items) {
    if (side !== "all" && it.sideName !== side) continue;
    if (!types.has(it.typeName)) continue;

    if (q) {
      let hit = false;
      for (const ef of it.effects) {
        if (ef.name.toLowerCase().includes(q)) { hit = true; break; }
      }
      if (!hit) continue;
    }

    filtered.push(it);
  }

  state.filtered = filtered;
  state.page = 1;

  renderCountsAndStatus();
  renderListPage();
  refreshOptimizerUIEnabled();
}

function clearFiltersToDefault() {
  state.filters.side = "all";
  state.filters.types = new Set(Object.values(ItemType));
  state.filters.search = "";

  document.querySelector('input[name="side"][value="all"]').checked = true;
  dom.searchBox.value = "";

  const inputs = dom.typeChecks.querySelectorAll('input[type="checkbox"]');
  inputs.forEach(i => i.checked = true);

  applyFilters();
}

/* ------------------------ RENDER COUNTS + LIST ------------------------ */
function renderCountsAndStatus() {
  dom.statusCount.textContent = String(state.items.length);

  if (state.items.length > 0) setPill(dom.statusInv, "pill--ok", "loaded");
  else setPill(dom.statusInv, "pill--warn", "not loaded");

  dom.countTotal.textContent = String(state.items.length);

  let commander = 0, castellan = 0;
  const byType = new Map();

  for (const it of state.items) {
    if (it.sideName === "Commander") commander++;
    if (it.sideName === "Castellan") castellan++;
    byType.set(it.typeName, (byType.get(it.typeName) || 0) + 1);
  }

  dom.countCommander.textContent = String(commander);
  dom.countCastellan.textContent = String(castellan);

  clearNode(dom.countsByType);
  for (const typeName of Object.values(ItemType)) {
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = typeName;

    const v = document.createElement("div");
    v.className = "v";
    v.textContent = String(byType.get(typeName) || 0);

    dom.countsByType.appendChild(k);
    dom.countsByType.appendChild(v);
  }
}

function renderListPage() {
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = clamp(state.page, 1, totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const slice = state.filtered.slice(start, end);

  dom.filteredCount.textContent = String(total);
  dom.shownCount.textContent = String(slice.length);
  dom.pageNow.textContent = String(state.page);
  dom.pageTotal.textContent = String(totalPages);

  dom.btnPrev.disabled = state.page <= 1;
  dom.btnNext.disabled = state.page >= totalPages;

  clearNode(dom.list);

  if (slice.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No items match the current filters.";
    dom.list.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const it of slice) frag.appendChild(renderItemRow(it));
  dom.list.appendChild(frag);
}

function renderItemRow(it) {
  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.setAttribute("role", "listitem");

  const top = document.createElement("div");
  top.className = "item__top";

  const badges = document.createElement("div");
  badges.className = "badges";

  const bType = document.createElement("span");
  bType.className = "badge";
  bType.textContent = it.typeName;

  const bSide = document.createElement("span");
  bSide.className = "badge badge--muted";
  bSide.textContent = it.sideName;

  badges.appendChild(bType);
  badges.appendChild(bSide);

  const details = document.createElement("details");
  details.className = "details";
  const summary = document.createElement("summary");
  summary.textContent = "Details";
  details.appendChild(summary);

  const effList = document.createElement("div");
  effList.className = "effectsList";

  if (!it.effects.length) {
    const none = document.createElement("div");
    none.className = "muted";
    none.textContent = "No effects found on this item.";
    effList.appendChild(none);
  } else {
    for (const ef of it.effects) {
      const row = document.createElement("div");
      row.className = "effectRow";

      const name = document.createElement("div");
      name.className = "effectRow__name";
      name.textContent = ef.name;

      const val = document.createElement("div");
      val.className = "effectRow__val";
      val.textContent = formatValue(ef.value);

      row.appendChild(name);
      row.appendChild(val);
      effList.appendChild(row);
    }
  }

  details.appendChild(effList);

  const compact = document.createElement("div");
  compact.className = "effectsCompact";
  compact.appendChild(renderCompactEffects(it.effects));

  top.appendChild(badges);
  top.appendChild(details);

  wrap.appendChild(top);
  wrap.appendChild(compact);

  return wrap;
}

function renderCompactEffects(effects) {
  const span = document.createElement("span");
  if (!effects.length) {
    span.className = "muted";
    span.textContent = "No effects.";
    return span;
  }

  const parts = [];
  const lim = Math.min(effects.length, MAX_EFFECTS_COMPACT);
  for (let i = 0; i < lim; i++) {
    const ef = effects[i];
    parts.push(`${ef.name}: ${formatValue(ef.value)}`);
  }
  if (effects.length > lim) parts.push(`+${effects.length - lim} more`);

  span.textContent = parts.join(" • ");
  return span;
}

/* ------------------------ OPTIMIZER (SINGLE RESULT) ------------------------ */
function populateModeOptionsForSide(side) {
  dom.optMode.textContent = "";
  const modes = Object.keys(OPT_PRESETS[side] || {});
  for (const m of modes) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    dom.optMode.appendChild(opt);
  }
}

function scoreItemByKeywords(item, keywords) {
  const phrases = (keywords || []).map(k => normalizeWhitespace(k).toLowerCase()).filter(Boolean);

  const contributions = [];
  let total = 0;
  let unknownIgnored = 0;

  for (const ef of item.effects) {
    const name = String(ef.name).toLowerCase();
    const isUnknown = name.startsWith("unknown effect");
    if (isUnknown) { unknownIgnored++; continue; }

    let matchedBy = null;
    for (const p of phrases) {
      if (p.length > 0 && name.includes(p)) { matchedBy = p; break; }
    }
    if (!matchedBy) continue;

    const val = safeNumber(ef.value);
    total += val;
    contributions.push({ effect: ef.name, value: val, matchedBy });
  }

  return { total, contributions, unknownIgnored };
}

function computeBestSetForSide(items, side, mode) {
  const keywords = OPT_PRESETS[side]?.[mode];
  if (!keywords || !keywords.length) {
    throw new Error(`No keywords configured for ${side} / ${mode}.`);
  }

  const sideItems = items.filter(x => x.sideName === side);

  const slots = Object.values(ItemType);
  const bySlot = new Map();
  for (const s of slots) bySlot.set(s, []);
  for (const it of sideItems) bySlot.get(it.typeName)?.push(it);

  const warnings = [];
  const chosen = new Map();

  // Greedy best-per-slot
  for (const slot of slots) {
    const arr = bySlot.get(slot) || [];
    if (!arr.length) {
      warnings.push(`Missing slot: ${slot}`);
      continue;
    }
    let best = null;
    let bestScore = -Infinity;
    for (const it of arr) {
      const s = scoreItemByKeywords(it, keywords);
      if (s.total > bestScore) {
        bestScore = s.total;
        best = { item: it, score: s };
      }
    }
    chosen.set(slot, best);
  }

  // Small local swap improvement (bounded)
  const TOP_N = 40; // Why: improvement without scanning thousands per slot
  let improved = true;

  for (let pass = 0; pass < LOCAL_SEARCH_SWAPS && improved; pass++) {
    improved = false;

    for (const slot of slots) {
      const candidates = bySlot.get(slot) || [];
      if (!candidates.length || !chosen.get(slot)) continue;

      const scored = candidates
        .map(it => ({ it, sc: scoreItemByKeywords(it, keywords) }))
        .sort((a, b) => b.sc.total - a.sc.total)
        .slice(0, TOP_N);

      const current = chosen.get(slot);
      const baseTotal = totalSetScore(chosen);

      for (const cand of scored) {
        if (cand.it === current.item) continue;
        const prev = chosen.get(slot);
        chosen.set(slot, { item: cand.it, score: cand.sc });

        const newTotal = totalSetScore(chosen);
        if (newTotal > baseTotal + 1e-9) {
          improved = true;
          break;
        } else {
          chosen.set(slot, prev);
        }
      }
    }
  }

  const result = {
    side,
    mode,
    keywords,
    total: totalSetScore(chosen),
    warnings,
    slots: buildSlotOutput(chosen),
  };

  return result;
}

function totalSetScore(chosenMap) {
  let t = 0;
  for (const v of chosenMap.values()) t += safeNumber(v?.score?.total);
  return t;
}

function buildSlotOutput(chosenMap) {
  const out = [];
  for (const slot of Object.values(ItemType)) {
    const pick = chosenMap.get(slot);
    if (!pick) {
      out.push({ slot, missing: true });
      continue;
    }
    out.push({
      slot,
      missing: false,
      score: pick.score.total,
      contributions: pick.score.contributions,
      effects: pick.item.effects.map(e => ({ name: e.name, value: e.value, code: e.code })),
      unknownIgnored: pick.score.unknownIgnored,
    });
  }
  return out;
}

function renderSingleResult(container, res) {
  clearNode(container);

  if (!res) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No result yet.";
    container.appendChild(p);
    return;
  }

  const meta = document.createElement("div");
  meta.className = "muted";
  meta.style.marginBottom = "10px";
  meta.textContent = `${res.side} • ${res.mode} • keywords: ${res.keywords.join(", ")}`;
  container.appendChild(meta);

  const totalLine = document.createElement("div");
  totalLine.className = "totalLine";

  const left = document.createElement("strong");
  left.textContent = "Total score";

  const right = document.createElement("strong");
  right.textContent = formatValue(res.total);

  totalLine.appendChild(left);
  totalLine.appendChild(right);
  container.appendChild(totalLine);

  for (const s of res.slots) {
    const slot = document.createElement("div");
    slot.className = "slot";

    const head = document.createElement("div");
    head.className = "slot__head";

    const title = document.createElement("div");
    title.className = "slot__title";
    title.textContent = s.slot;

    const sc = document.createElement("div");
    sc.className = "slot__score";
    sc.textContent = s.missing ? "missing" : `item score: ${formatValue(s.score)}`;

    head.appendChild(title);
    head.appendChild(sc);
    slot.appendChild(head);

    if (s.missing) {
      const m = document.createElement("div");
      m.className = "muted";
      m.textContent = "No items available for this slot.";
      slot.appendChild(m);
      container.appendChild(slot);
      continue;
    }

    const contribWrap = document.createElement("div");
    contribWrap.className = "slot__effects";

    const contribTitle = document.createElement("div");
    contribTitle.className = "muted";
    contribTitle.textContent = "Matched effects:";
    contribWrap.appendChild(contribTitle);

    if (!s.contributions.length) {
      const none = document.createElement("div");
      none.className = "muted";
      none.textContent = "No matching effects.";
      contribWrap.appendChild(none);
    } else {
      for (const c of s.contributions) {
        const row = document.createElement("div");
        row.className = "contrib";

        const n = document.createElement("div");
        n.textContent = `${c.effect} (match: ${c.matchedBy})`;

        const v = document.createElement("div");
        v.textContent = formatValue(c.value);

        row.appendChild(n);
        row.appendChild(v);
        contribWrap.appendChild(row);
      }
    }

    const details = document.createElement("details");
    details.className = "details";
    const summary = document.createElement("summary");
    summary.textContent = "Full effects";
    details.appendChild(summary);

    const effList = document.createElement("div");
    effList.className = "effectsList";
    for (const ef of s.effects) {
      const r = document.createElement("div");
      r.className = "effectRow";

      const n = document.createElement("div");
      n.className = "effectRow__name";
      n.textContent = ef.name;

      const v = document.createElement("div");
      v.className = "effectRow__val";
      v.textContent = formatValue(ef.value);

      r.appendChild(n);
      r.appendChild(v);
      effList.appendChild(r);
    }
    details.appendChild(effList);

    if (s.unknownIgnored) {
      const note = document.createElement("div");
      note.className = "muted";
      note.style.marginTop = "8px";
      note.textContent = `Unknown effects ignored: ${s.unknownIgnored}`;
      slot.appendChild(note);
    }

    slot.appendChild(contribWrap);
    slot.appendChild(details);
    container.appendChild(slot);
  }
}

/* ------------------------ EXPORT ------------------------ */
function exportResult() {
  if (!state.lastResult) return;

  // Keeping effect "code" is safe (spec only marks item ID as sensitive).
  // If you want codes removed too: drop "code" in mapping below.
  const payload = {
    side: state.lastResult.side,
    mode: state.lastResult.mode,
    keywords: state.lastResult.keywords,
    total: state.lastResult.total,
    warnings: state.lastResult.warnings,
    slots: state.lastResult.slots.map(s => {
      if (s.missing) return { slot: s.slot, missing: true };
      return {
        slot: s.slot,
        missing: false,
        score: s.score,
        contributions: s.contributions.map(c => ({ effect: c.effect, value: c.value, matchedBy: c.matchedBy })),
        effects: s.effects.map(e => ({ name: e.name, value: e.value, code: e.code })),
        unknownIgnored: s.unknownIgnored,
      };
    }),
    generatedAt: new Date().toISOString(),
    note: "No internal item IDs are included.",
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `gge_set_${safeFilename(state.lastResult.side)}_${safeFilename(state.lastResult.mode)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function safeFilename(s) {
  return String(s || "result")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "result";
}

/* ------------------------ UI INIT ------------------------ */
function buildTypeChecks() {
  clearNode(dom.typeChecks);
  const types = Object.values(ItemType);

  for (const t of types) {
    const label = document.createElement("label");
    label.className = "check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = t;
    input.checked = true;

    input.addEventListener("change", () => {
      if (input.checked) state.filters.types.add(t);
      else state.filters.types.delete(t);
    });

    const span = document.createElement("span");
    span.textContent = t;

    label.appendChild(input);
    label.appendChild(span);
    dom.typeChecks.appendChild(label);
  }
}

function refreshOptimizerUIEnabled() {
  // Optimizer enabled only when maxima loaded AND inventory loaded (your requirement).
  const enabled = state.maximaLoaded && state.items.length > 0;

  dom.optSide.disabled = !enabled;
  dom.optMode.disabled = !enabled;
  dom.btnCompute.disabled = !enabled;

  dom.btnExport.disabled = !state.lastResult;
}

function wireEvents() {
  dom.fileInput.addEventListener("change", async (e) => {
    clearError();
    clearInfo();
    clearOptWarning();

    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON. Please upload a valid .json file.");
      }

      const { items, unknownEffectsCount, rawCount } = normalizeInventory(parsed);
      state.items = items;

      showInfo(`Loaded ${items.length} items (raw rows: ${rawCount}). Unknown effects encountered: ${unknownEffectsCount}.`);

      renderCountsAndStatus();
      applyFilters();

      // Reset optimizer output after new inventory
      state.lastResult = null;
      dom.btnExport.disabled = true;
      dom.resultSingle.innerHTML = '<p class="muted">No result yet.</p>';

      refreshOptimizerUIEnabled();
    } catch (err) {
      showError(err?.message || String(err));
      state.items = [];
      state.filtered = [];
      renderCountsAndStatus();
      renderListPage();
      refreshOptimizerUIEnabled();
    } finally {
      dom.fileInput.value = "";
    }
  });

  dom.btnReset.addEventListener("click", () => {
    clearError();
    clearInfo();
    clearOptWarning();

    state.items = [];
    state.filtered = [];
    state.page = 1;
    state.lastResult = null;

    renderCountsAndStatus();
    renderListPage();

    dom.resultSingle.innerHTML = '<p class="muted">No result yet.</p>';
    dom.btnExport.disabled = true;

    refreshOptimizerUIEnabled();
  });

  dom.btnApply.addEventListener("click", () => {
    readSideFilter();
    state.filters.search = dom.searchBox.value || "";
    applyFilters();
  });

  dom.btnClearFilters.addEventListener("click", () => clearFiltersToDefault());

  dom.btnPrev.addEventListener("click", () => { state.page--; renderListPage(); });
  dom.btnNext.addEventListener("click", () => { state.page++; renderListPage(); });

  dom.optSide.addEventListener("change", () => {
    populateModeOptionsForSide(dom.optSide.value);
  });

  dom.btnCompute.addEventListener("click", () => {
    clearOptWarning();
    clearError();

    if (!state.items.length) {
      showOptWarning("Load an inventory first.");
      return;
    }
    if (!state.maximaLoaded) {
      showOptWarning("Maxima failed to load, optimizer is disabled.");
      return;
    }

    const side = dom.optSide.value;
    const mode = dom.optMode.value;

    try {
      const result = computeBestSetForSide(state.items, side, mode);
      state.lastResult = result;

      renderSingleResult(dom.resultSingle, result);

      if (result.warnings.length) showOptWarning(result.warnings.join(" • "));
      else clearOptWarning();

      dom.btnExport.disabled = false;
    } catch (err) {
      showError(err?.message || String(err));
    }
  });

  dom.btnExport.addEventListener("click", () => exportResult());
}

function initOptimizerDefaults() {
  // Default side = Commander (first option) and mode list accordingly
  dom.optSide.value = "Commander";
  populateModeOptionsForSide("Commander");
}

function init() {
  buildTypeChecks();
  renderCountsAndStatus();
  renderListPage();
  wireEvents();

  setPill(dom.statusInv, "pill--warn", "not loaded");
  setPill(dom.statusCount, "", "0");
  setPill(dom.statusMaxima, "pill--warn", "loading…");

  initOptimizerDefaults();
  refreshOptimizerUIEnabled();

  loadMaxima().finally(() => {
    refreshOptimizerUIEnabled();
  });
}

document.addEventListener("DOMContentLoaded", init);

/*
  SAMPLE INVENTORY SNIPPET (testing)
  {
    "I": [
      [
        489950016,
        2,
        1,
        5,
        -1,
        [
          [10005, 72, [85.6]],
          [99999, 1, [12.3]]
        ],
        -1,
        -1,
        0,
        -1
      ]
    ]
  }
*/
