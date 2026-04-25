import type { RoundTrace } from "../lib/api";

export default function KGAnalysisCard({
  summary,
  rounds,
}: {
  summary: string;
  rounds: RoundTrace[];
}) {
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
        Knowledge Graph Analysis
      </h2>

      {summary ? (
        <p className="italic text-neutral-600 mb-5 leading-relaxed border-l-2 border-gold-300 pl-3">
          "{summary}"
        </p>
      ) : (
        <p className="text-sm text-neutral-500 italic mb-4">No summary generated.</p>
      )}

      <div>
        <div className="text-sm font-semibold text-neutral-700 mb-2">
          Hop Execution Trace
        </div>
        <div className="space-y-2">
          {rounds.length === 0 && (
            <div className="text-sm text-neutral-500 italic">No hops executed.</div>
          )}
          {rounds.map((r) => (
            <HopCard key={r.round_number} round={r} />
          ))}
        </div>
      </div>
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
    new Set(
      round.selected_triples.map((t) =>
        t.relation.toLowerCase().replace(/_/g, " ")
      )
    )
  );
  return (
    <div className="border border-orange-100 rounded-xl p-3 bg-gold-50/40">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip chip-warm font-semibold">Hop {round.round_number}</span>
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
