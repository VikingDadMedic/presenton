"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const themes = [
  { value: "eggshell-light", label: "Eggshell Light" },
  { value: "eggshell-dark", label: "Eggshell Dark" },
  { value: "velara-light", label: "Velara Light" },
  { value: "velara-dark", label: "Velara Dark" },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="w-[160px] h-8 text-xs">
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        {themes.map((t) => (
          <SelectItem key={t.value} value={t.value} className="text-xs">
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
