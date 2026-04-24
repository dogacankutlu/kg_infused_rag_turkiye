from contextlib import contextmanager
from typing import Any, Iterable

from neo4j import GraphDatabase

from config import settings

from src.trace import Triple


RELATION_LABEL = "relation"


def normalize_relation(name: str) -> str:
    return name.strip().upper().replace(" ", "_").replace("-", "_")


class Neo4jClient:
    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str | None = None,
    ):
        self.uri = uri or settings.neo4j_uri
        self.user = user or settings.neo4j_user
        self.password = password or settings.neo4j_password
        self.database = database or settings.neo4j_database
        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        self._driver.close()

    @contextmanager
    def session(self):
        s = self._driver.session(database=self.database)
        try:
            yield s
        finally:
            s.close()

    def verify_connection(self) -> bool:
        with self.session() as s:
            r = s.run("RETURN 1 AS ok")
            return r.single()["ok"] == 1

    def run(self, cypher: str, **params: Any) -> list[dict[str, Any]]:
        with self.session() as s:
            result = s.run(cypher, **params)
            return [record.data() for record in result]

    def execute_write(self, cypher: str, **params: Any) -> None:
        with self.session() as s:
            s.execute_write(lambda tx: tx.run(cypher, **params))

    def ensure_indexes(self) -> None:
        with self.session() as s:
            s.run("CREATE INDEX entity_id_index IF NOT EXISTS FOR (e:Entity) ON (e.entityId)")
            s.run("CREATE INDEX entity_name_index IF NOT EXISTS FOR (e:Entity) ON (e.name)")
            s.run(
                "CREATE FULLTEXT INDEX entity_search IF NOT EXISTS "
                "FOR (e:Entity) ON EACH [e.name, e.description]"
            )

    def get_one_hop_neighbors(
        self, entity_ids: Iterable[str], visited_ids: Iterable[str]
    ) -> list[Triple]:
        entity_ids = list(entity_ids)
        visited_ids = list(visited_ids)
        if not entity_ids:
            return []
        rows = self.run(
            """
            MATCH (e:Entity)-[r]->(n:Entity)
            WHERE e.entityId IN $entity_ids
              AND NOT n.entityId IN $visited_ids
            RETURN
                e.entityId AS src_id, e.name AS src_name,
                type(r) AS rel,
                n.entityId AS tgt_id, n.name AS tgt_name
            """,
            entity_ids=entity_ids,
            visited_ids=visited_ids,
        )
        return [
            Triple(
                source_id=row["src_id"],
                source_name=row["src_name"] or row["src_id"],
                relation=row["rel"].lower().replace("_", " "),
                target_id=row["tgt_id"],
                target_name=row["tgt_name"] or row["tgt_id"],
            )
            for row in rows
        ]

    def entity_count(self) -> int:
        rows = self.run("MATCH (e:Entity) RETURN count(e) AS n")
        return rows[0]["n"] if rows else 0

    def relation_count(self) -> int:
        rows = self.run("MATCH ()-[r]->() RETURN count(r) AS n")
        return rows[0]["n"] if rows else 0

    def top_relations(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH ()-[r]->()
            RETURN type(r) AS relation, count(*) AS frequency
            ORDER BY frequency DESC LIMIT $limit
            """,
            limit=limit,
        )

    def fulltext_search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return self.run(
            """
            CALL db.index.fulltext.queryNodes('entity_search', $q)
            YIELD node, score
            RETURN node.entityId AS id, node.name AS name,
                   node.description AS description, score
            ORDER BY score DESC LIMIT $limit
            """,
            q=query,
            limit=limit,
        )

    def get_entity(self, entity_id: str) -> dict[str, Any] | None:
        rows = self.run(
            "MATCH (e:Entity {entityId: $id}) RETURN e.entityId AS id, e.name AS name, "
            "e.description AS description",
            id=entity_id,
        )
        return rows[0] if rows else None

    def sample_triples(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH (e:Entity)-[r]->(n:Entity)
            RETURN e.name AS src, type(r) AS rel, n.name AS tgt
            LIMIT $limit
            """,
            limit=limit,
        )
