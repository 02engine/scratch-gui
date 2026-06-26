import { useCallback, useMemo, useState } from "react";

function useStorageInfo<T>(key: string, defaultValue: T) {
  const readValue = () => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  };
  const [value, setValueState] = useState<T>(readValue);
  const defaultString = useMemo(() => JSON.stringify(defaultValue), [defaultValue]);

  const setValue = useCallback(
    (data: T) => {
      setValueState(data);
      localStorage.setItem(key, JSON.stringify(data ?? JSON.parse(defaultString)));
    },
    [defaultString, key]
  );

  return [value, setValue] as const;
}

export default useStorageInfo;
