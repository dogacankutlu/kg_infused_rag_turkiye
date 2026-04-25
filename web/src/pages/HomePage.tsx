import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type RAGResult } from "../lib/api";
import AnswerBlock from "../components/AnswerBlock";
import ActivationGraph from "../components/ActivationGraph";
import KGAnalysisCard from "../components/KGAnalysisCard";
import PathwayCard from "../components/PathwayCard";
import CypherQueriesCard from "../components/CypherQueriesCard";
import { Tabs } from "../App";
import { usePipeline } from "../lib/pipeline";
import { useTypewriter } from "../lib/useTypewriter";

const PLACEHOLDER_PHRASES = [
  "Ask a multi-hop question about Türkiye…",
  "Galatasaray'ın menajerinin doğum yeri neresidir?",
  "Koç Holding'in kurucusunun doğduğu şehir hangisidir?",
  "Ayasofya'nın bulunduğu şehir hangisidir?",
  "Mimar Sinan'ın doğduğu il hangisidir?",
];

const DIFFICULTY_ORDER = ["2-hop", "3-hop", "comparison"];
const DIFFICULTY_LABEL: Record<string, string> = {
  "2-hop": "2-Hop",
  "3-hop": "3-Hop",
  comparison: "Comparison",
};

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [pipeline] = usePipeline();
  const animatedPlaceholder = useTypewriter(PLACEHOLDER_PHRASES);

  const mutation = useMutation({
    mutationFn: (q: string) =>
      api.ask({ question_text: q, pipeline }),
  });

  const result = mutation.data as RAGResult | undefined;
  const hasResult = !!result;

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;
    setQuestion(trimmed);
    mutation.mutate(trimmed);
  };

  return (
    <div>
      {/* ── Search bar ── */}
      <div className="max-w-3xl mx-auto mb-5">
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="w-full pl-10 pr-4 py-3 bg-white/90 border border-orange-200 rounded-2xl
                         shadow-sm backdrop-blur-sm
                         focus:outline-none focus:ring-2 focus:ring-warm-400/40 focus:border-warm-400
                         placeholder:text-neutral-400 text-neutral-800"
              placeholder={animatedPlaceholder || " "}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(question);
                }
              }}
            />
          </div>
          <button
            className="px-5 py-3 rounded-2xl font-semibold shadow-md
                       bg-gradient-to-br from-gold-400 via-warm-500 to-warm-600
                       hover:from-gold-500 hover:via-warm-600 hover:to-warm-700
                       text-white disabled:from-neutral-300 disabled:to-neutral-300
                       disabled:cursor-not-allowed transition-all duration-150
                       active:scale-95 inline-flex items-center gap-2
                       shadow-warm-500/30"
            disabled={!question.trim() || mutation.isPending}
            onClick={() => submit(question)}
          >
            {mutation.isPending ? (
              <span className="animate-pulse">…</span>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m2 21 21-9L2 3l3 9-3 9z" />
                </svg>
                <span>Ask</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="max-w-3xl mx-auto mb-6">
        <Tabs />
      </div>

      {/* ── Error ── */}
      {mutation.error && (
        <div className="max-w-3xl mx-auto mb-4 text-sm text-red-700 bg-red-50
                        border border-red-200 rounded-xl p-3">
          {(mutation.error as Error).message}
        </div>
      )}

      {/* ── Pending ── */}
      {mutation.isPending && (
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="inline-flex items-center gap-3 text-warm-600 font-medium animate-pulse">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
            Thinking…
          </div>
        </div>
      )}

      {/* ── Landing: sample questions ── */}
      {!hasResult && !mutation.isPending && (
        <SampleQuestions onSelect={(q) => submit(q)} />
      )}

      {/* ── Results ── */}
      {result && <ResultView result={result} />}
    </div>
  );
}

/* ── Sample Questions ── */
function SampleQuestions({ onSelect }: { onSelect: (q: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["questions-all"],
    queryFn: () => api.questions(),
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-neutral-700 mb-1">
          Sample Questions
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Click any question to run it instantly.
        </p>

        {isLoading && (
          <div className="text-sm text-neutral-400 animate-pulse">Loading questions…</div>
        )}

        {data && (() => {
          // Group questions by difficulty, in canonical order.
          const groups = new Map<string, typeof data.questions>();
          for (const q of data.questions) {
            const key = q.difficulty || "other";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(q);
          }
          const orderedKeys = [
            ...DIFFICULTY_ORDER.filter((k) => groups.has(k)),
            ...Array.from(groups.keys()).filter(
              (k) => !DIFFICULTY_ORDER.includes(k)
            ),
          ];

          return (
            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {orderedKeys.map((key) => {
                const items = groups.get(key)!;
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-1.5 px-1 sticky top-0 bg-white/95 backdrop-blur-sm py-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-warm-600">
                        {DIFFICULTY_LABEL[key] || key}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        ({items.length})
                      </span>
                      <div className="flex-1 border-t border-orange-100" />
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((q) => (
                        <li key={q.question_id}>
                          <button
                            onClick={() => onSelect(q.question_text)}
                            className="w-full text-left px-3 py-2.5 rounded-xl text-sm
                                       border border-orange-100 bg-gold-50/40
                                       hover:bg-orange-50 hover:border-orange-200
                                       transition-colors group"
                          >
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-[10px] font-mono text-neutral-400 mt-0.5">
                                {q.question_id}
                              </span>
                              <span className="text-neutral-700 group-hover:text-neutral-900">
                                {q.question_text}
                              </span>
                              {q.domain && (
                                <span className="ml-auto shrink-0 chip chip-warm text-[10px]">
                                  {q.domain}
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ── Result View ── */
function ResultView({ result }: { result: RAGResult }) {
  const isVanilla = (result.pipeline || "").toLowerCase().includes("vanilla");

  return (
    <div className="space-y-5">
      {/* Row 1: Final Answer — full width */}
      <AnswerBlock result={result} />

      {isVanilla ? (
        <RetrievedPassagesCard result={result} />
      ) : (
        // Two-column layout — left column: KG Analysis + Knowledge Path,
        // right column: Pathway + Cypher Queries.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            <KGAnalysisCard
              summary={result.activation.summary}
              rounds={result.activation.rounds}
            />
            <ActivationGraph
              seeds={result.activation.seeds}
              rounds={result.activation.rounds}
            />
          </div>
          <div className="space-y-5">
            <PathwayCard subgraph={result.activation.subgraph} />
            <CypherQueriesCard />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Vanilla RAG: Retrieved Passages ── */
function RetrievedPassagesCard({ result }: { result: RAGResult }) {
  const passages = result.retrieval.deduped;
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-1">
        Retrieved Passages
      </h2>
      <p className="text-xs text-neutral-500 mb-4">
        BM25 retrieval over Türkiye-filtered descriptions ·{" "}
        <span className="font-semibold text-warm-600">{passages.length}</span>{" "}
        passages used for answer generation.
      </p>

      {passages.length === 0 ? (
        <div className="text-sm text-neutral-500 italic">
          No passages retrieved.
        </div>
      ) : (
        <ol className="space-y-3">
          {passages.map((p, i) => (
            <li
              key={p.entity_id + i}
              className="border border-orange-100 rounded-xl overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gold-50/60 border-b border-orange-100">
                <div className="text-sm font-semibold text-neutral-800">
                  {i + 1}. {p.title}
                </div>
                <span className="chip chip-warm text-[10px]">
                  score {p.score.toFixed(2)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-700 px-4 py-3 bg-white">
                {p.text.length > 600 ? p.text.slice(0, 600) + "…" : p.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
