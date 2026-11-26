'use client';

import React, { useState } from 'react';
import './Sidenote.css';

export interface SidenoteProps {
  id: string;
  label?: string;
  children: React.ReactNode;
}

export function Sidenote({ id, label = '§', children }: SidenoteProps) {
  const [open, setOpen] = useState(false);
  const noteId = `sn-${id}`;

  return (
    <>
      <span className="sidenote-ref">
        <button
          type="button"
          className="sidenote-toggle"
          aria-expanded={open}
          aria-controls={noteId}
          onClick={() => setOpen((prev) => !prev)}
        >
          {label}
        </button>
      </span>
      <span className="sidenote" id={noteId} role="note" data-open={open ? 'true' : 'false'}>
        {children}
      </span>
    </>
  );
}
