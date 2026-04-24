import type { RAGResult } from "../lib/api";

export default function AnswerBlock({ result }: { result: RAGResult }) {
  if (result.error) {
    return (
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-red-600 mb-2">
          Hata
        </div>
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">
        Nihai Cevap
      </div>
      <div className="text-2xl font-bold text-neutral-900">
        {result.answer || "—"}
      </div>
    </div>
  );
}
