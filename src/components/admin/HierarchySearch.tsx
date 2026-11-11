import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface HierarchySearchOption {
  id: string;
  name: string;
  email?: string;
  npn?: string | null;
  agentNumber?: string | null;
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function HierarchySearch({
  options,
  assistView,
  disabled,
  onLocate,
  onClear,
}: {
  options: HierarchySearchOption[];
  assistView: boolean;
  disabled: boolean;
  onLocate: (option: HierarchySearchOption) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return options.filter((option) => {
      const fields = assistView
        ? [option.name, option.npn]
        : [option.name, option.email, option.npn, option.agentNumber];
      const text = normalize(fields.filter(Boolean).join(" "));
      return terms.every((term) => text.includes(term));
    });
  }, [assistView, options, query]);
  const results = matches.slice(0, 8);
  const showResults = open && query.trim().length > 0 && !disabled;
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    const viewport = resultsRef.current;
    const activeOption = viewport?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!viewport || !activeOption) return;
    if (activeOption.offsetTop < viewport.scrollTop) {
      viewport.scrollTop = activeOption.offsetTop;
    } else if (activeOption.offsetTop + activeOption.offsetHeight > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = activeOption.offsetTop + activeOption.offsetHeight - viewport.clientHeight;
    }
  }, [query, selectedIndex, showResults]);

  function locate(option: HierarchySearchOption) {
    setQuery(option.name);
    setOpen(false);
    onLocate(option);
  }

  return (
    <div className="admin-hierarchy-search">
      <label className="admin-field" htmlFor={`${id}-input`}>
        <span>Find an agent</span>
      </label>
      <div className="admin-hierarchy-search-control">
        <Search size={17} aria-hidden="true" />
        <input
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults && results.length ? `${id}-results` : undefined}
          aria-activedescendant={showResults && results.length ? `${id}-result-${selectedIndex}` : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          placeholder={assistView ? "Search name or NPN" : "Search name, email, NPN or agent ID"}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
            onClear();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => results.length
                ? (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length
                : 0);
            } else if (event.key === "Enter" && showResults && results.length) {
              event.preventDefault();
              locate(results[selectedIndex]);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="admin-hierarchy-search-clear"
            aria-label="Clear agent search"
            onClick={() => {
              setQuery("");
              setOpen(false);
              onClear();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="admin-hierarchy-search-hint">
        Search the full organization. Choose a result to jump to their position.
      </p>
      {showResults && (
        <div ref={resultsRef} className="admin-hierarchy-search-results">
          {results.length ? (
            <ul id={`${id}-results`} role="listbox" aria-label="Matching agents">
              {results.map((option, index) => (
                <li
                  key={option.id}
                  id={`${id}-result-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => locate(option)}
                >
                  <strong>{option.name}</strong>
                  <span>{[!assistView && option.email, option.npn ? `NPN ${option.npn}` : null, !assistView && option.agentNumber].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : <p role="status">No agents found. Try another name{assistView ? " or NPN" : ", email, NPN or agent ID"}.</p>}
          {matches.length > results.length && (
            <p role="status">Showing {results.length} of {matches.length} matches. Keep typing to narrow the results.</p>
          )}
        </div>
      )}
    </div>
  );
}
