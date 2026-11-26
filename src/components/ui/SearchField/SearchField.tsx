'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import './SearchField.css';

export interface SearchFieldProps {
  id: string;
  label: string;
  placeholder: string;
  size?: 'md' | 'lg';
  prompt?: boolean;
  onSubmit?(q: string): void;
  name?: string;
}

export function SearchField({
  id,
  label,
  placeholder,
  size = 'md',
  prompt = false,
  onSubmit,
  name = 'q',
}: SearchFieldProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return;
    e.preventDefault();
    onSubmit(value.trim());
  };

  return (
    <form role="search" onSubmit={handleSubmit}>
      <label htmlFor={id}>
        <VisuallyHidden>{label}</VisuallyHidden>
      </label>
      <div className="search-field" data-size={size}>
        {prompt ? (
          <span className="search-field-prompt" aria-hidden="true">
            &gt;
          </span>
        ) : (
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        )}
        <input
          id={id}
          name={name}
          type="search"
          className="search-field-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </form>
  );
}
