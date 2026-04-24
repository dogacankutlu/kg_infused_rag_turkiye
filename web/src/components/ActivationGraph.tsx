import { useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { RoundTrace, SeedTrace } from "../lib/api";

const ROUND_COLORS = [
  "#E30A17", // seeds — Türkiye red
  "#2563EB",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
];

export default function ActivationGraph({
  seeds,
  rounds,
}: {
  seeds: SeedTrace[];
  rounds: RoundTrace[];
}) {
  const elements = useMemo(() => {
    const nodes = new Map<string, { id: string; label: string; round: number }>();
    const edges: { source: string; target: string; label: string; round: number }[] = [];

    for (const s of seeds) {
      nodes.set(s.entity_id, { id: s.entity_id, label: s.name, round: 0 });
    }
    rounds.forEach((r, i) => {
      const roundIdx = i + 1;
      for (const t of r.selected_triples) {
        if (!nodes.has(t.source_id)) {
          nodes.set(t.source_id, { id: t.source_id, label: t.source_name, round: roundIdx });
        }
        if (!nodes.has(t.target_id)) {
          nodes.set(t.target_id, { id: t.target_id, label: t.target_name, round: roundIdx });
        }
        edges.push({
          source: t.source_id,
          target: t.target_id,
          label: t.relation,
          round: roundIdx,
        });
      }
    });

    return [
      ...Array.from(nodes.values()).map((n) => ({
        data: { id: n.id, label: n.label, round: n.round },
      })),
      ...edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          label: e.label,
          round: e.round,
        },
      })),
    ];
  }, [seeds, rounds]);

  if (elements.length === 0) {
    return (
      <div className="text-sm text-neutral-500 italic">
        No triples selected during spreading activation.
      </div>
    );
  }

  const stylesheet: any = [
    {
      selector: "node",
      style: {
        "background-color": (ele: any) =>
          ROUND_COLORS[ele.data("round") % ROUND_COLORS.length],
        label: "data(label)",
        color: "#1f2937",
        "font-size": "10px",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-background-color": "#fff",
        "text-background-opacity": 0.9,
        "text-background-padding": "2px",
        width: 18,
        height: 18,
        "border-width": 2,
        "border-color": "#fff",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#d4d4d8",
        "target-arrow-color": "#d4d4d8",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "8px",
        color: "#6b7280",
        "text-background-color": "#fff",
        "text-background-opacity": 0.85,
        "text-background-padding": "1px",
      },
    },
  ];

  return (
    <div className="card p-2" style={{ height: 420 }}>
      <CytoscapeComponent
        elements={elements}
        style={{ width: "100%", height: "100%" }}
        stylesheet={stylesheet}
        layout={{ name: "cose", animate: false, padding: 30, nodeRepulsion: 8000 } as any}
      />
      <div className="flex flex-wrap gap-2 px-2 pt-2 text-xs">
        <span className="chip" style={{ borderLeft: `3px solid ${ROUND_COLORS[0]}` }}>
          seed
        </span>
        {rounds.map((_, i) => (
          <span
            key={i}
            className="chip"
            style={{
              borderLeft: `3px solid ${ROUND_COLORS[(i + 1) % ROUND_COLORS.length]}`,
            }}
          >
            round {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
