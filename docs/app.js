// ===============================
// CONSTANTS
// ===============================

const ITEM_TYPE = {
  1: "Armor",
  2: "Weapon",
  3: "Helmet",
  4: "Artifact",
  5: "Looks",
  6: "Hero",
};

const COM_OF_BV = {
  1: "Castellan",
  2: "Commander",
};

// Effect → attribute mapping
// Keys MUST match maxima.json keys
const EFFECT_TO_ATTR = {
  1: "melee_unit_strength_attacking",
  2: "range_unit_strength_attacking",
  3: "wall_protection",
  4: "gate_protection",
  5: "moat_protection",
  6: "army_travel_speed",
  7: "resources_plundered",

  115: "flank_unit_limit_attacking",
  116: "strength_courtyard_attacking",
  117: "unit_limit_front_attacking",
  118: "combat_strength_attacking",
  119: "combat_strength_front_attacking",
  120: "combat_strength_flank_attacking",
  121: "shieldmaiden_support_courtyard",

  // Castellan / defense examples
  10005: "melee_unit_strength_defending",
  10006: "range_unit_strength_defending",
  10109: "gate_protection",
  10108: "wall_protection",
  10110: "moat_protection",
  10111: "melee_unit_strength_defending",
  10112: "range_unit_strength_defending",
};

// ===============================
// HELPERS
// ===============================

function $(id) {
  return document.getElementById(id);
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

// Always load local maxima.json
async function loadMaxima() {
  const res = await fetch("./maxima.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load maxima.json");
  return await res.json();
}

// ===============================
// PARSE INVENTORY
// ===============================

function parseInventory(inv) {
  const raw = Array.isArray(inv?.I) ? inv.I : [];
  const items = [];

  for (const rec of raw) {
    if (!Array.isArray(rec) || rec.length < 6) continue;

    const typeId = rec[1];
    const comId = rec[2];
    const effects = Array.isArray(rec[5]) ? rec[5] : [];

    items.push({
      typeId,
      type: ITEM_TYPE[typeId] ?? `Type${typeId}`,
      com: COM_OF_BV[comId] ?? `Com${comId}`,
      effects,
    });
  }

  return items;
}

// ===============================
// EFFECT → ATTRIBUTE
// (NO PURITY LOGIC)
// ===============================

function effectsToAttrs(effects, maxima) {
  const attrs = {};

  // initialize all attributes to zero
  for (const key of Object.keys(maxima)) {
    attrs[key] = 0;
  }

  for (const eff of effects) {
    if (!Array.isArray(eff) || eff.length < 3) continue;

    const effectId = eff[0];
    const values = Array.isArray(eff[2]) ? eff[2] : [];

    if (!values.length) continue;

    const value = Number(values[0]);
    if (!Number.isFinite(value)) continue;

    const attr = EFFECT_TO_ATTR[effectId];
    if (!attr) continue;
    if (!(attr in attrs)) continue;

    attrs[attr] += value;
  }

  return attrs;
}

// ===============================
// SCORING
// ===============================

function clampAndScore(attrs, maxima) {
  let score = 0;

  for (const [attr, cfg] of Object.entries(maxima)) {
    const max = Number(cfg.max);
    const weight = Number(cfg.score);

    const raw = Number(attrs[attr] ?? 0);
    const capped = Number.isFinite(max) ? Math.min(raw, max) : raw;

    score += capped * weight;
  }

  return score;
}

// ===============================
// UI HANDLER
// ===============================

$("parseBtn").addEventListener("click", async () => {
  try {
    const invFile = $("invFile").files?.[0];
    if (!invFile) throw new Error("Upload an inventory JSON first.");

    const comFilter = $("comFilter").value;

    const [inventory, maxima] = await Promise.all([
      readJsonFile(invFile),
      loadMaxima(),
    ]);

    const items = parseInventory(inventory);

    // Apply Commander / Castellan filter
    const filtered =
      comFilter === "All"
        ? items
        : items.filter(it => it.com === comFilter);

    const props = filtered.map((it, idx) => {
      const attrs = effectsToAttrs(it.effects, maxima);
      const score = clampAndScore(attrs, maxima);

      return {
        SafeName: `Item #${idx + 1}`,
        Type: it.type,
        Com: it.com,
        Score: score,
      };
    });

    // Stats
    const byType = {};
    for (const p of props) byType[p.Type] = (byType[p.Type] || 0) + 1;

    $("status").textContent =
      `Loaded items: ${props.length}\n` +
      `Filter: ${comFilter}\n\n` +
      `By type:\n` +
      Object.entries(byType).map(([k, v]) => `  - ${k}: ${v}`).join("\n") +
      `\n\nAttributes in maxima: ${Object.keys(maxima).length}`;

    // Preview top 20
    props.sort((a, b) => b.Score - a.Score);

    $("preview").textContent = props
      .slice(0, 20)
      .map(p => `${p.Score.toFixed(2)}  ${p.Com}  ${p.Type}  ${p.SafeName}`)
      .join("\n");

    // expose for later optimizer step
    window.__DATA__ = { items, props, maxima };

  } catch (err) {
    $("status").textContent = "Error: " + err.message;
  }
});
