/* app.js
  Non-negotiables implemented:
  - No external libraries, no backend.
  - Never display internal item IDs (index 0).
  - Uploaded JSON processed in-memory only.
  - Resilient parsing: unknown fields/codes handled gracefully.
  - Performance: filters are computed on arrays, list rendering is paginated (50/page) and only updates the list area.
  - Security: DOM built with createElement/textContent (no innerHTML injection).
  - Works on GitHub Pages and also when opening index.html locally.
*/

/* ------------------------ MAPPINGS (hardcoded) ------------------------ */
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
  Effects mapping: you said you will provide it.
  Put your real mapping here. Unknown codes will render as "Unknown effect (CODE)".

  Example placeholders (replace with your full object):
*/
const Effects = {
    //Commander
    1: "melee unit strength when attacking",
    2: "range unit strength when attacking",
    3: "wall protection",
    4: "gate protection",
    5: "moat protection",
    6: "army travel speed",
    7: "resources plundered when looting",
    106: "army travel speed",
    108: "melee unit strength when attacking",
    109: "range unit strength when attacking",
    110: "wall protection",
    111: "gate protection",
    112: "moat protection",
    113: "army travel speed",
    114: "resources plundered when looting",
    115: "flank unit limit when attacking",
    116: "strength in courtyard when attacking",
    117: "unit limit on the front",
    118: "combat strength when attacking",
    119: "combat strength of units when attacking the front",
    120: "combat strength of units when attacking the flanks",
    121: "get supported by shield maiden in courtyard",


    //Sets
    231: "combat strength when attacking main castles, kingdom castles, and foreign castles",
    232: "combat strength when attacking outposts, capitals, and trading metropolises",

    //NOMS
    407: "wall protection of normad targets",
    408: "gate protection of normad targets",

    411: "flank unit limit when attacking normad targets",

    413: "unit limit on the front when attacking when normad targets",


    //SAM
    507: "wall protection of samurai targets",
    508: "gate protection of samurai targets",
    509: "melee unit strength when attacking samurai targets",
    510: "range unit strength when attacking samurai targets", 
    511: "flank unit limit when attacking samurai targets",
    512: "strength in courtyard of samurai targets",
    513: "unit limit on the front when attacking when samurai targets",
    514: "enemy moat protection when attacking samurai camps",
    515: "samurai tokens earned when samurai camps",


    //Beri
    702: "flank unit amount when attacking Berimond targets",
    705: "gate protection of Berimond targets",
    706: "strength in courtyard of Berimond targets",

    //Castle lord
    806: "later army detection when attacking castle lords",
    807: "moat protection of castle lords",
    808: "wall protection of castle lords",
    809: "gate protection of castle lords",
    810: "strength in courtyard of castle lords",
    811: "flank unit limit when attacking castle lords",
    812: "unit limit on the front when attacking enemy castle lords",
    813: "melee unit strength when attacking castle lords",
    814: "range unit strength when attacking castle lords",
    815: "fire damage inflicted when attacking enemy castle lords",
    816: "glory earned when attacking enemy castle lords",

    //unit & tool effects
    20002: "horror units strength when attacking",
    20008: "horror loot capacity",
    20012: "royal & elite units strength when attacking",
    20013: "horror units strength when attacking",
    20014: "imperial strength when attacking",
    20015: "beserker & spear woman strength when attacking",
    20016: "relic unit strength when attacking",
    20017: "attack strength for mead units when attacking",
    20018: "additional wave",
    20019: "attack cooldown after victory",
    20020: "army return travel speed",



    // Castellan
    10001: "resources lost after being looted",
    10002: "wall protection",
    10003: "gate protection",
    10004: "moat protection",
    10005: "melee unit strength when defending",
    10006: "range unit strength when defending",

    10107: "resources lost after being looted",
    10108: "wall protection",
    10109: "gate protection",
    10110: "moat protection",
    10111: "melee unit strength when defending",
    10112: "range unit strength when defending",
    10113: "wall unit limit when defending",
    10114: "strength in courtyard when defending",
    10115: "combat strength for defense units",
    10116: "combat strength for defense units of the front",
    10117: "combat strength for defense units of the flanks",
    10118: "get supported by protectors of the north in courtyard defense",
    


    10406: "strength when defending main castle and townships",

    //NPC
    10407: "strength for units stationed in outposts & landmarks",
    10411: "melee unit strength when defending against NPC targets",
    10412: "range unit strength when defending against NPC targets",
    10413: "wall unit limit when defending against NPC targets",
    10414: "strength in courtyard when defending against NPC targets",
    10415: "resources lost after being looted",
    10418: "resources lost after being looted",

    //Castle lord
    10507: "strength when defending main castle",
    10508: "strength for units stationed in outposts & landmarks",
    10509: "earlier attack warning when defending against castle lords",
    10510: "moat protection against castle lords",
    10511: "wall protection against castle lords",
    10512: "gate protection against castle lords",
    10513: "melee unit strength when defending against castle lords",
    10514: "range unit strength when defending against castle lords",
    10515: "wall unit limit when defending against castle lords",
    10516: "strength in courtyard when defending against castle lords",
    10517: "fire damage after attack from enemy castle lords",
    10518: "glory when defending against enemy castle lords",


    30009: "recruitment speed",
    30010: "hospital space",
    30011: "construction speed",
    30012: "base resource production bonus",
    30013: "base kingdom resources production bonus",
    30014: "public order bonus",
    30015: "research boost",
    30016: "resource transport capacity",
    30017: "mead production increase in castle",
    30018: "honey production increase in castle",
    30019: "mead storage capacity in castle",
    30020: "honey storage capacity in castle",
};

