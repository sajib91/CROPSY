"""Immutable prompt-version registry used to attribute evaluation runs."""

from __future__ import annotations

import hashlib
from typing import Any

from app.errors import DocumentError, NotFoundError
from app.models import utc_now
from app.modules.evaluation_framework.models import PromptVersion


class PromptVersionRegistry:
    def __init__(self) -> None:
        self._versions: dict[tuple[str, str], PromptVersion] = {}
        self._active: dict[str, str] = {}

    def register(
        self,
        *,
        key: str,
        version: str,
        system: str,
        user_template: str,
        activate: bool = False,
    ) -> PromptVersion:
        identity = (key, version)
        if identity in self._versions:
            raise DocumentError(f"Prompt '{key}' version '{version}' is already registered.")
        content_hash = hashlib.sha256(
            f"{system}\n{user_template}".encode("utf-8")
        ).hexdigest()
        prompt = PromptVersion(
            key=key,
            version=version,
            system=system,
            userTemplate=user_template,
            contentHash=content_hash,
            registeredAt=utc_now().isoformat(),
            active=activate,
        )
        self._versions[identity] = prompt
        if activate or key not in self._active:
            self._active[key] = version
        return prompt

    def activate(self, key: str, version: str) -> PromptVersion:
        prompt = self.resolve(key, version)
        for registered in self._versions.values():
            if registered.key == key:
                registered.active = registered.version == version
        self._active[key] = version
        return prompt

    def resolve(self, key: str, version: str | None = None) -> PromptVersion:
        selected = version or self._active.get(key)
        if selected is None:
            raise NotFoundError(f"No active prompt version is registered for '{key}'.")
        prompt = self._versions.get((key, selected))
        if prompt is None:
            raise NotFoundError(f"Prompt '{key}' version '{selected}' was not found.")
        return prompt

    def snapshot(self) -> dict[str, str]:
        return {key: version for key, version in self._active.items()}

    def describe(self) -> list[dict[str, Any]]:
        return [
            {
                "key": prompt.key,
                "version": prompt.version,
                "contentHash": prompt.contentHash,
                "active": prompt.active,
                "registeredAt": prompt.registeredAt,
            }
            for prompt in sorted(
                self._versions.values(), key=lambda item: (item.key, item.version)
            )
        ]


__all__ = ["PromptVersionRegistry"]
