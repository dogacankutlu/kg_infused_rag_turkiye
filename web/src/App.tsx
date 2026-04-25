import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import HomePage from "./pages/HomePage";
import HistoryPage from "./pages/HistoryPage";
import { api } from "./lib/api";
import {
  PIPELINE_LABELS,
  type PipelineId,
  usePipeline,
} from "./lib/pipeline";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function SiteHeader() {
  const [pipeline, setPipeline] = usePipeline();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (p: PipelineId) => {
    setPipeline(p);
    setOpen(false);
  };

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-orange-100 shadow-sm relative z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 overflow-visible">
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
          Multi-Hop Question Answering with{" "}
          <span ref={wrapRef} className="relative inline-block z-50">
            {/* Hidden toggle — looks like normal text, no button styling. */}
            <span
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={open}
              title="Click to switch pipeline"
              onClick={() => setOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((o) => !o);
                }
              }}
              className="text-warm-500 cursor-pointer select-none focus:outline-none
                         inline-flex items-center gap-1"
            >
              {PIPELINE_LABELS[pipeline]}
              {/* Dropdown affordance — rotates when menu open */}
              <svg
                className={`w-3.5 h-3.5 text-warm-400 transition-transform duration-150 ${
                  open ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
            {open && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-2 z-[100] min-w-[14rem]
                           bg-white border border-orange-200 rounded-xl shadow-xl
                           overflow-hidden text-sm"
              >
                <div className="px-3 py-2 text-[10px] uppercase tracking-widest
                                text-neutral-400 border-b border-orange-100 bg-gold-50/40">
                  Active pipeline
                </div>
                {(Object.keys(PIPELINE_LABELS) as PipelineId[]).map((id) => {
                  const active = id === pipeline;
                  return (
                    <button
                      key={id}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => choose(id)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3
                        ${active
                          ? "bg-warm-50 text-warm-700 font-semibold"
                          : "hover:bg-orange-50 text-neutral-700 font-medium"}`}
                    >
                      <span>{PIPELINE_LABELS[id]}</span>
                      {active && (
                        <span className="text-warm-500 text-xs">●</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
        </h1>
        <p className="text-xs text-warm-500/80 italic mt-0.5">
          (click the pipeline name to explore other models)
        </p>
      </div>
    </header>
  );
}

export function Tabs() {
  const { data } = useQuery({
    queryKey: ["history-count"],
    queryFn: () => api.history(undefined, 1000),
  });
  const count = data?.count ?? 0;
  const base =
    "flex-1 text-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150";
  return (
    <nav className="flex gap-2 bg-white/70 border border-orange-200 rounded-2xl p-1 shadow-sm backdrop-blur-sm">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? "bg-warm-500 text-white shadow-md shadow-warm-500/30"
              : "text-neutral-600 hover:bg-orange-50"
          }`
        }
      >
        Ask
      </NavLink>
      <NavLink
        to="/history"
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? "bg-warm-500 text-white shadow-md shadow-warm-500/30"
              : "text-neutral-600 hover:bg-orange-50"
          }`
        }
      >
        History ({count})
      </NavLink>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-orange-100 bg-white/70 backdrop-blur-sm mt-8">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="font-medium text-neutral-600">Stack:</span>
          <Tech>React + Vite</Tech>
          <Tech>FastAPI</Tech>
          <Tech>Neo4j</Tech>
          <Tech>Ollama / Groq</Tech>
          <Tech>Wikidata5M</Tech>
          <Tech>Tailwind CSS</Tech>
        </div>
        <p className="text-xs text-neutral-500">
          Created by{" "}
          <span className="font-medium text-neutral-700">Doğacan Kutlu</span>,{" "}
          <span className="font-medium text-neutral-700">Ceren Karadayı</span>{" "}
          for{" "}
          <span className="font-medium text-neutral-700">
            CSE 474 — Social Network Analysis (2026)
          </span>
        </p>
      </div>
    </footer>
  );
}

function Tech({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-50
                     border border-orange-200 text-warm-700 font-medium text-[11px]">
      {children}
    </span>
  );
}
