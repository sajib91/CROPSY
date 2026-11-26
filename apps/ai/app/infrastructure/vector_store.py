import importlib.util
import math
from dataclasses import dataclass
from typing import Any, Protocol

from app.errors import ConfigurationError, IntegrationUnavailableError, ProviderError


@dataclass(frozen=True)
class VectorPoint:
    id: str
    vector: list[float]
    payload: dict[str, Any]


class VectorIndex(Protocol):
    async def upsert(self, points: list[VectorPoint]) -> None: ...

    async def query(
        self,
        vector: list[float],
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float, dict[str, Any]]]: ...


def _cosine(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(0.0, min(1.0, numerator / (left_norm * right_norm)))


def matches_filters(payload: dict[str, Any], filters: dict[str, Any] | None) -> bool:
    if not filters:
        return True
    for key, expected in filters.items():
        actual = payload.get(key)
        if isinstance(expected, (list, tuple, set)):
            if actual not in expected:
                return False
        elif actual != expected:
            return False
    return True


class InMemoryVectorIndex:
    backend_name = "memory"

    def __init__(self) -> None:
        self._points: dict[str, VectorPoint] = {}

    async def upsert(self, points: list[VectorPoint]) -> None:
        for point in points:
            self._points[point.id] = point

    async def query(
        self,
        vector: list[float],
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float, dict[str, Any]]]:
        scored = [
            (point.id, _cosine(vector, point.vector), point.payload)
            for point in self._points.values()
            if matches_filters(point.payload, filters)
        ]
        scored.sort(key=lambda item: (-item[1], item[0]))
        return scored[:top_k]

    async def delete_document(self, document_id: str) -> None:
        for point_id in [
            point_id
            for point_id, point in self._points.items()
            if point.payload.get("documentId") == document_id
        ]:
            self._points.pop(point_id, None)


class QdrantVectorIndex:
    backend_name = "qdrant"

    def __init__(
        self,
        *,
        url: str,
        collection: str,
        dimensions: int,
        api_key: str = "",
        timeout_seconds: float = 10.0,
    ) -> None:
        if not url:
            raise ConfigurationError("Qdrant URL is required when vector_backend=qdrant.")
        self.url = url
        self.collection = collection
        self.dimensions = dimensions
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self._client: Any | None = None

    @classmethod
    def available(cls) -> bool:
        return importlib.util.find_spec("qdrant_client") is not None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.available():
            raise IntegrationUnavailableError(
                "Qdrant requires the optional qdrant-client dependency.",
                details={"backend": self.backend_name},
            )
        try:
            from qdrant_client import QdrantClient  # type: ignore[import-not-found]
            from qdrant_client.models import Distance, VectorParams  # type: ignore[import-not-found]

            client = QdrantClient(
                url=self.url,
                api_key=self.api_key or None,
                timeout=self.timeout_seconds,
            )
            collections = client.get_collections().collections
            names = {item.name for item in collections}
            if self.collection not in names:
                client.create_collection(
                    collection_name=self.collection,
                    vectors_config=VectorParams(
                        size=self.dimensions,
                        distance=Distance.COSINE,
                    ),
                )
            self._client = client
            return client
        except IntegrationUnavailableError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Qdrant could not be initialized.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def upsert(self, points: list[VectorPoint]) -> None:
        try:
            from qdrant_client.models import PointStruct  # type: ignore[import-not-found]

            self._get_client().upsert(
                collection_name=self.collection,
                points=[
                    PointStruct(id=point.id, vector=point.vector, payload=point.payload)
                    for point in points
                ],
                wait=True,
            )
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Qdrant upsert failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def query(
        self,
        vector: list[float],
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float, dict[str, Any]]]:
        try:
            from qdrant_client.models import FieldCondition, Filter, MatchValue  # type: ignore[import-not-found]

            conditions = []
            for key, expected in (filters or {}).items():
                if isinstance(expected, (list, tuple, set)):
                    try:
                        from qdrant_client.models import MatchAny  # type: ignore[import-not-found]
                    except ImportError:
                        conditions.extend(
                            FieldCondition(
                                key=key,
                                match=MatchValue(value=value),
                            )
                            for value in expected
                        )
                    else:
                        conditions.append(
                            FieldCondition(
                                key=key,
                                match=MatchAny(any=list(expected)),
                            )
                        )
                else:
                    conditions.append(
                        FieldCondition(key=key, match=MatchValue(value=expected))
                    )
            query_filter = Filter(must=conditions) if conditions else None
            client = self._get_client()
            if hasattr(client, "query_points"):
                response = client.query_points(
                    collection_name=self.collection,
                    query=vector,
                    limit=top_k,
                    query_filter=query_filter,
                    with_payload=True,
                )
                found = response.points
            else:
                found = client.search(
                    collection_name=self.collection,
                    query_vector=vector,
                    limit=top_k,
                    query_filter=query_filter,
                    with_payload=True,
                )
            return [
                (str(point.id), float(point.score), dict(point.payload or {}))
                for point in found
            ]
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Qdrant query failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def delete_document(self, document_id: str) -> None:
        try:
            from qdrant_client.models import FieldCondition, Filter, MatchValue  # type: ignore[import-not-found]

            self._get_client().delete(
                collection_name=self.collection,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="documentId",
                            match=MatchValue(value=document_id),
                        )
                    ]
                ),
                wait=True,
            )
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Qdrant delete failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error
