// Visual contract: identical chrome to PathwayCard and CypherQueriesCard —
// same `.card` background/border/shadow/border-radius and `p-5` padding,
// same warm-orange section heading, no gradient backgrounds, no decorative
// side bar. Keeps the trio visually consistent in the two-column result grid.

export default function KGAnalysisCard({ summary }: { summary: string }) {
  return (
    <div className="card p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-warm-500 mb-3">
        Knowledge Graph Analysis
      </h2>
      {summary ? (
        <p className="text-sm text-neutral-700 leading-relaxed">
          {summary}
        </p>
      ) : (
        <p className="text-sm text-neutral-500 italic">No summary generated.</p>
      )}
    </div>
  );
}
