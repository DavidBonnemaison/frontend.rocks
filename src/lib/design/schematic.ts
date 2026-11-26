import { SCHEMATIC } from './tokens.generated';
import type { GeometrySnapshot } from './schematic-snapshot';

export interface SchematicOptions {
  snapshot: GeometrySnapshot;
  width: number;
  highlight: string;
  figureNumber?: number;
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pure deterministic SVG generator from measured Chromium geometry. Coordinates rounded to 0.5. */
export function renderSchematic(opts: SchematicOptions): string {
  const { snapshot, width, highlight, figureNumber } = opts;
  const stroke = SCHEMATIC.stroke;
  const strokeFine = SCHEMATIC.strokeFine;
  const dash = SCHEMATIC.dash;
  const labelSize = SCHEMATIC.labelSize;
  const arrow = SCHEMATIC.arrow;

  const pad = 28;
  const captionHeight = snapshot.caption ? 24 : 0;
  const cropLen = 8;

  // Compute bounding box of all measured boxes and dimension endpoints
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of snapshot.boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  for (const dim of snapshot.dimensions) {
    minX = Math.min(minX, dim.from[0], dim.to[0]);
    minY = Math.min(minY, dim.from[1], dim.to[1]);
    maxX = Math.max(maxX, dim.from[0], dim.to[0]);
    maxY = Math.max(maxY, dim.from[1], dim.to[1]);
  }

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const innerW = Math.max(64, width - pad * 2);
  const scale = innerW / contentW;
  const scaledH = Math.max(48, contentH * scale);
  const dimTopOffset = snapshot.dimensions.length > 0 ? 18 : 0;
  const totalH = roundHalf(pad * 2 + dimTopOffset + scaledH + captionHeight);

  const tx = (x: number) => roundHalf(pad + (x - minX) * scale);
  const ty = (y: number) => roundHalf(pad + dimTopOffset + (y - minY) * scale);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${roundHalf(width)} ${totalH}" width="${roundHalf(width)}" height="${totalH}" fill="none" stroke="currentColor">`
  );

  // Crop marks (8px L-shapes at the 4 corners)
  const wR = roundHalf(width - 0.5);
  const hR = roundHalf(totalH - captionHeight - 0.5);
  parts.push(
    `<g stroke="currentColor" stroke-width="${stroke}" stroke-linecap="square">`,
    `<path d="M0.5 ${cropLen}V0.5H${cropLen}"/>`,
    `<path d="M${roundHalf(wR - cropLen)} 0.5H${wR}V${cropLen}"/>`,
    `<path d="M0.5 ${roundHalf(hR - cropLen)}V${hR}H${cropLen}"/>`,
    `<path d="M${roundHalf(wR - cropLen)} ${hR}H${wR}V${roundHalf(hR - cropLen)}"/>`,
    `</g>`
  );

  // Boxes
  parts.push(`<g stroke-width="${stroke}">`);
  for (const box of snapshot.boxes) {
    const x = tx(box.x);
    const y = ty(box.y);
    const w = Math.max(1, roundHalf(box.w * scale));
    const h = Math.max(1, roundHalf(box.h * scale));
    const dashAttr = box.dashed ? ` stroke-dasharray="${dash}"` : '';
    const fillAttr = box.highlight ? ` fill="${escapeXml(highlight)}" fill-opacity="0.18"` : ' fill="none"';
    const strokeAttr = box.highlight ? ` stroke="${escapeXml(highlight)}"` : ' stroke="currentColor"';
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${fillAttr}${strokeAttr}${dashAttr}/>`);

    const labelText = escapeXml(box.label.toUpperCase());
    const lx = roundHalf(x + 6);
    const ly = roundHalf(y + labelSize + 4);
    parts.push(
      `<text x="${lx}" y="${ly}" fill="currentColor" stroke="none" font-family="var(--font-meta, monospace)" font-size="${labelSize}" letter-spacing="0.06em">${labelText}</text>`
    );
  }
  parts.push(`</g>`);

  // Dimensions (architectural callouts with 0.5px lines and 4px filled arrows)
  if (snapshot.dimensions.length > 0) {
    parts.push(`<g stroke="currentColor" stroke-width="${strokeFine}">`);
    for (const dim of snapshot.dimensions) {
      const x1 = tx(dim.from[0]);
      const y1 = roundHalf(ty(dim.from[1]) - 10);
      const x2 = tx(dim.to[0]);
      const y2 = roundHalf(ty(dim.to[1]) - 10);
      const isHorizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);

      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
      if (isHorizontal) {
        parts.push(
          `<polygon points="${x1},${y1} ${roundHalf(x1 + arrow)},${roundHalf(y1 - arrow / 2)} ${roundHalf(x1 + arrow)},${roundHalf(y1 + arrow / 2)}" fill="currentColor" stroke="none"/>`,
          `<polygon points="${x2},${y2} ${roundHalf(x2 - arrow)},${roundHalf(y2 - arrow / 2)} ${roundHalf(x2 - arrow)},${roundHalf(y2 + arrow / 2)}" fill="currentColor" stroke="none"/>`
        );
        const mx = roundHalf((x1 + x2) / 2);
        const my = roundHalf(y1 - 4);
        parts.push(
          `<text x="${mx}" y="${my}" text-anchor="middle" fill="currentColor" stroke="none" font-family="var(--font-meta, monospace)" font-size="${labelSize}" letter-spacing="0.06em">${escapeXml(dim.label.toUpperCase())}</text>`
        );
      } else {
        parts.push(
          `<polygon points="${x1},${y1} ${roundHalf(x1 - arrow / 2)},${roundHalf(y1 + arrow)} ${roundHalf(x1 + arrow / 2)},${roundHalf(y1 + arrow)}" fill="currentColor" stroke="none"/>`,
          `<polygon points="${x2},${y2} ${roundHalf(x2 - arrow / 2)},${roundHalf(y2 - arrow)} ${roundHalf(x2 + arrow / 2)},${roundHalf(y2 - arrow)}" fill="currentColor" stroke="none"/>`
        );
        const mx = roundHalf(x1 + 6);
        const my = roundHalf((y1 + y2) / 2 + labelSize / 3);
        parts.push(
          `<text x="${mx}" y="${my}" fill="currentColor" stroke="none" font-family="var(--font-meta, monospace)" font-size="${labelSize}" letter-spacing="0.06em">${escapeXml(dim.label.toUpperCase())}</text>`
        );
      }
    }
    parts.push(`</g>`);
  }

  // Caption line
  if (snapshot.caption) {
    const prefix = typeof figureNumber === 'number' ? `FIG. ${figureNumber} · ` : '';
    const capText = escapeXml(`${prefix}${snapshot.caption}`.toUpperCase());
    parts.push(
      `<text x="${pad}" y="${roundHalf(totalH - 6)}" fill="currentColor" stroke="none" font-family="var(--font-meta, monospace)" font-size="${labelSize}" letter-spacing="0.06em">${capText}</text>`
    );
  }

  parts.push(`</svg>`);
  return parts.join('');
}
