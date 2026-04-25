import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function CypherQueriesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["queries"],
    queryFn: api.queries,
  });

  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-4">
        Cypher Queries
      </h2>

      {isLoading && (
        <div className="text-sm text-neutral-500 animate-pulse">Loading queries…</div>
      )}

      {data && (
        <div className="space-y-4">
          {data.templates.map((t) => (
            <div
              key={t.name}
              className="border border-orange-100 rounded-xl overflow-hidden"
            >
              {/* Sub-box header */}
              <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gold-50/60 border-b border-orange-100">
                <div>
                  <div className="text-sm font-semibold text-neutral-800">{t.name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{t.purpose}</div>
                </div>
              </div>

              {/* Query — always visible (no collapse) */}
              <pre className="text-xs leading-relaxed text-neutral-700 font-mono
                             bg-white px-4 py-3 overflow-auto whitespace-pre-wrap">
                {t.template}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
