
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]


def main():
    engine = create_engine(DATABASE_URL, pool_size=3)

    tenant_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    folder_a = uuid.uuid4()
    folder_b = uuid.uuid4()

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO tenants (id, name, slug, created_at)
                    VALUES (:id, 'Concurrency Test', :slug, NOW())
                    """
                ),
                {"id": tenant_id, "slug": f"concurrency-{tenant_id}"},
            )

            connection.execute(
                text(
                    """
                    INSERT INTO organizations
                        (id, tenant_id, name, slug, created_at)
                    VALUES (:id, :tenant_id, 'Concurrency Org', 'test', NOW())
                    """
                ),
                {"id": organization_id, "tenant_id": tenant_id},
            )

            for folder_id, name in (
                (folder_a, "Folder A"),
                (folder_b, "Folder B"),
            ):
                connection.execute(
                    text(
                        """
                        INSERT INTO folders
                            (id, organization_id, name, created_at)
                        VALUES (:id, :org_id, :name, NOW())
                        """
                    ),
                    {
                        "id": folder_id,
                        "org_id": organization_id,
                        "name": name,
                    },
                )

        barrier = threading.Barrier(2)

        def update_parent(folder_id, parent_id):
            barrier.wait(timeout=10)

            try:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            """
                            UPDATE folders
                            SET parent_folder_id = :parent_id
                            WHERE id = :folder_id
                            """
                        ),
                        {"parent_id": parent_id, "folder_id": folder_id},
                    )
                return "COMMITTED"
            except DBAPIError as error:
                return f"REJECTED: {error.orig}"

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_a = executor.submit(
                update_parent, folder_a, folder_b
            )
            future_b = executor.submit(
                update_parent, folder_b, folder_a
            )

            results = [future_a.result(), future_b.result()]

        for result in results:
            print(result)

        with engine.connect() as connection:
            relationships = connection.execute(
                text(
                    """
                    SELECT id, parent_folder_id
                    FROM folders
                    WHERE organization_id = :org_id
                    """
                ),
                {"org_id": organization_id},
            ).all()

        parent_map = {
            row.id: row.parent_folder_id for row in relationships
        }

        cycle_exists = (
            parent_map.get(folder_a) == folder_b
            and parent_map.get(folder_b) == folder_a
        )

        if cycle_exists:
            raise RuntimeError("FAILED: Circular hierarchy was committed")

        if results.count("COMMITTED") != 1:
            raise RuntimeError(
                f"Unexpected transaction outcomes: {results}"
            )

        print("PASS: Concurrent updates did not create a cycle")

    finally:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    DELETE FROM folders
                    WHERE organization_id = :org_id
                    """
                ),
                {"org_id": organization_id},
            )
            connection.execute(
                text(
                    "DELETE FROM organizations WHERE id = :org_id"
                ),
                {"org_id": organization_id},
            )
            connection.execute(
                text("DELETE FROM tenants WHERE id = :tenant_id"),
                {"tenant_id": tenant_id},
            )

        engine.dispose()


if __name__ == "__main__":
    main()
