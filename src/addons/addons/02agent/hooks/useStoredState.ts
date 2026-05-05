import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

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

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
