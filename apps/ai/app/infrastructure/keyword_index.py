import importlib.util
import math
import re
from collections import Counter
from typing import Any, Protocol

from app.errors import ConfigurationError, IntegrationUnavailableError, ProviderError

TOKEN_PATTERN = re.compile(r"[\w\u0980-\u09ff]+", flags=re.UNICODE)


class KeywordIndex(Protocol):
    async def upsert(self, id: str, text: str, payload: dict[str, Any]) -> None: ...

    async def search(
        self,
        query: str,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]: ...


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text) if len(token) > 1]


KEYWORD_FIELDS = (
    "chunkId",
    "documentId",
    "version",
    "language",
    "documentType",
    "source",
    "sourceName",
    "publisher",
    "jurisdiction",
    "authority",
    "sourceUrl",
    "citationEligible",
)


def build_keyword_index_body(index: str) -> dict[str, Any]:
    """Explicit mapping: Unicode text for Bengali/English plus keyword metadata filters."""
    properties: dict[str, Any] = {
        "text": {
            "type": "text",
            "analyzer": "cropsy_text",
            "fields": {"keyword": {"type": "keyword", "ignore_above": 512}},
        },
        "title": {"type": "text", "analyzer": "cropsy_text"},
        "section": {"type": "text", "analyzer": "cropsy_text"},
        "page": {"type": "integer"},
    }
    for field in KEYWORD_FIELDS:
        properties[field] = {
            "type": "boolean" if field == "citationEligible" else "keyword"
        }
    return {
        "settings": {
            "analysis": {
                "analyzer": {
                    "cropsy_text": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase"],
                    }
                }
            }
        },
        "mappings": {"properties": properties},
    }


def build_keyword_query(
    query: str,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    must: list[dict[str, Any]] = [
        {
            "multi_match": {
                "query": query,
                "fields": ["text^3", "title^2", "section"],
                "operator": "or",
            }
        }
    ]
    filter_clauses: list[dict[str, Any]] = []
    for key, value in (filters or {}).items():
        if isinstance(value, (list, tuple, set)):
            filter_clauses.append({"terms": {key: list(value)}})
        else:
            filter_clauses.append({"term": {key: value}})
    return {
        "size": 0,
        "query": {"bool": {"must": must, "filter": filter_clauses}},
    }


class InMemoryKeywordIndex:
    backend_name = "memory"

    def __init__(self) -> None:
        self._documents: dict[str, tuple[str, dict[str, Any]]] = {}

    async def upsert(self, id: str, text: str, payload: dict[str, Any]) -> None:
        self._documents[id] = (text, payload)

    async def search(
        self,
        query: str,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]:
        query_tokens = tokenize(query)
        if not query_tokens:
            return []
        query_counts = Counter(query_tokens)
        scored: list[tuple[str, float]] = []
        for doc_id, (text, payload) in self._documents.items():
            if filters:
                matches = True
                for key, expected in filters.items():
                    actual = payload.get(key)
                    if isinstance(expected, (list, tuple, set)):
                        if actual not in expected:
                            matches = False
                            break
                    elif actual != expected:
                        matches = False
                        break
                if not matches:
                    continue
            doc_tokens = tokenize(text)
            if not doc_tokens:
                continue
            counts = Counter(doc_tokens)
            score = sum(
                count * math.log1p(counts.get(token, 0))
                for token, count in query_counts.items()
            )
            if score > 0:
                scored.append((doc_id, score / math.sqrt(len(doc_tokens))))
        scored.sort(key=lambda item: (-item[1], item[0]))
        return scored[:top_k]

    async def delete_document(self, document_id: str) -> None:
        for doc_id in [
            doc_id
            for doc_id, (_, payload) in self._documents.items()
            if payload.get("documentId") == document_id
        ]:
            self._documents.pop(doc_id, None)


class OpenSearchKeywordIndex:
    backend_name = "opensearch"

    def __init__(
        self,
        *,
        url: str,
        index: str,
        username: str = "",
        password: str = "",
        timeout_seconds: float = 10.0,
    ) -> None:
        if not url:
            raise ConfigurationError("OpenSearch URL is required when keyword_backend=opensearch.")
        self.url = url
        self.index = index
        self.username = username
        self.password = password
        self.timeout_seconds = timeout_seconds
        self._client: Any | None = None

    @classmethod
    def available(cls) -> bool:
        return importlib.util.find_spec("opensearchpy") is not None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.available():
            raise IntegrationUnavailableError(
                "OpenSearch requires the optional opensearch-py dependency.",
                details={"backend": self.backend_name},
            )
        try:
            from opensearchpy import OpenSearch  # type: ignore[import-not-found]

            auth = (self.username, self.password) if self.username else None
            client = OpenSearch(
                hosts=[self.url],
                http_auth=auth,
                use_ssl=self.url.startswith("https://"),
                verify_certs=self.url.startswith("https://"),
                timeout=self.timeout_seconds,
                max_retries=2,
            )
            if not client.indices.exists(index=self.index):
                client.indices.create(
                    index=self.index,
                    body=build_keyword_index_body(self.index),
                )
            self._client = client
            return client
        except IntegrationUnavailableError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "OpenSearch could not be initialized.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def upsert(self, id: str, text: str, payload: dict[str, Any]) -> None:
        try:
            self._get_client().index(
                index=self.index,
                id=id,
                body={"text": text, **payload},
                refresh=True,
            )
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "OpenSearch indexing failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def search(
        self,
        query: str,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]:
        body = build_keyword_query(query, filters)
        body["size"] = top_k
        try:
            response = self._get_client().search(index=self.index, body=body)
            return [
                (str(hit["_id"]), float(hit.get("_score", 0.0)))
                for hit in response.get("hits", {}).get("hits", [])
            ]
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "OpenSearch query failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error

    async def delete_document(self, document_id: str) -> None:
        try:
            self._get_client().delete_by_query(
                index=self.index,
                body={"query": {"term": {"documentId": document_id}}},
                refresh=True,
            )
        except (IntegrationUnavailableError, ProviderError):
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "OpenSearch delete failed.",
                details={"backend": self.backend_name, "reason": type(error).__name__},
            ) from error
