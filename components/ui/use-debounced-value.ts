import { useEffect, useState } from "react";

/** 値が `delay` ミリ秒変わらなかったら返り値を追いつかせる（打つたびに重い処理を走らせない） */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
