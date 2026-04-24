import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type RAGResult } from "../lib/api";
import AnswerBlock from "../components/AnswerBlock";
import ActivationGraph from "../components/ActivationGraph";
import KnowledgeGraphAnalysis from "../components/KnowledgeGraphAnalysis";
import { Tabs } from "../App";

export default function HomePage() {
  const [question, setQuestion] = useState("");

  const mutation = useMutation({
    mutationFn: (q: string) => api.ask({ question_text: q }),
  });

  const result = mutation.data as RAGResult | undefined;

  const submit = () => {
    const q = question.trim();
    if (!q || mutation.isPending) return;
    mutation.mutate(q);
  };

  return (
    <div>
      {/* Search bar */}
      <div className="max-w-3xl mx-auto mb-5">
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
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
              className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl shadow-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                         placeholder:text-neutral-400"
              placeholder="In which country is Fenerbahce S.K.'s home venue located?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <button
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                       font-semibold shadow-sm disabled:bg-neutral-300 disabled:cursor-not-allowed
                       inline-flex items-center gap-2"
            disabled={!question.trim() || mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending ? (
              <span>...</span>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="m2 21 21-9L2 3l3 9-3 9z" />
                </svg>
                <span>Sor</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto mb-6">
        <Tabs />
      </div>

      {/* Error */}
      {mutation.error && (
        <div className="max-w-3xl mx-auto mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {(mutation.error as Error).message}
        </div>
      )}

      {/* Pending */}
      {mutation.isPending && (
        <div className="max-w-3xl mx-auto text-center text-neutral-500 py-10">
          <div className="animate-pulse">Thinking…</div>
        </div>
      )}

      {/* Result */}
      {result && <ResultView result={result} />}
    </div>
  );
}

function ResultView({ result }: { result: RAGResult }) {
  return (
    <div className="space-y-5">
      {/* Final answer — full width, under the search */}
      <AnswerBlock result={result} />

      {/* Analysis (left) + Knowledge Path (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <KnowledgeGraphAnalysis
          summary={result.activation.summary}
          subgraph={result.activation.subgraph}
          rounds={result.activation.rounds}
        />
        <ActivationGraph
          seeds={result.activation.seeds}
          rounds={result.activation.rounds}
        />
      </div>
    </div>
  );
}
