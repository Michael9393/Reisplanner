/**
 * Tekstveld met plaats-autocomplete via Photon. Degradeert stil naar een
 * gewoon tekstveld wanneer de geocoder onbereikbaar is: typen en opslaan
 * blijven altijd werken, alleen de suggesties vallen weg.
 */
import { useEffect, useRef, useState } from "react";
import { type PlaceSuggestion, searchPlaces } from "../services/photon";
import { inputClass } from "./shared";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export function PlaceSearchInput({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Alleen typen zet de query; programmatische value-wijzigingen (zoals een
  // gekozen suggestie) starten dus geen nieuwe zoekactie.
  const [query, setQuery] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query === null) return;

    abortRef.current?.abort();
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setOpen(false);
      setLoading(false);
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(query.trim(), controller.signal);
        setSuggestions(results);
        setActiveIndex(-1);
        setOpen(true);
        setLoading(false);
        setUnavailable(false);
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
        setUnavailable(true);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function select(suggestion: PlaceSuggestion) {
    setOpen(false);
    setSuggestions([]);
    setQuery(null);
    onSelect(suggestion);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      // Alleen de lijst sluiten — niet de omliggende modal (die luistert op document).
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const listId = `${id}-suggesties`;

  return (
    <div className="relative">
      <input
        id={id}
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Plaatssuggesties"
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {loading && <p className="px-3 py-1.5 text-xs text-slate-400">Zoeken…</p>}
          {!loading && suggestions.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-slate-400">Geen suggesties gevonden.</p>
          )}
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.name}|${suggestion.country ?? ""}`}
              id={`${listId}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                index === activeIndex ? "bg-emerald-50 text-emerald-900" : "text-slate-700"
              }`}
              // onMouseDown i.p.v. onClick: vóór de blur van het invoerveld.
              onMouseDown={(event) => {
                event.preventDefault();
                select(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-medium">{suggestion.name}</span>
              {suggestion.country && (
                <span className="text-slate-500"> · {suggestion.country}</span>
              )}
              {suggestion.description && (
                <span className="block text-xs text-slate-400">{suggestion.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {unavailable && (
        <p className="mt-0.5 text-xs text-slate-400">Suggesties niet beschikbaar (offline?)</p>
      )}
    </div>
  );
}
