import type { RoundTrace } from "../lib/api";

export default function HopTraceCard({ rounds }: { rounds: RoundTrace[] }) {
  // The hop count is the number of executed expansion rounds. A round that
  // stopped without selecting any new triples still counts — it represents a
  // real KG lookup the pipeline performed.
  const hopCount = rounds.length;
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
        Hop Execution Trace
      </h2>

      {/* Prominent hop-count summary at the top of the trace. */}
      <div className="mb-3 flex items-baseline gap-2 border-b border-orange-100 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
          Number of Hops:
        </span>
        <span className="text-2xl font-extrabold text-warm-600 leading-none">
          {hopCount}
        </span>
        {hopCount > 0 && (
          <span className="text-[11px] text-neutral-400 ml-1">
            ({hopCount === 1 ? "1 round" : `${hopCount} rounds`} executed)
          </span>
        )}
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
