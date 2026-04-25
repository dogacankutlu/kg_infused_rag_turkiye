// Active RAG pipeline selection — persisted in localStorage and shared via a
// tiny pub-sub so the hidden header dropdown and the Ask button stay in sync
// across pages without a context provider.

import { useEffect, useState } from "react";

export type PipelineId = "kg_infused" | "vanilla";

export const PIPELINE_LABELS: Record<PipelineId, string> = {
  kg_infused: "KG-Infused RAG",
  vanilla: "Vanilla RAG",
};

export const PIPELINE_SHORT: Record<PipelineId, string> = {
  kg_infused: "KG-Infused",
  vanilla: "Vanilla",
};

const KEY = "rag.pipeline";
const listeners = new Set<(p: PipelineId) => void>();

function read(): PipelineId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "vanilla") return "vanilla";
  } catch {
    /* ignore */
  }
  return "kg_infused";
}

export function getPipeline(): PipelineId {
  return read();
}

export function setPipeline(p: PipelineId) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(p));
}

export function usePipeline(): [PipelineId, (p: PipelineId) => void] {
  const [p, setP] = useState<PipelineId>(read);
  useEffect(() => {
    const l = (next: PipelineId) => setP(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [p, setPipeline];
}

// Map any backend pipeline string (incl. legacy "kg_infused_rag") to a label.
export function labelFor(name: string): string {
  if (!name) return "—";
  const n = name.toLowerCase();
  if (n.includes("vanilla")) return PIPELINE_SHORT.vanilla;
  if (n.includes("kg")) return PIPELINE_SHORT.kg_infused;
  return name;
}
