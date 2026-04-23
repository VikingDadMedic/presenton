"use client";

import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Map, Waves, Mountain, Landmark, Building2, Ship, Binoculars, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripContext } from "../type";

const BUDGET_TIERS = [
  { value: "budget", label: "Budget" },
  { value: "mid-range", label: "Mid-Range" },
  { value: "luxury", label: "Luxury" },
] as const;

const TRIP_TYPES = [
  { value: "beach", label: "Beach", icon: Waves },
  { value: "adventure", label: "Adventure", icon: Mountain },
  { value: "cultural", label: "Cultural", icon: Landmark },
  { value: "city", label: "City", icon: Building2 },
  { value: "cruise", label: "Cruise", icon: Ship },
  { value: "safari", label: "Safari", icon: Binoculars },
] as const;

interface TripPlanPopoverProps {
  tripContext: TripContext | null;
  onTripContextChange: (ctx: TripContext | null) => void;
}

export function TripPlanPopover({ tripContext, onTripContextChange }: TripPlanPopoverProps) {
  const ctx = tripContext ?? {
    destination: "",
    origin: "",
    tripDays: 5,
    budget: "mid-range" as const,
    tripType: "cultural",
    notes: "",
  };

  const hasContext = tripContext !== null && tripContext.destination.trim().length > 0;

  const update = (patch: Partial<TripContext>) => {
    onTripContextChange({ ...ctx, ...patch });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative w-9 h-9 rounded-md border flex items-center justify-center transition-colors",
            hasContext
              ? "border-primary bg-primary/5 text-primary"
              : "border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          title="Trip Plan"
        >
          <Map className="w-4 h-4" />
          {hasContext && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-border">
          <h4 className="font-mono text-xs tracking-widest uppercase text-primary">Trip Context</h4>
          <p className="text-xs text-muted-foreground mt-1">Add travel details to personalize the presentation</p>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Destination</label>
            <input
              type="text"
              value={ctx.destination}
              onChange={(e) => update({ destination: e.target.value })}
              placeholder="e.g. Bali, Indonesia"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Origin</label>
            <input
              type="text"
              value={ctx.origin}
              onChange={(e) => update({ origin: e.target.value })}
              placeholder="e.g. Sydney, Australia"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Duration</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => update({ tripDays: Math.max(1, ctx.tripDays - 1) })}
                className="w-8 h-8 rounded-md border border-border bg-card flex items-center justify-center hover:bg-accent"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-sm font-medium text-foreground w-16 text-center">{ctx.tripDays} days</span>
              <button
                onClick={() => update({ tripDays: Math.min(30, ctx.tripDays + 1) })}
                className="w-8 h-8 rounded-md border border-border bg-card flex items-center justify-center hover:bg-accent"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Budget</label>
            <div className="flex gap-2">
              {BUDGET_TIERS.map((tier) => (
                <button
                  key={tier.value}
                  onClick={() => update({ budget: tier.value })}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    ctx.budget === tier.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  )}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Trip Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TRIP_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => update({ tripType: value })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[10px] font-medium transition-colors",
                    ctx.tripType === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Notes</label>
            <textarea
              value={ctx.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Special requests, preferences..."
              rows={2}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        <div className="p-3 border-t border-border flex justify-between">
          <button
            onClick={() => onTripContextChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
          <span className="text-[10px] text-muted-foreground font-mono">
            {hasContext ? "Context active" : "No context set"}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
