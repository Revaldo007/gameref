import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Car,
  ChevronsDown,
  Copy,
  Crown,
  Gem,
  Flame,
  Gauge,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  ShoppingBag,
  Swords,
  Trophy,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import gtecLogoUrl from "./assets/logo.webp";
import charRevaldoUrl from "./assets/char-revaldo.png";
import charAliceUrl from "./assets/char-alice.png";
import charZaneUrl from "./assets/char-zane.png";
import charMayaUrl from "./assets/char-maya.png";

const BLOCK = 760;
const ROAD = 190;
const HALF_ROAD = ROAD / 2;
const WORLD_RADIUS = 4;
const CAR_LENGTH = 118;
const CAR_WIDTH = 56;
const MAX_LIVES = 5;
const POLICE_ESCALATE_TIME = 120;
const ROADBLOCK_TIME = 240;
const HELICOPTER_TIME = 420;
const TAU = Math.PI * 2;
const gtecLogoImage = new Image();
gtecLogoImage.src = gtecLogoUrl;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mod = (n, m) => ((n % m) + m) % m;

function hashSeed(x, y, salt = 0) {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(salt, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function createRng(x, y, salt = 0) {
  let seed = hashSeed(x, y, salt) || 1;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

function inRect(point, rect, pad = 0) {
  return (
    point.x > rect.x - pad &&
    point.x < rect.x + rect.w + pad &&
    point.y > rect.y - pad &&
    point.y < rect.y + rect.h + pad
  );
}

function isRoad(x, y, pad = 0) {
  return (
    mod(x + HALF_ROAD, BLOCK) < ROAD + pad * 2 ||
    mod(y + HALF_ROAD, BLOCK) < ROAD + pad * 2
  );
}

function nearestRoadPoint(x, y) {
  const gx = Math.round(x / BLOCK) * BLOCK;
  const gy = Math.round(y / BLOCK) * BLOCK;
  const toVertical = Math.abs(x - gx);
  const toHorizontal = Math.abs(y - gy);
  if (toVertical < toHorizontal) return { x: gx, y };
  return { x, y: gy };
}

function formatClock(seconds) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function getPhaseInfo(elapsed) {
  const minute = Math.floor(elapsed / 60);
  if (elapsed < POLICE_ESCALATE_TIME) {
    return {
      level: "PHASE 1",
      minute,
      title: "ESCAPE",
      next: `POLICE SWARM ${formatClock(POLICE_ESCALATE_TIME)}`,
      progress: clamp(elapsed / POLICE_ESCALATE_TIME, 0, 1),
    };
  }

  if (elapsed < ROADBLOCK_TIME) {
    return {
      level: "PHASE 2",
      minute,
      title: "POLICE SWARM",
      next: `ROADBLOCKS ${formatClock(ROADBLOCK_TIME)}`,
      progress: clamp(
        (elapsed - POLICE_ESCALATE_TIME) /
          (ROADBLOCK_TIME - POLICE_ESCALATE_TIME),
        0,
        1,
      ),
    };
  }

  if (elapsed < HELICOPTER_TIME) {
    return {
      level: "PHASE 3",
      minute,
      title: "ROADBLOCKS",
      next: `AIRSTRIKE ${formatClock(HELICOPTER_TIME)}`,
      progress: clamp(
        (elapsed - ROADBLOCK_TIME) / (HELICOPTER_TIME - ROADBLOCK_TIME),
        0,
        1,
      ),
    };
  }

  return {
    level: "PHASE 4",
    minute,
    title: "AIRSTRIKE",
    next: "SURVIVE",
    progress: 1,
  };
}

function makeInitialGame() {
  return {
    camera: { x: 0, y: 0 },
    score: 0,
    kills: 0,
    coins: 0,
    elapsed: 0,
    highSpeedTime: 0,
    gameOver: false,
    paused: false,
    slowMo: 0,
    shake: 0,
    flash: 0,
    spawnTimer: 4.2,
    trafficTimer: 1.2,
    coinPulse: 0,
    lastHud: 0,
    cells: new Map(),
    collectedCoins: new Set(),
    police: [],
    traffic: [],
    ambulance: null,
    roadBlock: null,
    roadBlockTimer: 0,
    helicopter: null,
    missiles: [],
    blasts: [],
    particles: [],
    skidMarks: [],
    debris: [],
    player: {
      x: -90,
      y: 45,
      vx: 0,
      vy: 0,
      angle: -0.44,
      nitro: 100,
      lives: 5,
      invincible: 0,
      jump: 0,
      jumpDuration: 0.8,
      jumpHeight: 0,
      heat: 1,
    },
  };
}

function getCell(game, cx, cy) {
  const key = `${cx}:${cy}`;
  if (game.cells.has(key)) return game.cells.get(key);

  const rng = createRng(cx, cy, 18);
  const blockX = cx * BLOCK + HALF_ROAD;
  const blockY = cy * BLOCK + HALF_ROAD;
  const inner = BLOCK - ROAD;
  const houses = [];
  const trees = [];
  const signs = [];
  const streetlights = [];
  const fences = [];
  const parkedCars = [];
  const yardDetails = [];
  const roadDetails = [];
  const palette = [
    "#f1d089",
    "#e9b56b",
    "#c8864b",
    "#9aa08d",
    "#d6c08e",
    "#b87756",
  ];
  const roofPalette = ["#4d382d", "#64412d", "#7d4937", "#3f4d50", "#8c4932"];
  const lotPalette = ["#7f8a46", "#8c843f", "#9a793a", "#6f7e45", "#86713d"];
  const lotColor = lotPalette[Math.floor(rng() * lotPalette.length)];
  const houseCount = 2 + Math.floor(rng() * 3);

  for (let i = 0; i < houseCount; i += 1) {
    const w = 145 + rng() * 150;
    const h = 120 + rng() * 145;
    const x = blockX + 60 + rng() * Math.max(20, inner - w - 120);
    const y = blockY + 60 + rng() * Math.max(20, inner - h - 120);
    const height = 55 + rng() * 85;
    houses.push({
      x,
      y,
      w,
      h,
      height,
      color: palette[Math.floor(rng() * palette.length)],
      roof: roofPalette[Math.floor(rng() * roofPalette.length)],
      garage: rng() > 0.62,
      chimney: rng() > 0.48,
      skylight: rng() > 0.55,
      driveway: rng() > 0.34 ? (rng() > 0.5 ? "x" : "y") : null,
    });
  }

  for (let i = 0; i < 3 + Math.floor(rng() * 4); i += 1) {
    trees.push({
      x: blockX + 45 + rng() * (inner - 90),
      y: blockY + 45 + rng() * (inner - 90),
      r: 24 + rng() * 18,
      h: 55 + rng() * 35,
      color: rng() > 0.5 ? "#6f7330" : "#819043",
    });
  }

  for (let i = 0; i < 7 + Math.floor(rng() * 7); i += 1) {
    yardDetails.push({
      x: blockX + 35 + rng() * (inner - 70),
      y: blockY + 35 + rng() * (inner - 70),
      type: rng() > 0.58 ? "bush" : "patch",
      size: 16 + rng() * 28,
      color: rng() > 0.5 ? "#586b35" : "#7f7a3b",
    });
  }

  const fenceInset = 28;
  if (rng() > 0.35) {
    fences.push({
      x1: blockX + fenceInset,
      y1: blockY + fenceInset,
      x2: blockX + inner - fenceInset,
      y2: blockY + fenceInset,
    });
    fences.push({
      x1: blockX + fenceInset,
      y1: blockY + inner - fenceInset,
      x2: blockX + inner - fenceInset,
      y2: blockY + inner - fenceInset,
    });
  }
  if (rng() > 0.5) {
    fences.push({
      x1: blockX + fenceInset,
      y1: blockY + fenceInset,
      x2: blockX + fenceInset,
      y2: blockY + inner - fenceInset,
    });
    fences.push({
      x1: blockX + inner - fenceInset,
      y1: blockY + fenceInset,
      x2: blockX + inner - fenceInset,
      y2: blockY + inner - fenceInset,
    });
  }

  for (let i = 0; i < 4; i += 1) {
    const along = blockX + 90 + rng() * (inner - 180);
    const across = blockY + 90 + rng() * (inner - 180);
    const verticalSide = rng() > 0.5;
    streetlights.push({
      x: verticalSide ? blockX - 34 : along,
      y: verticalSide ? across : blockY - 34,
      height: 82 + rng() * 24,
      flip: rng() > 0.5 ? 1 : -1,
    });
    streetlights.push({
      x: verticalSide ? blockX + inner + 34 : along,
      y: verticalSide ? across : blockY + inner + 34,
      height: 82 + rng() * 24,
      flip: rng() > 0.5 ? 1 : -1,
    });
  }

  const carColors = ["#49535a", "#7b806f", "#c7bea5", "#6b5f58", "#a7a99a"];
  const parkedCount = rng() > 0.45 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < parkedCount; i += 1) {
    const vertical = rng() > 0.5;
    const sideRoad = rng() > 0.5;
    parkedCars.push({
      x: vertical
        ? (sideRoad ? cx : cx + 1) * BLOCK + (rng() > 0.5 ? -72 : 72)
        : blockX + 90 + rng() * (inner - 180),
      y: vertical
        ? blockY + 90 + rng() * (inner - 180)
        : (sideRoad ? cy : cy + 1) * BLOCK + (rng() > 0.5 ? -72 : 72),
      angle: vertical ? Math.PI / 2 : 0,
      color: carColors[Math.floor(rng() * carColors.length)],
      vx: 0,
      vy: 0,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    const vertical = rng() > 0.5;
    roadDetails.push({
      x: vertical
        ? (rng() > 0.5 ? cx : cx + 1) * BLOCK + (rng() - 0.5) * 110
        : blockX + rng() * inner,
      y: vertical
        ? blockY + rng() * inner
        : (rng() > 0.5 ? cy : cy + 1) * BLOCK + (rng() - 0.5) * 110,
      angle: vertical ? Math.PI / 2 : 0,
      type: rng() > 0.68 ? "manhole" : rng() > 0.35 ? "crack" : "stain",
      size: 14 + rng() * 34,
    });
  }

  if (cx === 0 && cy === 0) {
    signs.push({
      x: blockX + 300,
      y: blockY - 230,
      label: "G-TEC",
      type: "gtec",
    });
  }

  if (rng() > 0.68) {
    signs.push({
      x: blockX + 60 + rng() * (inner - 120),
      y: blockY + inner - 85,
      label: rng() > 0.5 ? "GAMES" : "MART",
      type: "shop",
    });
  }

  const coins = [];
  for (let i = 0; i < 5; i += 1) {
    const onVertical = rng() > 0.5;
    const roadIndex = rng() > 0.5 ? cx : cx + 1;
    const crossIndex = rng() > 0.5 ? cy : cy + 1;
    const baseX = onVertical
      ? roadIndex * BLOCK + (rng() > 0.5 ? -38 : 38)
      : cx * BLOCK + 170 + rng() * 420;
    const baseY = onVertical
      ? cy * BLOCK + 170 + rng() * 420
      : crossIndex * BLOCK + (rng() > 0.5 ? -38 : 38);
    coins.push({ x: baseX, y: baseY, key: `${key}:coin:${i}` });
  }

  const ramps = [];
  if (rng() > 0.42) {
    const vertical = rng() > 0.5;
    ramps.push({
      x: vertical
        ? (rng() > 0.5 ? cx : cx + 1) * BLOCK
        : cx * BLOCK + 210 + rng() * 340,
      y: vertical
        ? cy * BLOCK + 210 + rng() * 340
        : (rng() > 0.5 ? cy : cy + 1) * BLOCK,
      angle: vertical ? Math.PI / 2 : 0,
      key: `${key}:ramp`,
    });
  }

  const cell = {
    houses,
    trees,
    signs,
    streetlights,
    fences,
    parkedCars,
    yardDetails,
    roadDetails,
    coins,
    ramps,
    lotColor,
  };
  game.cells.set(key, cell);
  return cell;
}

function getRenderZoom(width, height) {
  const coarsePointer = isMobilePerformanceView(width, height);
  if (!coarsePointer && (width >= 1120 || (width >= 1024 && height >= 620)))
    return 1;

  const targetWidth = coarsePointer ? 1760 : 1500;
  const targetHeight = coarsePointer ? 880 : 760;
  const minimumZoom = coarsePointer ? 0.62 : 0.72;
  return clamp(
    Math.min(width / targetWidth, height / targetHeight),
    minimumZoom,
    1,
  );
}

function isMobilePerformanceView(width, height) {
  const coarsePointer =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)")?.matches;
  const touchDevice =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const mobileBrowser =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return Boolean(coarsePointer || (touchDevice && mobileBrowser));
}

function getCanvasPixelRatio(width, height) {
  const mobile = isMobilePerformanceView(width, height);
  return Math.min(window.devicePixelRatio || 1, mobile ? 1.1 : 2);
}

function getRenderRadius(width, height) {
  if (!isMobilePerformanceView(width, height)) return WORLD_RADIUS;
  return Math.min(width, height) < 700 ? 2 : 3;
}

function projectPoint(camera, width, height, x, y, z = 0) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const zoom = camera.zoom || 1;
  return {
    x: width * 0.5 + (dx - dy) * 0.78 * zoom,
    y: height * 0.49 + (dx + dy) * 0.405 * zoom - z * zoom,
  };
}

function polygon(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function isoRect(ctx, view, rect, fill, stroke, z = 0) {
  const { camera, width, height } = view;
  const points = [
    projectPoint(camera, width, height, rect.x, rect.y, z),
    projectPoint(camera, width, height, rect.x + rect.w, rect.y, z),
    projectPoint(camera, width, height, rect.x + rect.w, rect.y + rect.h, z),
    projectPoint(camera, width, height, rect.x, rect.y + rect.h, z),
  ];
  polygon(ctx, points, fill, stroke);
  return points;
}

function rotatedWorldPoint(obj, lx, ly) {
  const c = Math.cos(obj.angle);
  const s = Math.sin(obj.angle);
  return {
    x: obj.x + c * lx - s * ly,
    y: obj.y + s * lx + c * ly,
  };
}

function drawRotatedRect(ctx, view, obj, length, width, fill, stroke, z = 0) {
  const pts = [
    rotatedWorldPoint(obj, length / 2, -width / 2),
    rotatedWorldPoint(obj, length / 2, width / 2),
    rotatedWorldPoint(obj, -length / 2, width / 2),
    rotatedWorldPoint(obj, -length / 2, -width / 2),
  ].map((p) => projectPoint(view.camera, view.width, view.height, p.x, p.y, z));
  polygon(ctx, pts, fill, stroke);
  return pts;
}

function drawCarPoly(
  ctx,
  view,
  car,
  points,
  fill,
  stroke,
  z = 0,
  lineWidth = 1,
) {
  const projected = points
    .map(([x, y]) => rotatedWorldPoint(car, x, y))
    .map((p) =>
      projectPoint(view.camera, view.width, view.height, p.x, p.y, z),
    );
  polygon(ctx, projected, fill, stroke, lineWidth);
  return projected;
}

function carScreenAngle(view, car) {
  const center = projectPoint(
    view.camera,
    view.width,
    view.height,
    car.x,
    car.y,
  );
  const nose = rotatedWorldPoint(car, 80, 0);
  const front = projectPoint(
    view.camera,
    view.width,
    view.height,
    nose.x,
    nose.y,
  );
  return Math.atan2(front.y - center.y, front.x - center.x);
}

function drawCarLight(ctx, view, car, lx, ly, color, z) {
  const p = rotatedWorldPoint(car, lx, ly);
  const screen = projectPoint(
    view.camera,
    view.width,
    view.height,
    p.x,
    p.y,
    z,
  );
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(screen.x, screen.y, 5, 2.5, carScreenAngle(view, car), 0, TAU);
  ctx.fill();
}

function drawBuilding(ctx, view, building) {
  if (building.driveway) {
    const driveway =
      building.driveway === "x"
        ? {
            x: building.x + building.w * 0.35,
            y: building.y + building.h - 12,
            w: 82,
            h: 142,
          }
        : {
            x: building.x + building.w - 10,
            y: building.y + building.h * 0.35,
            w: 142,
            h: 82,
          };
    isoRect(ctx, view, driveway, "#8f8674", "#5d5549");
    isoRect(
      ctx,
      view,
      {
        x: driveway.x + 8,
        y: driveway.y + 8,
        w: driveway.w - 16,
        h: driveway.h - 16,
      },
      "rgba(181,174,156,0.35)",
    );
  }

  const shadow = [
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + 18,
      building.y + 18,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w + 42,
      building.y + 18,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w + 64,
      building.y + building.h + 38,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + 28,
      building.y + building.h + 42,
    ),
  ];
  polygon(ctx, shadow, "rgba(37, 23, 13, 0.28)");

  const base = [
    projectPoint(view.camera, view.width, view.height, building.x, building.y),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w,
      building.y,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w,
      building.y + building.h,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x,
      building.y + building.h,
    ),
  ];
  const top = [
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x,
      building.y,
      building.height,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w,
      building.y,
      building.height,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w,
      building.y + building.h,
      building.height,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x,
      building.y + building.h,
      building.height,
    ),
  ];

  polygon(
    ctx,
    [top[1], base[1], base[2], top[2]],
    "#8c643c",
    "rgba(40,20,12,0.5)",
  );
  polygon(
    ctx,
    [top[2], base[2], base[3], top[3]],
    "#6f4b31",
    "rgba(40,20,12,0.5)",
  );
  polygon(ctx, top, building.color, "#24140d", 2);
  const roof = [
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x - 18,
      building.y - 18,
      building.height + 8,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w + 22,
      building.y - 12,
      building.height + 8,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x + building.w + 18,
      building.y + building.h + 18,
      building.height + 8,
    ),
    projectPoint(
      view.camera,
      view.width,
      view.height,
      building.x - 22,
      building.y + building.h + 12,
      building.height + 8,
    ),
  ];
  polygon(ctx, roof, building.roof, "#1d100c", 3);

  if (building.skylight) {
    isoRect(
      ctx,
      view,
      {
        x: building.x + building.w * 0.48,
        y: building.y + building.h * 0.2,
        w: 46,
        h: 26,
      },
      "#46565a",
      "#160d09",
      building.height + 13,
    );
    isoRect(
      ctx,
      view,
      {
        x: building.x + building.w * 0.5,
        y: building.y + building.h * 0.22,
        w: 20,
        h: 10,
      },
      "rgba(184,220,210,0.35)",
      null,
      building.height + 15,
    );
  }

  if (building.chimney) {
    const chimney = {
      x: building.x + building.w * 0.22,
      y: building.y + building.h * 0.24,
      w: 24,
      h: 24,
    };
    isoRect(ctx, view, chimney, "#5a3325", "#160d09", building.height + 24);
    isoRect(
      ctx,
      view,
      { x: chimney.x + 4, y: chimney.y + 4, w: 16, h: 16 },
      "#231510",
      null,
      building.height + 30,
    );
  }

  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 2; i += 1) {
      const wx = building.x + building.w * (0.32 + i * 0.28);
      const wy = building.y + building.h + 1;
      isoRect(
        ctx,
        view,
        { x: wx - 10, y: wy - 2, w: 20, h: 5 },
        row ? "#d5d99f" : "#e9efd0",
        "#301b14",
        building.height * (0.32 + row * 0.24),
      );
    }
  }

  if (building.garage) {
    isoRect(
      ctx,
      view,
      { x: building.x + 18, y: building.y + building.h - 16, w: 56, h: 18 },
      "#443326",
      "#21130d",
    );
  }
}