/* ------------------------ CONFIG (explained) ------------------------ */
/*
  PAGE_SIZE = 50
  Why: big inventories (thousands of items) stay responsive; 50 provides enough scanning without heavy DOM.
*/
const PAGE_SIZE = 50;

/*
  MAX_EFFECTS_COMPACT = 4
  Why: keep list rows readable; full list is available in expand/collapse.
*/
const MAX_EFFECTS_COMPACT = 4;

/*
  GREEDY + LOCAL_SEARCH_SWAPS
  Why: greedy gives instant baseline; small local swap pass improves without brute force.
*/
const LOCAL_SEARCH_SWAPS = 1; // one pass per slot, fast

/* ------------------------ STATE ------------------------ */
const state = {
  maxima: null,
  maximaLoaded: false,

  inventoryRawCount: 0,
  items: [],        // normalized items
  filtered: [],     // filtered items

  filters: {
    side: "all",              // "all" | "Commander" | "Castellan"
    types: new Set(Object.values(ItemType)), // typeName set
    search: "",
  },

  page: 1,
  lastResult: null, // { targetKey, commander:..., castellan:... }
};

/* ------------------------ DOM ------------------------ */
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
  favOnly: $("favOnly"),
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

  targetSelect: $("targetSelect"),
  maximaKeys: $("maximaKeys"),
  btnCompute: $("btnCompute"),
  btnRecomputeQuick: $("btnRecomputeQuick"),
  optWarnings: $("optWarnings"),

  resultCommander: $("resultCommander"),
  resultCastellan: $("resultCastellan"),
  btnExport: $("btnExport"),
};

/* ------------------------ UTIL ------------------------ */
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

/* ------------------------ MAXIMA LOADING ------------------------ */
async function loadMaxima() {
  // Why fetch relative path: works on GitHub Pages and local file opening may block fetch in some browsers.
  // We handle failure gracefully and keep uploader usable.
  try {
    const res = await fetch("./maxima.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.maxima = json;
    state.maximaLoaded = true;
    setPill(dom.statusMaxima, "pill--ok", "loaded");
    enableOptimizerIfReady();
    populateMaximaUI();
  } catch (e) {
    state.maxima = null;
    state.maximaLoaded = false;
    setPill(dom.statusMaxima, "pill--bad", "failed");
    showError(
      `Failed to load maxima.json. Optimizer disabled, uploader still works. Details: ${e?.message || e}`
    );
    disableOptimizerUI();
  }
}

/*
  IMPORTANT LOCAL FILE NOTE:
  Some browsers block fetch() for local file://. If you open index.html locally and maxima.json fails,
  the site will still work for inventory viewing; optimizer will be disabled until hosted (or served locally).
*/
function populateMaximaUI() {
  const { keys, text } = extractMaximaKeys(state.maxima);
  dom.maximaKeys.value = text;

  dom.targetSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = keys.length ? "Select a target…" : "No keys found";
  dom.targetSelect.appendChild(placeholder);

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    dom.targetSelect.appendChild(opt);
  }

  dom.targetSelect.disabled = !keys.length;
}

