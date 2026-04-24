"""Pre-filter Wikidata5M raw files to a Türkiye-reachable subgraph.

Reads from `data/raw/` (user extracts the two tar.gz archives there):
  wikidata5m_all_triplet.txt  — tab-separated  subject<TAB>relation<TAB>object
  wikidata5m_entity.txt       — tab-separated  entity_id<TAB>alias1<TAB>alias2...
  wikidata5m_relation.txt     — tab-separated  relation_id<TAB>alias1<TAB>...
  wikidata5m_text.txt         — tab-separated  entity_id<TAB>description

Writes to `data/processed/`:
  turkiye_entities.jsonl
  turkiye_triples.tsv         — subject  relation  object  relation_label
  turkiye_text.tsv            — entity_id  description
  turkiye_aliases.tsv         — entity_id  alias1  alias2 ...
  stats.json
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

from tqdm import tqdm

from config import settings


SEED_RELATIONS = {
    "P17",   # country
    "P27",   # country of citizenship
    "P159",  # headquarters location
    "P19",   # place of birth
    "P131",  # located in the administrative territorial entity
    "P276",  # location
    "P495",  # country of origin
    "P1001", # applies to jurisdiction
    "P625",  # coordinate location (rare link)
    "P569",  # date of birth  — kept so birth year appears as a KG edge
    "P570",  # date of death
    "P571",  # inception (founding date for clubs, companies, etc.)
    "P577",  # publication date
}

TURKIYE_KEYWORDS = [
    "türkiye", "turkey", "turkish",
    "istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya",
    "anatolia", "ottoman", "turkic",
]


def _read_aliases(path: Path) -> dict[str, list[str]]:
    aliases: dict[str, list[str]] = {}
    with path.open("r", encoding="utf-8") as f:
        for line in tqdm(f, desc=f"aliases: {path.name}"):
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            aliases[parts[0]] = parts[1:]
    return aliases


def _read_descriptions(path: Path) -> dict[str, str]:
    descriptions: dict[str, str] = {}
    with path.open("r", encoding="utf-8") as f:
        for line in tqdm(f, desc=f"descriptions: {path.name}"):
            parts = line.rstrip("\n").split("\t", 1)
            if len(parts) == 2:
                descriptions[parts[0]] = parts[1]
    return descriptions


def _read_relations(path: Path) -> dict[str, str]:
    rels: dict[str, str] = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                rels[parts[0]] = parts[1]
    return rels


def _iter_triples(path: Path) -> Iterable[tuple[str, str, str]]:
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 3:
                yield parts[0], parts[1], parts[2]


def _matches_turkiye_keyword(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in TURKIYE_KEYWORDS)


def extract(
    raw_dir: Path | None = None,
    processed_dir: Path | None = None,
    max_hops: int | None = None,
    turkiye_id: str | None = None,
) -> dict:
    raw_dir = raw_dir or settings.raw_path
    processed_dir = processed_dir or settings.processed_path
    processed_dir.mkdir(parents=True, exist_ok=True)

    max_hops = max_hops if max_hops is not None else settings.extraction_max_hops
    turkiye_id = turkiye_id or settings.turkiye_entity_id

    # Support both flat layout (all files directly in raw_dir) and the
    # nested layout produced by the provided archives:
    #   raw_dir/wikidata5m_raw_data/wikidata5m_all_triplet.txt
    #   raw_dir/wikidata5m_raw_data/wikidata5m_text.txt
    #   raw_dir/wikidata5m_raw_data/wikidata5m_alias/wikidata5m_entity.txt
    #   raw_dir/wikidata5m_raw_data/wikidata5m_alias/wikidata5m_relation.txt
    raw_data_dir = raw_dir / "wikidata5m_raw_data"
    alias_dir = raw_data_dir / "wikidata5m_alias"

    def _find(filename: str, *candidates) -> Path:
        for p in candidates:
            if Path(p).exists():
                return Path(p)
        raise FileNotFoundError(
            f"Cannot find {filename}. Expected one of:\n"
            + "\n".join(f"  {p}" for p in candidates)
        )

    triples_path  = _find("wikidata5m_all_triplet.txt",
                          raw_dir / "wikidata5m_all_triplet.txt",
                          raw_data_dir / "wikidata5m_all_triplet.txt")
    aliases_path  = _find("wikidata5m_entity.txt",
                          raw_dir / "wikidata5m_entity.txt",
                          alias_dir / "wikidata5m_entity.txt")
    relations_path = _find("wikidata5m_relation.txt",
                           raw_dir / "wikidata5m_relation.txt",
                           alias_dir / "wikidata5m_relation.txt")
    text_path     = _find("wikidata5m_text.txt",
                          raw_dir / "wikidata5m_text.txt",
                          raw_data_dir / "wikidata5m_text.txt")

    print("[1/5] Loading aliases, relations, descriptions...")
    aliases = _read_aliases(aliases_path)
    relations = _read_relations(relations_path)
    descriptions = _read_descriptions(text_path)

    keyword_hits = {
        eid for eid, desc in descriptions.items() if _matches_turkiye_keyword(desc)
    }
    for eid, alist in aliases.items():
        for alias in alist:
            if _matches_turkiye_keyword(alias):
                keyword_hits.add(eid)
                break
    print(f"    keyword-matched entities: {len(keyword_hits):,}")

    print(f"[2/5] BFS from {turkiye_id} up to {max_hops} hops...")
    adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    reverse_adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for s, r, o in tqdm(_iter_triples(triples_path), desc="index triples"):
        adjacency[s].append((r, o))
        reverse_adjacency[o].append((r, s))

    frontier = {turkiye_id}
    reachable = {turkiye_id}
    for hop in range(max_hops):
        next_frontier: set[str] = set()
        for node in frontier:
            for r, nb in reverse_adjacency.get(node, []):
                if r in SEED_RELATIONS and nb not in reachable:
                    next_frontier.add(nb)
            for r, nb in adjacency.get(node, []):
                if r in SEED_RELATIONS and nb not in reachable:
                    next_frontier.add(nb)
        reachable |= next_frontier
        frontier = next_frontier
        print(f"    hop {hop + 1}: +{len(next_frontier):,} -> total {len(reachable):,}")
        if not next_frontier:
            break

    selected_entities = reachable | keyword_hits
    print(f"[3/5] Selected entities: {len(selected_entities):,}")

    print("[4/5] Writing triples subset...")
    relation_freq: Counter[str] = Counter()
    triples_out = processed_dir / "turkiye_triples.tsv"
    kept_triples = 0
    with triples_out.open("w", encoding="utf-8") as out:
        for s, r, o in tqdm(_iter_triples(triples_path), desc="filter triples"):
            if s in selected_entities and o in selected_entities:
                label = relations.get(r, r)
                out.write(f"{s}\t{r}\t{o}\t{label}\n")
                relation_freq[label] += 1
                kept_triples += 1
    print(f"    wrote {kept_triples:,} triples -> {triples_out}")

    print("[5/5] Writing entity/text/alias artifacts...")
    ents_out = processed_dir / "turkiye_entities.jsonl"
    text_out = processed_dir / "turkiye_text.tsv"
    alias_out = processed_dir / "turkiye_aliases.tsv"
    with ents_out.open("w", encoding="utf-8") as ef, \
         text_out.open("w", encoding="utf-8") as tf, \
         alias_out.open("w", encoding="utf-8") as af:
        for eid in tqdm(selected_entities, desc="entities"):
            name_candidates = aliases.get(eid, [])
            name = name_candidates[0] if name_candidates else eid
            desc = descriptions.get(eid, "")
            ef.write(json.dumps({
                "entity_id": eid,
                "name": name,
                "aliases": name_candidates,
                "description": desc,
            }, ensure_ascii=False) + "\n")
            if desc:
                tf.write(f"{eid}\t{desc}\n")
            if name_candidates:
                af.write(eid + "\t" + "\t".join(name_candidates) + "\n")

    stats = {
        "turkiye_entity_id": turkiye_id,
        "total_entities": len(selected_entities),
        "reachable_via_relations": len(reachable),
        "keyword_matched": len(keyword_hits),
        "total_triples": kept_triples,
        "top_relations": relation_freq.most_common(25),
        "sample_triples": [],
    }
    sample_count = 0
    with triples_out.open("r", encoding="utf-8") as f:
        for line in f:
            s, r, o, label = line.rstrip("\n").split("\t")
            stats["sample_triples"].append(
                {
                    "subject": s,
                    "relation": label,
                    "object": o,
                    "subject_name": aliases.get(s, [s])[0],
                    "object_name": aliases.get(o, [o])[0],
                }
            )
            sample_count += 1
            if sample_count >= 30:
                break

    stats_path = processed_dir / "stats.json"
    stats_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"    wrote {stats_path}")
    return stats


if __name__ == "__main__":
    extract()