function drawTree(ctx, view, tree) {
  const trunk = projectPoint(
    view.camera,
    view.width,
    view.height,
    tree.x,
    tree.y,
    18,
  );
  const base = projectPoint(
    view.camera,
    view.width,
    view.height,
    tree.x,
    tree.y,
  );
  ctx.strokeStyle = "#6d3c22";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(trunk.x, trunk.y - tree.h * 0.55);
  ctx.stroke();

  const crown = projectPoint(
    view.camera,
    view.width,
    view.height,
    tree.x,
    tree.y,
    tree.h,
  );
  ctx.fillStyle = "rgba(26, 15, 8, 0.22)";
  ctx.beginPath();
  ctx.ellipse(
    base.x + 20,
    base.y + 12,
    tree.r * 1.25,
    tree.r * 0.52,
    -0.25,
    0,
    TAU,
  );
  ctx.fill();
  ctx.fillStyle = tree.color;
  ctx.beginPath();
  ctx.ellipse(crown.x, crown.y, tree.r * 1.05, tree.r * 0.82, -0.08, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,150,0.08)";
  ctx.beginPath();
  ctx.ellipse(
    crown.x - tree.r * 0.25,
    crown.y - tree.r * 0.22,
    tree.r * 0.44,
    tree.r * 0.28,
    -0.3,
    0,
    TAU,
  );
  ctx.fill();
}

function drawSign(ctx, view, sign) {
  const isGtec = sign.type === "gtec";
  const halfW = isGtec ? 84 : 55;
  const bottomZ = isGtec ? 30 : 20;
  const topZ = isGtec ? 104 : 82;
  const p1 = projectPoint(
    view.camera,
    view.width,
    view.height,
    sign.x - halfW,
    sign.y,
    bottomZ,
  );
  const p2 = projectPoint(
    view.camera,
    view.width,
    view.height,
    sign.x + halfW,
    sign.y,
    bottomZ,
  );
  const p3 = projectPoint(
    view.camera,
    view.width,
    view.height,
    sign.x + halfW,
    sign.y,
    topZ,
  );
  const p4 = projectPoint(
    view.camera,
    view.width,
    view.height,
    sign.x - halfW,
    sign.y,
    topZ,
  );
  if (!isGtec) {
    polygon(ctx, [p1, p2, p3, p4], "#eb5b27", "#2a160e", 3);
  }
  const post = projectPoint(
    view.camera,
    view.width,
    view.height,
    sign.x,
    sign.y,
    0,
  );
  ctx.strokeStyle = "#4d2d1d";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(post.x, post.y);
  ctx.lineTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  ctx.stroke();
  ctx.save();
  ctx.translate((p1.x + p3.x) / 2, (p1.y + p3.y) / 2 + 4);
  ctx.rotate(isGtec ? -0.08 : -0.12);
  ctx.textAlign = "center";
  if (isGtec) {
    ctx.fillStyle = "rgba(21, 10, 5, 0.35)";
    ctx.fillRect(-87, -35, 180, 78);
    ctx.fillStyle = "#075bd3";
    ctx.fillRect(-90, -42, 180, 76);
    ctx.strokeStyle = "#053c89";
    ctx.lineWidth = 5;
    ctx.strokeRect(-90, -42, 180, 76);
    ctx.fillStyle = "#101010";
    ctx.fillRect(-72, -30, 144, 52);
    if (gtecLogoImage.complete && gtecLogoImage.naturalWidth > 0) {
      const maxW = 128;
      const maxH = 42;
      const logoRatio =
        gtecLogoImage.naturalWidth / gtecLogoImage.naturalHeight;
      const drawW = Math.min(maxW, maxH * logoRatio);
      const drawH = drawW / logoRatio;
      ctx.drawImage(gtecLogoImage, -drawW / 2, -4 - drawH / 2, drawW, drawH);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 23px Arial";
      ctx.fillText("G-TEC", 8, -2);
      ctx.font = "900 9px Arial";
      ctx.fillText("EDUCATION", 18, 12);
    }
  } else {
    ctx.font = "900 18px Impact";
    ctx.fillStyle = "#fff4c2";
    ctx.fillText(sign.label, 0, 6);
  }
  ctx.restore();
}

function drawYardDetail(ctx, view, item) {
  if (item.type === "patch") {
    isoRect(
      ctx,
      view,
      {
        x: item.x - item.size,
        y: item.y - item.size * 0.55,
        w: item.size * 2,
        h: item.size * 1.1,
      },
      item.color,
      "rgba(52,42,22,0.18)",
    );
    return;
  }

  const base = projectPoint(
    view.camera,
    view.width,
    view.height,
    item.x,
    item.y,
    5,
  );
  ctx.fillStyle = "rgba(37,25,10,0.2)";
  ctx.beginPath();
  ctx.ellipse(
    base.x + 8,
    base.y + 5,
    item.size * 0.75,
    item.size * 0.28,
    -0.2,
    0,
    TAU,
  );
  ctx.fill();
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.ellipse(
    base.x,
    base.y - item.size * 0.25,
    item.size * 0.62,
    item.size * 0.46,
    -0.15,
    0,
    TAU,
  );
  ctx.fill();
}

function drawFence(ctx, view, fence) {
  const a = projectPoint(
    view.camera,
    view.width,
    view.height,
    fence.x1,
    fence.y1,
    18,
  );
  const b = projectPoint(
    view.camera,
    view.width,
    view.height,
    fence.x2,
    fence.y2,
    18,
  );
  ctx.strokeStyle = "#5d3d25";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const length = Math.hypot(fence.x2 - fence.x1, fence.y2 - fence.y1);
  const posts = Math.max(2, Math.floor(length / 90));
  for (let i = 0; i <= posts; i += 1) {
    const t = i / posts;
    const x = lerp(fence.x1, fence.x2, t);
    const y = lerp(fence.y1, fence.y2, t);
    const foot = projectPoint(view.camera, view.width, view.height, x, y, 0);
    const top = projectPoint(view.camera, view.width, view.height, x, y, 30);
    ctx.strokeStyle = "#442a19";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }
}

function drawStreetlight(ctx, view, light) {
  const foot = projectPoint(
    view.camera,
    view.width,
    view.height,
    light.x,
    light.y,
    0,
  );
  const top = projectPoint(
    view.camera,
    view.width,
    view.height,
    light.x,
    light.y,
    light.height,
  );
  const armEnd = projectPoint(
    view.camera,
    view.width,
    view.height,
    light.x + light.flip * 30,
    light.y - 24,
    light.height - 4,
  );
  ctx.strokeStyle = "rgba(44,31,22,0.35)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(foot.x + 18, foot.y + 10);
  ctx.lineTo(foot.x + 60, foot.y + 22);
  ctx.stroke();
  ctx.strokeStyle = "#2c2a25";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(armEnd.x, armEnd.y);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,221,130,0.2)";
  ctx.beginPath();
  ctx.ellipse(armEnd.x, armEnd.y + 8, 34, 13, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f8d77a";
  ctx.beginPath();
  ctx.ellipse(armEnd.x, armEnd.y, 7, 4, -0.2, 0, TAU);
  ctx.fill();
}

function drawRoadDetail(ctx, view, detail) {
  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    detail.x,
    detail.y,
    2,
  );
  if (detail.type === "manhole") {
    ctx.fillStyle = "#262522";
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      detail.size * 0.62,
      detail.size * 0.34,
      carScreenAngle(view, detail),
      0,
      TAU,
    );
    ctx.fill();
    ctx.strokeStyle = "rgba(240,220,170,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }

  if (detail.type === "stain") {
    ctx.fillStyle = "rgba(18,15,12,0.28)";
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      detail.size,
      detail.size * 0.38,
      detail.angle - 0.25,
      0,
      TAU,
    );
    ctx.fill();
    return;
  }

  ctx.strokeStyle = "rgba(20,18,15,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - detail.size * 0.7, p.y - detail.size * 0.16);
  ctx.lineTo(p.x - detail.size * 0.15, p.y + detail.size * 0.06);
  ctx.lineTo(p.x + detail.size * 0.22, p.y - detail.size * 0.12);
  ctx.lineTo(p.x + detail.size * 0.68, p.y + detail.size * 0.12);
  ctx.stroke();
}

