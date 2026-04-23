"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientProfile } from "../type";

const STORAGE_KEY = "tripstory_clients";

function readClients(): ClientProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistClients(clients: ClientProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function useClientProfiles() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  useEffect(() => {
    setClients(readClients());
  }, []);

  const addClient = useCallback((profile: Omit<ClientProfile, "id" | "createdAt">) => {
    const newClient: ClientProfile = {
      ...profile,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setClients((prev) => {
      const updated = [newClient, ...prev];
      persistClients(updated);
      return updated;
    });
    return newClient;
  }, []);

  const removeClient = useCallback((id: string) => {
    setClients((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persistClients(updated);
      return updated;
    });
    if (activeClientId === id) setActiveClientId(null);
  }, [activeClientId]);

  const updateClient = useCallback((id: string, patch: Partial<ClientProfile>) => {
    setClients((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      persistClients(updated);
      return updated;
    });
  }, []);

  const selectClient = useCallback((id: string | null) => {
    setActiveClientId(id);
  }, []);

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;

  return {
    clients,
    activeClient,
    activeClientId,
    addClient,
    removeClient,
    updateClient,
    selectClient,
  };
}
