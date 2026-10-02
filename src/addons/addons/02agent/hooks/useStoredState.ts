import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/** Writing on every state change re-serializes the whole stored value; the session list holds the
 * entire transcript, so a streaming flush would stringify hundreds of KB ~20 times per second and
 * block the main thread. Coalescing writes keeps that off the frame path. */
const STORAGE_WRITE_DELAY_MS = 250;

const readStoredValue = <T>(key: string, defaultValue: T): T => {
  const storedValue = localStorage.getItem(key);
  if (!storedValue) {
    return defaultValue;
  }

  try {
    return JSON.parse(storedValue) as T;
  } catch {
    return defaultValue;
  }
};

export function useStoredState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStoredValue(key, defaultValue));
  const pendingRef = useRef<{ key: string; value: T } | null>(null);
  const timerRef = useRef<number | null>(null);

  const writePending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    localStorage.setItem(pending.key, JSON.stringify(pending.value));
  }, []);

  // Never lose a coalesced write: flush it when the component goes away or the page is unloaded.
  useEffect(() => {
    window.addEventListener("pagehide", writePending);
    return () => {
      window.removeEventListener("pagehide", writePending);
      writePending();
    };
  }, [writePending]);

  useEffect(() => {
    pendingRef.current = { key, value };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(writePending, STORAGE_WRITE_DELAY_MS);
  }, [key, value, writePending]);

  return [value, setValue];
}