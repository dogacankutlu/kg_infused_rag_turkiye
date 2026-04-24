import type { RAGResult } from "../lib/api";

export default function AnswerBlock({ result }: { result: RAGResult }) {
  const m = result.metrics;
  const ok = result.verdict === "success";
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">Answer</h3>
        <span
          className={`chip ${
            ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {ok ? "success" : "failure"}
        </span>
      </div>
      {result.error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {result.error}
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
              System
            </div>
            <div className="text-2xl font-bold text-turkiye-red-dark">{result.answer || "—"}</div>
          </div>
          {result.question.gold_answer && (
            <div className="mb-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                Gold
              </div>
              <div className="text-lg">{result.question.gold_answer}</div>
            </div>
          )}
          {m && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="chip">EM {m.em.toFixed(2)}</span>
              <span className="chip">F1 {m.f1.toFixed(2)}</span>
              <span className="chip">Acc {m.accuracy.toFixed(2)}</span>
              <span className="chip">RR {m.retrieval_recall.toFixed(2)}</span>
              <span className="chip">⏱ {result.elapsed_seconds.toFixed(2)}s</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
