import React from 'react';
import './Kbd.css';

export interface KbdProps {
  children: React.ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return <kbd className="ui-kbd meta">{children}</kbd>;
}
