import React from 'react';
import { renderSchematic } from '@/lib/design/schematic';
import type { GeometrySnapshot } from '@/lib/design/schematic-snapshot';
import './Schematic.css';

export interface SchematicProps {
  snapshot: GeometrySnapshot;
  width?: number;
  highlight?: string;
  figureNumber?: number;
  label: string;
  bare?: boolean;
}

export function Schematic({
  snapshot,
  width = 640,
  highlight = 'var(--color-accent)',
  figureNumber,
  label,
  bare = false,
}: SchematicProps) {
  const svg = renderSchematic({ snapshot, width, highlight, figureNumber, bare });

  return (
    <div
      className="schematic"
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
