import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { api } from "../lib/api";
import { labelFor } from "../lib/pipeline";
import { Tabs } from "../App";

type Tab = "overview" | "qa" | "runs" | "evaluation";

const SUBTABS: { id: Tab; label: string }[] = [
  { id: "runs", label: "Recent Runs" },
  { id: "evaluation", label: "Evaluation & Metrics" },
  { id: "overview", label: "Overview" },
  { id: "qa", label: "QA Dataset" },
];

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

      {tab === "overview" && <OverviewTab />}
      {tab === "qa" && <QATab />}
      {tab === "runs" && <RunsTab />}
      {tab === "evaluation" && <EvaluationTab />}
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
          <div className="card p-4" style={{ height: 260 }}>
            <div className="text-sm font-semibold mb-2">QA domains</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie
                  data={domainData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {domainData.map((_, i) => (
                    <Cell key={i} fill={WARM_COLORS[i % WARM_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-4" style={{ height: 260 }}>
            <div className="text-sm font-semibold mb-2">QA difficulty</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={difficultyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#F97316" radius={[4, 4, 0, 0]} />
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
                const order = ["2-hop", "3-hop", "comparison"];
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["history", verdict],
    queryFn: () => api.history(verdict || undefined, 100),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          { id: "", label: "All" },
          { id: "success", label: "Successful" },
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
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((r, i) => {
                const ok = r.verdict === "success";
                return (
                  <tr
                    key={i}
                    className="border-t border-orange-50 align-top hover:bg-gold-50/30"
                  >
                    <td className="px-4 py-2 text-xs text-neutral-500 whitespace-nowrap">
                      {(r.finished_at || r.started_at || "")
                        .replace("T", " ")
                        .slice(0, 16)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {(() => {
                        const isVanilla = (r.pipeline || "")
                          .toLowerCase()
                          .includes("vanilla");
                        return (
                          <span
                            className={`chip text-[10px] ${
                              isVanilla
                                ? "bg-gold-100 text-gold-700 border-gold-300"
                                : "bg-orange-50 text-warm-700 border-orange-200"
                            }`}
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
                    <td className="px-4 py-2">
                      <span
                        className={`chip ${
                          ok
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {ok ? "Successful" : "Failed"}
                      </span>
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

  const kg = data.pipelines.find((p) => p.pipeline === "kg_infused");
  const va = data.pipelines.find((p) => p.pipeline === "vanilla");

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtNum = (v: number) => v.toFixed(3);

  const metricRows: { key: keyof NonNullable<typeof kg>["metrics"]; label: string }[] = [
    { key: "accuracy", label: "Accuracy" },
    { key: "f1", label: "F1 Score" },
    { key: "em", label: "Exact Match" },
    { key: "retrieval_recall", label: "Retrieval Recall" },
  ];

  const winnerClass = (a: number, b: number) =>
    a > b ? "text-warm-600 font-bold" : "text-neutral-700";

  return (
    <div className="space-y-5">
      {/* Performance Overview Box — side-by-side success rate */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500">
            Performance Overview
          </h3>
          <span className="text-xs text-neutral-500">
            Overall correctness rate across logged runs
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PipelineSuccessCard
            title="KG-Infused RAG"
            tone="warm"
            successRate={kg?.success_rate ?? 0}
            runs={kg?.runs ?? 0}
            successes={kg?.successes ?? 0}
            elapsed={kg?.avg_elapsed_seconds ?? 0}
          />
          <PipelineSuccessCard
            title="Vanilla RAG"
            tone="gold"
            successRate={va?.success_rate ?? 0}
            runs={va?.runs ?? 0}
            successes={va?.successes ?? 0}
            elapsed={va?.avg_elapsed_seconds ?? 0}
          />
        </div>
      </div>

      {/* Metric Comparison Table */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-warm-500">
            Method Comparison
          </h3>
          <span className="text-xs text-neutral-500">
            Mean over runs that included a gold answer
          </span>
        </div>

        {(!kg || !kg.with_gold) && (!va || !va.with_gold) ? (
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
                  <th className="px-3 py-2 font-semibold text-right">KG-Infused RAG</th>
                  <th className="px-3 py-2 font-semibold text-right">Vanilla RAG</th>
                  <th className="px-3 py-2 font-semibold text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {metricRows.map(({ key, label }) => {
                  const k = kg?.metrics[key] ?? 0;
                  const v = va?.metrics[key] ?? 0;
                  const delta = k - v;
                  return (
                    <tr
                      key={key}
                      className="border-b border-orange-50 hover:bg-gold-50/30"
                    >
                      <td className="px-3 py-2.5 font-medium text-neutral-700">
                        {label}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${winnerClass(k, v)}`}>
                        {fmtNum(k)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${winnerClass(v, k)}`}>
                        {fmtNum(v)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono text-xs ${
                          delta > 0
                            ? "text-green-600"
                            : delta < 0
                            ? "text-red-600"
                            : "text-neutral-400"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {fmtNum(delta)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-orange-100 bg-gold-50/30">
                  <td className="px-3 py-2.5 font-semibold text-neutral-700">
                    Success Rate
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-warm-700">
                    {fmtPct(kg?.success_rate ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-warm-700">
                    {fmtPct(va?.success_rate ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-neutral-400">—</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-neutral-400 mt-3">
              KG-Infused mean over <b>{kg?.with_gold ?? 0}</b> gold-answer runs ·
              Vanilla mean over <b>{va?.with_gold ?? 0}</b> gold-answer runs.
              Higher is better for all four metrics.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineSuccessCard({
  title,
  tone,
  successRate,
  runs,
  successes,
  elapsed,
}: {
  title: string;
  tone: "warm" | "gold";
  successRate: number;
  runs: number;
  successes: number;
  elapsed: number;
}) {
  const toneClasses =
    tone === "warm"
      ? "bg-gradient-to-br from-orange-50 to-warm-50 border-warm-200"
      : "bg-gradient-to-br from-gold-50 to-orange-50 border-gold-300";
  const accent = tone === "warm" ? "text-warm-600" : "text-gold-700";
  const pct = `${(successRate * 100).toFixed(1)}%`;

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-neutral-800">{title}</span>
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          {runs} runs
        </span>
      </div>
      <div className={`text-5xl font-extrabold ${accent} tracking-tight`}>
        {pct}
      </div>
      <div className="text-xs text-neutral-600 mt-2">
        <span className="font-semibold">{successes}</span> successful out of{" "}
        <span className="font-semibold">{runs}</span> · avg{" "}
        <span className="font-mono">{elapsed.toFixed(2)}s</span>
      </div>
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
