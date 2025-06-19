const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const coordsElem = document.getElementById("coords");
const spinner = document.getElementById("loading");

let playersGlobal = [];
let offset = { x: 0, y: 0 };
let scale = 1;
let isDragging = false;
let dragStart = { x: 0, y: 0 };

const castleTypes = {
  1: "Main Castle",
  4: "Outpost",
  23: "special Monument",
  26: "roem Monument",
};

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

function formatPower(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function drawPlayersWithOffset(
  players,
  offsetX,
  offsetY,
  scaleFactor,
  hoveredPlayer = null
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allianceColors = {};
  players.forEach((p) => {
    if (!allianceColors[p.alliance]) {
      allianceColors[p.alliance] = hashColor(p.alliance);
    }
  });

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scaleFactor, scaleFactor);

  for (const p of players) {
    ctx.fillStyle = allianceColors[p.alliance];
    const type = p.type;

    ctx.beginPath();

    if (type === "Main Castle") {
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); // Cirkel
    } else if (type === "Outpost") {
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 6, p.y);
      ctx.lineTo(p.x, p.y + 6);
      ctx.lineTo(p.x - 6, p.y);
      ctx.closePath(); // Ruit
    } else if (type === "Monument") {
      ctx.rect(p.x - 5, p.y - 5, 10, 10); // Vierkant
    } else {
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); // fallback
    }

    ctx.fill();
  }

  if (hoveredPlayer) {
    ctx.fillStyle = "#fff";
    ctx.font = `${14 / scaleFactor}px Arial`;

    const levelText = `Level: ${hoveredPlayer.level}`;
    const powerText = `Macht: ${formatPower(hoveredPlayer.power)}`;
    const allianceText = `Alliance: ${hoveredPlayer.alliance}`;

    const hoverText = [
      `${hoveredPlayer.name} (${hoveredPlayer.type})`,
      allianceText,
      levelText,
      powerText,
    ]
      .filter((line) => line)
      .join("\n");

    const lines = hoverText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(
        lines[i],
        hoveredPlayer.x + 10,
        hoveredPlayer.y - 10 + i * (16 / scaleFactor)
      );
    }
  }

  ctx.restore();
}

async function fetchAllData() {
  spinner.style.display = "block";

  const allCastles = [];
  const knownPlayers = new Set();

  for (let LID = 1; LID <= 6; LID++) {
    let sv = 1;
    let gotNewPlayers = true;

    while (gotNewPlayers) {
      gotNewPlayers = false;

      const url = `https://empire-api.fly.dev/EmpirefourkingdomsExGG_6/hgh/%22LT%22:6,%22LID%22:${LID},%22SV%22:%22${sv}%22`;
      try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.content || !data.content.L || data.content.L.length === 0) {
          break; // Geen data? Stop direct met deze LID
        }

        for (const playerEntry of data.content.L) {
          const playerData = playerEntry[2];
          const playerName = playerData.N;
          const playerLevel = playerData.L;
          const playerPower = playerData.MP;
          const playerAlliance = playerData.AN || "NoAlliance";

          for (const castle of playerData.AP) {
            const world = castle[0]
            const x = castle[2];
            const y = castle[3];
            const typeId = castle[4];
            const typeName = castleTypes[typeId] || `Type ${typeId}`;
            const uniqueId = `${playerName}_${x}_${y}`;

            if (castle[0] !== 0) continue;

            if (!knownPlayers.has(uniqueId)) {
              knownPlayers.add(uniqueId);
              allCastles.push({
                name: playerName,
                level: playerLevel,
                power: playerPower,
                alliance: playerAlliance,
                type: typeName,
                x,
                y,
              });
              gotNewPlayers = true;
            }
          }
        }

        sv+=6;
      } catch (err) {
        console.error("Fetch error:", err);
        break;
      }
    }
  }

  spinner.style.display = "none";
  playersGlobal = allCastles;
  drawPlayersWithOffset(playersGlobal, offset.x, offset.y, scale);
}

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
fetchAllData();

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - offset.x) / scale;
  const mouseY = (e.clientY - rect.top - offset.y) / scale;

  coordsElem.textContent = `Coords: (x: ${Math.round(mouseX)}, y: ${Math.round(
    mouseY
  )})`;

  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };
    offset.x += dx;
    offset.y += dy;
    drawPlayersWithOffset(playersGlobal, offset.x, offset.y, scale);
    return;
  }

  let hoveredPlayer = null;
  for (const p of playersGlobal) {
    const dx = p.x - mouseX;
    const dy = p.y - mouseY;
    if (Math.sqrt(dx * dx + dy * dy) < 8) {
      hoveredPlayer = p;
      break;
    }
  }

  drawPlayersWithOffset(
    playersGlobal,
    offset.x,
    offset.y,
    scale,
    hoveredPlayer
  );
});

const scaleMin = 0.5;
const scaleMax = 5;

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - offset.x) / scale;
  const mouseY = (e.clientY - rect.top - offset.y) / scale;

  const zoomFactor = 1.1;
  const oldScale = scale;

  if (e.deltaY < 0) {
    scale *= zoomFactor;
  } else {
    scale /= zoomFactor;
  }

  scale = Math.max(scaleMin, Math.min(scaleMax, scale));

  // Houd muispositie vast bij in-/uitzoomen
  offset.x -= mouseX * scale - mouseX * oldScale;
  offset.y -= mouseY * scale - mouseY * oldScale;

  drawPlayersWithOffset(playersGlobal, offset.x, offset.y, scale);
});
