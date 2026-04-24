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
import { Tabs } from "../App";

type Tab = "overview" | "qa" | "runs";

const SUBTABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "qa", label: "QA Dataset" },
  { id: "runs", label: "Recent Runs" },
];

const PIE_COLORS = [
  "#2563EB",
  "#0891B2",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#DB2777",
  "#E30A17",
  "#737373",
];

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <div className="max-w-3xl mx-auto mb-6">
        <Tabs />
      </div>

      <div className="flex gap-2 mb-5 border-b border-neutral-200">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
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
    </div>
  );
}

/* ────────── Overview (stats + top relations + sample triplets merged) ────────── */

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
  const topRelationsChart = rels.slice(0, 12).map(([name, freq]) => ({ name, freq }));

  const f = filter.toLowerCase();
  const filteredTriples = !f
    ? triples
    : triples.filter((t) =>
        [t.subject_name, t.relation, t.object_name].join(" ").toLowerCase().includes(f)
      );

  return (
    <div className="space-y-6">
      {/* Statistics summary */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
          Statistics summary
        </h3>
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
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4" style={{ height: 280 }}>
          <div className="text-sm font-semibold mb-2">QA domains</div>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie
                data={domainData}
                dataKey="value"
                nameKey="name"
                outerRadius={85}
                label
              >
                {domainData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4" style={{ height: 280 }}>
          <div className="text-sm font-semibold mb-2">QA difficulty</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={difficultyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top relations */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
          Top relations
        </h3>
        <div className="card p-4" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topRelationsChart}
              layout="vertical"
              margin={{ left: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={120}
              />
              <Tooltip />
              <Bar dataKey="freq" fill="#2563EB" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Sample triplets */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
          Sample triplets
        </h3>
        <input
          className="input mb-3"
          placeholder="Filter triples…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="card p-4 overflow-auto max-h-[420px]">
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase sticky top-0 bg-white">
              <tr>
                <th className="py-2">Subject</th>
                <th className="py-2">Relation</th>
                <th className="py-2">Object</th>
              </tr>
            </thead>
            <tbody>
              {filteredTriples.map((t, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="py-2">{t.subject_name}</td>
                  <td className="py-2 text-blue-600">{t.relation}</td>
                  <td className="py-2">{t.object_name}</td>
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

/* ────────── QA Dataset ────────── */

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
        <select
          className="input"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
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
        <div className="card p-4 overflow-auto">
          <div className="text-sm text-neutral-500 mb-2">{data.count} question(s)</div>
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2">ID</th>
                <th className="py-2">Question</th>
                <th className="py-2">Gold</th>
                <th className="py-2">Domain</th>
                <th className="py-2">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {data.questions.map((q) => (
                <tr
                  key={q.question_id}
                  className="border-t border-neutral-100 align-top"
                >
                  <td className="py-2 text-xs text-neutral-500">{q.question_id}</td>
                  <td className="py-2">{q.question_text}</td>
                  <td className="py-2 font-medium">{q.gold_answer}</td>
                  <td className="py-2">
                    <span className="chip">{q.domain}</span>
                  </td>
                  <td className="py-2">
                    <span className="chip bg-blue-50 text-blue-700 border-blue-200">
                      {q.difficulty}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ────────── Recent Runs ────────── */

function RunsTab() {
  const [verdict, setVerdict] = useState<string>("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["history", verdict],
    queryFn: () => api.history(verdict || undefined, 100),
  });

  const FilterButton = ({ id, label }: { id: string; label: string }) => (
    <button
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        verdict === id
          ? "bg-blue-600 text-white"
          : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
      }`}
      onClick={() => setVerdict(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <FilterButton id="" label="All" />
        <FilterButton id="success" label="Successful" />
        <FilterButton id="failure" label="Failed" />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorMsg msg={(error as Error).message} />}
      {data && (
        <div className="card p-4 overflow-auto">
          <div className="text-sm text-neutral-500 mb-2">{data.count} run(s)</div>
          <table className="text-sm w-full">
            <thead className="text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2">When</th>
                <th className="py-2">Question</th>
                <th className="py-2">Answer</th>
                <th className="py-2">⏱</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((r, i) => {
                const ok = r.verdict === "success";
                return (
                  <tr key={i} className="border-t border-neutral-100 align-top">
                    <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">
                      {(r.finished_at || r.started_at || "")
                        .replace("T", " ")
                        .slice(0, 16)}
                    </td>
                    <td
                      className="py-2 max-w-[340px] truncate"
                      title={r.question.question_text}
                    >
                      {r.question.question_text}
                    </td>
                    <td className="py-2 font-medium">{r.answer || "—"}</td>
                    <td className="py-2 whitespace-nowrap">
                      {r.elapsed_seconds.toFixed(2)}s
                    </td>
                    <td className="py-2">
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
            <div className="text-sm text-neutral-500 text-center py-6">
              No runs yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────── Helpers ────────── */

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase text-neutral-500 tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-neutral-800">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

function Loading() {
  return <div className="text-sm text-neutral-500">Loading…</div>;
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {msg}
    </div>
  );
}
