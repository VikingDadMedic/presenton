from collections.abc import AsyncGenerator
import os
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy import event, text
from sqlmodel import SQLModel

from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from models.sql.image_asset import ImageAsset
from models.sql.key_value import KeyValueSqlModel
from models.sql.narration_usage_log import NarrationUsageLog
from models.sql.ollama_pull_status import OllamaPullStatus
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.presentation import PresentationModel
from models.sql.template import TemplateModel
from models.sql.template_create_info import TemplateCreateInfoModel
from models.sql.slide import SlideModel
from models.sql.webhook_subscription import WebhookSubscription
from utils.get_env import get_app_data_directory_env
from utils.get_env import get_migrate_database_on_startup_env
from utils.db_utils import get_database_url_and_connect_args, get_pool_kwargs


database_url, connect_args = get_database_url_and_connect_args()

# Apply connection-pool settings for server-class databases (PostgreSQL, MySQL).
# SQLite uses a file-lock model and ignores pool configuration, so we skip it.
_pool_kwargs = get_pool_kwargs() if "sqlite" not in database_url else {}

sql_engine: AsyncEngine = create_async_engine(
    database_url, connect_args=connect_args, **_pool_kwargs
)
async_session_maker = async_sessionmaker(sql_engine, expire_on_commit=False)


def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


if database_url.startswith("sqlite"):
    event.listen(sql_engine.sync_engine, "connect", _enable_sqlite_foreign_keys)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


# Container DB (Lives inside the app data directory)
_app_data_dir = get_app_data_directory_env() or "/tmp/presenton"
container_db_url = f"sqlite+aiosqlite:///{os.path.join(_app_data_dir, 'container.db')}"
container_db_engine: AsyncEngine = create_async_engine(
    container_db_url, connect_args={"check_same_thread": False}
)
event.listen(container_db_engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
container_db_async_session_maker = async_sessionmaker(
    container_db_engine, expire_on_commit=False
)


async def get_container_db_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with container_db_async_session_maker() as session:
        yield session


# Create Database and Tables
async def create_db_and_tables():
    should_run_alembic = get_migrate_database_on_startup_env() in ["true", "True"]
    if not should_run_alembic:
        async with sql_engine.begin() as conn:
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        PresentationModel.__table__,
                        SlideModel.__table__,
                        KeyValueSqlModel.__table__,
                        ImageAsset.__table__,
                        NarrationUsageLog.__table__,
                        PresentationLayoutCodeModel.__table__,
                        TemplateCreateInfoModel.__table__,
                        TemplateModel.__table__,
                        WebhookSubscription.__table__,
                        AsyncPresentationGenerationTaskModel.__table__,
                    ],
                )
            )

            # Lightweight schema migration for existing DBs: ensure new columns exist.
            async def _get_column_names(table_name: str) -> set[str]:
                if database_url.startswith("sqlite"):
                    result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
                    return {row[1] for row in result.fetchall()}

                result = await conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = :table_name"
                    ),
                    {"table_name": table_name},
                )
                return {row[0] for row in result.fetchall()}

            presentation_column_names = await _get_column_names("presentations")

            if "theme" not in presentation_column_names:
                col_type = "JSON" if database_url.startswith("sqlite") else "JSONB"
                await conn.execute(text(f"ALTER TABLE presentations ADD COLUMN theme {col_type}"))
                presentation_column_names.add("theme")

            presentation_migration_columns = [
                ("origin", "VARCHAR(255)", None),
                ("currency", "VARCHAR(16)", "'USD'"),
                ("enriched_context", "TEXT", None),
                ("enriched_data", "JSON" if database_url.startswith("sqlite") else "JSONB", None),
                ("narration_voice_id", "VARCHAR(64)", None),
                ("narration_tone", "VARCHAR(64)", None),
                ("narration_model_id", "VARCHAR(64)", None),
                ("narration_pronunciation_dictionary_id", "VARCHAR(64)", None),
            ]
            for col_name, col_type, default_val in presentation_migration_columns:
                if col_name not in presentation_column_names:
                    default_clause = f" DEFAULT {default_val}" if default_val else ""
                    await conn.execute(text(
                        f"ALTER TABLE presentations ADD COLUMN {col_name} {col_type}{default_clause}"
                    ))
                    presentation_column_names.add(col_name)

            slide_column_names = await _get_column_names("slides")
            slide_migration_columns = [
                ("narration_voice_id", "VARCHAR(64)", None),
                ("narration_tone", "VARCHAR(64)", None),
                ("narration_model_id", "VARCHAR(64)", None),
                ("narration_audio_url", "VARCHAR(255)", None),
                ("narration_text_hash", "VARCHAR(64)", None),
                (
                    "narration_generated_at",
                    "DATETIME" if database_url.startswith("sqlite") else "TIMESTAMP WITH TIME ZONE",
                    None,
                ),
            ]
            for col_name, col_type, default_val in slide_migration_columns:
                if col_name not in slide_column_names:
                    default_clause = f" DEFAULT {default_val}" if default_val else ""
                    await conn.execute(
                        text(f"ALTER TABLE slides ADD COLUMN {col_name} {col_type}{default_clause}")
                    )
                    slide_column_names.add(col_name)

    async with container_db_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[OllamaPullStatus.__table__],
            )
        )


async def dispose_engines():
    """Dispose all engine connection pools.

    Call this during application shutdown (e.g. in a FastAPI ``shutdown``
    event or lifespan context) to release every connection back to the
    database and prevent stale / leaked connections.
    """
    await sql_engine.dispose()
    await container_db_engine.dispose()
