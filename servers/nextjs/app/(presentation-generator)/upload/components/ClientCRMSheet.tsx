"use client";

import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Users, Plus, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientProfile } from "../type";

const PREFERENCE_OPTIONS = [
  "Beach", "Adventure", "Fine Dining", "History",
  "Nightlife", "Family", "Romantic", "Solo",
  "Wellness", "Shopping", "Nature", "Culture",
] as const;

interface ClientCRMSheetProps {
  clients: ClientProfile[];
  activeClient: ClientProfile | null;
  onAddClient: (profile: Omit<ClientProfile, "id" | "createdAt">) => ClientProfile;
  onRemoveClient: (id: string) => void;
  onSelectClient: (id: string | null) => void;
}

export function ClientCRMSheet({
  clients,
  activeClient,
  onAddClient,
  onRemoveClient,
  onSelectClient,
}: ClientCRMSheetProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState<"budget" | "mid-range" | "luxury">("mid-range");
  const [notes, setNotes] = useState("");

  const hasActiveClient = activeClient !== null;

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setPreferences([]);
    setTravelStyle("mid-range");
    setNotes("");
    setIsAdding(false);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    const newClient = onAddClient({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      preferences,
      travelStyle,
      notes: notes.trim() || undefined,
    });
    onSelectClient(newClient.id);
    resetForm();
  };

  const togglePreference = (pref: string) => {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className={cn(
            "relative w-9 h-9 rounded-md border flex items-center justify-center transition-colors",
            hasActiveClient
              ? "border-primary bg-primary/5 text-primary"
              : "border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          title="Client Profiles"
        >
          <Users className="w-4 h-4" />
          {hasActiveClient && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
          )}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col">
        <div className="p-4 border-b border-border">
          <h4 className="font-mono text-xs tracking-widest uppercase text-primary">Clients</h4>
          <p className="text-xs text-muted-foreground mt-1">Select a client to personalize the presentation</p>
        </div>

        {activeClient && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
            <span className="text-xs text-primary font-medium">
              Presenting for: {activeClient.name}
            </span>
            <button onClick={() => onSelectClient(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!isAdding ? (
            <div className="p-4 space-y-2">
              <button
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Client
              </button>

              {clients.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No clients yet. Add your first client to get started.
                </p>
              )}

              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient(activeClient?.id === client.id ? null : client.id)}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                    activeClient?.id === client.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/20 hover:bg-accent"
                  )}
                >
                  <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-mono font-medium shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{client.name}</span>
                      {activeClient?.id === client.id && (
                        <Check className="w-3 h-3 text-primary shrink-0" />
                      )}
                    </div>
                    {client.preferences.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {client.preferences.slice(0, 3).map((p) => (
                          <span key={p} className="text-[9px] font-mono tracking-wide uppercase bg-muted px-1.5 py-0.5 rounded-xs text-muted-foreground">
                            {p}
                          </span>
                        ))}
                        {client.preferences.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{client.preferences.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveClient(client.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">New Client</h5>
                <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client name *"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone"
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Travel Style</label>
                <div className="flex gap-2">
                  {(["budget", "mid-range", "luxury"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setTravelStyle(style)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors capitalize",
                        travelStyle === style
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Preferences</label>
                <div className="flex flex-wrap gap-1.5">
                  {PREFERENCE_OPTIONS.map((pref) => (
                    <button
                      key={pref}
                      onClick={() => togglePreference(pref)}
                      className={cn(
                        "rounded-xs px-2 py-1 text-[10px] font-mono tracking-wide uppercase transition-colors",
                        preferences.includes(pref)
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted text-muted-foreground border border-transparent hover:border-border"
                      )}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (dietary restrictions, special occasions...)"
                rows={2}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />

              <button
                onClick={handleAdd}
                disabled={!name.trim()}
                className="w-full rounded-md bg-primary text-primary-foreground py-2 text-xs font-mono tracking-widest uppercase disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                Save Client
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
