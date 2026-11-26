"""Graph storage adapters for CROPSY GraphRAG.

The in-memory adapter is an explicit development/test backend. Production uses
Neo4j through the optional driver, with parameterized Cypher only. Every node
and relationship carries provenance and verification metadata; adapters never
mark an LLM extraction as verified.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.errors import ConfigurationError, IntegrationUnavailableError, ProviderError

EntityLabel = Literal[
    "Crop",
    "CropVariety",
    "PlantDisease",
    "Pest",
    "SoilType",
    "Fertilizer",
    "Nutrient",
    "AgriculturalPractice",
    "WeatherCondition",
    "GeographicRegion",
    "AgriculturalResearch",
    "ExpertRecommendation",
]

Predicate = Literal[
    "AFFECTS",
    "CAUSES",
    "TREATS",
    "REQUIRES",
    "GROWS_IN",
    "ASSOCIATED_WITH",
    "RECOMMENDED_FOR",
    "HAS_EVIDENCE",
    "FOUND_IN",
]

EvidenceClass = Literal[
    "candidate_extraction",
    "validated_extraction",
    "verified_relationship",
    "verified_external_evidence",
]


class GraphScope(BaseModel):
    """Tenant scope applied to every graph read and write."""

    organization_ids: tuple[str, ...] = ()
    include_global: bool = True

    def allows(self, organization_id: str | None) -> bool:
        if organization_id is None:
            return self.include_global
        return organization_id in self.organization_ids


class GraphProvenance(BaseModel):
    source: str = Field(min_length=1, max_length=200)
    sourceReference: str = Field(min_length=1, max_length=300)
    sourceUrl: str = Field(default="", max_length=1000)
    documentId: str = Field(default="", max_length=128)
    chunkId: str = Field(default="", max_length=128)
    extractionMethod: Literal["deterministic", "llm", "human"] = "deterministic"
    evidenceClass: EvidenceClass = "candidate_extraction"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    verified: bool = False
    validated: bool = False
    validationMethod: str = Field(default="", max_length=100)
    verifiedBy: str = Field(default="", max_length=128)
    verifiedAt: str = Field(default="", max_length=50)

    def to_properties(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class GraphNode(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    label: EntityLabel
    name: str = Field(min_length=1, max_length=300)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    organizationId: str | None = Field(default=None, max_length=128)
    properties: dict[str, Any] = Field(default_factory=dict)
    provenance: GraphProvenance

    def to_properties(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "name": self.name,
            "aliases": list(self.aliases),
            "organizationId": self.organizationId,
            **{key: value for key, value in self.properties.items() if key not in {"id", "label", "name"}},
            **self.provenance.to_properties(),
        }


class GraphEdge(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    subjectId: str = Field(min_length=1, max_length=200)
    predicate: Predicate
    objectId: str = Field(min_length=1, max_length=200)
    organizationId: str | None = Field(default=None, max_length=128)
    provenance: GraphProvenance

    def to_properties(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "subjectId": self.subjectId,
            "predicate": self.predicate,
            "objectId": self.objectId,
            "organizationId": self.organizationId,
            **self.provenance.to_properties(),
        }


class GraphSubgraph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    distances: dict[str, int] = Field(default_factory=dict)


class GraphCommunity(BaseModel):
    id: str
    node_ids: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    size: int = 0
    score: float = 0.0


class GraphValidationIssue(BaseModel):
    code: str
    message: str
    severity: Literal["error", "warning"] = "warning"
    subject: str = ""
    predicate: str = ""
    object: str = ""


class GraphStore(Protocol):
    backend_name: str

    async def upsert_node(self, node: GraphNode) -> None: ...

    async def upsert_edge(self, edge: GraphEdge) -> None: ...

    async def find_nodes(self, text: str, scope: GraphScope, limit: int = 10) -> list[GraphNode]: ...

    async def neighbors(
        self,
        node_id: str,
        scope: GraphScope,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
    ) -> list[tuple[GraphEdge, GraphNode]]: ...

    async def traverse(
        self,
        start_ids: list[str],
        scope: GraphScope,
        hops: int,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
        max_paths: int = 20,
    ) -> GraphSubgraph: ...

    async def list_nodes(self, scope: GraphScope) -> list[GraphNode]: ...

    async def stats(self, scope: GraphScope) -> dict[str, Any]: ...

    async def validate(self, scope: GraphScope) -> list[GraphValidationIssue]: ...

    def describe(self) -> dict[str, Any]: ...


_NORMALIZE = re.compile(r"[^\w\u0980-\u09ff]+", flags=re.UNICODE)


def normalize_graph_text(value: str) -> str:
    return " ".join(_NORMALIZE.sub(" ", value.casefold()).split())


def edge_id(subject: str, predicate: str, obj: str, source_reference: str) -> str:
    raw = f"{subject}|{predicate}|{obj}|{source_reference}"
    return f"edge-{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:24]}"


class InMemoryGraphStore:
    """Deterministic in-memory graph store for development and tests."""

    backend_name = "memory"

    def __init__(self) -> None:
        self._nodes: dict[str, GraphNode] = {}
        self._edges: dict[str, GraphEdge] = {}
        self._outgoing: dict[str, set[str]] = {}
        self._incoming: dict[str, set[str]] = {}

    def describe(self) -> dict[str, Any]:
        return {
            "backend": self.backend_name,
            "available": True,
            "productionSafe": False,
            "nodeCount": len(self._nodes),
            "edgeCount": len(self._edges),
        }

    def _visible_node(self, node: GraphNode | None, scope: GraphScope) -> bool:
        return node is not None and scope.allows(node.organizationId)

    def _visible_edge(
        self,
        edge: GraphEdge,
        scope: GraphScope,
        predicates: tuple[str, ...],
        min_confidence: float,
        verified_only: bool,
    ) -> bool:
        if predicates and edge.predicate not in predicates:
            return False
        if edge.provenance.confidence < min_confidence:
            return False
        if verified_only and not edge.provenance.verified:
            return False
        return self._visible_node(self._nodes.get(edge.subjectId), scope) and self._visible_node(
            self._nodes.get(edge.objectId), scope
        )

    async def upsert_node(self, node: GraphNode) -> None:
        existing = self._nodes.get(node.id)
        if existing and existing.organizationId != node.organizationId:
            raise ConfigurationError(
                "Graph node organization scope cannot be changed.",
                details={"nodeId": node.id},
            )
        if existing:
            aliases = list(dict.fromkeys([*existing.aliases, *node.aliases]))[:50]
            properties = {**existing.properties, **node.properties}
            provenance = (
                node.provenance
                if node.provenance.confidence >= existing.provenance.confidence
                else existing.provenance
            )
            node = node.model_copy(update={"aliases": aliases, "properties": properties, "provenance": provenance})
        self._nodes[node.id] = node

    async def upsert_edge(self, edge: GraphEdge) -> None:
        subject = self._nodes.get(edge.subjectId)
        obj = self._nodes.get(edge.objectId)
        if not subject or not obj:
            raise ConfigurationError(
                "Graph relationship endpoints must exist before the relationship is written.",
                details={"subjectId": edge.subjectId, "objectId": edge.objectId},
            )
        if subject.organizationId != obj.organizationId:
            raise ConfigurationError(
                "Graph relationship endpoints must share one organization scope.",
                details={"edgeId": edge.id},
            )
        if edge.organizationId is None:
            edge = edge.model_copy(update={"organizationId": subject.organizationId})
        elif edge.organizationId != subject.organizationId:
            raise ConfigurationError(
                "Graph relationship organization scope does not match its endpoints.",
                details={"edgeId": edge.id},
            )
        existing = self._edges.get(edge.id)
        if existing and existing.provenance.verified and not edge.provenance.verified:
            return
        self._edges[edge.id] = edge
        self._outgoing.setdefault(edge.subjectId, set()).add(edge.id)
        self._incoming.setdefault(edge.objectId, set()).add(edge.id)

    async def find_nodes(self, text: str, scope: GraphScope, limit: int = 10) -> list[GraphNode]:
        needle = normalize_graph_text(text)
        if not needle:
            return []
        scored: list[tuple[int, str, GraphNode]] = []
        for node in self._nodes.values():
            if not self._visible_node(node, scope):
                continue
            candidates = [node.name, *node.aliases]
            best = 0
            for candidate in candidates:
                normalized = normalize_graph_text(candidate)
                if normalized == needle:
                    best = max(best, 3)
                elif needle in normalized or normalized in needle:
                    best = max(best, 2)
                elif set(normalized.split()) & set(needle.split()):
                    best = max(best, 1)
            if best:
                scored.append((-best, node.id, node))
        scored.sort(key=lambda item: (item[0], item[1]))
        return [item[2] for item in scored[:limit]]

    async def neighbors(
        self,
        node_id: str,
        scope: GraphScope,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
    ) -> list[tuple[GraphEdge, GraphNode]]:
        node = self._nodes.get(node_id)
        if not self._visible_node(node, scope):
            return []
        results: list[tuple[GraphEdge, GraphNode]] = []
        connected = sorted(self._outgoing.get(node_id, set()) | self._incoming.get(node_id, set()))
        for edge_id_value in connected:
            edge = self._edges.get(edge_id_value)
            if not edge or not self._visible_edge(edge, scope, predicates, min_confidence, verified_only):
                continue
            neighbor_id = edge.objectId if edge.subjectId == node_id else edge.subjectId
            neighbor = self._nodes.get(neighbor_id)
            if neighbor:
                results.append((edge, neighbor))
        return results

    async def traverse(
        self,
        start_ids: list[str],
        scope: GraphScope,
        hops: int,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
        max_paths: int = 20,
    ) -> GraphSubgraph:
        distances: dict[str, int] = {}
        queue: list[tuple[str, int]] = []
        for start in start_ids:
            if self._visible_node(self._nodes.get(start), scope):
                distances[start] = 0
                queue.append((start, 0))
        edges: dict[str, GraphEdge] = {}
        while queue:
            node_id, depth = queue.pop(0)
            if depth >= hops:
                continue
            for edge, neighbor in await self.neighbors(
                node_id, scope, predicates, min_confidence, verified_only
            ):
                edges[edge.id] = edge
                if neighbor.id not in distances:
                    distances[neighbor.id] = depth + 1
                    queue.append((neighbor.id, depth + 1))
                if len(edges) >= max_paths:
                    break
            if len(edges) >= max_paths:
                break
        nodes = [
            self._nodes[node_id]
            for node_id in sorted(distances)
            if self._visible_node(self._nodes.get(node_id), scope)
        ]
        return GraphSubgraph(nodes=nodes, edges=[edges[key] for key in sorted(edges)], distances=distances)

    async def list_nodes(self, scope: GraphScope) -> list[GraphNode]:
        return [
            self._nodes[key]
            for key in sorted(self._nodes)
            if self._visible_node(self._nodes[key], scope)
        ]

    async def stats(self, scope: GraphScope) -> dict[str, Any]:
        nodes = await self.list_nodes(scope)
        node_ids = {node.id for node in nodes}
        edges = [
            edge
            for edge in self._edges.values()
            if edge.id
            and edge.subjectId in node_ids
            and edge.objectId in node_ids
            and self._visible_edge(edge, scope, (), 0.0, False)
        ]
        return {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "verifiedEdgeCount": sum(1 for edge in edges if edge.provenance.verified),
            "validatedEdgeCount": sum(1 for edge in edges if edge.provenance.validated),
            "candidateEdgeCount": sum(
                1 for edge in edges if edge.provenance.evidenceClass == "candidate_extraction"
            ),
            "labels": sorted({node.label for node in nodes}),
            "predicates": sorted({edge.predicate for edge in edges}),
        }

    async def validate(self, scope: GraphScope) -> list[GraphValidationIssue]:
        issues: list[GraphValidationIssue] = []
        nodes = await self.list_nodes(scope)
        node_ids = {node.id for node in nodes}
        for edge in self._edges.values():
            if edge.subjectId not in node_ids or edge.objectId not in node_ids:
                if scope.allows(edge.organizationId):
                    issues.append(
                        GraphValidationIssue(
                            code="dangling_relationship",
                            message="Relationship endpoint is missing or outside tenant scope.",
                            severity="error",
                            subject=edge.subjectId,
                            predicate=edge.predicate,
                            object=edge.objectId,
                        )
                    )
                continue
            if not edge.provenance.validated and edge.provenance.verified:
                issues.append(
                    GraphValidationIssue(
                        code="verified_without_validation",
                        message="Relationship is marked verified without validation metadata.",
                        severity="error",
                        subject=edge.subjectId,
                        predicate=edge.predicate,
                        object=edge.objectId,
                    )
                )
            if edge.provenance.evidenceClass == "candidate_extraction" and edge.provenance.confidence >= 1.0:
                issues.append(
                    GraphValidationIssue(
                        code="unvalidated_perfect_confidence",
                        message="Candidate extraction must not claim perfect confidence.",
                        subject=edge.subjectId,
                        predicate=edge.predicate,
                        object=edge.objectId,
                    )
                )
        return issues


class UnavailableGraphStore:
    backend_name = "none"

    def _error(self, operation: str) -> IntegrationUnavailableError:
        return IntegrationUnavailableError(
            f"Graph operation '{operation}' is unavailable because no graph backend is configured.",
            details={"reason": "graph_backend_not_configured"},
        )

    def describe(self) -> dict[str, Any]:
        return {"backend": self.backend_name, "available": False, "reason": "graph_backend_not_configured"}

    async def upsert_node(self, node: GraphNode) -> None:
        raise self._error("upsert_node")

    async def upsert_edge(self, edge: GraphEdge) -> None:
        raise self._error("upsert_edge")

    async def find_nodes(self, text: str, scope: GraphScope, limit: int = 10) -> list[GraphNode]:
        raise self._error("find_nodes")

    async def neighbors(
        self,
        node_id: str,
        scope: GraphScope,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
    ) -> list[tuple[GraphEdge, GraphNode]]:
        raise self._error("neighbors")

    async def traverse(
        self,
        start_ids: list[str],
        scope: GraphScope,
        hops: int,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
        max_paths: int = 20,
    ) -> GraphSubgraph:
        raise self._error("traverse")

    async def list_nodes(self, scope: GraphScope) -> list[GraphNode]:
        raise self._error("list_nodes")

    async def stats(self, scope: GraphScope) -> dict[str, Any]:
        raise self._error("stats")

    async def validate(self, scope: GraphScope) -> list[GraphValidationIssue]:
        raise self._error("validate")


class Neo4jGraphStore:
    """Neo4j adapter using only parameterized Cypher."""

    backend_name = "neo4j"

    def __init__(
        self,
        *,
        uri: str,
        user: str,
        password: str,
        database: str = "neo4j",
    ) -> None:
        if not uri or not user or not password:
            raise IntegrationUnavailableError(
                "Neo4j graph backend requires a URI, user, and password.",
                details={"reason": "neo4j_credentials_missing"},
            )
        try:
            from neo4j import AsyncGraphDatabase
        except ImportError as error:  # pragma: no cover - optional dependency guard
            raise IntegrationUnavailableError(
                "The Neo4j driver is not installed.",
                details={"reason": "neo4j_driver_missing"},
            ) from error
        self.uri = uri
        self.database = database
        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    def describe(self) -> dict[str, Any]:
        return {
            "backend": self.backend_name,
            "available": True,
            "productionSafe": True,
            "database": self.database,
            "credentialsInResponse": False,
        }

    async def close(self) -> None:
        await self._driver.close()

    async def _write(self, query: str, parameters: dict[str, Any]) -> list[dict[str, Any]]:
        async with self._driver.session(database=self.database) as session:
            result = await session.execute_write(lambda tx: tx.run(query, **parameters))
            return [dict(record) async for record in result]

    async def _read(self, query: str, parameters: dict[str, Any]) -> list[dict[str, Any]]:
        async with self._driver.session(database=self.database) as session:
            result = await session.execute_read(lambda tx: tx.run(query, **parameters))
            return [dict(record) async for record in result]

    @staticmethod
    def _node_from_record(record: dict[str, Any], key: str = "n") -> GraphNode:
        data = dict(record[key])
        properties = {
            field: data.pop(field)
            for field in ("source", "sourceReference", "sourceUrl", "documentId", "chunkId",
                          "extractionMethod", "evidenceClass", "confidence", "verified", "validated",
                          "validationMethod", "verifiedBy", "verifiedAt")
            if field in data
        }
        data.pop("aliases", None)
        return GraphNode(
            id=data["id"],
            label=data["label"],
            name=data["name"],
            aliases=list(record.get("aliases") or dict(record[key]).get("aliases") or []),
            organizationId=data.get("organizationId"),
            properties={k: v for k, v in data.items() if k not in {"id", "label", "name", "organizationId"}},
            provenance=GraphProvenance(**properties),
        )

    @staticmethod
    def _edge_from_record(record: dict[str, Any], key: str = "r") -> GraphEdge:
        data = dict(record[key])
        properties = {
            field: data.pop(field)
            for field in ("source", "sourceReference", "sourceUrl", "documentId", "chunkId",
                          "extractionMethod", "evidenceClass", "confidence", "verified", "validated",
                          "validationMethod", "verifiedBy", "verifiedAt")
            if field in data
        }
        return GraphEdge(
            id=data["id"],
            subjectId=data["subjectId"],
            predicate=data["predicate"],
            objectId=data["objectId"],
            organizationId=data.get("organizationId"),
            provenance=GraphProvenance(**properties),
        )

    async def upsert_node(self, node: GraphNode) -> None:
        query = """
        MERGE (n:AgriculturalEntity {id: $id})
        SET n.label = $label, n.name = $name, n.aliases = $aliases,
            n.organizationId = $organizationId, n += $properties
        RETURN n
        """
        properties = {
            key: value
            for key, value in node.to_properties().items()
            if key not in {"id", "label", "name", "aliases", "organizationId"}
        }
        await self._write(
            query,
            {
                "id": node.id,
                "label": node.label,
                "name": node.name,
                "aliases": node.aliases,
                "organizationId": node.organizationId,
                "properties": properties,
            },
        )

    async def upsert_edge(self, edge: GraphEdge) -> None:
        query = """
        MATCH (s:AgriculturalEntity {id: $subjectId})
        MATCH (o:AgriculturalEntity {id: $objectId})
        MERGE (s)-[r:GRAPH_RELATION {id: $id}]->(o)
        SET r += $properties
        RETURN r
        """
        properties = {
            key: value
            for key, value in edge.to_properties().items()
            if key not in {"id", "subjectId", "objectId", "predicate", "organizationId"}
        }
        await self._write(
            query,
            {
                "id": edge.id,
                "subjectId": edge.subjectId,
                "objectId": edge.objectId,
                "properties": {**properties, "predicate": edge.predicate, "organizationId": edge.organizationId},
            },
        )

    async def find_nodes(self, text: str, scope: GraphScope, limit: int = 10) -> list[GraphNode]:
        query = """
        MATCH (n:AgriculturalEntity)
        WHERE ($includeGlobal AND n.organizationId IS NULL OR n.organizationId IN $organizationIds)
          AND (toLower(n.name) CONTAINS toLower($text)
               OR any(alias IN n.aliases WHERE toLower(alias) CONTAINS toLower($text)))
        RETURN n, n.aliases AS aliases
        LIMIT $limit
        """
        rows = await self._read(
            query,
            {
                "text": text,
                "organizationIds": list(scope.organization_ids),
                "includeGlobal": scope.include_global,
                "limit": limit,
            },
        )
        return [self._node_from_record(row) for row in rows]

    async def neighbors(
        self,
        node_id: str,
        scope: GraphScope,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
    ) -> list[tuple[GraphEdge, GraphNode]]:
        query = """
        MATCH (n:AgriculturalEntity {id: $nodeId})-[r:GRAPH_RELATION]-(m:AgriculturalEntity)
        WHERE ($includeGlobal AND n.organizationId IS NULL OR n.organizationId IN $organizationIds)
          AND ($includeGlobal AND m.organizationId IS NULL OR m.organizationId IN $organizationIds)
          AND ($predicates = [] OR r.predicate IN $predicates)
          AND r.confidence >= $minConfidence
          AND (NOT $verifiedOnly OR r.verified = true)
        RETURN r, m, m.aliases AS aliases
        ORDER BY r.confidence DESC, r.id
        """
        rows = await self._read(
            query,
            {
                "nodeId": node_id,
                "organizationIds": list(scope.organization_ids),
                "includeGlobal": scope.include_global,
                "predicates": list(predicates),
                "minConfidence": min_confidence,
                "verifiedOnly": verified_only,
            },
        )
        return [(self._edge_from_record(row), self._node_from_record(row, "m")) for row in rows]

    async def traverse(
        self,
        start_ids: list[str],
        scope: GraphScope,
        hops: int,
        predicates: tuple[str, ...] = (),
        min_confidence: float = 0.0,
        verified_only: bool = False,
        max_paths: int = 20,
    ) -> GraphSubgraph:
        query = """
        MATCH p = (n:AgriculturalEntity)-[r:GRAPH_RELATION*1..$hops]-(m:AgriculturalEntity)
        WHERE n.id IN $startIds
          AND all(node IN nodes(p) WHERE
              ($includeGlobal AND node.organizationId IS NULL OR node.organizationId IN $organizationIds))
          AND all(rel IN relationships(p) WHERE
              ($predicates = [] OR rel.predicate IN $predicates)
              AND rel.confidence >= $minConfidence
              AND (NOT $verifiedOnly OR rel.verified = true))
        UNWIND relationships(p) AS edge
        WITH DISTINCT edge
        RETURN edge
        LIMIT $maxPaths
        """
        rows = await self._read(
            query,
            {
                "startIds": start_ids,
                "hops": hops,
                "organizationIds": list(scope.organization_ids),
                "includeGlobal": scope.include_global,
                "predicates": list(predicates),
                "minConfidence": min_confidence,
                "verifiedOnly": verified_only,
                "maxPaths": max_paths,
            },
        )
        edges = [self._edge_from_record(row, "edge") for row in rows]
        endpoint_ids = sorted({edge.subjectId for edge in edges} | {edge.objectId for edge in edges})
        nodes: list[GraphNode] = []
        for node_id in endpoint_ids:
            found = await self.find_nodes(node_id, scope, limit=1)
            if found and found[0].id == node_id:
                nodes.append(found[0])
        distances = {node.id: 0 for node in nodes}
        return GraphSubgraph(nodes=nodes, edges=edges, distances=distances)

    async def list_nodes(self, scope: GraphScope) -> list[GraphNode]:
        query = """
        MATCH (n:AgriculturalEntity)
        WHERE $includeGlobal AND n.organizationId IS NULL OR n.organizationId IN $organizationIds
        RETURN n, n.aliases AS aliases
        ORDER BY n.id
        """
        rows = await self._read(
            query,
            {
                "organizationIds": list(scope.organization_ids),
                "includeGlobal": scope.include_global,
            },
        )
        return [self._node_from_record(row) for row in rows]

    async def stats(self, scope: GraphScope) -> dict[str, Any]:
        nodes = await self.list_nodes(scope)
        node_ids = {node.id for node in nodes}
        query = """
        MATCH (s:AgriculturalEntity)-[r:GRAPH_RELATION]->(o:AgriculturalEntity)
        WHERE s.id IN $nodeIds AND o.id IN $nodeIds
        RETURN r
        """
        rows = await self._read(query, {"nodeIds": list(node_ids)}) if node_ids else []
        edges = [self._edge_from_record(row) for row in rows]
        return {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "verifiedEdgeCount": sum(1 for edge in edges if edge.provenance.verified),
            "validatedEdgeCount": sum(1 for edge in edges if edge.provenance.validated),
            "candidateEdgeCount": sum(
                1 for edge in edges if edge.provenance.evidenceClass == "candidate_extraction"
            ),
            "labels": sorted({node.label for node in nodes}),
            "predicates": sorted({edge.predicate for edge in edges}),
        }

    async def validate(self, scope: GraphScope) -> list[GraphValidationIssue]:
        stats = await self.stats(scope)
        issues: list[GraphValidationIssue] = []
        for predicate in stats["predicates"]:
            if predicate not in set(Predicate.__args__):  # type: ignore[attr-defined]
                issues.append(
                    GraphValidationIssue(
                        code="unsupported_predicate",
                        message=f"Unsupported graph predicate '{predicate}'.",
                        severity="error",
                        predicate=predicate,
                    )
                )
        return issues


def build_graph_store(settings: Settings | None = None) -> Any:
    active = settings or get_settings()
    if active.graph_backend == "none":
        return UnavailableGraphStore()
    if active.graph_backend == "memory":
        return InMemoryGraphStore()
    if active.graph_backend == "neo4j":
        return Neo4jGraphStore(
            uri=active.neo4j_uri,
            user=active.neo4j_user,
            password=active.neo4j_password.get_secret_value(),
            database=active.neo4j_database,
        )
    raise ConfigurationError(f"Unsupported graph backend '{active.graph_backend}'.")


__all__ = [
    "EvidenceClass",
    "EntityLabel",
    "GraphCommunity",
    "GraphEdge",
    "GraphNode",
    "GraphProvenance",
    "GraphScope",
    "GraphStore",
    "GraphSubgraph",
    "GraphValidationIssue",
    "InMemoryGraphStore",
    "Neo4jGraphStore",
    "Predicate",
    "UnavailableGraphStore",
    "build_graph_store",
    "edge_id",
    "normalize_graph_text",
]
