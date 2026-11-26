"""Conversation storage for follow-up agricultural assistant questions.

The default adapter is process-local and bounded. A durable adapter can be injected
through the container without changing the assistant service.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.errors import NotFoundError
from app.models import utc_now

ConversationRole = Literal["user", "assistant"]


class ConversationMessage(BaseModel):
    messageId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: ConversationRole
    content: str = Field(min_length=1, max_length=20000)
    createdAt: datetime = Field(default_factory=utc_now)
    language: str = Field(default="en", max_length=10)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    traceId: str = Field(default="", max_length=128)


class Conversation(BaseModel):
    conversationId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organizationId: str = Field(min_length=1, max_length=128)
    userId: str = Field(min_length=1, max_length=128)
    title: str = Field(default="Agricultural advisory conversation", max_length=300)
    language: str = Field(default="en", max_length=10)
    messages: list[ConversationMessage] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=utc_now)
    updatedAt: datetime = Field(default_factory=utc_now)


class ConversationStore(Protocol):
    backend_name: str

    async def create(
        self,
        *,
        organization_id: str,
        user_id: str,
        language: str = "en",
        title: str = "",
    ) -> Conversation: ...

    async def get(
        self,
        conversation_id: str,
        *,
        organization_id: str,
        user_id: str,
    ) -> Conversation: ...

    async def append(
        self,
        conversation_id: str,
        message: ConversationMessage,
        *,
        organization_id: str,
        user_id: str,
    ) -> Conversation: ...

    async def list(
        self,
        *,
        organization_id: str,
        user_id: str,
    ) -> list[Conversation]: ...

    async def delete(
        self,
        conversation_id: str,
        *,
        organization_id: str,
        user_id: str,
    ) -> None: ...


class InMemoryConversationStore:
    backend_name = "memory"

    def __init__(
        self,
        *,
        max_conversations: int = 1000,
        max_messages: int = 100,
        ttl_seconds: int = 86400,
    ) -> None:
        self.max_conversations = max_conversations
        self.max_messages = max_messages
        self.ttl_seconds = ttl_seconds
        self._conversations: dict[str, Conversation] = {}
        self._lock = asyncio.Lock()

    def _copy(self, conversation: Conversation) -> Conversation:
        return Conversation.model_validate(conversation.model_dump())

    def _visible(
        self,
        conversation: Conversation,
        *,
        organization_id: str,
        user_id: str,
    ) -> bool:
        return (
            conversation.organizationId == organization_id
            and conversation.userId == user_id
        )

    def _expired(self, conversation: Conversation) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.ttl_seconds)
        return conversation.updatedAt < cutoff

    async def create(
        self,
        *,
        organization_id: str,
        user_id: str,
        language: str = "en",
        title: str = "",
    ) -> Conversation:
        async with self._lock:
            conversation = Conversation(
                organizationId=organization_id,
                userId=user_id,
                language=language,
                title=title.strip() or "Agricultural advisory conversation",
            )
            self._conversations[conversation.conversationId] = conversation
            while len(self._conversations) > self.max_conversations:
                oldest = min(
                    self._conversations.values(),
                    key=lambda item: item.updatedAt,
                )
                self._conversations.pop(oldest.conversationId, None)
            return self._copy(conversation)

    async def get(
        self,
        conversation_id: str,
        *,
        organization_id: str,
        user_id: str,
    ) -> Conversation:
        async with self._lock:
            conversation = self._conversations.get(conversation_id)
            if conversation is None or self._expired(conversation):
                self._conversations.pop(conversation_id, None)
                raise NotFoundError(f"Conversation '{conversation_id}' was not found.")
            if not self._visible(
                conversation, organization_id=organization_id, user_id=user_id
            ):
                raise NotFoundError(f"Conversation '{conversation_id}' was not found.")
            return self._copy(conversation)

    async def append(
        self,
        conversation_id: str,
        message: ConversationMessage,
        *,
        organization_id: str,
        user_id: str,
    ) -> Conversation:
        async with self._lock:
            conversation = self._conversations.get(conversation_id)
            if conversation is None or self._expired(conversation):
                self._conversations.pop(conversation_id, None)
                raise NotFoundError(f"Conversation '{conversation_id}' was not found.")
            if not self._visible(
                conversation, organization_id=organization_id, user_id=user_id
            ):
                raise NotFoundError(f"Conversation '{conversation_id}' was not found.")
            conversation.messages.append(message)
            if len(conversation.messages) > self.max_messages:
                conversation.messages = conversation.messages[-self.max_messages :]
            conversation.updatedAt = utc_now()
            return self._copy(conversation)

    async def list(
        self,
        *,
        organization_id: str,
        user_id: str,
    ) -> list[Conversation]:
        async with self._lock:
            visible = [
                conversation
                for conversation in self._conversations.values()
                if self._visible(
                    conversation,
                    organization_id=organization_id,
                    user_id=user_id,
                )
                and not self._expired(conversation)
            ]
            return [
                self._copy(item)
                for item in sorted(visible, key=lambda item: item.updatedAt, reverse=True)
            ]

    async def delete(
        self,
        conversation_id: str,
        *,
        organization_id: str,
        user_id: str,
    ) -> None:
        async with self._lock:
            conversation = self._conversations.get(conversation_id)
            if conversation is None or not self._visible(
                conversation, organization_id=organization_id, user_id=user_id
            ):
                raise NotFoundError(f"Conversation '{conversation_id}' was not found.")
            self._conversations.pop(conversation_id, None)

    @staticmethod
    def history(conversation: Conversation, *, max_turns: int) -> list[dict[str, Any]]:
        # A turn is a user message plus its assistant reply.
        messages = conversation.messages[-(max_turns * 2) :]
        return [
            {"role": item.role, "content": item.content}
            for item in messages
        ]
