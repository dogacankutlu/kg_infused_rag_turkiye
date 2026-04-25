import type { RAGResult } from "../lib/api";

export default function AnswerBlock({ result }: { result: RAGResult }) {
  if (result.error) {
    return (
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2">
          Error
        </div>
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 border-l-4 border-l-warm-500">
      <div className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-2">
        Final Answer
      </div>
      <div className="text-3xl font-bold text-neutral-900">
        {result.answer || "—"}
      </div>
    </div>
  );
}
