import { useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { RoundTrace, SeedTrace } from "../lib/api";
import { prettyName, prettyRelation } from "../lib/prettyName";

const ROUND_COLORS = [
  "#EA580C",
  "#F97316",
  "#FB923C",
  "#FBBF24",
  "#F59E0B",
  "#D97706",
  "#C2410C",
];

export default function ActivationGraph({
  seeds,
  rounds,
}: {
  seeds: SeedTrace[];
  rounds: RoundTrace[];
}) {
  const { elements, nodeCount, edgeCount } = useMemo(() => {
    const nodes = new Map<string, { id: string; label: string; round: number }>();
    const edges: { source: string; target: string; label: string; round: number }[] = [];

    for (const s of seeds) {
      nodes.set(s.entity_id, { id: s.entity_id, label: prettyName(s.name), round: 0 });
    }
    rounds.forEach((r, i) => {
      const idx = i + 1;
      for (const t of r.selected_triples) {
        if (!nodes.has(t.source_id))
          nodes.set(t.source_id, {
            id: t.source_id,
            label: prettyName(t.source_name),
            round: idx,
          });
        if (!nodes.has(t.target_id))
          nodes.set(t.target_id, {
            id: t.target_id,
            label: prettyName(t.target_name),
            round: idx,
          });
        edges.push({
          source: t.source_id,
          target: t.target_id,
          label: prettyRelation(t.relation),
          round: idx,
        });
      }
    });

    return {
      elements: [
        ...Array.from(nodes.values()).map((n) => ({
          data: { id: n.id, label: n.label, round: n.round },
        })),
        ...edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.source, target: e.target, label: e.label, round: e.round },
        })),
      ],
      nodeCount: nodes.size,
      edgeCount: edges.length,
    };
  }, [seeds, rounds]);

  const stylesheet: any = [
    {
      selector: "node",
      style: {
        "background-color": (ele: any) =>
          ROUND_COLORS[ele.data("round") % ROUND_COLORS.length],
        label: "data(label)",
        color: "#374151",
        "font-size": "10px",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "text-background-color": "#fffbeb",
        "text-background-opacity": 0.9,
        "text-background-padding": "2px",
        width: 20,
        height: 20,
        "border-width": 2.5,
        "border-color": "#ffffff",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#fed7aa",
        "target-arrow-color": "#fb923c",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "8px",
        color: "#78350f",
        "text-background-color": "#fffbeb",
        "text-background-opacity": 0.9,
        "text-background-padding": "1px",
      },
    },
  ];

  return (
    <div className="card p-5 flex flex-col">
      <h2 className="font-semibold text-neutral-800 mb-1">Knowledge Path</h2>
      <div className="text-xs text-neutral-500 mb-3">
        Nodes:{" "}
        <span className="font-semibold text-warm-600">{nodeCount}</span>
        &nbsp;·&nbsp;Relations:{" "}
        <span className="font-semibold text-warm-600">{edgeCount}</span>
      </div>

      {rounds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="chip text-[10px]" style={{ borderLeft: `3px solid ${ROUND_COLORS[0]}` }}>
            seed
          </span>
          {rounds.map((_, i) => (
            <span
              key={i}
              className="chip text-[10px]"
              style={{ borderLeft: `3px solid ${ROUND_COLORS[(i + 1) % ROUND_COLORS.length]}` }}
            >
              round {i + 1}
            </span>
          ))}
        </div>
      )}

      {elements.length === 0 ? (
        <div className="h-[420px] flex items-center justify-center text-sm text-neutral-500 italic">
          No triples selected during spreading activation.
        </div>
      ) : (
        // Explicit height so Cytoscape has a measurable container at mount
        // time. Width auto-fills the column.
        <div
          className="w-full rounded-xl border border-orange-100 bg-warm-50/30"
          style={{ height: 460 }}
        >
          <CytoscapeComponent
            key={elements.length}
            elements={elements}
            style={{ width: "100%", height: "100%" }}
            stylesheet={stylesheet}
            layout={
              {
                name: "cose",
                animate: false,
                padding: 30,
                nodeRepulsion: 9000,
                idealEdgeLength: 80,
                fit: true,
              } as any
            }
          />
        </div>
      )}
    </div>
  );
}