function drawCar(ctx, view, car, variant = "player") {
  const speed = Math.hypot(car.vx || 0, car.vy || 0);
  const jumpZ =
    car.jump > 0
      ? Math.sin((car.jump / car.jumpDuration) * Math.PI) * car.jumpHeight
      : 0;
  const isPolice = variant === "police";
  const isAmbulance = variant === "ambulance";
  const isParked = variant === "parked";
  const isTraffic = variant === "traffic";
  const isPlayer = variant === "player";
  const screenAngle = carScreenAngle(view, car);
  const shadowAlpha = clamp(0.42 - jumpZ / 360, 0.12, 0.42);
  const body = isPolice
    ? "#f2f0e7"
    : isAmbulance
      ? "#f7f1dc"
      : isPlayer
        ? car.nitroBoost
          ? "#3aa0ff"
          : "#1e73d8"
        : isParked
          ? car.color || "#687069"
          : isTraffic
            ? car.color || "#b24a35"
            : "#1f68c7";
  const darkBody = isPolice
    ? "#121212"
    : isAmbulance
      ? "#b52a22"
      : isPlayer
        ? "#082958"
        : isParked
          ? "#282b28"
          : "#3b251e";
  const hood = isPolice
    ? "#f9f6eb"
    : isAmbulance
      ? "#fff8e6"
      : isPlayer
        ? "#2076d7"
        : isParked
          ? "#7a7f76"
          : "#d5a560";
  const glass = "#111a1d";

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [68, -29],
      [48, -36],
      [-42, -35],
      [-66, -26],
      [-70, 26],
      [-42, 35],
      [48, 36],
      [68, 29],
    ],
    `rgba(18, 12, 8, ${shadowAlpha})`,
    null,
    -5,
  );

  for (const [lx, ly] of [
    [36, -34],
    [36, 34],
    [-38, -34],
    [-38, 34],
  ]) {
    const p = rotatedWorldPoint(car, lx, ly);
    const s = projectPoint(
      view.camera,
      view.width,
      view.height,
      p.x,
      p.y,
      jumpZ + 8,
    );
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(screenAngle);
    ctx.fillStyle = "#0b0b0a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#3c3d38";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 3.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [65, -21],
      [49, -31],
      [-43, -31],
      [-62, -22],
      [-64, 22],
      [-43, 31],
      [49, 31],
      [65, 21],
    ],
    darkBody,
    "rgba(17,10,8,0.9)",
    jumpZ + 11,
    2,
  );

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [61, -17],
      [43, -26],
      [-37, -26],
      [-56, -17],
      [-57, 17],
      [-37, 26],
      [43, 26],
      [61, 17],
    ],
    body,
    "#17100d",
    jumpZ + 24,
    2,
  );

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [59, -18],
      [70, -15],
      [70, 15],
      [59, 18],
    ],
    "#0a0b0c",
    "rgba(255,255,255,0.08)",
    jumpZ + 32,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [59, -14],
      [69, -10],
      [69, -5],
      [58, -8],
    ],
    "#f5e7bf",
    null,
    jumpZ + 36,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [59, 14],
      [69, 10],
      [69, 5],
      [58, 8],
    ],
    "#fff1c8",
    null,
    jumpZ + 36,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-57, -14],
      [-66, -11],
      [-66, -5],
      [-57, -7],
    ],
    "#c51d16",
    null,
    jumpZ + 32,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-57, 14],
      [-66, 11],
      [-66, 5],
      [-57, 7],
    ],
    "#e33325",
    null,
    jumpZ + 32,
  );

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [50, -20],
      [15, -23],
      [10, -10],
      [15, 10],
      [50, 20],
      [59, 12],
      [59, -12],
    ],
    hood,
    "rgba(17,10,8,0.45)",
    jumpZ + 31,
  );
  if (isPlayer) {
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [52, -17],
        [18, -20],
        [17, -16],
        [49, -12],
      ],
      "#4da7ff",
      null,
      jumpZ + 38,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [52, 17],
        [18, 20],
        [17, 16],
        [49, 12],
      ],
      "#0b3b78",
      null,
      jumpZ + 37,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [45, -7],
        [18, -9],
        [16, 9],
        [45, 7],
      ],
      "#07090c",
      "rgba(255,255,255,0.08)",
      jumpZ + 40,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [41, -3],
        [20, -4],
        [19, 4],
        [41, 3],
      ],
      "#151920",
      "rgba(255,255,255,0.08)",
      jumpZ + 41,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [57, -18],
        [28, -24],
        [28, -19],
        [57, -12],
      ],
      "rgba(94,176,255,0.38)",
      null,
      jumpZ + 38,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [57, 18],
        [28, 24],
        [28, 19],
        [57, 12],
      ],
      "rgba(7,24,52,0.34)",
      null,
      jumpZ + 38,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [16, -3],
        [-38, -5],
        [-38, 0],
        [16, 2],
      ],
      "#07111d",
      null,
      jumpZ + 42,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [-9, -19],
        [-32, -17],
        [-34, -13],
        [-9, -14],
      ],
      "#2f8deb",
      null,
      jumpZ + 41,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [-9, 19],
        [-32, 17],
        [-34, 13],
        [-9, 14],
      ],
      "#0a3264",
      null,
      jumpZ + 40,
    );
  }

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [8, -18],
      [-25, -18],
      [-35, -11],
      [-35, 11],
      [-25, 18],
      [8, 18],
      [20, 8],
      [20, -8],
    ],
    glass,
    "#060707",
    jumpZ + 36,
    2,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [7, -14],
      [-8, -15],
      [-5, -5],
      [16, -5],
    ],
    "#203538",
    null,
    jumpZ + 40,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [7, 14],
      [-8, 15],
      [-5, 5],
      [16, 5],
    ],
    "#17282b",
    null,
    jumpZ + 40,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-12, -15],
      [-29, -11],
      [-31, -5],
      [-11, -5],
    ],
    "#1c3033",
    null,
    jumpZ + 40,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-12, 15],
      [-29, 11],
      [-31, 5],
      [-11, 5],
    ],
    "#132427",
    null,
    jumpZ + 40,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [16, -13],
      [-27, -12],
      [-22, -9],
      [11, -9],
    ],
    "rgba(160,220,230,0.2)",
    null,
    jumpZ + 41,
  );
  if (isPlayer) {
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [11, -19],
        [-27, -18],
        [-24, -15],
        [8, -15],
      ],
      "#1b79d1",
      null,
      jumpZ + 39,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [11, 19],
        [-27, 18],
        [-24, 15],
        [8, 15],
      ],
      "#08386f",
      null,
      jumpZ + 38,
    );
  }

  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-39, -19],
      [-55, -13],
      [-55, 13],
      [-39, 19],
    ],
    isPolice || isAmbulance ? "#f2f0e7" : body,
    "rgba(17,10,8,0.45)",
    jumpZ + 29,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-59, -32],
      [-73, -28],
      [-73, -21],
      [-59, -23],
    ],
    "#111111",
    "rgba(0,0,0,0.45)",
    jumpZ + 36,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-59, 32],
      [-73, 28],
      [-73, 21],
      [-59, 23],
    ],
    "#111111",
    "rgba(0,0,0,0.45)",
    jumpZ + 36,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [42, -28],
      [56, -21],
      [53, -17],
      [40, -22],
    ],
    "rgba(0,0,0,0.28)",
    null,
    jumpZ + 34,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [42, 28],
      [56, 21],
      [53, 17],
      [40, 22],
    ],
    "rgba(0,0,0,0.28)",
    null,
    jumpZ + 34,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-38, -27],
      [-54, -20],
      [-51, -15],
      [-36, -21],
    ],
    "rgba(0,0,0,0.24)",
    null,
    jumpZ + 33,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-38, 27],
      [-54, 20],
      [-51, 15],
      [-36, 21],
    ],
    "rgba(0,0,0,0.24)",
    null,
    jumpZ + 33,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-50, -25],
      [43, -25],
      [40, -20],
      [-48, -20],
    ],
    isPlayer ? "#134f9c" : "rgba(0,0,0,0.18)",
    null,
    jumpZ + 36,
  );
  drawCarPoly(
    ctx,
    view,
    car,
    [
      [-50, 25],
      [43, 25],
      [40, 20],
      [-48, 20],
    ],
    isPlayer ? "#0b2e5c" : "rgba(0,0,0,0.18)",
    null,
    jumpZ + 35,
  );

  for (const [mx, my] of [
    [14, -31],
    [14, 31],
  ]) {
    const p = rotatedWorldPoint(car, mx, my);
    const s = projectPoint(
      view.camera,
      view.width,
      view.height,
      p.x,
      p.y,
      jumpZ + 39,
    );
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(screenAngle);
    ctx.fillStyle = "#101010";
    ctx.fillRect(-5, -2, 10, 4);
    ctx.restore();
  }

  if (isPolice) {
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [58, -22],
        [25, -29],
        [25, -22],
        [58, -13],
      ],
      "#101010",
      null,
      jumpZ + 39,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [58, 22],
        [25, 29],
        [25, 22],
        [58, 13],
      ],
      "#101010",
      null,
      jumpZ + 39,
    );
    const labelPoint = projectPoint(
      view.camera,
      view.width,
      view.height,
      car.x,
      car.y,
      jumpZ + 44,
    );
    ctx.save();
    ctx.translate(labelPoint.x, labelPoint.y);
    ctx.rotate(screenAngle);
    ctx.fillStyle = "#f7f2e6";
    ctx.font = "900 8px Arial";
    ctx.textAlign = "center";
    ctx.fillText("POLICE", -17, 2);
    ctx.restore();
    drawRotatedRect(
      ctx,
      view,
      {
        ...car,
        x: rotatedWorldPoint(car, 0, -8).x,
        y: rotatedWorldPoint(car, 0, -8).y,
      },
      18,
      9,
      "#ff2a24",
      "#20100c",
      jumpZ + 48,
    );
    drawRotatedRect(
      ctx,
      view,
      {
        ...car,
        x: rotatedWorldPoint(car, 0, 8).x,
        y: rotatedWorldPoint(car, 0, 8).y,
      },
      18,
      9,
      "#1e88ff",
      "#20100c",
      jumpZ + 48,
    );
    if (Math.floor(performance.now() / 120) % 2 === 0) {
      const p = projectPoint(
        view.camera,
        view.width,
        view.height,
        car.x,
        car.y,
        jumpZ + 47,
      );
      ctx.fillStyle = "rgba(255,40,30,0.22)";
      ctx.beginPath();
      ctx.ellipse(p.x - 8, p.y, 38, 12, -0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(35,120,255,0.22)";
      ctx.beginPath();
      ctx.ellipse(p.x + 8, p.y, 38, 12, -0.55, 0, TAU);
      ctx.fill();
    }
  }

  if (isAmbulance) {
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [58, -21],
        [20, -28],
        [20, -21],
        [58, -13],
      ],
      "#d92d25",
      null,
      jumpZ + 39,
    );
    drawCarPoly(
      ctx,
      view,
      car,
      [
        [58, 21],
        [20, 28],
        [20, 21],
        [58, 13],
      ],
      "#d92d25",
      null,
      jumpZ + 39,
    );
    drawRotatedRect(
      ctx,
      view,
      {
        ...car,
        x: rotatedWorldPoint(car, -8, 0).x,
        y: rotatedWorldPoint(car, -8, 0).y,
      },
      34,
      9,
      "#d92d25",
      "#5c120f",
      jumpZ + 48,
    );
    drawRotatedRect(
      ctx,
      view,
      {
        ...car,
        x: rotatedWorldPoint(car, -8, 0).x,
        y: rotatedWorldPoint(car, -8, 0).y,
        angle: car.angle + Math.PI / 2,
      },
      34,
      9,
      "#d92d25",
      "#5c120f",
      jumpZ + 49,
    );
    const labelPoint = projectPoint(
      view.camera,
      view.width,
      view.height,
      car.x,
      car.y,
      jumpZ + 52 + Math.sin(car.pulse || 0) * 4,
    );
    ctx.save();
    ctx.translate(labelPoint.x, labelPoint.y);
    ctx.rotate(screenAngle);
    ctx.fillStyle = "rgba(88,255,143,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#102016";
    ctx.font = "900 9px Arial";
    ctx.textAlign = "center";
    ctx.fillText("MED", 0, 3);
    ctx.restore();
  }

  if (isPlayer && car.nitroBoost && speed > 80) {
    const tail = rotatedWorldPoint(car, -CAR_LENGTH * 0.55, 0);
    const p = projectPoint(
      view.camera,
      view.width,
      view.height,
      tail.x,
      tail.y,
      jumpZ + 10,
    );
    ctx.fillStyle = "rgba(52, 211, 255, 0.46)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 24, 9, -0.5, 0, TAU);
    ctx.fill();
  }
}

function addParticle(game, particle) {
  game.particles.push(particle);
  const limit = game.mobilePerformance ? 360 : 850;
  if (game.particles.length > limit)
    game.particles.splice(0, game.particles.length - limit);
}

function puff(game, x, y, color, count = 10, power = 95, life = 0.7) {
  const particleCount = Math.max(
    1,
    Math.floor(count * (game.mobilePerformance ? 0.48 : 1)),
  );
  for (let i = 0; i < particleCount; i += 1) {
    const a = Math.random() * TAU;
    const s = (0.15 + Math.random()) * power;
    addParticle(game, {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      z: Math.random() * 20,
      vz: Math.random() * 85,
      size: 5 + Math.random() * 13,
      life,
      maxLife: life,
      color,
      gravity: 95,
    });
  }
}

