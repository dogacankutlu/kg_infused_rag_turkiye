import { useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { RoundTrace, SeedTrace } from "../lib/api";

const ROUND_COLORS = [
  "#1E40AF", // seeds — deep blue
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#0891B2",
  "#059669",
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
      nodes.set(s.entity_id, { id: s.entity_id, label: s.name, round: 0 });
    }
    rounds.forEach((r, i) => {
      const roundIdx = i + 1;
      for (const t of r.selected_triples) {
        if (!nodes.has(t.source_id)) {
          nodes.set(t.source_id, {
            id: t.source_id,
            label: t.source_name,
            round: roundIdx,
          });
        }
        if (!nodes.has(t.target_id)) {
          nodes.set(t.target_id, {
            id: t.target_id,
            label: t.target_name,
            round: roundIdx,
          });
        }
        edges.push({
          source: t.source_id,
          target: t.target_id,
          label: t.relation,
          round: roundIdx,
        });
      }
    });

    const els = [
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
    return { elements: els, nodeCount: nodes.size, edgeCount: edges.length };
  }, [seeds, rounds]);

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
        "text-margin-y": 6,
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
        width: 1.3,
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
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
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <svg
          className="w-5 h-5 text-blue-600"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5 3h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 8h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zm0 8h14a2 2 0 0 1 2 2 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2z" />
        </svg>
        <h2 className="font-semibold text-neutral-800">Bilgi Yolu (Knowledge Path)</h2>
      </div>
      <div className="text-xs text-neutral-500 mb-3">
        Nodes: <span className="font-medium text-neutral-700">{nodeCount}</span>{" "}
        &nbsp;|&nbsp; Relations:{" "}
        <span className="font-medium text-neutral-700">{edgeCount}</span>
      </div>

      {elements.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 italic">
          No triples selected during spreading activation.
        </div>
      ) : (
        <div className="flex-1 min-h-[420px]">
          <CytoscapeComponent
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
              } as any
            }
          />
        </div>
      )}
    </div>
  );
}
