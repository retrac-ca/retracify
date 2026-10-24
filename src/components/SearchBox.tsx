import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { Place } from '../../shared/types';
import type { SearchStatus } from '../hooks/useLocationSearch';
import { formatPlaceMeta, formatPopulation } from '../lib/format';

const LISTBOX_ID = 'location-results';
const HELP_ID = 'location-search-help';

interface SearchBoxProps {
  query: string;
  onQueryChange: (value: string) => void;
  results: Place[];
  status: SearchStatus;
  error: string | null;
  onSelect: (place: Place) => void;
  onRetry: () => void;
}

export function SearchBox({
  query,
  onQueryChange,
  results,
  status,
  error,
  onSelect,
  onRetry,
}: SearchBoxProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isDismissed, setIsDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const trimmed = query.trim();
  const isSearchable = trimmed.length >= 2;
  const showResults =
    isSearchable &&
    !isDismissed &&
    status !== 'error' &&
    results.length > 0;
  const activePlace =
    activeIndex >= 0 ? results[activeIndex] : undefined;

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        formRef.current &&
        !formRef.current.contains(event.target as Node)
      ) {
        setIsDismissed(true);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) =>
        index >= results.length - 1 ? 0 : index + 1,
      );
      return;
    }

    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? results.length - 1 : index - 1,
      );
      return;
    }

    if (event.key === 'Enter' && activePlace) {
      event.preventDefault();
      onSelect(activePlace);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveIndex(-1);
      setIsDismissed(true);
      inputRef.current?.blur();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = activePlace ?? results[0];

    if (choice) {
      onSelect(choice);
    }
  }

  return (
    <form
      ref={formRef}
      className="search"
      role="search"
      onSubmit={handleSubmit}
    >
      <label className="search-label" htmlFor="location-search">
        Search for a city or town
      </label>
      <p className="sr-only" id={HELP_ID}>
        Type at least two characters. Use the up and down arrow keys to review
        results, Enter to select, and Escape to close the list.
      </p>

      <div className="search-controls">
        <div className="search-input-wrap">
          <svg
            className="search-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m15.5 15.5 5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            id="location-search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? LISTBOX_ID : undefined}
            aria-activedescendant={
              activePlace ? `${LISTBOX_ID}-${activePlace.id}` : undefined
            }
            aria-describedby={HELP_ID}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            spellCheck={false}
            placeholder="e.g. Grand Falls, New Brunswick"
            value={query}
            onFocus={() => setIsDismissed(false)}
            onChange={(event) => {
              setActiveIndex(-1);
              setIsDismissed(false);
              onQueryChange(event.target.value);
            }}
            onKeyDown={handleKeyDown}
          />
          {status === 'loading' && isSearchable && (
            <span className="search-spinner" aria-hidden="true" />
          )}
        </div>
        <button
          className="search-button"
          type="submit"
          disabled={!isSearchable || status === 'loading'}
        >
          Search
        </button>
      </div>

      <div className="search-feedback" aria-live="polite">
        {trimmed.length === 1 && (
          <p className="search-hint">Type at least two characters.</p>
        )}
        {status === 'loading' && isSearchable && (
          <p className="search-hint">Searching locations…</p>
        )}
        {status === 'error' && error && (
          <div className="search-error" role="alert">
            <p>{error}</p>
            <button type="button" className="text-button" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
        {status === 'success' && results.length > 0 && (
          <p className="search-hint">
            {results.length} locations found. Use the arrow keys to choose.
          </p>
        )}
        {status === 'success' && isSearchable && results.length === 0 && (
          <p className="search-hint">
            No places found. Try adding a region or country.
          </p>
        )}
      </div>

      {showResults && (
        <ul
          className="search-results"
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Location results"
        >
          {results.map((place, index) => {
            const population = formatPopulation(place.population);
            const meta = formatPlaceMeta(place);

            return (
              <li
                key={place.id}
                id={`${LISTBOX_ID}-${place.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex ? 'search-result is-active' : 'search-result'
                }
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(place)}
                >
                  <span className="search-result-name">{place.name}</span>
                  <span className="search-result-meta">
                    {meta}
                    {population ? `${meta ? ' · ' : ''}${population}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