function explosion(game, x, y, big = false) {
  game.shake = Math.max(game.shake, big ? 28 : 16);
  game.flash = Math.max(game.flash, big ? 0.55 : 0.32);
  if (big) (game.blasts ||= []).push({ x, y, life: 0.62, maxLife: 0.62 });
  puff(game, x, y, "#ffbd4c", big ? 34 : 20, big ? 320 : 220, 0.72);
  puff(game, x, y, "#ff4b21", big ? 22 : 14, big ? 220 : 160, 0.58);
  puff(game, x, y, "rgba(54,47,40,0.82)", big ? 26 : 14, big ? 150 : 100, 1.3);
  const debrisCount = Math.max(
    4,
    Math.floor((big ? 18 : 10) * (game.mobilePerformance ? 0.5 : 1)),
  );
  for (let i = 0; i < debrisCount; i += 1) {
    const a = Math.random() * TAU;
    const s = 80 + Math.random() * 260;
    game.debris.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      angle: Math.random() * TAU,
      spin: -6 + Math.random() * 12,
      life: 0.9 + Math.random() * 0.7,
      maxLife: 1.5,
      color: Math.random() > 0.45 ? "#1d1915" : "#f06a27",
    });
  }
}

function addSkid(game, car, strength = 1) {
  const left = rotatedWorldPoint(car, -42, -CAR_WIDTH * 0.45);
  const right = rotatedWorldPoint(car, -42, CAR_WIDTH * 0.45);
  game.skidMarks.push({
    x: left.x,
    y: left.y,
    angle: car.angle,
    life: 5,
    strength,
  });
  game.skidMarks.push({
    x: right.x,
    y: right.y,
    angle: car.angle,
    life: 5,
    strength,
  });
  const limit = game.mobilePerformance ? 240 : 520;
  if (game.skidMarks.length > limit)
    game.skidMarks.splice(0, game.skidMarks.length - limit);
}

function damagePlayer(game, amount = 1) {
  if (game.player.invincible > 0 || game.player.jump > 0) return;
  game.player.lives = Math.max(0, game.player.lives - amount);
  game.player.invincible = 2;
  game.slowMo = 0.18;
  if (game.player.lives <= 0) game.gameOver = true;
}

function getNearbyCells(game, x, y, radius = WORLD_RADIUS) {
  const cx = Math.floor(x / BLOCK);
  const cy = Math.floor(y / BLOCK);
  const cells = [];
  for (let ix = cx - radius; ix <= cx + radius; ix += 1) {
    for (let iy = cy - radius; iy <= cy + radius; iy += 1) {
      cells.push({ cx: ix, cy: iy, cell: getCell(game, ix, iy) });
    }
  }
  return cells;
}

function getNearbyBuildings(game, x, y, radius = 1) {
  return getNearbyCells(game, x, y, radius).flatMap(({ cell }) => cell.houses);
}

function getPoliceLimit(game) {
  if (game.elapsed >= ROADBLOCK_TIME) return 5;
  if (game.elapsed < POLICE_ESCALATE_TIME)
    return 3 + Math.floor(game.player.heat * 0.4);
  return Math.min(
    10,
    4 + Math.floor((game.elapsed - POLICE_ESCALATE_TIME) / 18),
  );
}

function spawnPolice(game) {
  if (game.police.length >= getPoliceLimit(game)) return;
  const side = Math.floor(Math.random() * 4);
  const distance = 1650 + Math.random() * 720;
  let x =
    game.player.x +
    (side === 0
      ? -distance
      : side === 1
        ? distance
        : (Math.random() - 0.5) * 1000);
  let y =
    game.player.y +
    (side === 2
      ? -distance
      : side === 3
        ? distance
        : (Math.random() - 0.5) * 1000);
  const snapped = nearestRoadPoint(x, y);
  x = snapped.x;
  y = snapped.y;
  const angle = Math.atan2(game.player.y - y, game.player.x - x);
  game.police.push({
    x,
    y,
    vx: Math.cos(angle) * 55,
    vy: Math.sin(angle) * 55,
    angle,
    cooldown: 0.8,
    siren: Math.random(),
  });
}

function spawnAmbulance(game) {
  if (game.ambulance || game.player.lives > 3) return;
  const angle =
    game.player.angle +
    (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2) +
    (Math.random() - 0.5) * 0.9;
  const distance = 680 + Math.random() * 520;
  const snapped = nearestRoadPoint(
    game.player.x + Math.cos(angle) * distance,
    game.player.y + Math.sin(angle) * distance,
  );
  game.ambulance = {
    x: snapped.x,
    y: snapped.y,
    vx: 0,
    vy: 0,
    angle: Math.random() > 0.5 ? 0 : Math.PI / 2,
    pulse: Math.random() * TAU,
  };
}

function spawnRoadBlock(game) {
  const speed = Math.hypot(game.player.vx, game.player.vy);
  const forward =
    speed > 120
      ? Math.atan2(game.player.vy, game.player.vx)
      : game.player.angle;
  const flank = (Math.random() - 0.5) * 0.42;
  const distance = 660 + Math.random() * 420;
  const target = nearestRoadPoint(
    game.player.x + Math.cos(forward + flank) * distance,
    game.player.y + Math.sin(forward + flank) * distance,
  );
  const verticalRoad =
    Math.abs(target.x - Math.round(target.x / BLOCK) * BLOCK) <
    Math.abs(target.y - Math.round(target.y / BLOCK) * BLOCK);
  game.roadBlock = {
    x: target.x,
    y: target.y,
    angle: verticalRoad ? 0 : Math.PI / 2,
    length: ROAD + 155,
    width: 104,
    spikeWidth: 210,
    age: 0,
    ttl: 58 + Math.random() * 22,
  };
}

function launchMissile(game) {
  const lead = clamp(
    Math.hypot(game.player.vx, game.player.vy) / 420,
    0.15,
    0.85,
  );
  const source = game.helicopter || game.player;
  game.missiles.push({
    x: game.player.x + game.player.vx * lead,
    y: game.player.y + game.player.vy * lead,
    sourceX: source.x,
    sourceY: source.y,
    angle: Math.atan2(game.player.y - source.y, game.player.x - source.x),
    roll: Math.random() * TAU,
    timer: 3,
    maxTimer: 3,
  });
}

function spawnTraffic(game) {
  if (game.traffic.length > 18) return;
  const vertical = Math.random() > 0.5;
  const lane = Math.random() > 0.5 ? -44 : 44;
  const spawnAngle = Math.random() * TAU;
  const spawnDistance = 760 + Math.random() * 900;
  const spawnX = game.player.x + Math.cos(spawnAngle) * spawnDistance;
  const spawnY = game.player.y + Math.sin(spawnAngle) * spawnDistance;
  const gx = Math.round(spawnX / BLOCK) * BLOCK;
  const gy = Math.round(spawnY / BLOCK) * BLOCK;
  const direction = Math.random() > 0.5 ? 1 : -1;
  const colors = ["#cf3d2f", "#e66b22", "#d8b94f", "#7ca75d", "#ece3c4"];
  const car = {
    x: vertical ? gx + lane : spawnX,
    y: vertical ? spawnY : gy + lane,
    vx: vertical ? 0 : direction * (90 + Math.random() * 80),
    vy: vertical ? direction * (90 + Math.random() * 80) : 0,
    angle: vertical
      ? direction > 0
        ? Math.PI / 2
        : -Math.PI / 2
      : direction > 0
        ? 0
        : Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)],
    turnCooldown: 1 + Math.random(),
  };
  game.traffic.push(car);
}

