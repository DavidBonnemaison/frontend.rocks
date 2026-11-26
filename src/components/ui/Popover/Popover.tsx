import React from 'react';
import './Popover.css';

export interface PopoverProps {
  id: string;
  anchorName: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  placement?: 'top' | 'bottom';
}

export function Popover({
  id,
  anchorName,
  trigger,
  children,
  placement = 'bottom',
}: PopoverProps) {
  const triggerStyle = { anchorName } as React.CSSProperties & Record<string, string>;
  const panelStyle = { positionAnchor: anchorName } as React.CSSProperties & Record<string, string>;

  return (
    <>
      <button
        type="button"
        className="ui-popover-trigger caps"
        popoverTarget={id}
        style={triggerStyle}
      >
        {trigger}
      </button>
      <div id={id} popover="auto" className="ui-popover" data-placement={placement} style={panelStyle}>
        {children}
      </div>
    </>
  );
}
