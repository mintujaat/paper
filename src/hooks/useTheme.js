import { useCallback, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") || "light"
  );

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("quiz_theme", next);
      } catch {}
      document
        .getElementById("themeColorMeta")
        ?.setAttribute("content", next === "dark" ? "#0b0f19" : "#f8fafc");
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