function updateCarPhysics(car, input, dt, options = {}) {
  const f = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const r = { x: -f.y, y: f.x };
  const forwardSpeed = car.vx * f.x + car.vy * f.y;
  const lateralSpeed = car.vx * r.x + car.vy * r.y;
  const steerScale = clamp(Math.abs(forwardSpeed) / 310, 0.15, 1.28);
  car.angle +=
    input.steer *
    (options.turnRate || 2.55) *
    steerScale *
    dt *
    (forwardSpeed >= -15 ? 1 : -1);

  const nf = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const nr = { x: -nf.y, y: nf.x };
  car.vx += nf.x * input.throttle * (options.accel || 540) * dt;
  car.vy += nf.y * input.throttle * (options.accel || 540) * dt;
  car.vx -= nf.x * input.brake * (options.brake || 660) * dt;
  car.vy -= nf.y * input.brake * (options.brake || 660) * dt;

  const currentForward = car.vx * nf.x + car.vy * nf.y;
  const currentLateral = car.vx * nr.x + car.vy * nr.y;
  const grip = input.handbrake ? 1.35 : options.grip || 4.45;
  const dampedLateral = currentLateral * Math.max(0, 1 - grip * dt);
  const drag = Math.max(0, 1 - (options.drag || 0.55) * dt);
  car.vx = (nf.x * currentForward + nr.x * dampedLateral) * drag;
  car.vy = (nf.y * currentForward + nr.y * dampedLateral) * drag;

  const speed = Math.hypot(car.vx, car.vy);
  const maxSpeed = options.maxSpeed || 540;
  if (speed > maxSpeed) {
    car.vx = (car.vx / speed) * maxSpeed;
    car.vy = (car.vy / speed) * maxSpeed;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  return { speed, lateral: currentLateral };
}

function updateGame(game, keys, touch, dt) {
  if (game.paused || game.gameOver) return;
  const step = game.slowMo > 0 ? dt * 0.45 : dt;
  game.slowMo = Math.max(0, game.slowMo - dt);
  game.shake = Math.max(0, game.shake - 22 * dt);
  game.flash = Math.max(0, game.flash - 1.7 * dt);
  game.coinPulse += dt;
  game.elapsed += step;

  const player = game.player;
  const joyX = clamp(touch.joyX || 0, -1, 1);
  const joyY = clamp(touch.joyY || 0, -1, 1);
  const keyThrottle = keys.KeyW || keys.ArrowUp || touch.up ? 1 : 0;
  const keyBrake = keys.KeyS || keys.ArrowDown || touch.down ? 1 : 0;
  const joystickThrottle = joyY < -0.16 ? clamp(-joyY, 0, 1) : 0;
  const joystickBrake = joyY > 0.42 ? clamp(joyY, 0, 1) : 0;
  const throttle = Math.max(keyThrottle, joystickThrottle);
  const brake = Math.max(keyBrake, joystickBrake);
  const keySteer =
    (keys.KeyD || keys.ArrowRight || touch.right ? 1 : 0) -
    (keys.KeyA || keys.ArrowLeft || touch.left ? 1 : 0);
  const steer = clamp(keySteer + joyX, -1, 1);
  const handbrake =
    keys.ShiftLeft || keys.ShiftRight || touch.drift || touch.down;
  const nitroPressed = keys.Space || touch.nitro;
  const canNitro = nitroPressed && player.nitro > 1 && throttle;
  player.nitroBoost = canNitro;
  if (canNitro) {
    player.nitro = Math.max(0, player.nitro - 32 * step);
    player.vx += Math.cos(player.angle) * 920 * step;
    player.vy += Math.sin(player.angle) * 920 * step;
    const tail = rotatedWorldPoint(player, -62, 0);
    puff(game, tail.x, tail.y, "rgba(65,210,255,0.7)", 2, 55, 0.32);
  } else {
    player.nitro = Math.min(
      100,
      player.nitro + (isRoad(player.x, player.y) ? 18 : 10) * step,
    );
  }

  if (player.jump > 0) player.jump = Math.max(0, player.jump - step);
  player.invincible = Math.max(0, player.invincible - step);

  const roadGrip = isRoad(player.x, player.y, 24) ? 1 : 0.7;
  const physics = updateCarPhysics(
    player,
    { throttle, brake, steer, handbrake },
    step,
    {
      accel: canNitro ? 780 : 620,
      maxSpeed: canNitro ? 930 : 630,
      grip: handbrake ? 1.15 : 4.25 * roadGrip,
    },
  );

  if (!isRoad(player.x, player.y, 12)) {
    player.vx *= 1 - 0.95 * step;
    player.vy *= 1 - 0.95 * step;
  }

  if (Math.abs(physics.lateral) > 92 || (handbrake && physics.speed > 120)) {
    addSkid(game, player, clamp(Math.abs(physics.lateral) / 210, 0.35, 1.2));
    const tail = rotatedWorldPoint(player, -58, 0);
    puff(game, tail.x, tail.y, "rgba(84,78,67,0.5)", 1, 25, 0.36);
  }

  game.score += step * (36 + physics.speed * 0.18 + game.police.length * 8);
  player.heat = Math.min(6, 1 + game.score / 2800 + game.kills * 0.12);
  game.highSpeedTime = physics.speed > 520 ? game.highSpeedTime + step : 0;
  const policeLimit = getPoliceLimit(game);
  if (game.police.length > policeLimit) {
    game.police.sort((a, b) => dist(a, player) - dist(b, player));
    game.police.splice(policeLimit);
  }

  const nearby = getNearbyCells(game, player.x, player.y, 2);
  for (const { cell } of nearby) {
    for (const coin of cell.coins) {
      if (
        !game.collectedCoins.has(coin.key) &&
        Math.hypot(player.x - coin.x, player.y - coin.y) < 58
      ) {
        game.collectedCoins.add(coin.key);
        game.coins += 1;
        game.score += 200;
        puff(game, coin.x, coin.y, "#ffd55a", 12, 95, 0.45);
      }
    }
    for (const ramp of cell.ramps) {
      if (
        Math.hypot(player.x - ramp.x, player.y - ramp.y) < 78 &&
        physics.speed > 210 &&
        player.jump <= 0
      ) {
        player.jump = 0.86;
        player.jumpDuration = 0.86;
        player.jumpHeight = 96 + clamp(physics.speed - 260, 0, 260) * 0.22;
        game.score += 100;
        puff(game, ramp.x, ramp.y, "rgba(230,205,130,0.6)", 10, 80, 0.5);
      }
    }
  }

  if (player.jump <= 0) {
    for (const building of getNearbyBuildings(game, player.x, player.y, 1)) {
      if (inRect(player, building, 31)) {
        explosion(game, player.x, player.y, false);
        damagePlayer(game, 1);
        const center = {
          x: building.x + building.w / 2,
          y: building.y + building.h / 2,
        };
        const a = Math.atan2(player.y - center.y, player.x - center.x);
        player.x += Math.cos(a) * 42;
        player.y += Math.sin(a) * 42;
        player.vx = Math.cos(a) * 180;
        player.vy = Math.sin(a) * 180;
        break;
      }
    }
  }

  spawnAmbulance(game);
  if (game.ambulance) {
    game.ambulance.pulse += step * 4;
    if (dist(player, game.ambulance) < 72 && player.jump <= 0) {
      player.lives = MAX_LIVES;
      player.invincible = Math.max(player.invincible, 1.25);
      game.score += 450;
      puff(
        game,
        game.ambulance.x,
        game.ambulance.y,
        "rgba(88,255,143,0.78)",
        22,
        130,
        0.62,
      );
      game.ambulance = null;
    } else if (
      dist(player, game.ambulance) > 1700 ||
      player.lives >= MAX_LIVES
    ) {
      game.ambulance = null;
    }
  }

  if (game.elapsed >= ROADBLOCK_TIME) {
    game.roadBlockTimer -= step;
    if (!game.roadBlock && game.roadBlockTimer <= 0) {
      spawnRoadBlock(game);
      game.roadBlockTimer = 36 + Math.random() * 18;
    }
  }

  if (game.roadBlock) {
    game.roadBlock.age += step;
    const along =
      (player.x - game.roadBlock.x) * Math.cos(game.roadBlock.angle) +
      (player.y - game.roadBlock.y) * Math.sin(game.roadBlock.angle);
    const across =
      -(player.x - game.roadBlock.x) * Math.sin(game.roadBlock.angle) +
      (player.y - game.roadBlock.y) * Math.cos(game.roadBlock.angle);
    const barrierHit =
      Math.abs(along) < game.roadBlock.length / 2 + 42 &&
      Math.abs(across) < game.roadBlock.width / 2 + 38;
    const spikeHit =
      Math.abs(along) < game.roadBlock.length / 2 + 82 &&
      Math.abs(across) < (game.roadBlock.spikeWidth || 190) / 2 + 28;
    if (barrierHit && player.jump <= 0 && player.invincible <= 0) {
      explosion(game, player.x, player.y, false);
      damagePlayer(game, 1);
      const away = Math.atan2(
        player.y - game.roadBlock.y,
        player.x - game.roadBlock.x,
      );
      player.x += Math.cos(away) * 76;
      player.y += Math.sin(away) * 76;
      player.vx = Math.cos(away) * 260;
      player.vy = Math.sin(away) * 260;
    } else if (spikeHit && player.jump <= 0 && player.invincible <= 0) {
      damagePlayer(game, 1);
      player.nitro = 0;
      player.vx *= -0.18;
      player.vy *= -0.18;
      puff(game, player.x, player.y, "rgba(30,26,22,0.72)", 12, 120, 0.62);
    }
    if (
      game.roadBlock.age > game.roadBlock.ttl ||
      dist(player, game.roadBlock) > 1900
    )
      game.roadBlock = null;
  }

  if (game.elapsed >= HELICOPTER_TIME) {
    if (!game.helicopter)
      game.helicopter = { angle: Math.random() * TAU, cooldown: 2.8 };
    game.helicopter.angle += step * 0.34;
    game.helicopter.x = player.x + Math.cos(game.helicopter.angle) * 720;
    game.helicopter.y = player.y + Math.sin(game.helicopter.angle) * 720;
    game.helicopter.cooldown -= step;
    if (game.helicopter.cooldown <= 0) {
      launchMissile(game);
      game.helicopter.cooldown = 8.5 + Math.random() * 3.5;
    }
  }

  for (let i = game.missiles.length - 1; i >= 0; i -= 1) {
    const missile = game.missiles[i];
    missile.timer -= step;
    if (missile.timer <= 0) {
      explosion(game, missile.x, missile.y, true);
      if (dist(player, missile) < 165 && player.jump <= 0)
        damagePlayer(game, 2);
      game.missiles.splice(i, 1);
    }
  }

  game.spawnTimer -= step;
  if (game.spawnTimer <= 0) {
    spawnPolice(game);
    const lateChase = game.elapsed >= POLICE_ESCALATE_TIME ? 1 : 0;
    game.spawnTimer = Math.max(
      1.05,
      4.6 - player.heat * 0.22 - lateChase * 1.15,
    );
  }

  game.trafficTimer -= step;
  if (game.trafficTimer <= 0) {
    spawnTraffic(game);
    game.trafficTimer = 0.7 + Math.random() * 0.65;
  }

  for (let i = game.police.length - 1; i >= 0; i -= 1) {
    const car = game.police[i];
    const predict = clamp(dist(car, player) / 920, 0.06, 0.45);
    const tx = player.x + player.vx * predict;
    const ty = player.y + player.vy * predict;
    const desired =
      Math.atan2(ty - car.y, tx - car.x) +
      Math.sin(game.score * 0.015 + car.siren * 9) * 0.16;
    let delta = Math.atan2(
      Math.sin(desired - car.angle),
      Math.cos(desired - car.angle),
    );
    const roadBias = isRoad(car.x, car.y, 50) ? 0 : 0.45;
    if (roadBias) {
      const road = nearestRoadPoint(car.x, car.y);
      delta +=
        Math.atan2(
          Math.sin(Math.atan2(road.y - car.y, road.x - car.x) - car.angle),
          Math.cos(Math.atan2(road.y - car.y, road.x - car.x) - car.angle),
        ) * roadBias;
    }
    const policePhysics = updateCarPhysics(
      car,
      {
        throttle: 1,
        brake: 0,
        steer: clamp(delta * 1.15, -1, 1),
        handbrake: Math.abs(delta) > 1.05,
      },
      step,
      {
        accel: 380 + player.heat * 22,
        maxSpeed: 430 + player.heat * 16,
        grip: 2.65,
        turnRate: 2.25,
        drag: 0.52,
      },
    );

    if (Math.abs(policePhysics.lateral) > 135) addSkid(game, car, 0.75);
    car.cooldown = Math.max(0, car.cooldown - step);

    for (const building of getNearbyBuildings(game, car.x, car.y, 1)) {
      if (inRect(car, building, 22)) {
        explosion(game, car.x, car.y, true);
        game.police.splice(i, 1);
        game.kills += 1;
        game.score += 400;
        break;
      }
    }

    if (!game.police[i]) continue;
    if (dist(car, player) < 60 && player.jump <= 0 && car.cooldown <= 0) {
      const rel = Math.hypot(player.vx - car.vx, player.vy - car.vy);
      explosion(
        game,
        (player.x + car.x) / 2,
        (player.y + car.y) / 2,
        rel > 360,
      );
      if (rel > 410 || player.nitroBoost) {
        game.police.splice(i, 1);
        game.kills += 1;
        game.score += 500;
      }
      damagePlayer(game, rel > 500 ? 2 : 1);
      car.cooldown = 1.2;
      player.vx += Math.cos(player.angle) * 220;
      player.vy += Math.sin(player.angle) * 220;
    } else if (dist(car, player) > 2300) {
      game.police.splice(i, 1);
    }
  }

  for (let i = game.traffic.length - 1; i >= 0; i -= 1) {
    const car = game.traffic[i];
    car.x += car.vx * step;
    car.y += car.vy * step;
    car.turnCooldown -= step;
    const speed = Math.hypot(car.vx, car.vy);
    if (
      Math.abs(mod(car.x + BLOCK / 2, BLOCK) - BLOCK / 2) < speed * step &&
      Math.abs(mod(car.y + BLOCK / 2, BLOCK) - BLOCK / 2) < speed * step &&
      car.turnCooldown <= 0
    ) {
      const turn = Math.random();
      if (turn > 0.42) {
        const dir =
          Math.atan2(car.vy, car.vx) +
          (turn > 0.72 ? Math.PI / 2 : -Math.PI / 2);
        car.vx = Math.cos(dir) * speed;
        car.vy = Math.sin(dir) * speed;
        car.angle = dir;
      }
      car.turnCooldown = 1.1;
    }

    if (dist(car, player) < 66 && player.jump <= 0) {
      explosion(game, (player.x + car.x) / 2, (player.y + car.y) / 2, false);
      game.traffic.splice(i, 1);
      damagePlayer(game, 1);
      continue;
    }

    for (let j = game.police.length - 1; j >= 0; j -= 1) {
      if (dist(car, game.police[j]) < 62) {
        explosion(game, car.x, car.y, true);
        game.traffic.splice(i, 1);
        game.police.splice(j, 1);
        game.kills += 1;
        game.score += 300;
        break;
      }
    }

    if (game.traffic[i] && dist(car, player) > 2200) game.traffic.splice(i, 1);
  }

  game.camera.x = lerp(
    game.camera.x,
    player.x + player.vx * 0.24,
    1 - Math.exp(-step * 5.5),
  );
  game.camera.y = lerp(
    game.camera.y,
    player.y + player.vy * 0.24,
    1 - Math.exp(-step * 5.5),
  );

  updateEffects(game, step);
}

function updateEffects(game, dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += (p.vz || 0) * dt;
    p.vz = (p.vz || 0) - (p.gravity || 0) * dt;
    p.vx *= 1 - 0.55 * dt;
    p.vy *= 1 - 0.55 * dt;
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }

  for (let i = game.skidMarks.length - 1; i >= 0; i -= 1) {
    game.skidMarks[i].life -= dt * 0.16;
    if (game.skidMarks[i].life <= 0) game.skidMarks.splice(i, 1);
  }

  for (let i = game.debris.length - 1; i >= 0; i -= 1) {
    const d = game.debris[i];
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.angle += d.spin * dt;
    d.vx *= 1 - 0.7 * dt;
    d.vy *= 1 - 0.7 * dt;
    d.life -= dt;
    if (d.life <= 0) game.debris.splice(i, 1);
  }

  game.blasts ||= [];
  for (let i = game.blasts.length - 1; i >= 0; i -= 1) {
    game.blasts[i].life -= dt;
    if (game.blasts[i].life <= 0) game.blasts.splice(i, 1);
  }
}

function drawRoadMark(ctx, view, x1, y1, x2, y2, width, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  drawRotatedRect(
    ctx,
    view,
    { x: cx, y: cy, angle: a },
    len,
    width,
    color,
    null,
    1,
  );
}

function drawWorld(ctx, view, game) {
  const { width, height } = view;
  const radius = view.renderRadius || WORLD_RADIUS;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#56643e";
  ctx.fillRect(0, 0, width, height);

  const cx = Math.floor(game.camera.x / BLOCK);
  const cy = Math.floor(game.camera.y / BLOCK);
  const roadMinX = (cx - radius - 1) * BLOCK;
  const roadMaxX = (cx + radius + 2) * BLOCK;
  const roadMinY = (cy - radius - 1) * BLOCK;
  const roadMaxY = (cy + radius + 2) * BLOCK;

  for (let ix = cx - radius - 1; ix <= cx + radius + 1; ix += 1) {
    for (let iy = cy - radius - 1; iy <= cy + radius + 1; iy += 1) {
      const cell = getCell(game, ix, iy);
      isoRect(
        ctx,
        view,
        {
          x: ix * BLOCK + HALF_ROAD,
          y: iy * BLOCK + HALF_ROAD,
          w: BLOCK - ROAD,
          h: BLOCK - ROAD,
        },
        cell.lotColor,
      );
      isoRect(
        ctx,
        view,
        {
          x: ix * BLOCK + HALF_ROAD + 18,
          y: iy * BLOCK + HALF_ROAD + 18,
          w: BLOCK - ROAD - 36,
          h: BLOCK - ROAD - 36,
        },
        "rgba(190,168,102,0.18)",
      );
      isoRect(
        ctx,
        view,
        {
          x: ix * BLOCK + HALF_ROAD + 42,
          y: iy * BLOCK + HALF_ROAD + 42,
          w: BLOCK - ROAD - 84,
          h: BLOCK - ROAD - 84,
        },
        "rgba(66,90,50,0.14)",
      );
    }
  }

  for (let i = cx - radius - 2; i <= cx + radius + 2; i += 1) {
    isoRect(
      ctx,
      view,
      {
        x: i * BLOCK - HALF_ROAD,
        y: roadMinY,
        w: ROAD,
        h: roadMaxY - roadMinY,
      },
      "#343636",
      "#232323",
    );
    isoRect(
      ctx,
      view,
      { x: i * BLOCK - 56, y: roadMinY, w: 112, h: roadMaxY - roadMinY },
      "rgba(29,31,31,0.22)",
    );
  }
  for (let i = cy - radius - 2; i <= cy + radius + 2; i += 1) {
    isoRect(
      ctx,
      view,
      {
        x: roadMinX,
        y: i * BLOCK - HALF_ROAD,
        w: roadMaxX - roadMinX,
        h: ROAD,
      },
      "#373837",
      "#232323",
    );
    isoRect(
      ctx,
      view,
      { x: roadMinX, y: i * BLOCK - 56, w: roadMaxX - roadMinX, h: 112 },
      "rgba(28,30,30,0.22)",
    );
  }

  ctx.lineCap = "round";
  for (let i = cx - radius - 2; i <= cx + radius + 2; i += 1) {
    const x = i * BLOCK;
    for (let y = roadMinY; y < roadMaxY; y += 130) {
      drawRoadMark(
        ctx,
        view,
        x,
        y + 24,
        x,
        y + 76,
        8,
        "rgba(255,244,190,0.82)",
      );
    }
  }
  for (let i = cy - radius - 2; i <= cy + radius + 2; i += 1) {
    const y = i * BLOCK;
    for (let x = roadMinX; x < roadMaxX; x += 130) {
      drawRoadMark(
        ctx,
        view,
        x + 24,
        y,
        x + 76,
        y,
        8,
        "rgba(255,244,190,0.82)",
      );
    }
  }

  for (let ix = cx - radius - 1; ix <= cx + radius + 1; ix += 1) {
    for (let iy = cy - radius - 1; iy <= cy + radius + 1; iy += 1) {
      const bx = ix * BLOCK + HALF_ROAD - 22;
      const by = iy * BLOCK + HALF_ROAD - 22;
      isoRect(
        ctx,
        view,
        { x: bx, y: by, w: BLOCK - ROAD + 44, h: 22 },
        "#a79a83",
        "#726756",
      );
      isoRect(
        ctx,
        view,
        { x: bx, y: by, w: 22, h: BLOCK - ROAD + 44 },
        "#aea087",
        "#726756",
      );
      isoRect(
        ctx,
        view,
        { x: bx, y: by + BLOCK - ROAD + 22, w: BLOCK - ROAD + 44, h: 22 },
        "#978a74",
        "#645a4b",
      );
      isoRect(
        ctx,
        view,
        { x: bx + BLOCK - ROAD + 22, y: by, w: 22, h: BLOCK - ROAD + 44 },
        "#978a74",
        "#645a4b",
      );
    }
  }

  for (let ix = cx - radius - 1; ix <= cx + radius + 1; ix += 1) {
    for (let iy = cy - radius - 1; iy <= cy + radius + 1; iy += 1) {
      const centerX = ix * BLOCK;
      const centerY = iy * BLOCK;
      for (let k = -1; k <= 1; k += 1) {
        drawRoadMark(
          ctx,
          view,
          centerX - 130 + k * 46,
          centerY + HALF_ROAD - 18,
          centerX - 104 + k * 46,
          centerY + HALF_ROAD - 18,
          14,
          "#fff2c3",
        );
        drawRoadMark(
          ctx,
          view,
          centerX + HALF_ROAD - 18,
          centerY - 130 + k * 46,
          centerX + HALF_ROAD - 18,
          centerY - 104 + k * 46,
          14,
          "#fff2c3",
        );
      }
    }
  }
}

