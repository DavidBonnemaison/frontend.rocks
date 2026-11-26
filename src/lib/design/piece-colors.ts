import { z } from 'zod';
import { PIECE_KEYS } from './tokens.generated';

export const PIECE_COLORS = PIECE_KEYS;
export const PieceColorSchema = z.enum(PIECE_KEYS);
export type PieceColor = z.infer<typeof PieceColorSchema>;

/** Attributes to place on the root element of a piece. */
export function pieceAttrs(color: PieceColor): { 'data-piece': PieceColor } {
  return { 'data-piece': color };
}

/** First color from PIECE_COLORS absent from the last 4 published pieces (across all categories). */
export function nextPieceColor(lastPublished: PieceColor[]): PieceColor {
  const recent = new Set(lastPublished.slice(-4));
  return PIECE_COLORS.find((c) => !recent.has(c)) ?? PIECE_COLORS[0];
}
