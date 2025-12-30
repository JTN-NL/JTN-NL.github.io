// -----------------------------
// 0) Maps you already have
// -----------------------------
const ITEM_TYPE = {
  1: "Armor",
  2: "Weapon",
  3: "Helmet",
  4: "Artifact",
  5: "Looks",
  6: "Hero",
};

// If you want to filter Commander vs Castellan later:
const COM_OF_BV = { 1: "Castellan", 2: "Commander" };

// -----------------------------
// 1) EffectId -> attribute name mapping
// IMPORTANT: keys must match maxima.json keys.
// Start small; expand as you decode more effectIds.
// -----------------------------
const EFFECT_TO_ATTR = {
  // Commander examples (your list)
  1: "melee_unit_strength_attacking",
  2: "range_unit_strength_attacking",
  3: "wall_protection",
  4: "gate_protection",
  5: "moat_protection",
  6: "army_travel_speed",
  7: "resources_plundered",
  116: "strength_courtyard_attacking",
  115: "flank_unit_limit_attacking",
  117: "unit_limit_front_attacking",
  118: "combat_strength_attacking",
  119: "combat_strength_front_attacking",
  120: "combat_strength_flank_attacking",
  121: "shieldmaiden_support_courtyard",

  // Castellan examples (from your earlier sample)
  10109: "gate_protection",
  10108: "wall_protection",
  10110: "moat_protection",
  10005: "melee_unit_strength_defending",
  10006: "range_unit_strength_defending",
  10111: "melee_unit_strength_defending",
  10112: "range_unit_strength_defending",
};

// -----------------------------
// 2) Helpers
// -----------------------------
function $(id) { return document.getElementById(id); }

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

// Default maxima load from ./maxima.json unless user uploads one.
async function loadMaxima() {
  const file = $("maxFile").files?.[0];
  if (file) return readJsonFile(file);

  // Parameter choice: fetch local maxima.json so you can ship it with the site.
  const resp = await fetch("./maxima.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("Could not load ./maxima.json (upload it or place it in docs/).");
  return await resp.json();
}

// -----------------------------
// 3) Parse the inventory blob
// Input structure: { "I": [ [item], [item], ... ] }
// Each item is a list; you already mapped first fields.
// -----------------------------
function parseInventory(inv) {
  const raw = Array.isArray(inv?.I) ? inv.I : [];
  const items = [];

  for (const rec of raw) {
    if (!Array.isArray(rec) || rec.length < 6) continue;

    const instanceId = rec[0];
    const typeId = rec[1];
    const comId = rec[2];
    const effects = Array.isArray(rec[5]) ? rec[5] : [];

    // "Favorited" position can vary; keep it best-effort:
    const favorited = (typeof rec[12] === "number") ? rec[12] : null;

    items.push({
      instanceId,
      typeId,
      type: ITEM_TYPE[typeId] ?? `Type${typeId}`,
      comId,
      com: COM_OF_BV[comId] ?? `Com${comId}`,
      effects,
      favorited,
      raw: rec,
    });
  }

  return items;
}

// -----------------------------
// 4) Convert effects -> attribute object
// Effect triple: [effectId, purity, [value]]
// Parameter choice: purity scaling default ON.
// -----------------------------
function effectsToAttrs(effects, maxima, usePurityScaling) {
  // Initialize all maxima attributes to 0 so downstream is consistent
  const attrs = {};
  for (const attr of Object.keys(maxima)) attrs[attr] = 0;

  for (const eff of effects) {
    if (!Array.isArray(eff) || eff.length < 3) continue;

    const effectId = eff[0];
    const purity = eff[1];
    const values = Array.isArray(eff[2]) ? eff[2] : [];

    if (values.length === 0) continue;

    const rawValue = Number(values[0]);
    if (!Number.isFinite(rawValue)) continue;

    const mul = usePurityScaling ? (Number(purity) / 100) : 1;
    const effectiveValue = rawValue * mul;

    const attrName = EFFECT_TO_ATTR[effectId];
    if (!attrName) continue;                // unmapped effect
    if (!(attrName in attrs)) continue;     // attr not present in maxima.json

    attrs[attrName] += effectiveValue;
  }

  return attrs;
}

// -----------------------------
// 5) Clamp + weighted item score (preview only)
// Score uses maxima[attr].score
// Clamp uses maxima[attr].max
// Parameter choice: clamp per item for preview; combo clamp happens later in optimizer.
// -----------------------------
function clampAndScore(attrs, maxima) {
  let score = 0;
  const clamped = {};

  for (const [attr, cfg] of Object.entries(maxima)) {
    const maxCap = Number(cfg.max);
    const weight = Number(cfg.score);

    const v = Number(attrs[attr] ?? 0);
    const capped = Number.isFinite(maxCap) ? Math.min(v, maxCap) : v;

    clamped[attr] = capped;
    if (Number.isFinite(weight)) score += capped * weight;
  }

  return { score, clamped };
}

// -----------------------------
// 6) UI wire-up
// -----------------------------
$("parseBtn").addEventListener("click", async () => {
  try {
    const invFile = $("invFile").files?.[0];
    if (!invFile) throw new Error("Upload an inventory JSON first.");

    const usePurityScaling = $("usePurity").checked;

    const [inv, maxima] = await Promise.all([
      readJsonFile(invFile),
      loadMaxima(),
    ]);

    const items = parseInventory(inv);

    // Build "properties" objects (like rows in Excel)
    const props = items.map(it => {
      const attrs = effectsToAttrs(it.effects, maxima, usePurityScaling);
      const { score } = clampAndScore(attrs, maxima);
      return {
        Name: String(it.instanceId),
        Type: it.type,
        ComOfBV: it.com,
        ScoreHint: score,
        attrs,
      };
    });

    // Status
    const byType = {};
    for (const it of props) byType[it.Type] = (byType[it.Type] ?? 0) + 1;

    $("status").textContent =
      `Loaded items: ${props.length}\n` +
      `By type:\n` +
      Object.entries(byType).map(([k,v]) => `  - ${k}: ${v}`).join("\n") +
      `\n\nMaxima attributes: ${Object.keys(maxima).length}\n` +
      `Purity scaling: ${usePurityScaling ? "ON" : "OFF"}\n` +
      `Mapped effects: ${Object.keys(EFFECT_TO_ATTR).length}\n` +
      `Note: Unmapped effectIds are ignored until you add them to EFFECT_TO_ATTR.`;

    // Preview top 20
    props.sort((a,b) => b.ScoreHint - a.ScoreHint);
    const top = props.slice(0, 20).map(p => `${p.ScoreHint.toFixed(2)}  ${p.ComOfBV}  ${p.Type}  ${p.Name}`);
    $("preview").textContent = top.join("\n") || "No items.";

    // Store globally for next step (optimizer)
    window.__DATA__ = { maxima, items, props };

  } catch (err) {
    $("status").textContent = `Error: ${err.message}`;
  }
});
