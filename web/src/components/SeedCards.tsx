import type { SeedTrace } from "../lib/api";

export default function SeedCards({ seeds }: { seeds: SeedTrace[] }) {
  if (!seeds.length) {
    return <div className="text-sm text-neutral-500">No seeds found.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {seeds.map((s) => (
        <div key={s.entity_id} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">{s.name}</div>
            <span className="chip">{s.entity_id}</span>
          </div>
          {s.entity_type && (
            <div className="text-xs text-neutral-500 mb-2">{s.entity_type}</div>
          )}
          <div className="flex gap-2 mb-3 text-xs">
            <span className="chip chip-red">score {s.score.toFixed(2)}</span>
            <span className="chip">bm25 {s.bm25_score.toFixed(2)}</span>
            <span className="chip">emb {s.embed_score.toFixed(2)}</span>
          </div>
          {s.one_hop_relations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-500 mb-1">
                one-hop relations
              </div>
              <ul className="text-xs text-neutral-600 space-y-0.5 max-h-28 overflow-auto">
                {s.one_hop_relations.slice(0, 8).map((r, i) => (
                  <li key={i} className="truncate">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