function extractMaximaKeys(maxima) {
  // Safe approach: attempt to show “reasonable” keys without assuming structure.
  // Strategy:
  // 1) If maxima is a plain object => keys = Object.keys(maxima)
  // 2) Else if it has a nested "max" or "maxima" object => keys from there
  // 3) Else fallback to deep-ish scan: collect keys of top-level objects/arrays (bounded).
  const lines = [];
  const keysSet = new Set();

  const addKeysFromObj = (obj, prefix = "") => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) {
      keysSet.add(prefix ? `${prefix}.${k}` : k);
    }
  };

  if (maxima && typeof maxima === "object") {
    if (!Array.isArray(maxima)) {
      addKeysFromObj(maxima);
      if (maxima.max && typeof maxima.max === "object") addKeysFromObj(maxima.max, "max");
      if (maxima.maxima && typeof maxima.maxima === "object") addKeysFromObj(maxima.maxima, "maxima");
    } else {
      // Array: show indices as "idx:N" for selection, but keep it bounded.
      const limit = Math.min(maxima.length, 200);
      for (let i = 0; i < limit; i++) keysSet.add(`idx:${i}`);
    }
  }

  // Debug text (bounded)
  lines.push("maxima.json summary:");
  lines.push(`type: ${Array.isArray(maxima) ? "array" : typeof maxima}`);
  if (maxima && typeof maxima === "object") {
    const topKeys = Array.isArray(maxima) ? [] : Object.keys(maxima);
    lines.push(`top-level keys: ${topKeys.slice(0, 200).join(", ")}${topKeys.length > 200 ? " …" : ""}`);
  }
  lines.push("");
  lines.push("Selectable targets:");
  const keys = Array.from(keysSet).sort((a, b) => a.localeCompare(b));
  lines.push(keys.join("\n"));

  return { keys, text: lines.join("\n") };
}

function disableOptimizerUI() {
  dom.targetSelect.disabled = true;
  dom.btnCompute.disabled = true;
  dom.btnRecomputeQuick.disabled = true;
}

function enableOptimizerIfReady() {
  // Optimizer requires maxima loaded AND some inventory loaded.
  const ok = state.maximaLoaded && state.items.length > 0;
  dom.btnCompute.disabled = !ok || !dom.targetSelect.value;
  dom.btnRecomputeQuick.disabled = !ok || !state.lastResult;
  dom.btnExport.disabled = !state.lastResult;
}

