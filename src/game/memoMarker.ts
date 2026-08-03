import type { MemoType } from '../types/memo';

// A memo marker is static art — only its bounce offset and glow alpha change per frame.
// Bake it once per (type, zoom) and blit the result, the same way getDyedSprite caches
// character sheets. Drawing it live cost a ctx.filter blur every frame, which forces the
// main canvas onto a slow path and shows up as stutter while walking.

const markerCache: Record<string, HTMLCanvasElement> = {};

// World units: 16 = one tile
const CARD_W = 11;
const CARD_H = 13;
const FOLD = 4;
const BADGE_R = 2.2;
const GLOW_R = 9;

// Padding in device px so the 1px stroke and the badge are not clipped by the bake
const PAD = 2;

export const memoCardSize = (tileScale: number) => ({
  width: CARD_W * tileScale,
  height: CARD_H * tileScale
});

/** Offset from the card's top-left corner to where the baked canvas must be drawn. */
export const memoCardOrigin = (tileScale: number) => ({
  x: -PAD,
  y: -PAD - BADGE_R * tileScale
});

export const memoGlowRadius = (tileScale: number) => GLOW_R * tileScale;

/** Card art: paper, folded corner, abstract lines, and the type badge. No text, ever. */
export function getMemoCard(memoType: MemoType, tileScale: number): HTMLCanvasElement {
  const key = `card_${memoType}_${tileScale}`;
  const cached = markerCache[key];
  if (cached) return cached;

  const u = (n: number) => n * tileScale;
  const isNotice = memoType === 'notice';

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(u(CARD_W) + PAD * 2);
  canvas.height = Math.ceil(u(BADGE_R) + u(CARD_H) + PAD * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const accent = isNotice ? '#f5c2e7' : '#a78bfa';
  const accentDark = isNotice ? '#b4568f' : '#6d4bc4';
  const paperTop = isNotice ? '#fff1f7' : '#f4f1ff';
  const paperBottom = isNotice ? '#f2d7e7' : '#ded6ff';

  const x = PAD;
  const y = PAD + u(BADGE_R);
  const w = u(CARD_W);
  const h = u(CARD_H);
  const fold = u(FOLD);

  const card = new Path2D();
  card.moveTo(x, y);
  card.lineTo(x + w, y);
  card.lineTo(x + w, y + h - fold);
  card.lineTo(x + w - fold, y + h);
  card.lineTo(x, y + h);
  card.closePath();

  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, paperTop);
  grad.addColorStop(1, paperBottom);
  ctx.fillStyle = grad;
  ctx.fill(card);

  ctx.lineWidth = Math.max(1, u(0.9));
  ctx.strokeStyle = accentDark;
  ctx.stroke(card);

  // Fold flap
  ctx.beginPath();
  ctx.moveTo(x + w - fold, y + h);
  ctx.lineTo(x + w - fold, y + h - fold);
  ctx.lineTo(x + w, y + h - fold);
  ctx.closePath();
  ctx.fillStyle = accentDark;
  ctx.globalAlpha = 0.35;
  ctx.fill();

  // Abstract "written lines" — shape only, never the real text
  ctx.globalAlpha = 0.55;
  const lineH = Math.max(1, u(1));
  [u(3), u(5.5), u(8)].forEach((offset, i) => {
    ctx.fillRect(x + u(2), y + offset, w - u(4) - (i === 2 ? u(2.5) : 0), lineH);
  });
  ctx.globalAlpha = 1;

  // Type badge: a pin head for notices, a ribbon tie for one-time notes
  if (isNotice) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y, u(BADGE_R), 0, Math.PI * 2);
    ctx.fillStyle = '#e64980';
    ctx.fill();
    ctx.lineWidth = Math.max(1, u(0.7));
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + u(1.5), w, u(1.6));
  }

  markerCache[key] = canvas;
  return canvas;
}

/** Soft attention glow, blitted under the card with a pulsing alpha. */
export function getMemoGlow(memoType: MemoType, tileScale: number): HTMLCanvasElement {
  const key = `glow_${memoType}_${tileScale}`;
  const cached = markerCache[key];
  if (cached) return cached;

  const r = GLOW_R * tileScale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(r * 2);
  canvas.height = Math.ceil(r * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const rgb = memoType === 'notice' ? '245, 194, 231' : '167, 139, 250';
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb}, 0.85)`);
  grad.addColorStop(0.55, `rgba(${rgb}, 0.4)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  markerCache[key] = canvas;
  return canvas;
}
