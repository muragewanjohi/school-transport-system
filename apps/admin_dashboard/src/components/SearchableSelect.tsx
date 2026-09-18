"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { filterStopsByName } from "@/lib/studentStopAssignment";

export type SearchableSelectOption = {
  id: string;
  name: string;
};

interface SearchableSelectProps {
  id: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyLabel?: string;
  error?: boolean;
}

export default function SearchableSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  searchPlaceholder = "Search stages",
  searchAriaLabel = "Filter stages",
  emptyLabel = "No matches",
  error = false,
}: Readonly<SearchableSelectProps>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => filterStopsByName(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`form-input searchable-select-trigger${error ? " error" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (next) setQuery("");
            return next;
          });
        }}
      >
        <span>{selected?.name || placeholder}</span>
        <ChevronDown size={16} aria-hidden />
      </button>

      {open && !disabled ? (
        <div className="searchable-select-dropdown" id={listId} role="listbox" aria-label={placeholder}>
          <div className="searchable-select-search">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              className="searchable-select-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              autoComplete="off"
            />
          </div>
          <ul className="searchable-select-list">
            {filtered.length === 0 ? (
              <li className="searchable-select-empty">
                {query.trim() ? `${emptyLabel} “${query.trim()}”` : emptyLabel}
              </li>
            ) : (
              filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`searchable-select-option${option.id === value ? " is-selected" : ""}`}
                    role="option"
                    aria-selected={option.id === value}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {option.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
