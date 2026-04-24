"""Rich-based console renderer — the ONLY module importing `rich`.

All data comes from trace dataclasses via to_dict(); removing this file does
not break any business logic. A future web UI reads the same dataclasses.
"""
from __future__ import annotations

from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

from .models import RAGResult


_console = Console()


def render_result(result: RAGResult) -> None:
    q = result.question
    header = f"[bold]Question[/] {q.question_id}  ([cyan]{q.difficulty}[/], [magenta]{q.domain}[/])"
    _console.print(Rule(header))
    _console.print(f"[bold]Q:[/]    {q.question_text}")
    if q.gold_answer:
        _console.print(f"[bold]Gold:[/] {q.gold_answer}")
    if q.reasoning_path:
        _console.print(
            "[bold]Reasoning path:[/] " + " → ".join(q.reasoning_path)
        )

    if result.error:
        _console.print(Panel(result.error, title="[red]Error[/]", style="red"))
        return

    _console.print(Rule("Seed entities (k={})".format(len(result.activation.seeds))))
    table = Table(show_header=True, header_style="bold")
    table.add_column("entity_id", no_wrap=True)
    table.add_column("name")
    table.add_column("score", justify="right")
    table.add_column("bm25", justify="right")
    table.add_column("embed", justify="right")
    table.add_column("aliases matched")
    for s in result.activation.seeds:
        table.add_row(
            s.entity_id,
            s.name,
            f"{s.score:.3f}",
            f"{s.bm25_score:.3f}",
            f"{s.embed_score:.3f}",
            ", ".join(s.matched_aliases) or "-",
        )
    _console.print(table)

    _console.print(Rule("Spreading activation"))
    for r in result.activation.rounds:
        header = (
            f"Round {r.round_number}  frontier={len(r.frontier)}  "
            f"candidates={r.candidate_triples}  selected={len(r.selected_triples)}"
        )
        _console.print(f"[bold]{header}[/]")
        for t in r.selected_triples:
            _console.print(
                f"    {t.source_name} --[{t.relation}]--> {t.target_name}  [dim]({t.target_id})[/]"
            )
        if r.stopped:
            _console.print(f"    [yellow]stopped: {r.stop_reason}[/]")

    if result.activation.summary:
        _console.print(
            Panel(result.activation.summary, title="KG summary", border_style="blue")
        )

    _console.print(Rule("Retrieval"))
    rt = result.retrieval
    _console.print(f"[bold]Original query:[/] {rt.original_query}")
    _console.print(f"[bold]Expanded query:[/] {rt.expanded_query}")
    retrieval_table = Table(show_header=True, header_style="bold")
    retrieval_table.add_column("source")
    retrieval_table.add_column("entity_id")
    retrieval_table.add_column("title")
    retrieval_table.add_column("score", justify="right")
    retrieval_table.add_column("snippet")
    for p in rt.deduped:
        snippet = (p.text[:110] + "…") if len(p.text) > 110 else p.text
        retrieval_table.add_row(
            p.source_query, p.entity_id, p.title, f"{p.score:.2f}", snippet
        )
    _console.print(retrieval_table)

    _console.print(Rule("Answer"))
    _console.print(f"[bold]System:[/] {result.answer}")
    if q.gold_answer:
        m = result.metrics
        match_glyph = "[green]✓[/]" if (m and m.em >= 1.0) else "[red]✗[/]"
        _console.print(f"[bold]Gold:[/]   {q.gold_answer}   {match_glyph}")
        if m:
            _console.print(
                f"EM={m.em:.2f}  F1={m.f1:.2f}  Acc={m.accuracy:.2f}  "
                f"Retrieval-Recall={m.retrieval_recall:.2f}"
            )

    _console.print(
        f"[dim]elapsed {result.elapsed_seconds}s — pipeline={result.pipeline}[/]"
    )


def render_eval_summary(rows: list[dict], aggregate: dict) -> None:
    _console.print(Rule("Evaluation Summary"))
    table = Table(show_header=True, header_style="bold")
    table.add_column("group")
    table.add_column("n", justify="right")
    table.add_column("Acc", justify="right")
    table.add_column("F1", justify="right")
    table.add_column("EM", justify="right")
    table.add_column("Retrieval-Recall", justify="right")
    for row in rows:
        table.add_row(
            row["group"],
            str(row["n"]),
            f"{row['accuracy']:.3f}",
            f"{row['f1']:.3f}",
            f"{row['em']:.3f}",
            f"{row['retrieval_recall']:.3f}",
        )
    _console.print(table)
    _console.print(
        f"[bold]Overall:[/] Acc={aggregate['accuracy']:.3f}  "
        f"F1={aggregate['f1']:.3f}  EM={aggregate['em']:.3f}  "
        f"RR={aggregate['retrieval_recall']:.3f}  (n={aggregate['n']})"
    )


def println(msg: str) -> None:
    _console.print(msg)
