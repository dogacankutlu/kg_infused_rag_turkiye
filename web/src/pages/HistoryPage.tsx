import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Verdict, type VerifyResponse } from "../lib/api";
import {
  labelFor,
  pipelineKey,
  PIPELINE_IDS,
  PIPELINE_LABELS,
  PIPELINE_SHORT,
  PIPELINE_TONES,
  type PipelineId,
} from "../lib/pipeline";
import { Tabs } from "../App";

// Top-level tabs after consolidation:
//   runs        — Recent Runs (with Failure Reason column)
//   evaluation  — Evaluation & Metrics + dataset Overview underneath
//   dataset     — Dataset & Validation: Question Verifier + QA Dataset
type Tab = "runs" | "evaluation" | "dataset";

const SUBTABS: { id: Tab; label: string }[] = [
  { id: "runs", label: "Recent Runs" },
  { id: "evaluation", label: "Evaluation & Metrics" },
  { id: "dataset", label: "Dataset & Validation" },
];

// Map a raw error / no-info answer to a 1-2 word failure tag.
function failureReason(r: {
  error?: string;
  answer?: string;
  verdict?: string;
}): string {
  // Only show the failure-reason chip for actual failures. Unverified
  // and successful runs never get a reason tag.
  if (r.verdict !== "failure") return "";
  const err = (r.error || "").toLowerCase();
  if (err) {
    if (err.includes("timeout") || err.includes("timed out")) return "Timeout";
    if (err.includes("rate limit") || err.includes("ratelimit")) return "Rate Limit";
    if (err.includes("unauthorized") || err.includes("api key") || err.includes("401"))
      return "Auth";
    if (err.includes("serviceunavailable") || err.includes("connection") || err.includes("refused"))
      return "DB Down";
    if (err.includes("neo4j") || err.includes("cypher")) return "KG Error";
    if (err.includes("groq") || err.includes("ollama") || err.includes("llm"))
      return "LLM Error";
    if (err.includes("seed") || err.includes("no seeds")) return "No Seeds";
    if (err.includes("retriev")) return "Retrieval";
    if (err.includes("parse") || err.includes("json")) return "Parse";
    return "Error";
  }
  // No raw error but answer flagged "no info" by the verdict logic.
  const ans = (r.answer || "").toLowerCase();
  if (!ans) return "Empty";
  if (
    ans.includes("bilgi bulunmamaktadır") ||
    ans.includes("bilgi yok") ||
    ans.includes("no information") ||
    ans.includes("don't know") ||
    ans.includes("dont know")
  )
    return "No Info";
  return "Wrong";
}

