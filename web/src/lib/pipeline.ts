// Active RAG pipeline selection — persisted in localStorage and shared via a
// tiny pub-sub so the hidden header dropdown and the Ask button stay in sync
// across pages without a context provider.

import { useEffect, useState } from "react";

export type PipelineId =
  | "kg_infused"
  | "vanilla"
  | "vanilla_qe"
  | "no_retrieval";

export const PIPELINE_IDS: PipelineId[] = [
  "kg_infused",
  "vanilla",
  "vanilla_qe",
  "no_retrieval",
];

export const PIPELINE_LABELS: Record<PipelineId, string> = {
  kg_infused: "KG-Infused RAG",
  vanilla: "Vanilla RAG",
  vanilla_qe: "Vanilla + Query Expansion",
  no_retrieval: "No-Retrieval Baseline",
};

export const PIPELINE_SHORT: Record<PipelineId, string> = {
  kg_infused: "KG-Infused",
  vanilla: "Vanilla",
  vanilla_qe: "Vanilla-QE",
  no_retrieval: "No-Retrieval",
};

// Per-pipeline accent classes (chip background + text + border). Used in the
// Recent Runs Method column and Evaluation cards.
export const PIPELINE_TONES: Record<
  PipelineId,
  { chip: string; bg: string; accent: string }
> = {
  kg_infused: {
    chip: "bg-warm-100 text-warm-800 border-warm-300",
    bg: "bg-gradient-to-br from-warm-50 to-tangerine-100 border-warm-300",
    accent: "text-warm-700",
  },
  vanilla: {
    chip: "bg-gold-100 text-gold-800 border-gold-300",
    bg: "bg-gradient-to-br from-gold-50 to-peach-100 border-gold-300",
    accent: "text-gold-700",
  },
  vanilla_qe: {
    chip: "bg-tangerine-100 text-burnt-700 border-tangerine-300",
    bg: "bg-gradient-to-br from-tangerine-50 to-peach-200 border-tangerine-400",
    accent: "text-burnt-600",
  },
  no_retrieval: {
    chip: "bg-red-100 text-red-700 border-red-300",
    bg: "bg-gradient-to-br from-peach-50 to-red-100 border-red-300",
    accent: "text-red-700",
  },
};

const KEY = "rag.pipeline";
const listeners = new Set<(p: PipelineId) => void>();

function read(): PipelineId {
  try {
    const v = localStorage.getItem(KEY);
    if (
      v === "vanilla" ||
      v === "vanilla_qe" ||
      v === "no_retrieval" ||
      v === "kg_infused"
    )
      return v;
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

// Map any backend pipeline string to a PipelineId for tone/label lookup.
export function pipelineKey(name: string): PipelineId {
  const n = (name || "").toLowerCase();
  if (n.includes("no_retrieval") || n === "nor") return "no_retrieval";
  if (n.includes("vanilla_qe") || n === "qe") return "vanilla_qe";
  if (n.includes("vanilla")) return "vanilla";
  return "kg_infused";
}

export function labelFor(name: string): string {
  if (!name) return "—";
  return PIPELINE_SHORT[pipelineKey(name)];
}
