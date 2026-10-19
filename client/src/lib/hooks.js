import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** حالة تُحفَظ في localStorage (وتعمل بدونه لو حُظر) — للتفضيلات الشخصية فقط */
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : JSON.parse(stored);
    } catch {
      return initial;
    }
  });
  const update = useCallback((next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      try { window.localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* وضع خاص */ }
      return resolved;
    });
  }, [key]);
  return [value, update];
}

/** يغلق عنصرًا منبثقًا عند الضغط خارجه أو على Esc */
export function useDismiss(ref, onDismiss, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onPointer = (event) => { if (ref.current && !ref.current.contains(event.target)) onDismiss(); };
    const onKey = (event) => { if (event.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — مصروفي` : 'مصروفي';
    return () => { document.title = previous; };
  }, [title]);
}

/** مرجع يحمل آخر قيمة (لاستعمالها داخل مؤثّرات بلا إعادة اشتراك) */
export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}