// Warm amber/orange chart palette
const WARM_COLORS = [
  "#EA580C",
  "#F97316",
  "#FB923C",
  "#FBBF24",
  "#F59E0B",
  "#D97706",
  "#C2410C",
  "#92400E",
];

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("runs");

  return (
    <div>
      <div className="max-w-3xl mx-auto mb-6">
        <Tabs />
      </div>

      <div className="flex gap-1 mb-6 border-b border-orange-200">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-warm-500 text-warm-600"
                : "border-transparent text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "runs" && <RunsTab />}
      {tab === "evaluation" && (
        <div className="space-y-8">
          <EvaluationTab />
          <OverviewTab />
        </div>
      )}
      {tab === "dataset" && (
        <div className="space-y-8">
          <VerifierTab />
          <QATab />
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Overview ────────────────────────── */

function OverviewTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
  });
  const [filter, setFilter] = useState("");

  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  if (!data) return null;

  const filtered = data.filtered;
  const live = data.live;
  const domainHist: Record<string, number> = data.qa_domain_histogram || {};
  const difficultyHist: Record<string, number> = data.qa_difficulty_histogram || {};
  const rels: [string, number][] = filtered?.top_relations ?? [];
  const triples: any[] = filtered?.sample_triples ?? [];

  const domainData = Object.entries(domainHist).map(([name, value]) => ({
    name,
    value,
  }));
  const difficultyData = Object.entries(difficultyHist).map(([name, value]) => ({
    name,
    value,
  }));
  const topRelChart = rels.slice(0, 12).map(([name, freq]) => ({ name, freq }));

  const f = filter.toLowerCase();
  const filteredTriples = !f
    ? triples
    : triples.filter((t) =>
        [t.subject_name, t.relation, t.object_name]
          .join(" ")
          .toLowerCase()
          .includes(f)
      );

  return (
    <div className="space-y-8">
      {/* ── Statistics ── */}
      <section>
        <SectionLabel>Statistics Summary</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <Stat
            label="Filtered entities"
            value={filtered?.total_entities?.toLocaleString() ?? "—"}
          />
          <Stat
            label="Filtered triples"
            value={filtered?.total_triples?.toLocaleString() ?? "—"}
          />
          <Stat label="QA questions" value={(data.qa_total ?? 0).toString()} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat
            label="Neo4j live entities"
            value={live?.entities?.toLocaleString() ?? "(offline)"}
          />
          <Stat
            label="Neo4j live relations"
            value={live?.relations?.toLocaleString() ?? "(offline)"}
          />
          <Stat label="Seed entity" value={filtered?.turkiye_entity_id ?? "Q43"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="card p-4" style={{ height: 320 }}>
            <div className="text-sm font-semibold mb-2">QA domains</div>
            <ResponsiveContainer width="100%" height="88%">
              <PieChart>
                <Pie
                  data={domainData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  // Label each slice with the domain name + count.
                  label={(p: any) => `${p.name} (${p.value})`}
                  labelLine
                  isAnimationActive={false}
                >
                  {domainData.map((_, i) => (
                    <Cell key={i} fill={WARM_COLORS[i % WARM_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [`${value} questions`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-4" style={{ height: 320 }}>
            <div className="text-sm font-semibold mb-2">Number of Questions</div>
            <div className="text-[11px] text-neutral-500 mb-1">
              Question count grouped by difficulty
            </div>
            <ResponsiveContainer width="100%" height="82%">
              <BarChart data={difficultyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: any, _name: any, p: any) => [
                    `${value} questions`,
                    p.payload.name,
                  ]}
                />
                <Bar dataKey="value" name="Questions" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Top Relations ── */}
      <section>
        <SectionLabel>Top Relations</SectionLabel>
        <div className="card p-4" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topRelChart}
              layout="vertical"
              margin={{ left: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={120}
              />
              <Tooltip />
              <Bar dataKey="freq" fill="#F97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Sample Triplets ── */}
      <section>
        <SectionLabel>Sample Triplets</SectionLabel>
        <input
          className="input mb-3"
          placeholder="Filter triples…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="card overflow-auto max-h-[400px]">
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase sticky top-0 bg-white/95">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Relation</th>
                <th className="px-4 py-3">Object</th>
              </tr>
            </thead>
            <tbody>
              {filteredTriples.map((t, i) => (
                <tr key={i} className="border-t border-orange-50 hover:bg-gold-50/40">
                  <td className="px-4 py-2">{t.subject_name}</td>
                  <td className="px-4 py-2">
                    <span className="chip chip-warm text-[11px]">{t.relation}</span>
                  </td>
                  <td className="px-4 py-2">{t.object_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTriples.length === 0 && (
            <div className="text-sm text-neutral-500 text-center py-6">
              No triples match.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────── QA Dataset ────────────────────────── */

function QATab() {
  const { data: domains } = useQuery({
    queryKey: ["domains"],
    queryFn: api.domains,
  });
  const [domain, setDomain] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["questions", domain, difficulty],
    queryFn: () => api.questions(domain || undefined, difficulty || undefined),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">All domains</option>
          {(domains?.domains ?? []).map((d) => (
            <option key={d} value={d}>
              {d} ({domains!.counts[d]})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">All difficulties</option>
          <option value="single-hop">single-hop</option>
          <option value="2-hop">2-hop</option>
          <option value="3-hop">3-hop</option>
          <option value="comparison">comparison</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorMsg msg={(error as Error).message} />}
      {data && (
        <div className="card overflow-auto">
          <div className="px-4 py-3 text-sm text-neutral-500 border-b border-orange-50">
            {data.count} question(s)
          </div>
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Gold</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const order = ["single-hop", "2-hop", "3-hop", "comparison"];
                const groups = new Map<string, typeof data.questions>();
                for (const q of data.questions) {
                  const key = q.difficulty || "other";
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(q);
                }
                const orderedKeys = [
                  ...order.filter((k) => groups.has(k)),
                  ...Array.from(groups.keys()).filter((k) => !order.includes(k)),
                ];
                const rows: JSX.Element[] = [];
                for (const key of orderedKeys) {
                  const items = groups.get(key)!;
                  rows.push(
                    <tr
                      key={`hdr-${key}`}
                      className="bg-gold-50/60 border-t border-orange-100"
                    >
                      <td
                        colSpan={5}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-warm-700"
                      >
                        {key} · {items.length}
                      </td>
                    </tr>
                  );
                  for (const q of items) {
                    rows.push(
                      <tr
                        key={q.question_id}
                        className="border-t border-orange-50 align-top hover:bg-gold-50/30"
                      >
                        <td className="px-4 py-2 text-xs text-neutral-500">
                          {q.question_id}
                        </td>
                        <td className="px-4 py-2">{q.question_text}</td>
                        <td className="px-4 py-2 font-medium">{q.gold_answer}</td>
                        <td className="px-4 py-2">
                          <span className="chip">{q.domain}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="chip chip-warm">{q.difficulty}</span>
                        </td>
                      </tr>
                    );
                  }
                }
                return rows;
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Recent Runs ────────────────────────── */

function RunsTab() {
  const [verdict, setVerdict] = useState<string>("");
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["history", verdict],
    queryFn: () => api.history(verdict || undefined, 100),
  });

  // Manual verdict override — persists server-side and immediately
  // invalidates Evaluation tab so success rate / metrics recompute.
  const setVerdictMut = useMutation({
    mutationFn: ({ run_id, v }: { run_id: string; v: Verdict | "auto" }) =>
      api.setVerdict(run_id, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["evaluation"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          { id: "", label: "All" },
          { id: "success", label: "Successful" },
          { id: "unverified", label: "Unverified" },
          { id: "failure", label: "Failed" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setVerdict(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              verdict === id
                ? "bg-warm-500 text-white shadow-sm shadow-warm-500/30"
                : "bg-white border border-orange-200 text-neutral-700 hover:bg-gold-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading && <Loading />}
      {error && <ErrorMsg msg={(error as Error).message} />}
      {data && (
        <div className="card overflow-auto">
          <div className="px-4 py-3 text-sm text-neutral-500 border-b border-orange-50">
            {data.count} run(s)
          </div>
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Answer</th>
                <th className="px-4 py-3">⏱</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Failure Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((r, i) => {
                const reason = failureReason(r);
                const rid = r.run_id || "";
                return (
                  <tr
                    key={rid || i}
                    className="border-t border-orange-50 align-top hover:bg-gold-50/30"
                  >
                    <td className="px-4 py-2 text-xs text-neutral-500 whitespace-nowrap">
                      {(r.finished_at || r.started_at || "")
                        .replace("T", " ")
                        .slice(0, 16)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {(() => {
                        const tone = PIPELINE_TONES[pipelineKey(r.pipeline)].chip;
                        return (
                          <span
                            className={`chip text-[10px] ${tone}`}
                            title={r.pipeline}
                          >
                            {labelFor(r.pipeline)}
                          </span>
                        );
                      })()}
                    </td>
                    <td
                      className="px-4 py-2 max-w-[320px] truncate"
                      title={r.question.question_text}
                    >
                      {r.question.question_text}
                    </td>
                    <td className="px-4 py-2 font-medium">{r.answer || "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.elapsed_seconds.toFixed(2)}s
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <VerdictToggle
                        current={r.verdict}
                        manual={!!r.manual_verdict}
                        disabled={!rid || setVerdictMut.isPending}
                        onSet={(v) =>
                          rid && setVerdictMut.mutate({ run_id: rid, v })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {reason ? (
                        <span
                          className="chip text-[10px] bg-red-50 text-red-700 border-red-200"
                          title={r.error || r.answer || ""}
                        >
                          {reason}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.attempts.length === 0 && (
            <div className="text-sm text-neutral-500 text-center py-8">
              No runs yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── VerdictToggle ────────────────────────── */
//
// Three-state interactive status: Successful (✓ green) / Unverified (◌ gray)
// / Failed (✗ red). Clicking a state sets the manual override; clicking the
// active state again clears it back to "auto" (recomputed from gold answer).

function VerdictToggle({
  current,
  manual,
  disabled,
  onSet,
}: {
  current: Verdict;
  manual: boolean;
  disabled: boolean;
  onSet: (v: Verdict | "auto") => void;
}) {
  const buttons: {
    v: Verdict;
    title: string;
    icon: string;
    activeCls: string;
    idleCls: string;
  }[] = [
    {
      v: "success",
      title: "Mark as Successful",
      icon: "✓",
      activeCls: "bg-green-100 text-green-700 border-green-300 ring-1 ring-green-300",
      idleCls: "text-neutral-300 hover:text-green-600 hover:bg-green-50 border-transparent",
    },
    {
      v: "unverified",
      title: "Mark as Unverified",
      icon: "◌",
      activeCls: "bg-neutral-100 text-neutral-600 border-neutral-300 ring-1 ring-neutral-300",
      idleCls: "text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 border-transparent",
    },
    {
      v: "failure",
      title: "Mark as Failed",
      icon: "✗",
      activeCls: "bg-red-100 text-red-700 border-red-300 ring-1 ring-red-300",
      idleCls: "text-neutral-300 hover:text-red-600 hover:bg-red-50 border-transparent",
    },
  ];

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-orange-100
                 bg-white/80 px-0.5 py-0.5"
      title={
        manual
          ? "Manual override active — click the highlighted icon to clear"
          : "Automatic verdict — click an icon to override"
      }
    >
      {buttons.map(({ v, title, icon, activeCls, idleCls }) => {
        const active = current === v;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            title={title}
            aria-pressed={active}
            onClick={() => onSet(active ? "auto" : v)}
            className={`w-6 h-6 inline-flex items-center justify-center
                        rounded-md border text-xs font-bold transition-colors
                        disabled:cursor-not-allowed disabled:opacity-60 ${
                          active ? activeCls : idleCls
                        }`}
          >
            {icon}
          </button>
        );
      })}
      {manual && (
        <span
          className="ml-1 text-[9px] font-semibold uppercase tracking-wider
                     text-warm-600"
          title="Manual override"
        >
          M
        </span>
      )}
    </div>
  );
}

/* ────────────────────────── Helpers ────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
      {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase text-neutral-500 tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-neutral-800">{value}</div>
    </div>
  );
}

/* ────────────────────────── Evaluation & Metrics ────────────────────────── */

function EvaluationTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["evaluation"],
    queryFn: api.evaluation,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  if (!data) return null;

  const byId = new Map<PipelineId, (typeof data.pipelines)[number]>();
  for (const p of data.pipelines) byId.set(p.pipeline as PipelineId, p);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtNum = (v: number) => v.toFixed(3);

  const metricRows: {
    key: "accuracy" | "f1" | "em" | "retrieval_recall";
    label: string;
  }[] = [
    { key: "accuracy", label: "Accuracy" },
    { key: "f1", label: "F1 Score" },
    { key: "em", label: "Exact Match" },
    { key: "retrieval_recall", label: "Retrieval Recall" },
  ];

  const totalGold = PIPELINE_IDS.reduce(
    (s, id) => s + (byId.get(id)?.with_gold ?? 0),
    0
  );

  // For each metric row find the winner among the 4 pipelines.
  const winnerOf = (
    key: "accuracy" | "f1" | "em" | "retrieval_recall"
  ): PipelineId | null => {
    let best: PipelineId | null = null;
    let bestVal = -Infinity;
    for (const id of PIPELINE_IDS) {
      const v = byId.get(id)?.metrics[key] ?? 0;
      if (v > bestVal) {
        bestVal = v;
        best = id;
      }
    }
    return bestVal > 0 ? best : null;
  };

  return (
    <div className="space-y-5">
      {/* Performance Overview — 4 cards, one per pipeline */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500">
            Performance Overview
          </h3>
          <span className="text-xs text-neutral-500">
            Overall correctness rate across logged runs
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PIPELINE_IDS.map((id) => {
            const p = byId.get(id);
            return (
              <PipelineSuccessCard
                key={id}
                id={id}
                successRate={p?.success_rate ?? 0}
                runs={p?.runs ?? 0}
                successes={p?.successes ?? 0}
                unverified={p?.unverified ?? 0}
                elapsed={p?.avg_elapsed_seconds ?? 0}
              />
            );
          })}
        </div>
      </div>

      {/* Metric Comparison Table — 4 pipeline columns */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500">
            Method Comparison
          </h3>
          <span className="text-xs text-neutral-500">
            Mean over runs that included a gold answer
          </span>
        </div>

        {totalGold === 0 ? (
          <div className="text-sm text-neutral-500 italic">
            No gold-answer runs logged yet — run questions from the QA Dataset
            (filled gold answers) to populate this table.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr className="border-b border-orange-100">
                  <th className="px-3 py-2 font-semibold">Metric</th>
                  {PIPELINE_IDS.map((id) => (
                    <th
                      key={id}
                      className="px-3 py-2 font-semibold text-right whitespace-nowrap"
                    >
                      {PIPELINE_SHORT[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricRows.map(({ key, label }) => {
                  const winner = winnerOf(key);
                  return (
                    <tr
                      key={key}
                      className="border-b border-orange-50 hover:bg-gold-50/30"
                    >
                      <td className="px-3 py-2.5 font-medium text-neutral-700">
                        {label}
                      </td>
                      {PIPELINE_IDS.map((id) => {
                        const v = byId.get(id)?.metrics[key] ?? 0;
                        const isWin = winner === id;
                        return (
                          <td
                            key={id}
                            className={`px-3 py-2.5 text-right font-mono ${
                              isWin
                                ? `${PIPELINE_TONES[id].accent} font-bold`
                                : "text-neutral-700"
                            }`}
                          >
                            {fmtNum(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-orange-100 bg-gold-50/30">
                  <td className="px-3 py-2.5 font-semibold text-neutral-700">
                    Success Rate
                  </td>
                  {PIPELINE_IDS.map((id) => (
                    <td
                      key={id}
                      className="px-3 py-2.5 text-right font-mono font-semibold text-warm-700"
                    >
                      {fmtPct(byId.get(id)?.success_rate ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-neutral-400 mt-3">
              {PIPELINE_IDS.map(
                (id) =>
                  `${PIPELINE_SHORT[id]}: ${byId.get(id)?.with_gold ?? 0} gold runs`
              ).join(" · ")}
              . Higher is better for all four metrics.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineSuccessCard({
  id,
  successRate,
  runs,
  successes,
  unverified,
  elapsed,
}: {
  id: PipelineId;
  successRate: number;
  runs: number;
  successes: number;
  unverified: number;
  elapsed: number;
}) {
  const tones = PIPELINE_TONES[id];
  const decided = runs - unverified;
  const pct = decided > 0 ? `${(successRate * 100).toFixed(1)}%` : "—";

  return (
    <div className={`rounded-2xl border p-5 ${tones.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-neutral-800">
          {PIPELINE_LABELS[id]}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          {runs} runs
        </span>
      </div>
      <div className={`text-4xl font-extrabold ${tones.accent} tracking-tight`}>
        {pct}
      </div>
      <div className="text-xs text-neutral-600 mt-2 space-y-0.5">
        <div>
          <span className="font-semibold">{successes}</span> / {decided}{" "}
          decided · avg <span className="font-mono">{elapsed.toFixed(2)}s</span>
        </div>
        {unverified > 0 && (
          <div className="text-[11px] text-neutral-500">
            <span className="font-semibold text-warm-700">{unverified}</span>{" "}
            pending review
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── Question Verifier ────────────────────────── */

function VerifierTab() {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [gold, setGold] = useState("");
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Defensive query: any error in `api.verify` lands in `error` instead of
  // bubbling as an unhandled promise. We never throw inside render.
  const { data, isLoading, error, refetch, isFetching } = useQuery<VerifyResponse>({
    queryKey: ["verify", submitted],
    queryFn: async () => {
      // Re-trim on the way out so a stray whitespace key never hits the API.
      const q = (submitted || "").trim();
      if (!q) throw new Error("Empty question");
      return api.verify(q);
    },
    enabled: !!submitted,
    retry: false,
  });

  // Promote-to-dataset: if the user supplies a gold answer for an
  // answerable question, append it to the QA JSON, drop it into the
  // "user-created" domain, and retroactively rescore any earlier runs.
  const promoteMut = useMutation({
    mutationFn: () =>
      api.promoteQuestion({
        question_text: (submitted || "").trim(),
        gold_answer: gold.trim(),
        domain: "user-created",
      }),
    onSuccess: (res) => {
      setPromoteMessage(
        res.created
          ? `Saved as ${res.question.question_id} · ${res.rescored_runs} prior run(s) rescored.`
          : `Updated existing entry · ${res.rescored_runs} prior run(s) rescored.`
      );
      setGold("");
      // Refresh the QA dataset table, sample list, domain dropdowns,
      // and the metrics dashboard.
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["questions-all"] });
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      queryClient.invalidateQueries({ queryKey: ["evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const onTest = () => {
    const t = text.trim();
    if (!t) return;
    setPromoteMessage(null);
    setGold("");
    if (t === submitted) {
      // React Query won't re-run if key is unchanged; force it.
      void refetch();
    } else {
      setSubmitted(t);
    }
  };

  // Tolerate any field being missing — older logs / partial responses
  // shouldn't crash the UI.
  const checks = data?.checks ?? [];
  const seeds = data?.seeds ?? [];
  const passages = data?.passages ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-1">
          Question Verifier
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Test a candidate question against the Türkiye subgraph + retrieval
          corpus before running it through any pipeline. No LLM call is
          performed — only seed-resolution and BM25 reachability checks.
        </p>

        {/* How verification works — explains the pass/fail criteria. */}
        <div className="mb-4 rounded-xl border border-orange-200 bg-gradient-to-br
                        from-gold-50 to-peach-50 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-burnt-700 mb-1.5">
            How verification works
          </div>
          <ul className="text-xs text-neutral-700 space-y-1 list-disc pl-4">
            <li>
              <b>Question shape:</b> at least 3 words and 10 characters — too
              short and the system can't extract enough signal.
            </li>
            <li>
              <b>KG seed entities:</b> the question must mention at least one
              entity that resolves into the Türkiye-filtered Wikidata5M
              subgraph (matched by alias + embedding cosine).
            </li>
            <li>
              <b>Passage retrieval:</b> BM25 over filtered descriptions must
              return at least one above-threshold passage.
            </li>
          </ul>
          <div className="text-[11px] text-neutral-500 mt-2">
            A question is judged <b>Answerable</b> when shape passes <i>and</i>
            either KG-seed or passage retrieval succeeds.
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Enter a question to verify…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onTest();
              }
            }}
          />
          <button
            disabled={!text.trim() || isFetching}
            onClick={onTest}
            className="px-4 py-2 rounded-xl font-semibold text-white
                       bg-gradient-to-br from-gold-400 via-warm-500 to-warm-600
                       hover:from-gold-500 hover:via-warm-600 hover:to-warm-700
                       disabled:from-neutral-300 disabled:to-neutral-300
                       disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {isFetching ? "Testing…" : "Test"}
          </button>
        </div>
      </div>

      {isLoading && <Loading />}
      {error && <ErrorMsg msg={(error as Error).message} />}

      {data && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={`chip text-[11px] ${
                data.answerable
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {data.answerable ? "Answerable" : "Not Answerable"}
            </span>
            <span className="text-xs text-neutral-500">
              {data.recommendation || ""}
            </span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
              Checks
            </div>
            <ul className="space-y-1.5">
              {checks.map((c, i) => (
                <li
                  key={c.id || i}
                  className="flex items-start gap-2 text-sm border border-orange-100
                             rounded-lg px-3 py-2 bg-gold-50/40"
                >
                  <span
                    className={`mt-0.5 inline-flex items-center justify-center
                                w-4 h-4 rounded-full text-[10px] font-bold ${
                      c.ok
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <div>
                    <div className="font-medium text-neutral-800">
                      {c.label || c.id}
                    </div>
                    <div className="text-xs text-neutral-600">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {seeds.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                Seed Entities ({seeds.length})
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {seeds.map((s, i) => (
                  <li
                    key={s.entity_id || i}
                    className="border border-orange-100 rounded-lg px-3 py-2 text-xs
                               bg-white"
                  >
                    <div className="font-semibold text-neutral-800">
                      {s.name}{" "}
                      <span className="font-mono text-neutral-400 text-[10px]">
                        {s.entity_id}
                      </span>
                    </div>
                    <div className="text-neutral-500">
                      score {Number(s.score ?? 0).toFixed(3)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passages.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                Top Retrieved Passages ({passages.length})
              </div>
              <ol className="space-y-2">
                {passages.map((p, i) => (
                  <li
                    key={p.entity_id || i}
                    className="border border-orange-100 rounded-lg overflow-hidden"
                  >
                    <div className="px-3 py-1.5 bg-gold-50/60 border-b border-orange-100
                                    flex items-center justify-between text-xs">
                      <span className="font-semibold text-neutral-800">
                        {i + 1}. {p.title || p.entity_id}
                      </span>
                      <span className="chip chip-warm text-[10px]">
                        BM25 {Number(p.score ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Promote-to-Dataset — only when the question is answerable.
              Captures a manual gold answer, appends it to questions/turkiye_qa.json
              under the "user-created" domain, and retroactively rescores any
              prior runs that asked the same text. */}
          {data.answerable && (
            <div className="rounded-xl border border-green-200 bg-gradient-to-br
                            from-green-50 to-gold-50/40 px-4 py-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest
                                text-green-700 mb-1">
                  Promote to Dataset
                </div>
                <p className="text-xs text-neutral-600">
                  This question reaches the KG. Provide a gold answer to add it
                  to the QA dataset under the <b>user-created</b> domain. Any
                  earlier "Unverified" runs of this question will be re-scored
                  against the gold automatically.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="input flex-1"
                  placeholder="Enter gold answer…"
                  value={gold}
                  onChange={(e) => setGold(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && gold.trim() && !promoteMut.isPending) {
                      e.preventDefault();
                      promoteMut.mutate();
                    }
                  }}
                />
                <button
                  disabled={!gold.trim() || promoteMut.isPending}
                  onClick={() => promoteMut.mutate()}
                  className="px-4 py-2 rounded-xl font-semibold text-white
                             bg-gradient-to-br from-green-500 to-green-600
                             hover:from-green-600 hover:to-green-700
                             disabled:from-neutral-300 disabled:to-neutral-300
                             disabled:cursor-not-allowed transition-all shadow-sm
                             whitespace-nowrap"
                >
                  {promoteMut.isPending ? "Saving…" : "Save to Dataset"}
                </button>
              </div>

              {promoteMessage && (
                <div className="text-xs text-green-800 bg-green-100/70 border
                                border-green-200 rounded-lg px-3 py-2">
                  {promoteMessage}
                </div>
              )}
              {promoteMut.error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200
                                rounded-lg px-3 py-2">
                  {(promoteMut.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return <div className="text-sm text-neutral-500 animate-pulse">Loading…</div>;
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
      {msg}
    </div>
  );
}
