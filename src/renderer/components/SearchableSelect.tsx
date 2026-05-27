import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string | number;
  label: string;
}

interface Props {
  options: Option[];
  value: string | number | '';
  onChange: (value: string | number) => void;
  placeholder?: string;
  className?: string;
  dropdownWidth?: number;
}

export default function SearchableSelect({ options, value, onChange, placeholder = 'Search...', className = '', dropdownWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const safeValue = value ?? '';
  const selectedOption = options.find(o => String(o.value) === String(safeValue));
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setSearch('');
      setHighlighted(-1);
    }
  }, [open]);

  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      items[highlighted]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      onChange(filtered[highlighted].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleSelect(opt: Option) {
    onChange(opt.value);
    setOpen(false);
  }

  return (
    <div className={`searchable-select ${className}`} ref={containerRef}>
      <div
        className="searchable-select-trigger"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: dropdownWidth || Math.max(rect.width, 280),
                zIndex: 10000,
              });
            }
            setOpen(true);
          }
        }}
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
      >
        <span className="searchable-select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="searchable-select-arrow">{open ? '▲' : '▼'}</span>
      </div>
      {open && createPortal(
        <div className="searchable-select-dropdown" style={dropdownStyle} ref={dropdownRef}>
          <input
            ref={inputRef}
            className="searchable-select-search"
            type="text"
            placeholder="Type to search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <ul className="searchable-select-list" ref={listRef}>
            {filtered.length === 0 ? (
              <li className="searchable-select-empty">No results</li>
            ) : (
              filtered.map((opt, i) => (
                <li
                  key={opt.value}
                  className={`searchable-select-option ${String(opt.value) === String(safeValue) ? 'selected' : ''} ${i === highlighted ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
