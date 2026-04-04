"use client";
import React, { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Brain, Loader2 } from "lucide-react";

const MemorySettings = () => {
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const configRes = await fetch("/api/user-config");
        const config = await configRes.json();
        setMemoryEnabled(config.MEMORI_ENABLED === true || config.MEMORI_ENABLED === "true");
      } catch {
        setMemoryEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  const handleMemoryToggle = async (enabled: boolean) => {
    const prev = memoryEnabled;
    setMemoryEnabled(enabled);
    setSaving(true);
    try {
      if (window.electron?.setUserConfig) {
        await window.electron.setUserConfig({
          MEMORI_ENABLED: enabled,
        } as any);
      } else {
        await fetch("/api/user-config", {
          method: "POST",
          body: JSON.stringify({ MEMORI_ENABLED: enabled }),
        });
      }
    } catch {
      setMemoryEnabled(prev);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full bg-[#F9F8F8] p-7 rounded-[20px] flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-[#5146E5]" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="bg-[#F9F8F8] p-7 rounded-[20px]">
        <h4 className="text-sm font-semibold text-[#191919] mb-1">Memory</h4>
        <p className="text-xs text-[#6B7280] mb-6 leading-relaxed max-w-lg">
          Control whether conversation memory is used to provide richer context across interactions.
        </p>

        <div className="flex items-center justify-between gap-4 rounded-[10px] bg-white border border-[#EDEEEF] p-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full border border-[#EDEEEF] flex items-center justify-center bg-white mt-0.5">
              <Brain className="w-4 h-4 text-[#5146E5]" />
            </div>
            <div>
              <label
                htmlFor="memory-toggle"
                className="text-sm font-medium text-[#191919] cursor-pointer select-none block"
              >
                {memoryEnabled ? "Memory Enabled" : "Memory Disabled"}
              </label>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {memoryEnabled
                  ? "Conversation memory is active for richer context."
                  : "Conversation memory is turned off."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            )}
            <Switch
              id="memory-toggle"
              checked={memoryEnabled}
              onCheckedChange={handleMemoryToggle}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemorySettings;