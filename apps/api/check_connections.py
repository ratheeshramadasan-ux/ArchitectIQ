import os

from dotenv import load_dotenv
from redis import Redis
from sqlalchemy import create_engine, text

load_dotenv()

database_url = os.environ["DATABASE_URL"]
redis_url = os.environ["REDIS_URL"]

engine = create_engine(database_url, pool_pre_ping=True)

with engine.connect() as connection:
    result = connection.execute(
        text("SELECT current_database(), current_user")
    ).one()
    print(f"PostgreSQL OK: database={result[0]}, user={result[1]}")

engine.dispose()

client = Redis.from_url(redis_url, socket_connect_timeout=5)

try:
    if not client.ping():
        raise RuntimeError("Redis PING failed")
    print("Redis OK: PONG")
finally:
    client.close()

print("ArchitectIQ infrastructure connectivity verified.")
