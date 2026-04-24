from __future__ import annotations

import json
import uuid

import click

from config import settings
from src.eval import Evaluator, score_result
from src.kg import Neo4jClient
from src.kg.loader import load as load_into_neo4j
from src.kg.seed_finder import SeedFinder
from src.kg.turkey_extractor import extract as extract_turkiye
from src.llm import get_llm_client
from src.logging_utils import RunLogger
from src.rag import KGInfusedRAG
from src.rag.passage_retriever import PassageRetriever
from src.trace import Question
from src.trace.console import println, render_eval_summary, render_result


@click.group(help="KG-Infused RAG CLI — Türkiye domain.")
def cli():
    pass


@cli.command("check-neo4j", help="Verify Neo4j connectivity.")
def check_neo4j():
    client = Neo4jClient()
    try:
        ok = client.verify_connection()
        println("[green]Neo4j Connected![/]" if ok else "[red]Neo4j check failed[/]")
    finally:
        client.close()


@cli.command("extract-turkiye", help="Filter Wikidata5M raw files to a Türkiye-reachable subset.")
@click.option("--max-hops", type=int, default=None)
def extract_cmd(max_hops):
    stats = extract_turkiye(max_hops=max_hops)
    println(
        f"[green]done[/]  entities={stats['total_entities']:,}  "
        f"triples={stats['total_triples']:,}"
    )


@cli.command("load-neo4j", help="Load the filtered Türkiye subgraph into Neo4j.")
def load_cmd():
    result = load_into_neo4j()
    println(
        f"[green]loaded[/]  entities={result['entities_loaded']:,}  "
        f"triples={result['triples_loaded']:,}"
    )


@cli.command("stats", help="Print dataset + Neo4j statistics.")
def stats_cmd():
    stats_file = settings.processed_path / "stats.json"
    if stats_file.exists():
        stats = json.loads(stats_file.read_text(encoding="utf-8"))
        println(f"[bold]Filtered dataset ({stats_file})[/]")
        println(f"  entities : {stats.get('total_entities', 0):,}")
        println(f"  triples  : {stats.get('total_triples', 0):,}")
        println("  top relations:")
        for label, freq in stats.get("top_relations", [])[:10]:
            println(f"    {label:<40} {freq:,}")
    try:
        client = Neo4jClient()
        println(
            f"[bold]Neo4j live[/]  entities={client.entity_count():,}  "
            f"relations={client.relation_count():,}"
        )
        client.close()
    except Exception as e:
        println(f"[yellow]Neo4j check skipped:[/] {e}")


def _build_pipeline() -> KGInfusedRAG:
    llm = get_llm_client()
    neo4j = Neo4jClient()
    seed_finder = SeedFinder()
    retriever = PassageRetriever()
    return KGInfusedRAG(llm=llm, neo4j=neo4j, seed_finder=seed_finder, retriever=retriever)


@cli.command("ask", help="Ask a single Türkiye question.")
@click.argument("question", type=str)
@click.option("--gold", type=str, default="", help="Optional gold answer for metrics.")
@click.option("--domain", type=str, default="")
@click.option("--difficulty", type=str, default="2-hop")
@click.option("--reasoning", type=str, default="", help="Pipe-separated reasoning steps.")
def ask_cmd(question, gold, domain, difficulty, reasoning):
    pipeline = _build_pipeline()
    q = Question(
        question_id=f"ad-hoc-{uuid.uuid4().hex[:6]}",
        question_text=question,
        gold_answer=gold,
        domain=domain,
        difficulty=difficulty,
        reasoning_path=[s.strip() for s in reasoning.split("|") if s.strip()],
    )
    result = pipeline.answer(q)
    score_result(result)
    RunLogger().log_attempt(result)
    render_result(result)


@cli.command("interactive", help="REPL for asking Türkiye questions.")
def interactive_cmd():
    pipeline = _build_pipeline()
    logger = RunLogger()
    println("[bold]Interactive mode[/] — type a Türkiye question, 'quit' to exit.")
    while True:
        try:
            text = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            println("\nbye")
            return
        if not text:
            continue
        if text.lower() in {"quit", "exit"}:
            return
        q = Question(
            question_id=f"repl-{uuid.uuid4().hex[:6]}",
            question_text=text,
        )
        result = pipeline.answer(q)
        score_result(result)
        logger.log_attempt(result)
        render_result(result)


@cli.command("eval", help="Run evaluation over the full QA dataset.")
@click.option("--questions-file", type=click.Path(), default=None)
@click.option("--limit", type=int, default=0, help="If >0, only evaluate first N questions.")
def eval_cmd(questions_file, limit):
    pipeline = _build_pipeline()
    evaluator = Evaluator(pipeline)
    from pathlib import Path
    qpath = Path(questions_file) if questions_file else settings.questions_path
    questions = evaluator.load_questions(qpath)
    if limit > 0:
        questions = questions[:limit]
    run = evaluator.run(questions=questions, render_each=render_result)
    render_eval_summary(run["groups"], run["aggregate"])


@cli.command("serve", help="Start the FastAPI web server (for the web UI).")
@click.option("--host", default="127.0.0.1")
@click.option("--port", default=8000, type=int)
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev).")
def serve_cmd(host, port, reload):
    import uvicorn

    uvicorn.run("src.web.app:app", host=host, port=port, reload=reload)
