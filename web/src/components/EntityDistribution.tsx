import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RoundTrace, SeedTrace } from "../lib/api";

export default function EntityDistribution({
  seeds,
  rounds,
}: {
  seeds: SeedTrace[];
  rounds: RoundTrace[];
}) {
  const data = [
    { round: "seed", entities: seeds.length, triples: 0 },
    ...rounds.map((r, i) => {
      const entitiesThisRound = new Set<string>();
      for (const t of r.selected_triples) {
        entitiesThisRound.add(t.source_id);
        entitiesThisRound.add(t.target_id);
      }
      return {
        round: `r${i + 1}`,
        entities: entitiesThisRound.size,
        triples: r.selected_triples.length,
      };
    }),
  ];

  return (
    <div className="card p-4" style={{ height: 240 }}>
      <div className="text-sm font-semibold mb-2">Entity & triple distribution per round</div>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="round" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="entities" fill="#E30A17" radius={[4, 4, 0, 0]} />
          <Bar dataKey="triples" fill="#737373" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
