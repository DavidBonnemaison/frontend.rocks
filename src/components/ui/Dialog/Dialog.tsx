'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onClose(): void;
  labelledBy: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, labelledBy, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        className="ui-dialog-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {children}
    </dialog>
  );
}
