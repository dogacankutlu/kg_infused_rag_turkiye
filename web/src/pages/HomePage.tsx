import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type RAGResult } from "../lib/api";
import SeedCards from "../components/SeedCards";
import ActivationGraph from "../components/ActivationGraph";
import EntityDistribution from "../components/EntityDistribution";
import AnswerBlock from "../components/AnswerBlock";
import Section from "../components/Section";

const EXAMPLES = [
  "Galatasaray'ın teknik direktörünün doğum yeri neresidir?",
  "Koç Holding'in kurucusunun doğum yeri neresidir?",
  "Kış Uykusu filminin yönetmeninin uyruğu nedir?",
];

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [gold, setGold] = useState("");
  const [domain, setDomain] = useState("");
  const [difficulty, setDifficulty] = useState("2-hop");

  const mutation = useMutation({
    mutationFn: (body: {
      question_text: string;
      gold_answer: string;
      domain: string;
      difficulty: string;
    }) => api.ask(body),
  });

  const result = mutation.data as RAGResult | undefined;

  return (
    <div>
      <div className="card p-5 mb-6">
        <h1 className="text-xl font-semibold mb-1">Ask a Türkiye question</h1>
        <p className="text-sm text-neutral-500 mb-4">
          Turkish questions work best — the pipeline retrieves over the Türkiye-reachable
          Wikidata5M subgraph.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input
            className="input md:col-span-2"
            placeholder="Ör: Galatasaray'ın teknik direktörünün doğum yeri neresidir?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && question.trim()) {
                e.preventDefault();
                mutation.mutate({ question_text: question, gold_answer: gold, domain, difficulty });
              }
            }}
          />
          <input
            className="input"
            placeholder="Gold answer (optional)"
            value={gold}
            onChange={(e) => setGold(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Domain (football, cinema, …)"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <select
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="2-hop">2-hop</option>
              <option value="3-hop">3-hop</option>
              <option value="comparison">comparison</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-primary"
            disabled={!question.trim() || mutation.isPending}
            onClick={() =>
              mutation.mutate({ question_text: question, gold_answer: gold, domain, difficulty })
            }
          >
            {mutation.isPending ? "Thinking…" : "Ask"}
          </button>
          <span className="text-xs text-neutral-500 ml-2">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="chip hover:bg-neutral-200"
              onClick={() => setQuestion(ex)}
            >
              {ex.length > 40 ? ex.slice(0, 38) + "…" : ex}
            </button>
          ))}
        </div>

        {mutation.error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {(mutation.error as Error).message}
          </div>
        )}
      </div>

      {result && <ResultView result={result} />}
    </div>
  );
}

function ResultView({ result }: { result: RAGResult }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <AnswerBlock result={result} />
        </div>
        <EntityDistribution seeds={result.activation.seeds} rounds={result.activation.rounds} />
      </div>

      <Section title="Seed entities">
        <SeedCards seeds={result.activation.seeds} />
      </Section>

      <Section title="Spreading activation">
        <ActivationGraph
          seeds={result.activation.seeds}
          rounds={result.activation.rounds}
        />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-2">Rounds</h3>
            <ul className="space-y-2 text-sm">
              {result.activation.rounds.map((r) => (
                <li key={r.round_number}>
                  <div className="flex items-center gap-2">
                    <span className="chip chip-red">round {r.round_number}</span>
                    <span className="text-neutral-500 text-xs">
                      frontier={r.frontier.length} · candidates={r.candidate_triples} ·
                      selected={r.selected_triples.length}
                    </span>
                  </div>
                  {r.stopped && (
                    <div className="text-xs text-neutral-500 ml-2 italic">
                      stopped: {r.stop_reason}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-2">KG summary</h3>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">
              {result.activation.summary || "—"}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Retrieval">
        <div className="card p-4">
          <div className="flex flex-wrap gap-2 text-xs mb-3">
            <span className="chip">original: {result.retrieval.original_hits.length}</span>
            <span className="chip">expanded: {result.retrieval.expanded_hits.length}</span>
            <span className="chip chip-red">deduped: {result.retrieval.deduped.length}</span>
          </div>
          {result.retrieval.expanded_query && (
            <div className="text-sm text-neutral-600 mb-3">
              <span className="font-medium">Expanded query:</span>{" "}
              {result.retrieval.expanded_query}
            </div>
          )}
          <ul className="space-y-2">
            {result.retrieval.deduped.slice(0, 10).map((p, i) => (
              <li key={i} className="border border-neutral-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{p.title || p.entity_id}</span>
                  <div className="flex gap-1">
                    <span className="chip">{p.source_query}</span>
                    <span className="chip">score {p.score.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-xs text-neutral-600 line-clamp-3">{p.text}</div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Notes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">Passage note</h3>
            <p className="text-sm whitespace-pre-wrap text-neutral-700">
              {result.passage_note || "—"}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">Enhanced note (KG-augmented)</h3>
            <p className="text-sm whitespace-pre-wrap text-neutral-700">
              {result.enhanced_note || "—"}
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
