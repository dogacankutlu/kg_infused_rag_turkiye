"""Incrementally load the Türkiye-filtered subgraph into Neo4j.

Reads from `data/processed/`:
  turkiye_entities.jsonl
  turkiye_triples.tsv
"""
from __future__ import annotations

import json
from pathlib import Path

from tqdm import tqdm

from config import settings

from .neo4j_client import Neo4jClient, normalize_relation


BATCH_SIZE = 5000


def _batched(iterable, size):
    batch = []
    for x in iterable:
        batch.append(x)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _load_entities(client: Neo4jClient, path: Path) -> int:
    with path.open("r", encoding="utf-8") as f:
        rows = (json.loads(line) for line in f)
        count = 0
        for batch in _batched(rows, BATCH_SIZE):
            with client.session() as s:
                s.execute_write(
                    lambda tx: tx.run(
                        """
                        UNWIND $rows AS row
                        MERGE (e:Entity {entityId: row.entity_id})
                        SET e.name = row.name,
                            e.description = row.description,
                            e.aliases = row.aliases
                        """,
                        rows=batch,
                    )
                )
            count += len(batch)
            tqdm.write(f"entities loaded: {count:,}")
    return count


def _load_triples(client: Neo4jClient, path: Path) -> int:
    grouped: dict[str, list[dict]] = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            s, r, o, label = parts[0], parts[1], parts[2], parts[3]
            rel_type = normalize_relation(label)
            grouped.setdefault(rel_type, []).append(
                {"src": s, "tgt": o, "rel_id": r, "rel_label": label}
            )

    total = 0
    for rel_type, rows in tqdm(grouped.items(), desc="relation types"):
        for batch in _batched(rows, BATCH_SIZE):
            cypher = (
                "UNWIND $rows AS row "
                "MATCH (s:Entity {entityId: row.src}) "
                "MATCH (t:Entity {entityId: row.tgt}) "
                f"MERGE (s)-[r:`{rel_type}`]->(t) "
                "SET r.relationId = row.rel_id, r.label = row.rel_label"
            )
            with client.session() as s:
                s.execute_write(lambda tx: tx.run(cypher, rows=batch))
            total += len(batch)
    return total


def load(
    processed_dir: Path | None = None,
    client: Neo4jClient | None = None,
) -> dict:
    processed_dir = processed_dir or settings.processed_path
    entities_file = processed_dir / "turkiye_entities.jsonl"
    triples_file = processed_dir / "turkiye_triples.tsv"

    if not entities_file.exists() or not triples_file.exists():
        raise FileNotFoundError(
            "Run `python -m src.cli extract-turkiye` first to produce filtered artifacts."
        )

    owns_client = client is None
    client = client or Neo4jClient()
    try:
        print("Ensuring indexes...")
        client.ensure_indexes()

        print(f"Loading entities from {entities_file}...")
        n_entities = _load_entities(client, entities_file)

        print(f"Loading triples from {triples_file}...")
        n_triples = _load_triples(client, triples_file)

        return {"entities_loaded": n_entities, "triples_loaded": n_triples}
    finally:
        if owns_client:
            client.close()


if __name__ == "__main__":
    print(load())
