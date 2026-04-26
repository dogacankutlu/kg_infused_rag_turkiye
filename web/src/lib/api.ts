// API client. The Vite dev server proxies /api -> FastAPI on :8000.

export type SeedTrace = {
  entity_id: string;
  name: string;
  entity_type: string;
  score: number;
  bm25_score: number;
  embed_score: number;
  matched_aliases: string[];
  one_hop_relations: string[];
};

export type Triple = {
  source_id: string;
  source_name: string;
  relation: string;
  target_id: string;
  target_name: string;
};

export type RoundTrace = {
  round_number: number;
  frontier: string[];
  candidate_triples: number;
  selected_triples: Triple[];
  stopped: boolean;
  stop_reason: string;
};

export type SpreadingActivationTrace = {
  seeds: SeedTrace[];
  rounds: RoundTrace[];
  subgraph: Triple[];
  visited: string[];
  summary: string;
};

export type RetrievedPassage = {
  entity_id: string;
  title: string;
  text: string;
  score: number;
  source_query: string;
};

export type RetrievalTrace = {
  original_query: string;
  expanded_query: string;
  original_hits: RetrievedPassage[];
  expanded_hits: RetrievedPassage[];
  deduped: RetrievedPassage[];
};

export type MetricScores = {
  em: number;
  f1: number;
  accuracy: number;
  retrieval_recall: number;
};

export type Question = {
  question_id: string;
  question_text: string;
  reasoning_path: string[];
  gold_answer: string;
  difficulty: string;
  domain: string;
};

export type Verdict = "success" | "failure" | "unverified";

export type RAGResult = {
  pipeline: string;
  question: Question;
  activation: SpreadingActivationTrace;
  retrieval: RetrievalTrace;
  passage_note: string;
  enhanced_note: string;
  answer: string;
  metrics: MetricScores | null;
  started_at: string;
  finished_at: string;
  elapsed_seconds: number;
  error: string;
  verdict: Verdict;
  // Stable identifier for manual-verdict overrides (added by /api/history).
  run_id?: string;
  manual_verdict?: Verdict | "";
};

export type AskRequest = {
  question_text: string;
  gold_answer?: string;
  domain?: string;
  difficulty?: string;
  reasoning_path?: string[];
  pipeline?: "kg_infused" | "vanilla" | "vanilla_qe" | "no_retrieval";
};

// Matches the actual /api/verify payload (lightweight previews — not full
// SeedTrace / RetrievedPassage objects).
export type VerifyCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type VerifySeed = {
  entity_id: string;
  name: string;
  score: number;
};

export type VerifyPassage = {
  entity_id: string;
  title: string;
  score: number;
};

export type VerifyResponse = {
  question_text: string;
  answerable: boolean;
  recommendation: string;
  checks: VerifyCheck[];
  seeds: VerifySeed[];
  passages: VerifyPassage[];
};

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  ask: (body: AskRequest) =>
    jfetch<RAGResult>("/api/ask", { method: "POST", body: JSON.stringify(body) }),
  stats: () => jfetch<any>("/api/stats"),
  history: (verdict?: string, limit = 100) =>
    jfetch<{ count: number; attempts: RAGResult[] }>(
      `/api/history?${new URLSearchParams({
        ...(verdict ? { verdict } : {}),
        limit: String(limit),
      })}`
    ),
  questions: (domain?: string, difficulty?: string) =>
    jfetch<{ count: number; questions: Question[] }>(
      `/api/questions?${new URLSearchParams({
        ...(domain ? { domain } : {}),
        ...(difficulty ? { difficulty } : {}),
      })}`
    ),
  domains: () => jfetch<{ domains: string[]; counts: Record<string, number> }>("/api/domains"),
  queries: () =>
    jfetch<{
      templates: { name: string; purpose: string; template: string }[];
      template_count: number;
      max_hops_observed: number;
      avg_elapsed_seconds: number;
      runs_analyzed: number;
    }>("/api/queries"),
  evaluation: () =>
    jfetch<{
      pipelines: {
        pipeline: "kg_infused" | "vanilla" | "vanilla_qe" | "no_retrieval";
        runs: number;
        successes: number;
        failures: number;
        unverified: number;
        success_rate: number;
        with_gold: number;
        metrics: {
          em: number;
          f1: number;
          accuracy: number;
          retrieval_recall: number;
        };
        avg_elapsed_seconds: number;
      }[];
    }>("/api/evaluation"),
  verify: (question_text: string) =>
    jfetch<VerifyResponse>("/api/verify", {
      method: "POST",
      body: JSON.stringify({ question_text }),
    }),
  setVerdict: (run_id: string, verdict: Verdict | "auto") =>
    jfetch<{ run_id: string; verdict: string }>("/api/runs/verdict", {
      method: "POST",
      body: JSON.stringify({ run_id, verdict }),
    }),
  promoteQuestion: (body: {
    question_text: string;
    gold_answer: string;
    domain?: string;
    difficulty?: string;
  }) =>
    jfetch<{
      created: boolean;
      question: Question;
      rescored_runs: number;
    }>("/api/questions/promote", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
