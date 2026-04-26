import type { RAGResult } from "../lib/api";

type ExecutedQuery = {
  name: string;
  purpose: string;
  template: string;
  bindings?: Record<string, string | number>;
  execution_count: number;
};

/**
 * Derive the Cypher queries actually executed for the *current* question
 * from the RAGResult trace. No static templates — only what ran.
 *
 * Sources (KGInfusedRAG.answer):
 *   - SeedFinder.find_seeds       → fulltext entity search (per question, k=3)
 *   - kg_infused.py:71-75         → seed one-hop relations (per seed)
 *   - SpreadingActivation.run     → outgoing-triples expansion (per round)
 *   - kg_infused.py:86-92         → entity lookup for visited nodes (descriptions)
 */
function deriveExecutedQueries(result: RAGResult): ExecutedQuery[] {
  const out: ExecutedQuery[] = [];
  const seeds = result.activation?.seeds ?? [];
  const rounds = result.activation?.rounds ?? [];
  const visited = result.activation?.visited ?? [];

  // 1. Fulltext seed search — runs once per ask, k=3.
  out.push({
    name: "Fulltext seed search",
    purpose: "Resolve question text to candidate KG entities (alias/desc match).",
    template:
      "CALL db.index.fulltext.queryNodes('entity_text', $q)\n" +
      "YIELD node, score\n" +
      "RETURN node.entityId AS id, node.name AS name, score\n" +
      "LIMIT $limit",
    bindings: { q: result.question.question_text, limit: 3 },
    execution_count: 1,
  });

  // 2. Seed neighbors (one hop) — runs once per resolved seed.
  if (seeds.length > 0) {
    out.push({
      name: "Seed neighbors (one hop)",
      purpose: "Fetch each seed's outgoing relations for the seed-card display.",
      template:
        "MATCH (e:Entity {entityId: $id})-[r]->(n)\n" +
        "RETURN type(r) AS rel, n.name AS name LIMIT 15",
      bindings: {
        id: `${seeds.map((s) => s.entity_id).join(", ")} (${seeds.length} seed${seeds.length === 1 ? "" : "s"})`,
      },
      execution_count: seeds.length,
    });
  }

  // 3. Spreading activation expansion — once per round.
  if (rounds.length > 0) {
    const totalCandidates = rounds.reduce(
      (sum, r) => sum + (r.candidate_triples ?? 0),
      0,
    );
    out.push({
      name: "Spreading activation expansion",
      purpose: `Each hop fetches outgoing triples from the current frontier (${rounds.length} round${rounds.length === 1 ? "" : "s"}, ${totalCandidates} candidate triples).`,
      template:
        "MATCH (e:Entity {entityId: $id})-[r]->(n)\n" +
        "RETURN e.entityId AS sId, e.name AS sName,\n" +
        "       type(r) AS rel, n.entityId AS tId, n.name AS tName\n" +
        "LIMIT $limit",
      bindings: {
        id: `frontier nodes per hop`,
        limit: 50,
      },
      execution_count: rounds.length,
    });
  }

  // 4. Entity lookup — once per visited entity (for descriptions).
  if (visited.length > 0) {
    out.push({
      name: "Entity lookup",
      purpose: "Fetch name + description for each visited entity (used by summarizer).",
      template:
        "MATCH (e:Entity {entityId: $id})\n" +
        "RETURN e.entityId AS entityId, e.name AS name, e.description AS description",
      bindings: {
        id: `${visited.length} visited entit${visited.length === 1 ? "y" : "ies"}`,
      },
      execution_count: visited.length,
    });
  }

  return out;
}

export default function CypherQueriesCard({ result }: { result: RAGResult }) {
  const queries = deriveExecutedQueries(result);
  const total = queries.reduce((s, q) => s + q.execution_count, 0);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500">
          Cypher Queries
        </h2>
        <span className="chip chip-warm text-[10px]">
          {total} execution{total === 1 ? "" : "s"} · {queries.length} distinct
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Queries actually executed for this question. Re-runs vary with the
        question's seeds, hop count, and visited entities.
      </p>

      {queries.length === 0 && (
        <div className="text-sm text-neutral-500 italic">
          No KG queries were executed for this run.
        </div>
      )}

      <div className="space-y-4">
        {queries.map((q) => (
          <div
            key={q.name}
            className="border border-orange-100 rounded-xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gold-50/60 border-b border-orange-100">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-800">{q.name}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{q.purpose}</div>
              </div>
              <span className="chip chip-warm text-[10px] shrink-0">
                ×{q.execution_count}
              </span>
            </div>

            <pre className="text-xs leading-relaxed text-neutral-700 font-mono
                            bg-white px-4 py-3 overflow-auto whitespace-pre-wrap">
              {q.template}
            </pre>

            {q.bindings && Object.keys(q.bindings).length > 0 && (
              <div className="px-4 py-2 bg-neutral-50 border-t border-orange-100
                              text-[11px] font-mono text-neutral-600 space-y-0.5">
                {Object.entries(q.bindings).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-warm-600">${k}</span>
                    <span className="text-neutral-400"> = </span>
                    <span className="text-neutral-700">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
