"use client";

import { cn } from "@/lib/utils";

/** Jauge essence 8 segments (1-8). value 0/null = non renseigné. */
export default function FuelGauge({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const level = value ?? 0;
  return (
    <div className="inline-block">
      <div className="flex items-stretch border rounded-md overflow-hidden bg-secondary">
        <div className="w-1.5 bg-foreground/70" title="Vide (E)" />
        {[1, 2, 3, 4].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(level === i ? null : i)}
            title={`${i}/8`}
            className={cn(
              "w-7 h-9 border-r border-border last:border-r-0 transition-colors",
              i <= level ? "bg-primary" : "bg-card hover:bg-primary/20"
            )}
          />
        ))}
        <div className="w-1.5 bg-foreground/70" title="½" />
        {[5, 6, 7, 8].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(level === i ? null : i)}
            title={`${i}/8`}
            className={cn(
              "w-7 h-9 border-r border-border last:border-r-0 transition-colors",
              i <= level ? "bg-primary" : "bg-card hover:bg-primary/20"
            )}
          />
        ))}
        <div className="w-1.5 bg-foreground/70" title="Plein (F)" />
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground mt-1 px-0.5">
        <span>E</span>
        <span>½</span>
        <span>F</span>
      </div>
    </div>
  );
}