function drawRamp(ctx, view, ramp) {
  const top = drawRotatedRect(
    ctx,
    view,
    { ...ramp },
    130,
    74,
    "#c9843c",
    "#2c190d",
    4,
  );
  const lip = drawRotatedRect(
    ctx,
    view,
    {
      ...ramp,
      x: rotatedWorldPoint(ramp, 42, 0).x,
      y: rotatedWorldPoint(ramp, 42, 0).y,
    },
    34,
    76,
    "#f1c46e",
    "#2c190d",
    20,
  );
  polygon(ctx, [top[0], top[1], lip[1], lip[0]], "#d99b48", "#2c190d");
}

function drawCoin(ctx, view, coin, pulse) {
  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    coin.x,
    coin.y,
    22 + Math.sin(pulse * 5 + coin.x) * 5,
  );
  ctx.fillStyle = "rgba(75,45,10,0.28)";
  ctx.beginPath();
  ctx.ellipse(p.x + 6, p.y + 17, 16, 7, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffd954";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 13, 17, 0.08, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#8a5515";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#fff6a8";
  ctx.beginPath();
  ctx.ellipse(p.x - 4, p.y - 5, 3, 7, 0.1, 0, TAU);
  ctx.fill();
}

function drawRoadBlock(ctx, view, block) {
  const spikeLength = block.length + 120;
  drawRotatedRect(
    ctx,
    view,
    { ...block, x: block.x, y: block.y },
    spikeLength,
    16,
    "#10100f",
    "#050505",
    8,
  );
  for (let i = -4; i <= 4; i += 1) {
    const center = rotatedWorldPoint(block, i * 36, 0);
    drawRotatedRect(
      ctx,
      view,
      { ...block, x: center.x, y: center.y, angle: block.angle + Math.PI / 4 },
      25,
      6,
      "#d8d0b2",
      "#17110c",
      18,
    );
  }

  const guardOffset = block.width * 0.62;
  for (const side of [-1, 1]) {
    const carPoint = rotatedWorldPoint(
      block,
      -block.length * 0.22,
      side * guardOffset,
    );
    drawCar(
      ctx,
      view,
      {
        x: carPoint.x,
        y: carPoint.y,
        vx: 0,
        vy: 0,
        angle: block.angle + side * 0.18,
        siren: side > 0 ? 0.2 : 0.75,
      },
      "police",
    );
  }

  drawRotatedRect(
    ctx,
    view,
    block,
    block.length,
    block.width,
    "#2b2020",
    "#150c0b",
    9,
  );
  for (let i = -4; i <= 4; i += 1) {
    const center = rotatedWorldPoint(block, i * 34, 0);
    drawRotatedRect(
      ctx,
      view,
      { ...block, x: center.x, y: center.y },
      26,
      block.width + 12,
      i % 2 ? "#fff0be" : "#e43b28",
      "#190d0a",
      22,
    );
  }
  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    block.x,
    block.y,
    56,
  );
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(carScreenAngle(view, block));
  ctx.fillStyle = "#fff0be";
  ctx.strokeStyle = "#180c09";
  ctx.lineWidth = 3;
  ctx.font = "900 13px Arial";
  ctx.textAlign = "center";
  ctx.strokeText("BLOCK", 0, 4);
  ctx.fillText("BLOCK", 0, 4);
  ctx.restore();
}

