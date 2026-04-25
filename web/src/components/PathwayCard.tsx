import type { Triple } from "../lib/api";

export default function PathwayCard({ subgraph }: { subgraph: Triple[] }) {
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
        Pathway
      </h2>
      {subgraph.length === 0 ? (
        <div className="text-sm text-neutral-500 italic">No triples in pathway.</div>
      ) : (
        <ol className="space-y-2 text-sm">
          {subgraph.map((t, i) => (
            <li key={i} className="flex gap-2 leading-relaxed items-start">
              <span className="text-neutral-400 tabular-nums w-6 shrink-0 mt-0.5">
                {i + 1}.
              </span>
              <span className="text-neutral-700">
                {t.source_name.toLowerCase()}{" "}
                <span className="text-neutral-400 mx-0.5">→</span>{" "}
                <span
                  className="font-bold text-warm-600 uppercase text-[11px] tracking-wider
                               bg-gold-50 border border-gold-200 rounded px-1.5 py-0.5 whitespace-nowrap"
                >
                  {t.relation}
                </span>{" "}
                <span className="text-neutral-400 mx-0.5">→</span>{" "}
                {t.target_name.toLowerCase()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
