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
}

export function Schematic({
  snapshot,
  width = 640,
  highlight = 'var(--color-accent)',
  figureNumber,
  label,
}: SchematicProps) {
  const svg = renderSchematic({ snapshot, width, highlight, figureNumber });

  return (
    <div
      className="schematic"
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
