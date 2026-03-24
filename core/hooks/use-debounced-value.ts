import { useEffect, useState } from 'react';

const DEFAULT_MS = 350;

/**
 * Returns `value` only after it has stayed stable for `delayMs` (debounce).
 * Useful for server search while typing.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
