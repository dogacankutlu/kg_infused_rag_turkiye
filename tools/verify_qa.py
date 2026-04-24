"""Verify that the reasoning path of each question in turkiye_qa.json exists in Neo4j.

Prints PASS/FAIL per question. Run BEFORE trusting the dataset for eval —
the assignment rule (§10.1) is: verify every path in the dataset before writing.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from config import settings
from src.kg.neo4j_client import Neo4jClient


def _find_entity_id(client: Neo4jClient, name: str) -> str | None:
    rows = client.run(
        "MATCH (e:Entity) WHERE toLower(e.name) = toLower($name) "
        "OR $name IN e.aliases RETURN e.entityId AS id LIMIT 1",
        name=name,
    )
    if rows:
        return rows[0]["id"]
    rows = client.fulltext_search(name, limit=1)
    return rows[0]["id"] if rows else None


def _path_exists(client: Neo4jClient, steps: list[str]) -> bool:
    # steps is interleaved: entity, relation, entity, relation, entity, ...
    if len(steps) < 3 or len(steps) % 2 == 0:
        return False
    entity_ids = []
    for name in steps[::2]:
        eid = _find_entity_id(client, name)
        if not eid:
            return False
        entity_ids.append(eid)
    relations = steps[1::2]
    for i, rel in enumerate(relations):
        rel_norm = rel.upper().replace(" ", "_").replace("-", "_")
        rows = client.run(
            f"MATCH (a:Entity {{entityId:$src}})-[r:`{rel_norm}`]->(b:Entity {{entityId:$tgt}}) "
            "RETURN count(r) AS n",
            src=entity_ids[i],
            tgt=entity_ids[i + 1],
        )
        if not rows or rows[0]["n"] == 0:
            return False
    return True


def main():
    qa_path = settings.questions_path
    questions = json.loads(qa_path.read_text(encoding="utf-8"))
    client = Neo4jClient()
    try:
        passed = failed = 0
        failed_ids = []
        for q in questions:
            ok = _path_exists(client, q.get("reasoning_path", []))
            flag = "PASS" if ok else "FAIL"
            print(f"{flag}  {q['question_id']}  {q['question_text']}")
            if ok:
                passed += 1
            else:
                failed += 1
                failed_ids.append(q["question_id"])
        print(f"\n{passed} passed, {failed} failed.")
        if failed:
            print("failed:", ", ".join(failed_ids))
            sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
