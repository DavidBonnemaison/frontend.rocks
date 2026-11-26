import React from 'react';
import './Button.css';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'link';
  size?: 'sm' | 'md';
  href?: string;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  href,
  iconStart,
  iconEnd,
  disabled = false,
  type = 'button',
  onClick,
  className,
  'aria-label': ariaLabel,
  children,
}: ButtonProps) {
  const cls = className ? `ui-button ${className}` : 'ui-button';

  if (href) {
    return (
      <a
        href={disabled ? undefined : href}
        className={cls}
        data-variant={variant}
        data-size={size}
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {iconStart}
        <span>{children}</span>
        {iconEnd}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {iconStart}
      <span>{children}</span>
      {iconEnd}
    </button>
  );
}