function drawBlastRing(ctx, view, blast) {
  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    blast.x,
    blast.y,
    8,
  );
  const progress = 1 - clamp(blast.life / blast.maxLife, 0, 1);
  const alpha = clamp(blast.life / blast.maxLife, 0, 1);
  const radius = 36 + progress * 170;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-0.48);
  ctx.fillStyle = `rgba(255, 128, 34, ${0.2 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.58, radius * 0.26, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 226, 134, ${0.72 * alpha})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.45, 0, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 55, 28, ${0.52 * alpha})`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.7, radius * 0.32, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawMissileWarning(ctx, view, missile) {
  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    missile.x,
    missile.y,
    4,
  );
  const t = clamp(missile.timer / missile.maxTimer, 0, 1);
  const progress = 1 - t;
  const pulse = 0.5 + Math.sin(progress * TAU * 5 + missile.roll) * 0.5;
  const radius = 76 - progress * 26;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-0.48);
  ctx.fillStyle = `rgba(255, 55, 32, ${0.08 + progress * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.48, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 240, 190, ${0.55 + pulse * 0.28})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius + 9, radius * 0.48 + 5, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = `rgba(255, 48, 32, ${0.72 + progress * 0.22})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.48, 0, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i += 1) {
    const a = i * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius * 0.48, Math.sin(a) * radius * 0.25);
    ctx.lineTo(Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.47);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 241, 200, 0.92)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(18, 0);
  ctx.moveTo(0, -13);
  ctx.lineTo(0, 13);
  ctx.stroke();
  ctx.fillStyle = "#fff1c8";
  ctx.font = "900 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText(Math.ceil(missile.timer).toString(), 0, -radius * 0.58);
  ctx.restore();

  const sourceX = missile.sourceX ?? missile.x - 240;
  const sourceY = missile.sourceY ?? missile.y - 240;
  const falling = projectPoint(
    view.camera,
    view.width,
    view.height,
    lerp(sourceX, missile.x, progress),
    lerp(sourceY, missile.y, progress),
    48 + 260 * t,
  );
  ctx.save();
  ctx.translate(falling.x, falling.y);
  ctx.rotate((missile.angle || -0.7) - 0.5);
  const flame = 20 + pulse * 10;
  ctx.fillStyle = "rgba(255, 151, 47, 0.42)";
  ctx.beginPath();
  ctx.moveTo(-8, 21);
  ctx.lineTo(0, 21 + flame);
  ctx.lineTo(8, 21);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#252b31";
  ctx.strokeStyle = "#07090b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-7, -24, 14, 45);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d8dde0";
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(9, -22);
  ctx.lineTo(-9, -22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e94a32";
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(5, -24);
  ctx.lineTo(-5, -24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8b2521";
  ctx.fillRect(-13, 10, 7, 14);
  ctx.fillRect(6, 10, 7, 14);
  ctx.restore();
}

function drawHelicopter(ctx, view, helicopter) {
  const shadow = projectPoint(
    view.camera,
    view.width,
    view.height,
    helicopter.x,
    helicopter.y,
    0,
  );
  ctx.fillStyle = "rgba(12, 8, 7, 0.24)";
  ctx.beginPath();
  ctx.ellipse(shadow.x + 18, shadow.y + 36, 96, 30, -0.48, 0, TAU);
  ctx.fill();

  const p = projectPoint(
    view.camera,
    view.width,
    view.height,
    helicopter.x,
    helicopter.y,
    245,
  );
  const bodyAngle = carScreenAngle(view, {
    x: helicopter.x,
    y: helicopter.y,
    angle: (helicopter.angle || 0) + Math.PI / 2,
  });
  const rotorSpin = performance.now() * 0.018;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(bodyAngle);

  ctx.save();
  ctx.rotate(rotorSpin);
  ctx.fillStyle = "rgba(214, 224, 225, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 112, 13, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 94, 10, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(235, 244, 246, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-112, 0);
  ctx.lineTo(112, 0);
  ctx.moveTo(0, -94);
  ctx.lineTo(0, 94);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#15191c";
  ctx.strokeStyle = "#050607";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(63, 0);
  ctx.bezierCurveTo(52, -24, 10, -31, -30, -23);
  ctx.lineTo(-104, -8);
  ctx.lineTo(-109, 8);
  ctx.lineTo(-30, 23);
  ctx.bezierCurveTo(8, 31, 52, 23, 63, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#283139";
  ctx.beginPath();
  ctx.ellipse(10, 0, 45, 22, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#5d7681";
  ctx.strokeStyle = "#071014";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(54, 0);
  ctx.bezierCurveTo(44, -17, 22, -17, 6, -12);
  ctx.lineTo(14, 12);
  ctx.bezierCurveTo(31, 17, 47, 12, 54, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(141, 202, 218, 0.42)";
  ctx.beginPath();
  ctx.ellipse(37, -3, 15, 7, -0.15, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#0b0d0f";
  ctx.fillRect(-113, -5, 54, 10);
  ctx.beginPath();
  ctx.moveTo(-110, -20);
  ctx.lineTo(-92, -7);
  ctx.lineTo(-112, -5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-110, 20);
  ctx.lineTo(-92, 7);
  ctx.lineTo(-112, 5);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(-122, 0);
  ctx.rotate(-rotorSpin * 1.6);
  ctx.strokeStyle = "rgba(232, 240, 241, 0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(24, 0);
  ctx.moveTo(0, -24);
  ctx.lineTo(0, 24);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "#050607";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-28, -28);
  ctx.lineTo(40, -34);
  ctx.moveTo(-28, 28);
  ctx.lineTo(40, 34);
  ctx.stroke();
  ctx.strokeStyle = "#444d50";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -25);
  ctx.lineTo(-8, -39);
  ctx.moveTo(22, -31);
  ctx.lineTo(36, -43);
  ctx.moveTo(-22, 25);
  ctx.lineTo(-8, 39);
  ctx.moveTo(22, 31);
  ctx.lineTo(36, 43);
  ctx.stroke();

  ctx.fillStyle = "#252b31";
  ctx.strokeStyle = "#060708";
  ctx.lineWidth = 2;
  for (const y of [-28, 28]) {
    ctx.fillRect(-5, y - 7, 46, 14);
    ctx.strokeRect(-5, y - 7, 46, 14);
    ctx.fillStyle = "#e54d35";
    ctx.fillRect(31, y - 4, 8, 8);
    ctx.fillStyle = "#252b31";
  }

  ctx.fillStyle = "#d9d0aa";
  ctx.beginPath();
  ctx.moveTo(66, -6);
  ctx.lineTo(82, 0);
  ctx.lineTo(66, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDynamicObjects(ctx, view, game) {
  const drawables = [];
  const cells = getNearbyCells(
    game,
    game.camera.x,
    game.camera.y,
    view.renderRadius || WORLD_RADIUS,
  );
  for (const { cell } of cells) {
    for (const detail of cell.roadDetails)
      drawables.push({
        y: detail.x + detail.y - 40,
        type: "roadDetail",
        item: detail,
      });
    for (const yard of cell.yardDetails)
      drawables.push({ y: yard.x + yard.y - 20, type: "yard", item: yard });
    for (const fence of cell.fences)
      drawables.push({
        y: Math.max(fence.x1 + fence.y1, fence.x2 + fence.y2) + 6,
        type: "fence",
        item: fence,
      });
    for (const ramp of cell.ramps)
      drawables.push({ y: ramp.x + ramp.y, type: "ramp", item: ramp });
    for (const coin of cell.coins) {
      if (!game.collectedCoins.has(coin.key))
        drawables.push({ y: coin.x + coin.y, type: "coin", item: coin });
    }
    for (const parked of cell.parkedCars)
      drawables.push({
        y: parked.x + parked.y,
        type: "parkedCar",
        item: parked,
      });
    for (const sign of cell.signs)
      drawables.push({ y: sign.x + sign.y + 70, type: "sign", item: sign });
    for (const light of cell.streetlights)
      drawables.push({
        y: light.x + light.y + 85,
        type: "streetlight",
        item: light,
      });
    for (const tree of cell.trees)
      drawables.push({ y: tree.x + tree.y + 60, type: "tree", item: tree });
    for (const house of cell.houses)
      drawables.push({
        y: house.x + house.y + house.w + house.h,
        type: "building",
        item: house,
      });
  }

  for (const mark of game.skidMarks)
    drawables.push({ y: mark.x + mark.y - 8, type: "skid", item: mark });
  if (game.roadBlock)
    drawables.push({
      y: game.roadBlock.x + game.roadBlock.y + 24,
      type: "roadBlock",
      item: game.roadBlock,
    });
  if (game.ambulance)
    drawables.push({
      y: game.ambulance.x + game.ambulance.y,
      type: "ambulance",
      item: game.ambulance,
    });
  for (const car of game.traffic)
    drawables.push({ y: car.x + car.y, type: "traffic", item: car });
  for (const car of game.police)
    drawables.push({ y: car.x + car.y, type: "police", item: car });
  drawables.push({
    y: game.player.x + game.player.y,
    type: "player",
    item: game.player,
  });
  for (const d of game.debris)
    drawables.push({ y: d.x + d.y + 12, type: "debris", item: d });
  for (const p of game.particles)
    drawables.push({ y: p.x + p.y + p.z, type: "particle", item: p });

  drawables.sort((a, b) => a.y - b.y);
  for (const drawable of drawables) {
    if (drawable.type === "roadDetail")
      drawRoadDetail(ctx, view, drawable.item);
    if (drawable.type === "yard") drawYardDetail(ctx, view, drawable.item);
    if (drawable.type === "fence") drawFence(ctx, view, drawable.item);
    if (drawable.type === "building") drawBuilding(ctx, view, drawable.item);
    if (drawable.type === "tree") drawTree(ctx, view, drawable.item);
    if (drawable.type === "sign") drawSign(ctx, view, drawable.item);
    if (drawable.type === "streetlight")
      drawStreetlight(ctx, view, drawable.item);
    if (drawable.type === "coin")
      drawCoin(ctx, view, drawable.item, game.coinPulse);
    if (drawable.type === "ramp") drawRamp(ctx, view, drawable.item);
    if (drawable.type === "skid") {
      const p = drawable.item;
      const alpha = clamp(p.life / 5, 0, 0.55) * p.strength;
      drawRotatedRect(
        ctx,
        view,
        { x: p.x, y: p.y, angle: p.angle },
        52,
        7,
        `rgba(15, 10, 7, ${alpha})`,
        null,
        1,
      );
    }
    if (drawable.type === "roadBlock") drawRoadBlock(ctx, view, drawable.item);
    if (drawable.type === "parkedCar")
      drawCar(ctx, view, drawable.item, "parked");
    if (drawable.type === "ambulance")
      drawCar(ctx, view, drawable.item, "ambulance");
    if (drawable.type === "traffic")
      drawCar(ctx, view, drawable.item, "traffic");
    if (drawable.type === "police") drawCar(ctx, view, drawable.item, "police");
    if (drawable.type === "player") {
      if (
        game.player.invincible > 0 &&
        Math.floor(performance.now() / 90) % 2 === 0
      )
        continue;
      drawCar(ctx, view, drawable.item, "player");
    }
    if (drawable.type === "particle") {
      const p = drawable.item;
      const screen = projectPoint(
        view.camera,
        view.width,
        view.height,
        p.x,
        p.y,
        p.z,
      );
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y, p.size, p.size * 0.72, -0.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (drawable.type === "debris") {
      const d = drawable.item;
      const p = projectPoint(
        view.camera,
        view.width,
        view.height,
        d.x,
        d.y,
        18,
      );
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(d.angle);
      ctx.globalAlpha = clamp(d.life / d.maxLife, 0, 1);
      ctx.fillStyle = d.color;
      ctx.fillRect(-8, -4, 16, 8);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  for (const blast of game.blasts || []) drawBlastRing(ctx, view, blast);
  for (const missile of game.missiles) drawMissileWarning(ctx, view, missile);
  if (game.helicopter) drawHelicopter(ctx, view, game.helicopter);
}

function drawPost(ctx, view, game) {
  const { width, height } = view;
  const grainAlpha = 0.055;
  ctx.fillStyle = `rgba(12, 7, 4, ${grainAlpha})`;
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.2,
    width / 2,
    height / 2,
    height * 0.77,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(20,7,5,0.44)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,225,132,${game.flash})`;
    ctx.fillRect(0, 0, width, height);
  }
}

const pregameSteps = [
  { id: "welcome", label: "Welcome" },
  { id: "world", label: "World" },
  { id: "customize", label: "Customize" },
  { id: "lobby", label: "Lobby" },
  { id: "shop", label: "Shop" },
];

const lobbyPlayers = [
  {
    name: "Revaldo",
    level: 25,
    role: "HOST",
    status: "READY",
    art: charRevaldoUrl,
    accent: "gold",
  },
  {
    name: "Alice",
    level: 20,
    role: "READY",
    status: "READY",
    art: charAliceUrl,
    accent: "violet",
  },
  {
    name: "Zane",
    level: 18,
    role: "READY",
    status: "READY",
    art: charZaneUrl,
    accent: "blue",
  },
  {
    name: "Maya",
    level: 22,
    role: "NOT READY",
    status: "NOT READY",
    art: charMayaUrl,
    accent: "red",
  },
];

const friendList = [
  { name: "Luna", status: "Online", art: charAliceUrl },
  { name: "Zane", status: "Online", art: charZaneUrl },
  { name: "Maya", status: "Online", art: charMayaUrl },
  { name: "Rex", status: "Offline", art: charRevaldoUrl },
  { name: "Nova", status: "Offline", art: charZaneUrl },
];

const shopItems = [
  { name: "Knight Armor", price: "1,200", type: "outfit", color: "blue" },
  { name: "Shadow Suit", price: "1,500", type: "outfit", color: "purple" },
  { name: "Dragon Rider", price: "2,000", type: "vehicle", color: "green" },
  { name: "Star Racer", price: "1,800", type: "vehicle", color: "red" },
  { name: "Royal Chariot", price: "2,500", type: "vehicle", color: "gold" },
  { name: "Thunder Bike", price: "2,000", type: "vehicle", color: "blue" },
  { name: "Flame Truck", price: "2,200", type: "vehicle", color: "orange" },
  { name: "Crystal Kart", price: "1,900", type: "vehicle", color: "violet" },
];

function PreGameFlow({ screen, setScreen, onStart }) {
  const stepIndex = Math.max(
    0,
    pregameSteps.findIndex((step) => step.id === screen),
  );
  const goWorld = () => setScreen("world");
  return (
    <main className="pregame-shell">
      <div className="fantasy-bg">
        <span />
        <span />
        <span />
      </div>
      {screen !== "welcome" && (
        <StepRibbon active={screen} onStep={setScreen} />
      )}
      {screen === "welcome" && <StartAdventureScreen onNext={goWorld} />}
      {screen === "world" && (
        <WorldGate setScreen={setScreen} onStart={onStart} />
      )}
      {screen === "customize" && (
        <CustomizationGate onBack={goWorld} onNext={() => setScreen("lobby")} />
      )}
      {screen === "lobby" && (
        <LobbyGate onBack={goWorld} onStart={onStart} setScreen={setScreen} />
      )}
      {screen === "shop" && <ShopGate onBack={goWorld} onStart={onStart} />}
      {screen !== "welcome" && (
        <div className="step-count">
          STEP {stepIndex + 1} / {pregameSteps.length}
        </div>
      )}
    </main>
  );
}

function StepRibbon({ active, onStep }) {
  return (
    <nav className="step-ribbon" aria-label="Pre game screens">
      {pregameSteps.map((step, index) => (
        <button
          className={step.id === active ? "active" : ""}
          type="button"
          onClick={() => onStep(step.id)}
          key={step.id}
        >
          <b>{index + 1}</b>
          {step.label}
        </button>
      ))}
    </nav>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <header className="ui-topbar">
      {onBack ? (
        <button className="ui-back" type="button" onClick={onBack} title="Back">
          <ArrowLeft size={30} />
        </button>
      ) : (
        <span />
      )}
      <div className="vine-title">
        <span>{title}</span>
      </div>
      {right || <Wallet />}
    </header>
  );
}

function Wallet() {
  return (
    <div className="wallet">
      <span className="coin-dot" />
      <strong>12,450</strong>
      <span className="gem-dot" />
      <strong>860</strong>
      <button type="button" title="Add">
        <Plus size={24} />
      </button>
    </div>
  );
}

function StartAdventureScreen({ onNext }) {
  return (
    <section className="start-adventure-screen">
      <div className="scene-sky" />
      <div className="scene-canopy left" />
      <div className="scene-canopy right" />
      <div className="scene-castle" />
      <div className="scene-waterfall" />
      <div className="scene-path" />
      <div className="scene-flowers" />

      <div className="start-sign">
        <div className="start-badge">
          <Trophy size={34} />
        </div>
        <div className="sign-leaves left" />
        <div className="sign-leaves right" />
        <div className="start-small">WELCOME</div>
        <div className="start-to">TO</div>
        <h1>
          <span>REVALDO'S</span>
          <span>WORLD</span>
        </h1>
      </div>

      <div className="start-plaque">
        Embark on an epic journey, challenge your skills, and become a legend!
      </div>

      <button className="start-go-button" type="button" onClick={onNext}>
        LET'S GO!
      </button>
    </section>
  );
}

function WorldGate({ setScreen, onStart }) {
  return (
    <section className="ui-screen world-screen">
      <TopBar title="REVALDO'S WORLD" />
      <div className="world-grid">
        <ProfileCard />
        <div className="world-actions">
          <MenuAction
            icon={<Play size={38} />}
            title="PLAY"
            subtitle="Start the chase now"
            onClick={onStart}
          />
          <MenuAction
            icon={<Users size={38} />}
            title="MULTIPLAYER"
            subtitle="Create a lobby with friends"
            onClick={() => setScreen("lobby")}
          />
          <MenuAction
            icon={<Shield size={38} />}
            title="CUSTOMIZATION"
            subtitle="Tune your hero and style"
            onClick={() => setScreen("customize")}
          />
          <MenuAction
            icon={<ShoppingBag size={38} />}
            title="SHOP"
            subtitle="Buy exclusive items"
            onClick={() => setScreen("shop")}
          />
        </div>
        <div className="daily-panel">
          <h2>Daily Chase</h2>
          <div className="daily-track">
            <span style={{ "--w": "72%" }} />
          </div>
          <p>Survive 7 minutes to unlock airstrike rewards.</p>
          <div className="reward-row">
            <span>
              <Crown size={20} /> 450 XP
            </span>
            <span>
              <Gem size={20} /> 20
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuAction({ icon, title, subtitle, onClick }) {
  return (
    <button className="menu-action" type="button" onClick={onClick}>
      <span className="menu-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </button>
  );
}

function ProfileCard() {
  return (
    <aside className="profile-card">
      <img src={charRevaldoUrl} alt="Revaldo character" />
      <div>
        <h2>Revaldo</h2>
        <strong>Level 25</strong>
        <div className="xp-track">
          <span />
        </div>
        <p>ID: REV#2500</p>
      </div>
    </aside>
  );
}

function CustomizationGate({ onBack, onNext }) {
  return (
    <section className="ui-screen customize-screen">
      <TopBar title="CUSTOMIZATION" onBack={onBack} />
      <div className="custom-layout">
        <aside className="custom-tabs">
          <button className="active" type="button">
            <Users size={22} /> Character
          </button>
          <button type="button">
            <Shield size={22} /> Outfit
          </button>
          <button type="button">
            <Crown size={22} /> Accessories
          </button>
          <button type="button">
            <Car size={22} /> Vehicle
          </button>
        </aside>
        <div className="character-stage">
          <img src={charRevaldoUrl} alt="Selected Revaldo character" />
        </div>
        <aside className="custom-panel">
          <div className="gender-toggle">
            <button className="active" type="button">
              MALE
            </button>
            <button type="button">FEMALE</button>
          </div>
          <div className="outfit-grid">
            {["blue", "red", "shadow", "green"].map((color) => (
              <button
                className={`outfit-card ${color}`}
                type="button"
                key={color}
              >
                <Shield size={34} />
              </button>
            ))}
          </div>
          <div className="color-swatches">
            {["#1478d8", "#d53024", "#65a635", "#f2b52a", "#6c35b8"].map(
              (color) => (
                <button
                  type="button"
                  style={{ backgroundColor: color }}
                  key={color}
                />
              ),
            )}
          </div>
          <button className="save-button" type="button" onClick={onNext}>
            SAVE & JOIN LOBBY
          </button>
        </aside>
      </div>
    </section>
  );
}

function LobbyGate({ onBack, onStart, setScreen }) {
  return (
    <section className="ui-screen lobby-screen">
      <TopBar title="MULTIPLAYER LOBBY" onBack={onBack} />
      <div className="room-chip">
        <span>Room ID: 4587</span>
        <Copy size={17} />
      </div>

      <div className="lobby-layout">
        <div className="player-grid">
          {lobbyPlayers.map((player) => (
            <article className={`hero-slot ${player.accent}`} key={player.name}>
              <div
                className={`ready-tag ${player.status === "NOT READY" ? "danger" : ""}`}
              >
                {player.role}
              </div>
              <img src={player.art} alt={`${player.name} character`} />
              <div className="hero-info">
                <strong>{player.name}</strong>
                <span>Level {player.level}</span>
                <button
                  className={player.status === "NOT READY" ? "not-ready" : ""}
                  type="button"
                >
                  {player.status}
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="friend-panel">
          <div className="friend-tabs">
            <button className="active" type="button">
              FRIENDS
            </button>
            <button type="button">RECENT</button>
          </div>
          {friendList.map((friend) => (
            <div
              className={`friend-row ${friend.status === "Offline" ? "offline" : ""}`}
              key={friend.name}
            >
              <img src={friend.art} alt="" />
              <div>
                <strong>{friend.name}</strong>
                <span>{friend.status}</span>
              </div>
              <button type="button" title="Invite">
                <Plus size={22} />
              </button>
            </div>
          ))}
          <button className="invite-button" type="button">
            <UserPlus size={22} /> INVITE FRIENDS
          </button>
        </aside>
      </div>

      <footer className="lobby-footer">
        <div className="chat-panel">
          <div className="chat-tabs">
            <button className="active" type="button">
              WORLD
            </button>
            <button type="button">TEAM</button>
          </div>
          <p>
            <b>Revaldo:</b> Let's go!
          </p>
          <p>
            <b>Alice:</b> Ready when you are.
          </p>
          <p>
            <b>Zane:</b> Let's win this!
          </p>
          <div className="chat-input">
            <MessageCircle size={18} />
            <span>Tap to chat...</span>
          </div>
        </div>
        <div className="mode-card">
          <div className="mode-title">GAME MODE</div>
          <Swords size={58} />
          <strong>TEAM RACE</strong>
          <span>First team to 3 wins</span>
        </div>
        <div className="mode-card track-card">
          <div className="mode-title">TRACK</div>
          <div className="track-preview" />
          <strong>DRAGON FALLS</strong>
        </div>
        <div className="start-panel">
          <button
            className="leave-button"
            type="button"
            onClick={() => setScreen("shop")}
          >
            SHOP
          </button>
          <button className="start-button" type="button" onClick={onStart}>
            <Play size={42} /> START
          </button>
        </div>
      </footer>
    </section>
  );
}

function ShopGate({ onBack, onStart }) {
  return (
    <section className="ui-screen shop-screen">
      <TopBar title="SHOP" onBack={onBack} />
      <div className="shop-layout">
        <aside className="shop-tabs">
          {["FEATURED", "OUTFITS", "VEHICLES", "EMOTES", "CURRENCY"].map(
            (tab, index) => (
              <button
                className={index === 0 ? "active" : ""}
                type="button"
                key={tab}
              >
                {index < 2 ? (
                  <Shield size={21} />
                ) : index === 2 ? (
                  <Car size={21} />
                ) : (
                  <ShoppingBag size={21} />
                )}
                {tab}
              </button>
            ),
          )}
        </aside>
        <div className="shop-grid">
          {shopItems.map((item) => (
            <article className={`shop-item ${item.color}`} key={item.name}>
              <div className="item-preview">
                {item.type === "vehicle" ? (
                  <Car size={58} />
                ) : (
                  <Shield size={58} />
                )}
              </div>
              <strong>{item.name}</strong>
              <span>
                <span className="coin-dot" /> {item.price}
              </span>
            </article>
          ))}
        </div>
        <div className="shop-start">
          <button className="start-button" type="button" onClick={onStart}>
            <Play size={38} /> START GAME
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(makeInitialGame());
  const keysRef = useRef({});
  const touchRef = useRef({});
  const joystickRef = useRef(null);
  const frameRef = useRef(0);
  const [pregameScreen, setPregameScreen] = useState("welcome");
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 });
  const [hud, setHud] = useState({
    score: 0,
    kills: 0,
    coins: 0,
    lives: 5,
    nitro: 100,
    police: 0,
    gameOver: false,
    paused: false,
    phase: getPhaseInfo(0),
    map: null,
  });

  const touchHandlers = useMemo(
    () => ({
      down(name) {
        touchRef.current[name] = true;
      },
      up(name) {
        touchRef.current[name] = false;
      },
    }),
    [],
  );

  useEffect(() => {
    const down = (event) => {
      keysRef.current[event.code] = true;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (event.code === "KeyR" && gameRef.current.gameOver) restart();
      if (event.code === "KeyP") {
        gameRef.current.paused = !gameRef.current.paused;
        setHud((current) => ({ ...current, paused: gameRef.current.paused }));
      }
    };
    const up = (event) => {
      keysRef.current[event.code] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (pregameScreen !== "game") return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let last = performance.now();
    let lastMobileFrame = 0;

    const resize = () => {
      const dpr = getCanvasPixelRatio(window.innerWidth, window.innerHeight);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const tick = (now) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobilePerformance = isMobilePerformanceView(width, height);
      if (mobilePerformance && now - lastMobileFrame < 25) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastMobileFrame = now;

      const game = gameRef.current;
      const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
      last = now;
      game.mobilePerformance = mobilePerformance;

      updateGame(game, keysRef.current, touchRef.current, dt);

      const shake = game.shake > 0 ? game.shake : 0;
      const sx = shake ? (Math.random() - 0.5) * shake : 0;
      const sy = shake ? (Math.random() - 0.5) * shake : 0;
      const view = {
        camera: {
          x: game.camera.x + sx,
          y: game.camera.y + sy,
          zoom: getRenderZoom(width, height),
        },
        width,
        height,
        renderRadius: getRenderRadius(width, height),
      };

      drawWorld(ctx, view, game);
      drawDynamicObjects(ctx, view, game);
      drawPost(ctx, view, game);

      if (now - game.lastHud > 80) {
        game.lastHud = now;
        setHud({
          score: Math.floor(game.score / 10) * 10,
          kills: game.kills,
          coins: game.coins,
          lives: game.player.lives,
          nitro: Math.round(game.player.nitro),
          police: game.police.length,
          gameOver: game.gameOver,
          paused: game.paused,
          phase: getPhaseInfo(game.elapsed),
          map: {
            player: {
              x: game.player.x,
              y: game.player.y,
              angle: game.player.angle,
            },
            police: game.police.map((car) => ({ x: car.x, y: car.y })),
            ambulance: game.ambulance
              ? { x: game.ambulance.x, y: game.ambulance.y }
              : null,
            roadBlock: game.roadBlock
              ? {
                  x: game.roadBlock.x,
                  y: game.roadBlock.y,
                  angle: game.roadBlock.angle,
                  length: game.roadBlock.length,
                }
              : null,
          },
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [pregameScreen]);

  function restart() {
    gameRef.current = makeInitialGame();
    keysRef.current = {};
    touchRef.current = {};
    setJoystick({ active: false, x: 0, y: 0 });
    setHud({
      score: 0,
      kills: 0,
      coins: 0,
      lives: 5,
      nitro: 100,
      police: 0,
      gameOver: false,
      paused: false,
      phase: getPhaseInfo(0),
      map: null,
    });
  }

  function startGame() {
    restart();
    setPregameScreen("game");
  }

  function togglePause() {
    gameRef.current.paused = !gameRef.current.paused;
    setHud((current) => ({ ...current, paused: gameRef.current.paused }));
  }

  function updateJoystick(event) {
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const max = rect.width * 0.34;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const length = Math.hypot(rawX, rawY);
    const scale = length > max ? max / length : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    touchRef.current.joyX = clamp(x / max, -1, 1);
    touchRef.current.joyY = clamp(y / max, -1, 1);
    setJoystick({ active: true, x, y });
  }

  function releaseJoystick() {
    touchRef.current.joyX = 0;
    touchRef.current.joyY = 0;
    setJoystick({ active: false, x: 0, y: 0 });
  }

  const bindJoystick = {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateJoystick(event);
    },
    onPointerMove: (event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        updateJoystick(event);
    },
    onPointerUp: releaseJoystick,
    onPointerCancel: releaseJoystick,
    onLostPointerCapture: releaseJoystick,
  };

  const bindAction = (name) => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      touchHandlers.down(name);
    },
    onPointerUp: () => touchHandlers.up(name),
    onPointerCancel: () => touchHandlers.up(name),
    onPointerLeave: () => touchHandlers.up(name),
  });
  const bindTouch = bindAction;

  const bindBrake = {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      touchHandlers.down("down");
      touchHandlers.down("drift");
    },
    onPointerUp: () => {
      touchHandlers.up("down");
      touchHandlers.up("drift");
    },
    onPointerCancel: () => {
      touchHandlers.up("down");
      touchHandlers.up("drift");
    },
    onPointerLeave: () => {
      touchHandlers.up("down");
      touchHandlers.up("drift");
    },
  };

  async function requestLandscape() {
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen?.();
      await window.screen.orientation?.lock?.("landscape-primary");
    } catch {
      // Some browsers only allow orientation changes from installed PWAs.
    }
  }

  if (pregameScreen !== "game") {
    return (
      <PreGameFlow
        screen={pregameScreen}
        setScreen={setPregameScreen}
        onStart={startGame}
      />
    );
  }

  const mapSize = 142;
  const mapCenter = mapSize / 2;
  const mapRange = 1750;
  const mapScale = mapSize / (mapRange * 2);
  const map = hud.map;
  const toMini = (point) => ({
    x: mapCenter + (point.x - map.player.x) * mapScale,
    y: mapCenter + (point.y - map.player.y) * mapScale,
  });
  const miniRoads = [];
  if (map) {
    const baseX = Math.round(map.player.x / BLOCK) * BLOCK;
    const baseY = Math.round(map.player.y / BLOCK) * BLOCK;
    for (let i = -3; i <= 3; i += 1) {
      const vx = baseX + i * BLOCK;
      const hx = toMini({ x: vx, y: map.player.y });
      miniRoads.push({ key: `v${i}`, x1: hx.x, y1: 0, x2: hx.x, y2: mapSize });
      const hy = baseY + i * BLOCK;
      const vy = toMini({ x: map.player.x, y: hy });
      miniRoads.push({ key: `h${i}`, x1: 0, y1: vy.y, x2: mapSize, y2: vy.y });
    }
  }

  return (
    <main className="game-shell" aria-label="PAKO style car chase game">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="hud">
        <div className="hud-top">
          <div className="hud-stat">KILLS: {hud.kills}</div>
          <div className="phase-stack">
            <div className="lives" aria-label={`${hud.lives} lives`}>
              {Array.from({ length: 5 }).map((_, index) => (
                <span
                  key={index}
                  className="life"
                  style={{ opacity: index < hud.lives ? 1 : 0.22 }}
                />
              ))}
            </div>
            <div
              className="phase-card"
              style={{ "--phase-progress": `${hud.phase.progress * 100}%` }}
            >
              <div className="phase-line">
                <span>{hud.phase.level}</span>
                <span>MIN {hud.phase.minute}</span>
              </div>
              <div className="phase-title">{hud.phase.title}</div>
              <div className="phase-next">NEXT: {hud.phase.next}</div>
              <div className="phase-track">
                <span />
              </div>
            </div>
          </div>
          <div className="hud-stat right">
            SCORE: {hud.score}
            <br />
            COINS: {hud.coins} | POLICE: {hud.police}
          </div>
        </div>

        {map && (
          <div className="mini-map" aria-label="Mini map">
            <svg viewBox={`0 0 ${mapSize} ${mapSize}`} role="img">
              <rect x="0" y="0" width={mapSize} height={mapSize} rx="8" />
              {miniRoads.map((road) => (
                <line
                  key={road.key}
                  className="mini-road"
                  x1={road.x1}
                  y1={road.y1}
                  x2={road.x2}
                  y2={road.y2}
                />
              ))}
              {map.roadBlock &&
                (() => {
                  const p = toMini(map.roadBlock);
                  return (
                    <line
                      className="mini-roadblock"
                      x1={p.x - 12}
                      y1={p.y}
                      x2={p.x + 12}
                      y2={p.y}
                      transform={`rotate(${(map.roadBlock.angle * 180) / Math.PI} ${p.x} ${p.y})`}
                    />
                  );
                })()}
              {map.police.map((car, index) => {
                const p = toMini(car);
                return (
                  <circle
                    key={index}
                    className="mini-police"
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                  />
                );
              })}
              {map.ambulance &&
                (() => {
                  const p = toMini(map.ambulance);
                  return (
                    <circle
                      className="mini-ambulance"
                      cx={p.x}
                      cy={p.y}
                      r="5.5"
                    />
                  );
                })()}
              <polygon
                className="mini-player"
                points="80,71 62,62 62,80"
                transform={`rotate(${(map.player.angle * 180) / Math.PI} ${mapCenter} ${mapCenter})`}
              />
            </svg>
          </div>
        )}

        <div className="hud-bottom">
          <div className="meters">
            <div className="meter-label">
              <Zap size={14} /> NITRO
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ "--value": `${hud.nitro}%` }}
              />
            </div>
          </div>

          <div className="controls">
            <button
              className="icon-button"
              type="button"
              onClick={togglePause}
              title={hud.paused ? "Resume" : "Pause"}
            >
              {hud.paused ? <Play size={24} /> : <Pause size={24} />}
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={restart}
              title="Restart"
            >
              <RotateCcw size={24} />
            </button>
          </div>
        </div>
      </div>

      <div className="mobile-controls" aria-label="Touch driving controls">
        <div className="drive-stick" ref={joystickRef} {...bindJoystick}>
          <span className="stick-arrow up" />
          <span className="stick-arrow right" />
          <span className="stick-arrow down" />
          <span className="stick-arrow left" />
          <span
            className="stick-knob"
            style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }}
          >
            <span />
          </span>
        </div>

        <div className="action-cluster">
          <button
            className="action-button orient"
            type="button"
            title="Landscape"
            onClick={requestLandscape}
          >
            <Maximize2 size={20} />
          </button>
          <button
            className="action-button boost"
            type="button"
            title="Boost"
            {...bindAction("nitro")}
          >
            <Flame size={30} />
          </button>
          <button
            className="action-button brake"
            type="button"
            title="Brake"
            {...bindBrake}
          >
            <ChevronsDown size={32} />
          </button>
        </div>
      </div>

      <div className="touch-pad left">
        <button
          className="touch-button"
          type="button"
          title="Left"
          {...bindTouch("left")}
        >
          ◀
        </button>
        <button
          className="touch-button"
          type="button"
          title="Right"
          {...bindTouch("right")}
        >
          ▶
        </button>
        <button
          className="touch-button wide"
          type="button"
          title="Drift"
          {...bindTouch("drift")}
        >
          <Gauge size={22} />
        </button>
      </div>

      <div className="touch-pad">
        <button
          className="touch-button"
          type="button"
          title="Accelerate"
          {...bindTouch("up")}
        >
          ▲
        </button>
        <button
          className="touch-button"
          type="button"
          title="Nitro"
          {...bindTouch("nitro")}
        >
          <Zap size={22} />
        </button>
        <button
          className="touch-button"
          type="button"
          title="Brake"
          {...bindTouch("down")}
        >
          ▼
        </button>
      </div>

      {(hud.gameOver || hud.paused) && (
        <div className="overlay">
          <div className="game-over-panel">
            <div className="game-over-title">
              {hud.gameOver ? "BUSTED" : "PAUSED"}
            </div>
            <div className="game-over-score">FINAL SCORE: {hud.score}</div>
            <button
              className="restart-button"
              type="button"
              onClick={hud.gameOver ? restart : togglePause}
            >
              {hud.gameOver ? "PLAY AGAIN" : "RESUME"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
