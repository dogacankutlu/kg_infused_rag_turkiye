import type { Triple } from "../lib/api";
import { prettyName, prettyRelation } from "../lib/prettyName";

// Renders the spreading-activation subgraph as a numbered list of triples.
// Each row uses the canonical (Subject) → [RELATION] → (Object) shape.
//
// Display layer only — the backend payload is already a clean array of
// {source_name, relation, target_name} structs from
// SpreadingActivationTrace.to_dict(). The Wikidata5M raw corpus stores names
// in a messy form ("demirel, suleyman", "istanbul (turkey)", "i̇tü"), so we
// run them through prettyName() before showing.

export default function PathwayCard({ subgraph }: { subgraph: Triple[] }) {
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
        Pathway
      </h2>
      {subgraph.length === 0 ? (
        <div className="text-sm text-neutral-500 italic">
          No triples in pathway.
        </div>
      ) : (
        <ol className="space-y-2 text-sm">
          {subgraph.map((t, i) => {
            const subj = prettyName(t.source_name);
            const obj = prettyName(t.target_name);
            const rel = prettyRelation(t.relation);
            return (
              <li
                key={`${t.source_id}-${t.relation}-${t.target_id}-${i}`}
                className="flex gap-2 leading-relaxed items-start"
              >
                <span className="text-neutral-400 tabular-nums w-6 shrink-0 mt-0.5">
                  {i + 1}.
                </span>
                <span className="text-neutral-800">
                  <span className="text-neutral-400">(</span>
                  <span className="font-medium">{subj}</span>
                  <span className="text-neutral-400">)</span>{" "}
                  <span className="text-neutral-400">→</span>{" "}
                  <span
                    className="font-bold text-warm-600 uppercase text-[11px] tracking-wider
                               bg-gold-50 border border-gold-200 rounded px-1.5 py-0.5
                               whitespace-nowrap"
                    title={t.relation}
                  >
                    [{rel}]
                  </span>{" "}
                  <span className="text-neutral-400">→</span>{" "}
                  <span className="text-neutral-400">(</span>
                  <span className="font-medium">{obj}</span>
                  <span className="text-neutral-400">)</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
