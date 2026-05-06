import os
from utils.get_env import get_app_data_directory_env, get_database_url_env
from urllib.parse import urlsplit, urlunsplit, parse_qsl
import ssl
from sqlalchemy import func


def _ensure_sqlite_parent_dir(database_url: str) -> None:
    if not database_url.startswith("sqlite://"):
        return

    split_result = urlsplit(database_url)
    db_path = split_result.path
    if not db_path:
        return

    # sqlite URLs on Windows can start with /C:/..., normalize that for os.path.
    if os.name == "nt" and len(db_path) >= 3 and db_path[0] == "/" and db_path[2] == ":":
        db_path = db_path[1:]

    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
def _int_env(name: str, default: int) -> int:
    """Read an integer from an environment variable, falling back to *default*."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def get_pool_kwargs() -> dict:
    """Build SQLAlchemy engine pool keyword arguments from environment variables.

    Supported variables (all optional):
        DB_POOL_SIZE          – max persistent connections (default 5)
        DB_MAX_OVERFLOW       – extra connections above pool_size (default 10)
        DB_POOL_TIMEOUT       – seconds to wait for a connection (default 30)
        DB_POOL_RECYCLE       – seconds before a connection is recycled (default 1800)
        DB_POOL_PRE_PING      – enable connection liveness check (default true)

    For SQLite the pool settings are not applicable and an empty dict is
    returned, since SQLite uses ``StaticPool`` / ``NullPool`` by default.
    """
    return {
        "pool_size": _int_env("DB_POOL_SIZE", 5),
        "max_overflow": _int_env("DB_MAX_OVERFLOW", 10),
        "pool_timeout": _int_env("DB_POOL_TIMEOUT", 30),
        "pool_recycle": _int_env("DB_POOL_RECYCLE", 1800),
        "pool_pre_ping": os.getenv("DB_POOL_PRE_PING", "true").lower()
        not in ("false", "0", "no"),
    }


def get_database_url_and_connect_args() -> tuple[str, dict]:
    database_url = get_database_url_env() or "sqlite:///" + os.path.join(
        get_app_data_directory_env() or "/tmp/presenton", "fastapi.db"
    )

    _ensure_sqlite_parent_dir(database_url)

    if database_url.startswith("sqlite://"):
        database_url = database_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    elif database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif database_url.startswith("mysql://"):
        database_url = database_url.replace("mysql://", "mysql+aiomysql://", 1)
    else:
        database_url = database_url

    connect_args = {}
    if "sqlite" in database_url:
        connect_args["check_same_thread"] = False

    try:
        split_result = urlsplit(database_url)
        if split_result.query:
            query_params = parse_qsl(split_result.query, keep_blank_values=True)
            driver_scheme = split_result.scheme
            for k, v in query_params:
                key_lower = k.lower()
                if key_lower == "sslmode" and "postgresql+asyncpg" in driver_scheme:
                    if v.lower() != "disable" and "sqlite" not in database_url:
                        connect_args["ssl"] = ssl.create_default_context()

            database_url = urlunsplit(
                (
                    split_result.scheme,
                    split_result.netloc,
                    split_result.path,
                    "",
                    split_result.fragment,
                )
            )
    except Exception:
        pass

    return database_url, connect_args


def group_by_period(column, period: str, database_url: str):
    normalized_period = (period or "day").strip().lower()
    if normalized_period not in {"day", "month"}:
        normalized_period = "day"

    if "sqlite" in database_url:
        sqlite_pattern = "%Y-%m" if normalized_period == "month" else "%Y-%m-%d"
        return func.strftime(sqlite_pattern, column)

    if "mysql" in database_url:
        mysql_pattern = "%Y-%m" if normalized_period == "month" else "%Y-%m-%d"
        return func.date_format(column, mysql_pattern)

    trunc_granularity = "month" if normalized_period == "month" else "day"
    output_pattern = "YYYY-MM" if normalized_period == "month" else "YYYY-MM-DD"
    return func.to_char(func.date_trunc(trunc_granularity, column), output_pattern)


def to_sync_sqlalchemy_url(database_url: str) -> str:
    """Strip async driver prefixes for Alembic and other sync SQLAlchemy engines.

    PostgreSQL URLs use ``postgresql+psycopg://`` (psycopg3) so migrations do not
    depend on psycopg2, which is not installed when using asyncpg at runtime.

    MySQL URLs use ``mysql+pymysql://`` so Alembic does not require ``mysqlclient``
    (the default for plain ``mysql://``); PyMySQL is already pulled in by aiomysql.
    """
    if database_url.startswith("sqlite+aiosqlite:///"):
        return "sqlite:///" + database_url[len("sqlite+aiosqlite:///") :]
    if database_url.startswith("postgresql+asyncpg://"):
        rest = database_url[len("postgresql+asyncpg://") :]
        return f"postgresql+psycopg://{rest}"
    if database_url.startswith("mysql+aiomysql://"):
        rest = database_url[len("mysql+aiomysql://") :]
        return f"mysql+pymysql://{rest}"
    if database_url.startswith("postgresql://"):
        rest = database_url[len("postgresql://") :]
        return f"postgresql+psycopg://{rest}"
    if database_url.startswith("mysql://"):
        rest = database_url[len("mysql://") :]
        return f"mysql+pymysql://{rest}"
    return database_url
