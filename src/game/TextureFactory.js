import * as THREE from 'three';

/**
 * Generates crisp, high-resolution procedural PBR Canvas textures for:
 * - Stadium pitch turf with custom mowing patterns, blade noise & crisp FIFA-style pitch markings
 * - Classic championship match soccer ball panels
 * - Dynamic per-player jersey kits with real club patterns, back name, and shirt number
 * - Animated stadium perimeter LED boards
 */

const jerseyCache = new Map();

export function createPitchTexture(stadium) {
  const w = 2048;
  const h = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Base emerald fill
  ctx.fillStyle = stadium.grassA;
  ctx.fillRect(0, 0, w, h);

  // Turf mowing pattern
  if (stadium.turfPattern === 'checkered') {
    const cols = 16;
    const rows = 10;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? stadium.grassA : stadium.grassB;
        ctx.fillRect(c * cw, r * ch, cw + 1, ch + 1);
      }
    }
  } else if (stadium.turfPattern === 'circles') {
    const stripes = 18;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? stadium.grassA : stadium.grassB;
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let r = 120; r < w * 0.7; r += 110) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.lineWidth = 48;
      ctx.strokeStyle = stadium.grassB;
      ctx.stroke();
    }
    ctx.restore();
  } else {
    const stripes = 16;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? stadium.grassA : stadium.grassB;
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }
  }

  // Subtle organic turf grain for rich close-up visual depth
  ctx.save();
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, y, 2, 3);
  }
  ctx.restore();

  // Crisp chalk pitch markings
  const padX = 76;
  const padY = 64;
  const pw = w - padX * 2;
  const ph = h - padY * 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 7;

  // Outer touchlines & goal lines
  ctx.strokeRect(padX, padY, pw, ph);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(w / 2, padY);
  ctx.lineTo(w / 2, padY + ph);
  ctx.stroke();

  // Center circle & spot
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 165, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 11, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right penalty areas + 6-yard boxes + penalty spots + arcs
  const penW = 310;
  const penH = 660;
  const sixW = 115;
  const sixH = 340;

  // Left side
  ctx.strokeRect(padX, h / 2 - penH / 2, penW, penH);
  ctx.strokeRect(padX, h / 2 - sixH / 2, sixW, sixH);
  ctx.beginPath();
  ctx.arc(padX + 218, h / 2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + 218, h / 2, 132, -0.78, 0.78);
  ctx.stroke();

  // Right side
  ctx.strokeRect(padX + pw - penW, h / 2 - penH / 2, penW, penH);
  ctx.strokeRect(padX + pw - sixW, h / 2 - sixH / 2, sixW, sixH);
  ctx.beginPath();
  ctx.arc(padX + pw - 218, h / 2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + pw - 218, h / 2, 132, Math.PI - 0.78, Math.PI + 0.78);
  ctx.stroke();

  // Corner arcs
  const cornerR = 34;
  ctx.beginPath(); ctx.arc(padX, padY, cornerR, 0, Math.PI * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(padX + pw, padY, cornerR, Math.PI * 0.5, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(padX + pw, padY + ph, cornerR, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(padX, padY + ph, cornerR, Math.PI * 1.5, Math.PI * 2); ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createSoccerBallTexture() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Crisp pearl-white championship leather base
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, w, h);

  // Subtle hex grid seams
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 3;
  for (let y = 0; y <= h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw crisp star/pentagon Champions-style panels across UV bands
  const drawStar = (cx, cy, outerR, innerR, color) => {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#F59E0B';
    ctx.stroke();
    ctx.restore();
  };

  // Equator & mid-latitude panels
  const cols = 6;
  for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * (w / cols);
    drawStar(x, h * 0.5, 58, 28, '#0F172A');
    drawStar(x + w / (cols * 2), h * 0.22, 46, 22, '#1E293B');
    drawStar(x + w / (cols * 2), h * 0.78, 46, 22, '#1E293B');
  }
  // Polar caps
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, w, 34);
  ctx.fillRect(0, h - 34, w, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Creates a wrapped cylinder torso jersey texture with real kit patterns,
 * front chest badge, and player's real name + number on the back.
 */
export function createJerseyTexture(club, playerData, isGK = false) {
  const key = `${club.id}_${playerData.id}_${isGK ? 'gk' : 'out'}`;
  if (jerseyCache.has(key)) return jerseyCache.get(key);

  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const primary = isGK ? '#FACC15' : club.primary;
  const secondary = isGK ? '#111827' : club.secondary;
  const accent = isGK ? '#22C55E' : club.accent;

  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, w, h);

  // Kit pattern
  if (!isGK && club.pattern === 'stripes') {
    const stripeCount = 8;
    const sw = w / stripeCount;
    ctx.fillStyle = secondary;
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillRect(i * sw, 0, sw, h);
    }
  } else if (!isGK && club.pattern === 'center-stripe') {
    // Front (x=128) & Back (x=384) center vertical stripe
    ctx.fillStyle = accent;
    ctx.fillRect(102, 0, 52, h);
    ctx.fillStyle = secondary;
    ctx.fillRect(110, 0, 36, h);
  } else if (!isGK && club.pattern === 'solid-trim') {
    ctx.fillStyle = secondary;
    ctx.fillRect(0, 0, w, 28);
    ctx.fillRect(0, h - 22, w, 22);
  }

  // Collar band
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 22);

  // Determine high-contrast text color for jersey back name & number
  const isLightPrimary = isColorLight(primary) && club.pattern !== 'stripes';
  const textColor = isLightPrimary ? '#0F172A' : '#FFFFFF';
  const strokeColor = isLightPrimary ? '#FFFFFF' : '#0F172A';

  // Front chest (centered around u = 0.25 -> x = 128)
  ctx.save();
  // Mini club shield badge on left chest
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(166, 130, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Front club short name sponsor-style stripe
  ctx.font = '900 34px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 4;
  ctx.strokeText(club.shortName, 128, 250);
  ctx.fillText(club.shortName, 128, 250);
  ctx.restore();

  // Back of jersey (centered around u = 0.75 -> x = 384)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  ctx.strokeStyle = strokeColor;

  // Player last name on upper back
  const displayName = (playerData.name || '').toUpperCase().slice(0, 12);
  ctx.font = '800 30px "Barlow Condensed", sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeText(displayName, 384, 128);
  ctx.fillText(displayName, 384, 128);

  // Big bold shirt number
  ctx.font = '900 132px "Barlow Condensed", sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeText(String(playerData.number || 10), 384, 295);
  ctx.fillText(String(playerData.number || 10), 384, 295);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  jerseyCache.set(key, texture);
  return texture;
}