/* ------------------------ INVENTORY PARSING ------------------------ */
function normalizeInventory(json) {
  // Resilient validation: data.I should be an array.
  const raw = json && typeof json === "object" ? json.I : null;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid inventory format: expected top-level key "I" as an array.');
  }

  const out = [];
  let unknownEffectsCount = 0;

  for (let idx = 0; idx < raw.length; idx++) {
    const row = raw[idx];
    if (!Array.isArray(row)) continue; // ignore invalid rows safely

    // Per spec indices:
    // 0: id (sensitive; never stored for rendering)
    // 1: typeId
    // 2: sideId
    // 5: effects array
    // 9: favorited flag (non-zero => true)
    const typeId = safeNumber(row[1]);
    const sideId = safeNumber(row[2]);
    const typeName = ItemType[typeId] || `Unknown type (${typeId || "?"})`;
    const sideName = ComOfBV[sideId] || `Unknown side (${sideId || "?"})`;

    const effectsRaw = row[5];
    const effects = [];
    if (Array.isArray(effectsRaw)) {
      for (const e of effectsRaw) {
        // effect tuple: [code, level?, [value]]
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
function applyFilters() {
  const { side, types, favoritesOnly, search } = state.filters;
  const q = normalizeWhitespace(search).toLowerCase();

  const filtered = [];
  for (const it of state.items) {
    if (side !== "all" && it.sideName !== side) continue;
    if (!types.has(it.typeName)) continue;

    if (q) {
      // Search within effect names
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
  enableOptimizerIfReady();
}

/* ------------------------ RENDERING (incremental) ------------------------ */
function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderCountsAndStatus() {
  dom.statusCount.textContent = String(state.items.length);

  if (state.items.length > 0) {
    setPill(dom.statusInv, "pill--ok", "loaded");
  } else {
    setPill(dom.statusInv, "pill--warn", "not loaded");
  }

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
    const row = document.createElement("div");
    row.className = "k";
    row.textContent = typeName;
    const val = document.createElement("div");
    val.className = "v";
    val.textContent = String(byType.get(typeName) || 0);
    dom.countsByType.appendChild(row);
    dom.countsByType.appendChild(val);
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

  // Only re-render list container (not whole app)
  clearNode(dom.list);

  if (slice.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No items match the current filters.";
    dom.list.appendChild(empty);
    return;
  }

  // Build document fragment for performance
  const frag = document.createDocumentFragment();

  for (const it of slice) {
    frag.appendChild(renderItemRow(it));
  }

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

  if (!it.effects.length) {
    const none = document.createElement("div");
    none.className = "muted";
    none.textContent = "No effects found on this item.";
    effList.appendChild(none);
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

function formatValue(v) {
  // Why: values may be float or int; keep compact but readable.
  const n = safeNumber(v);
  const abs = Math.abs(n);
  if (abs >= 1000) return String(Math.round(n));
  if (abs >= 100) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/* ------------------------ OPTIMIZER ------------------------ */
/*
  computeBestSet(items, targetKey)
  - Computes separately for Commander and Castellan.
  - A “set” is best-per-slot using greedy score, with a tiny local swap pass.
  - Scoring is explainable: we return contributions per item.
  - If maxima.json mapping to effect codes is unknown, we use "direct effect name match":
    include effect in score if effect name contains a target keyword.
*/
function computeBestSet(allItems, targetKey) {
  const target = normalizeWhitespace(targetKey);
  if (!target) throw new Error("Select a target metric.");

  const commanderItems = allItems.filter(x => x.sideName === "Commander");
  const castellanItems = allItems.filter(x => x.sideName === "Castellan");

  const commander = computeSideSet(commanderItems, target);
  const castellan = computeSideSet(castellanItems, target);

  return { targetKey: targetKey, commander, castellan };
}

function computeSideSet(items, target) {
  const slots = Object.values(ItemType); // includes Looks/Hero
  const bySlot = new Map();
  for (const s of slots) bySlot.set(s, []);
  for (const it of items) {
    if (!bySlot.has(it.typeName)) bySlot.set(it.typeName, []);
    bySlot.get(it.typeName).push(it);
  }

  const warnings = [];
  const chosen = new Map();

  // Greedy: choose best item per slot by score
  for (const slot of slots) {
    const arr = bySlot.get(slot) || [];
    if (!arr.length) {
      warnings.push(`Missing slot: ${slot}`);
      continue;
    }
    let best = null;
    let bestScore = -Infinity;
    for (const it of arr) {
      const s = scoreItem(it, target);
      if (s.total > bestScore) {
        bestScore = s.total;
        best = { item: it, score: s };
      }
    }
    chosen.set(slot, best);
  }

  // Optional local improvement: one swap pass per slot (fast)
  // For each slot, try top few candidates (bounded) and see if total improves.
  // Why bounded: thousands of items need speed; we only consider top N by item score.
  const TOP_N = 40; // Why: balance improvement vs speed; 40 per slot keeps it quick.
  let improved = true;

  for (let pass = 0; pass < LOCAL_SEARCH_SWAPS && improved; pass++) {
    improved = false;

    for (const slot of slots) {
      const candidates = bySlot.get(slot) || [];
      if (!candidates.length || !chosen.get(slot)) continue;

      const scored = candidates
        .map(it => ({ it, sc: scoreItem(it, target) }))
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

  const total = totalSetScore(chosen);

  return {
    total,
    slots: buildSlotOutput(chosen, target),
    warnings,
  };
}

function totalSetScore(chosenMap) {
  let t = 0;
  for (const v of chosenMap.values()) t += safeNumber(v?.score?.total);
  return t;
}

function scoreItem(item, target) {
  // Fallback scoring: effect name contains target token(s).
  // Tokenization: split on spaces, require all tokens to appear somewhere across included effect names? Too strict.
  // Better: treat target as a phrase; include effect if it contains ANY token longer than 2.
  const q = normalizeWhitespace(target).toLowerCase();
  const tokens = q.split(" ").filter(t => t.length > 2);

  const contributions = [];
  let total = 0;
  let unknownIgnored = 0;

  for (const ef of item.effects) {
    const name = String(ef.name).toLowerCase();
    const isUnknown = name.startsWith("unknown effect");
    if (isUnknown) {
      // Unknown effects cannot be matched by semantic meaning. We keep them “ignored” unless target explicitly includes "unknown".
      if (!q.includes("unknown")) { unknownIgnored++; continue; }
    }

    let match = false;
    if (!tokens.length) {
      match = name.includes(q);
    } else {
      for (const t of tokens) {
        if (name.includes(t)) { match = true; break; }
      }
    }

    if (match) {
      const val = safeNumber(ef.value);
      total += val;
      contributions.push({ name: ef.name, value: val });
    }
  }

  return { total, contributions, unknownIgnored };
}

function buildSlotOutput(chosenMap, target) {
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
      itemType: pick.item.typeName,
      side: pick.item.sideName,
      score: pick.score.total,
      contributions: pick.score.contributions,
      // include full effects for transparency (still no IDs)
      effects: pick.item.effects.map(e => ({ name: e.name, value: e.value, code: e.code })),
      unknownIgnored: pick.score.unknownIgnored,
      targetUsed: target,
    });
  }
  return out;
}

function renderResult(container, result) {
  clearNode(container);

  if (!result) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No result yet.";
    container.appendChild(p);
    return;
  }

  const totalLine = document.createElement("div");
  totalLine.className = "totalLine";
  const left = document.createElement("strong");
  left.textContent = "Total score";
  const right = document.createElement("strong");
  right.textContent = formatValue(result.total);
  totalLine.appendChild(left);
  totalLine.appendChild(right);
  container.appendChild(totalLine);

  for (const s of result.slots) {
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
    contribTitle.textContent = "Contributions to target:";
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
        n.textContent = c.name;
        const v = document.createElement("div");
        v.innerHTML = ""; // not used; just being explicit we set textContent below
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

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.marginTop = "8px";
    meta.textContent = s.unknownIgnored ? `Unknown effects ignored: ${s.unknownIgnored}` : "";

    slot.appendChild(contribWrap);
    slot.appendChild(details);
    if (s.unknownIgnored) slot.appendChild(meta);

    container.appendChild(slot);
  }
}

/* ------------------------ EXPORT ------------------------ */
function exportResult() {
  if (!state.lastResult) return;

  // Remove codes if you consider codes sensitive too; spec only says IDs are sensitive.
  // Here we keep effect code because it is not the internal item id. If you want, set includeCode=false.
  const includeCode = true;

  const stripSlot = (slot) => {
    if (slot.missing) return { slot: slot.slot, missing: true };
    return {
      slot: slot.slot,
      missing: false,
      score: slot.score,
      contributions: slot.contributions.map(c => ({ name: c.name, value: c.value })),
      effects: slot.effects.map(e => includeCode ? ({ name: e.name, value: e.value, code: e.code }) : ({ name: e.name, value: e.value })),
      unknownIgnored: slot.unknownIgnored,
    };
  };

  const payload = {
    targetKey: state.lastResult.targetKey,
    commander: {
      total: state.lastResult.commander.total,
      warnings: state.lastResult.commander.warnings,
      slots: state.lastResult.commander.slots.map(stripSlot),
    },
    castellan: {
      total: state.lastResult.castellan.total,
      warnings: state.lastResult.castellan.warnings,
      slots: state.lastResult.castellan.slots.map(stripSlot),
    },
    generatedAt: new Date().toISOString(),
    note: "No internal item IDs are included.",
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `gge_set_optimizer_${safeFilename(state.lastResult.targetKey)}.json`;
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

/* ------------------------ INIT UI ------------------------ */
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

function readSideFilter() {
  const checked = document.querySelector('input[name="side"]:checked');
  state.filters.side = checked ? checked.value : "all";
}

function clearFiltersToDefault() {
  state.filters.side = "all";
  state.filters.types = new Set(Object.values(ItemType));
  state.filters.favoritesOnly = false;
  state.filters.search = "";

  // reflect UI
  document.querySelector('input[name="side"][value="all"]').checked = true;
  dom.searchBox.value = "";

  // type checks
  const inputs = dom.typeChecks.querySelectorAll('input[type="checkbox"]');
  inputs.forEach(i => i.checked = true);

  applyFilters();
}

/* ------------------------ EVENTS ------------------------ */
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
      state.inventoryRawCount = rawCount;

      showInfo(
        `Loaded ${items.length} items (raw rows: ${rawCount}). Unknown effects encountered: ${unknownEffectsCount}.`
      );

      renderCountsAndStatus();
      // Apply current filters to new inventory
      applyFilters();

      // Enable optimizer if maxima already loaded
      enableOptimizerIfReady();
      dom.btnExport.disabled = true;
      state.lastResult = null;
      dom.resultCommander.innerHTML = '<p class="muted">No result yet.</p>';
      dom.resultCastellan.innerHTML = '<p class="muted">No result yet.</p>';
    } catch (err) {
      showError(err?.message || String(err));
      state.items = [];
      state.filtered = [];
      renderCountsAndStatus();
      renderListPage();
      enableOptimizerIfReady();
    } finally {
      // Clear file input so re-uploading same file triggers change event
      dom.fileInput.value = "";
    }
  });

  dom.btnReset.addEventListener("click", () => {
    clearError();
    clearInfo();
    clearOptWarning();

    state.items = [];
    state.filtered = [];
    state.inventoryRawCount = 0;
    state.page = 1;
    state.lastResult = null;

    renderCountsAndStatus();
    renderListPage();

    dom.resultCommander.innerHTML = '<p class="muted">No result yet.</p>';
    dom.resultCastellan.innerHTML = '<p class="muted">No result yet.</p>';
    dom.btnExport.disabled = true;

    enableOptimizerIfReady();
  });

  dom.btnApply.addEventListener("click", () => {
    readSideFilter();
    state.filters.search = dom.searchBox.value || "";
    applyFilters();
  });

  dom.btnClearFilters.addEventListener("click", () => {
    clearFiltersToDefault();
  });

  dom.btnPrev.addEventListener("click", () => {
    state.page--;
    renderListPage();
  });
  dom.btnNext.addEventListener("click", () => {
    state.page++;
    renderListPage();
  });

  dom.targetSelect.addEventListener("change", () => {
    enableOptimizerIfReady();
  });

  dom.btnCompute.addEventListener("click", () => {
    clearOptWarning();
    clearError();
    clearInfo();

    const targetKey = dom.targetSelect.value;
    if (!targetKey) {
      showOptWarning("Select a target metric first.");
      return;
    }
    if (!state.items.length) {
      showOptWarning("Load an inventory first.");
      return;
    }

    try {
      const result = computeBestSet(state.items, targetKey);
      state.lastResult = result;

      renderResult(dom.resultCommander, result.commander);
      renderResult(dom.resultCastellan, result.castellan);

      const warns = []
        .concat(result.commander.warnings.map(w => `Commander: ${w}`))
        .concat(result.castellan.warnings.map(w => `Castellan: ${w}`));

      if (warns.length) showOptWarning(warns.join(" • "));
      else clearOptWarning();

      dom.btnExport.disabled = false;
      dom.btnRecomputeQuick.disabled = false;
    } catch (err) {
      showError(err?.message || String(err));
    }
  });

  dom.btnRecomputeQuick.addEventListener("click", () => {
    if (!state.lastResult) return;
    dom.targetSelect.value = state.lastResult.targetKey;
    dom.btnCompute.click();
  });

  dom.btnExport.addEventListener("click", () => {
    exportResult();
  });
}

/* ------------------------ STARTUP ------------------------ */
function init() {
  buildTypeChecks();
  renderCountsAndStatus();
  renderListPage();
  wireEvents();

  // Initial pills
  setPill(dom.statusInv, "pill--warn", "not loaded");
  setPill(dom.statusCount, "", "0");
  setPill(dom.statusMaxima, "pill--warn", "loading…");

  // Load maxima.json at startup
  loadMaxima().finally(() => {
    // Optimizer buttons depend on maxima + inventory + selected target
    enableOptimizerIfReady();
  });
}

document.addEventListener("DOMContentLoaded", init);

/*
  SAMPLE INVENTORY SNIPPET (for testing)
  {
    "I": [
      [
        489950016,         // ID (SENSITIVE, never shown)
        2,                 // type: Weapon
        1,                 // side: Castellan
        5,
        -1,
        [
          [10005, 72, [85.6]],
          [99999, 1, [12.3]] // Unknown effect (99999)
        ],
        -1,
        -1,
        0,
        1                  // favorited (truthy => favorite)
      ]
    ]
  }
*/
