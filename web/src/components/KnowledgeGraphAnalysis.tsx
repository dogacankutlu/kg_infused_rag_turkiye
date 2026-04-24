import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type RoundTrace, type Triple } from "../lib/api";

export default function KnowledgeGraphAnalysis({
  summary,
  subgraph,
  rounds,
}: {
  summary: string;
  subgraph: Triple[];
  rounds: RoundTrace[];
}) {
  const [showCypher, setShowCypher] = useState(false);

  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">
        Knowledge Graph Analizi
      </h2>

      {summary && (
        <p className="italic text-neutral-600 mb-5 leading-relaxed">"{summary}"</p>
      )}

      <Pathway subgraph={subgraph} />

      <div className="mt-6">
        <div className="text-sm font-medium text-neutral-700 mb-2">
          Hop execution trace (all attempted hops)
        </div>
        <div className="space-y-2">
          {rounds.map((r) => (
            <HopCard key={r.round_number} round={r} />
          ))}
          {rounds.length === 0 && (
            <div className="text-sm text-neutral-500 italic">No hops executed.</div>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-neutral-100 pt-4">
        <button
          onClick={() => setShowCypher((s) => !s)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <span>{showCypher ? "▾" : "▸"}</span>
          <span>Cypher queries used</span>
        </button>
        {showCypher && <CypherList />}
      </div>
    </div>
  );
}

function Pathway({ subgraph }: { subgraph: Triple[] }) {
  if (subgraph.length === 0) {
    return (
      <div className="text-sm text-neutral-500 italic">No triples in pathway.</div>
    );
  }
  return (
    <div>
      <div className="text-sm font-medium text-neutral-700 mb-2">
        Pathway (ordered triples)
      </div>
      <ol className="space-y-1.5 text-sm">
        {subgraph.map((t, i) => (
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="text-neutral-400 tabular-nums w-6 shrink-0">
              {i + 1}.
            </span>
            <span className="text-neutral-700">
              {t.source_name.toLowerCase()}{" "}
              <span className="text-neutral-400">→</span>{" "}
              <span className="font-semibold text-blue-600 uppercase text-xs tracking-wider">
                {t.relation}
              </span>{" "}
              <span className="text-neutral-400">→</span>{" "}
              {t.target_name.toLowerCase()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HopCard({ round }: { round: RoundTrace }) {
  const selectedCount = round.selected_triples.length;
  const status = round.stopped
    ? round.stop_reason || "stopped"
    : selectedCount > 0
    ? "selected"
    : "no selection";
  const relations = Array.from(
    new Set(round.selected_triples.map((t) => t.relation.toLowerCase().replace(/_/g, " ")))
  );

  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-blue-50 text-blue-700 border-blue-200">
          Hop {round.round_number}
        </span>
        <span className="chip">status: {status}</span>
        <span className="chip bg-amber-50 text-amber-700 border-amber-200">
          fetched: {round.candidate_triples}
        </span>
        <span className="chip bg-green-50 text-green-700 border-green-200">
          selected: {selectedCount}
        </span>
      </div>
      {relations.length > 0 && (
        <div className="mt-2 text-xs text-neutral-600">
          <span className="text-neutral-500">selected relations: </span>
          <span className="font-medium">{relations.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function CypherList() {
  const { data } = useQuery({ queryKey: ["queries"], queryFn: api.queries });
  if (!data) {
    return (
      <div className="text-sm text-neutral-500 mt-3 italic">Loading Cypher templates…</div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {data.templates.map((t) => (
        <details key={t.name} className="group">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-blue-600 list-none">
            <span className="inline-block group-open:rotate-90 transition-transform mr-1">
              ▸
            </span>
            {t.name}
          </summary>
          <div className="mt-1 ml-4">
            <div className="text-xs text-neutral-500 mb-1">{t.purpose}</div>
            <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 overflow-auto">
              {t.template}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
