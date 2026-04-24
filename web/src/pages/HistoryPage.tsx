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

type Tab = "stats" | "relations" | "triplets" | "qa" | "cypher" | "runs";

const TABS: { id: Tab; label: string }[] = [
  { id: "stats", label: "Statistics Summary" },
  { id: "relations", label: "Top Relations" },
  { id: "triplets", label: "Sample Triplets" },
  { id: "qa", label: "QA Dataset" },
  { id: "cypher", label: "Cypher Catalog" },
  { id: "runs", label: "Recent Runs" },
];

const PIE_COLORS = ["#E30A17", "#2563EB", "#059669", "#D97706", "#7C3AED", "#0891B2", "#DB2777", "#737373"];

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("stats");

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
      <aside>
        <div className="card p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors ${
                tab === t.id
                  ? "bg-turkiye-red-light text-turkiye-red-dark"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </aside>
      <div>
        {tab === "stats" && <StatsTab />}
        {tab === "relations" && <RelationsTab />}
        {tab === "triplets" && <TripletsTab />}
        {tab === "qa" && <QATab />}
        {tab === "cypher" && <CypherTab />}
        {tab === "runs" && <RunsTab />}
      </div>
    </div>
  );
}

function StatsTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  if (!data) return null;

  const filtered = data.filtered;
  const live = data.live;
  const domainHist = data.qa_domain_histogram || {};
  const difficultyHist = data.qa_difficulty_histogram || {};

  const domainData = Object.entries(domainHist).map(([name, value]) => ({
    name,
    value: value as number,
  }));
  const difficultyData = Object.entries(difficultyHist).map(([name, value]) => ({
    name,
    value: value as number,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Filtered entities" value={filtered?.total_entities?.toLocaleString() ?? "—"} />
        <Stat label="Filtered triples" value={filtered?.total_triples?.toLocaleString() ?? "—"} />
        <Stat label="QA questions" value={(data.qa_total ?? 0).toString()} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Neo4j live entities" value={live?.entities?.toLocaleString() ?? "(offline)"} />
        <Stat label="Neo4j live relations" value={live?.relations?.toLocaleString() ?? "(offline)"} />
        <Stat label="Seed entity" value={filtered?.turkiye_entity_id ?? "Q43"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4" style={{ height: 300 }}>
          <div className="text-sm font-semibold mb-2">QA domains</div>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie data={domainData} dataKey="value" nameKey="name" outerRadius={90} label>
                {domainData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4" style={{ height: 300 }}>
          <div className="text-sm font-semibold mb-2">QA difficulty</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={difficultyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#E30A17" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function RelationsTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  const filtered = data?.filtered;
  const rels: [string, number][] = filtered?.top_relations ?? [];
  const chartData = rels.slice(0, 15).map(([name, freq]) => ({ name, freq }));

  return (
    <div className="space-y-4">
      <div className="card p-4" style={{ height: 420 }}>
        <div className="text-sm font-semibold mb-2">Top relations (filtered Türkiye subgraph)</div>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
            <Tooltip />
            <Bar dataKey="freq" fill="#E30A17" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card p-4 overflow-auto">
        <table className="text-sm w-full">
          <thead className="text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="py-2">Relation</th>
              <th className="py-2 text-right">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {rels.map(([name, freq]) => (
              <tr key={name} className="border-t border-neutral-100">
                <td className="py-2">{name}</td>
                <td className="py-2 text-right">{freq.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TripletsTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const [filter, setFilter] = useState("");
  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  const triples: any[] = data?.filtered?.sample_triples ?? [];
  const f = filter.toLowerCase();
  const filtered = !f
    ? triples
    : triples.filter((t) =>
        [t.subject_name, t.relation, t.object_name].join(" ").toLowerCase().includes(f)
      );

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Filter triples…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="card p-4 overflow-auto">
        <table className="text-sm w-full">
          <thead className="text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="py-2">Subject</th>
              <th className="py-2">Relation</th>
              <th className="py-2">Object</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={i} className="border-t border-neutral-100">
                <td className="py-2">{t.subject_name}</td>
                <td className="py-2 text-turkiye-red-dark">{t.relation}</td>
                <td className="py-2">{t.object_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-sm text-neutral-500 text-center py-6">No triples match.</div>
        )}
      </div>
    </div>
  );
}

function QATab() {
  const { data: domains } = useQuery({ queryKey: ["domains"], queryFn: api.domains });
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
                <tr key={q.question_id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 text-xs text-neutral-500">{q.question_id}</td>
                  <td className="py-2">{q.question_text}</td>
                  <td className="py-2 font-medium">{q.gold_answer}</td>
                  <td className="py-2">
                    <span className="chip">{q.domain}</span>
                  </td>
                  <td className="py-2">
                    <span className="chip chip-red">{q.difficulty}</span>
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

function CypherTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["queries"], queryFn: api.queries });
  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={(error as Error).message} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Template count" value={data.template_count.toString()} />
        <Stat label="Max hops observed" value={data.max_hops_observed.toString()} />
        <Stat
          label="Avg retrieval time"
          value={`${data.avg_elapsed_seconds.toFixed(2)}s`}
          sub={`${data.runs_analyzed} runs`}
        />
      </div>
      <div className="space-y-3">
        {data.templates.map((t) => (
          <div key={t.name} className="card p-4">
            <div className="font-semibold text-sm mb-1">{t.name}</div>
            <div className="text-xs text-neutral-500 mb-2">{t.purpose}</div>
            <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-3 overflow-auto">
              {t.template}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunsTab() {
  const [verdict, setVerdict] = useState<string>("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["history", verdict],
    queryFn: () => api.history(verdict || undefined, 50),
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          className={verdict === "" ? "btn-primary" : "btn-secondary"}
          onClick={() => setVerdict("")}
        >
          All
        </button>
        <button
          className={verdict === "success" ? "btn-primary" : "btn-secondary"}
          onClick={() => setVerdict("success")}
        >
          Success
        </button>
        <button
          className={verdict === "failure" ? "btn-primary" : "btn-secondary"}
          onClick={() => setVerdict("failure")}
        >
          Failure
        </button>
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
                <th className="py-2">Gold</th>
                <th className="py-2">EM</th>
                <th className="py-2">F1</th>
                <th className="py-2">⏱</th>
                <th className="py-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((r, i) => (
                <tr key={i} className="border-t border-neutral-100 align-top">
                  <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">
                    {(r.finished_at || r.started_at || "").replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="py-2 max-w-[300px] truncate" title={r.question.question_text}>
                    {r.question.question_text}
                  </td>
                  <td className="py-2 font-medium">{r.answer}</td>
                  <td className="py-2">{r.question.gold_answer}</td>
                  <td className="py-2">{r.metrics?.em.toFixed(2) ?? "—"}</td>
                  <td className="py-2">{r.metrics?.f1.toFixed(2) ?? "—"}</td>
                  <td className="py-2">{r.elapsed_seconds.toFixed(2)}s</td>
                  <td className="py-2">
                    <span
                      className={`chip ${
                        r.verdict === "success"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {r.verdict}
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
