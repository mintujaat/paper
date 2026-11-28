import { useCallback, useEffect, useRef, useState } from "react";

export function useToast() {
  const [toastState, setToastState] = useState({ msg: "", kind: "", show: false });
  const timerRef = useRef(null);

  const toast = useCallback((msg, kind = "") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastState({ msg, kind, show: true });
    timerRef.current = setTimeout(() => {
      setToastState(prev => ({ ...prev, show: false }));
    }, 3400);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toastState, toast };
}