export function createLedBoardTexture(homeClub, awayClub, stadium, isGoalMode = false) {
  const w = 1024;
  const h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (isGoalMode) {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#F59E0B');
    grad.addColorStop(0.5, '#FDE047');
    grad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#0B1218';
    ctx.font = '900 58px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★  GOAL!!   ★   GOAL!!   ★   GOAL!!  ★', w / 2, h / 2 + 2);
  } else {
    ctx.fillStyle = '#0B1218';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = stadium.ledColor || '#22C55E';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);

    ctx.font = '800 42px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    const text = `${homeClub.name.toUpperCase()}   •   ${stadium.name.toUpperCase()}   •   ${awayClub.name.toUpperCase()}   •   PITCH LEGENDS`;
    ctx.fillText(text, w / 2, h / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(3, 1);
  return texture;
}

export function createNameplateSprite(label, accentColor = '#FFFFFF') {
  const w = 320;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Rounded dark translucent broadcast pill (universally supported across all mobile browsers)
  const x = 12, y = 10, rw = w - 24, rh = h - 20, r = 22;
  ctx.fillStyle = 'rgba(11, 18, 24, 0.84)';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + rw - r, y);
  ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
  ctx.lineTo(x + rw, y + rh - r);
  ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
  ctx.lineTo(x + r, y + rh);
  ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = '700 30px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label.slice(0, 16), w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.72, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function isColorLight(hex) {
  const clean = String(hex || '#FFFFFF').replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}
