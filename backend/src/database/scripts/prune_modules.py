"""Remove module rows the CMS module seeder no longer declares.

The hotel half of this app is gone, but a database seeded before that still
holds its module rows (RESERVATIONS, GUEST, FOLIO, ROOM, HOUSEKEEPING, ...).
Left in place they collide on id with the CMS ids the seeder declares, and
role_seeder grants permissions against a tree containing modules no route
requires.

This script keeps only the modules the CMS seeder declares. It reports what it
would delete and requires --apply.

Usage (from backend/): python -m src.database.scripts.prune_modules [--apply]

Everything is inside main() behind a __main__ guard on purpose. At module
level this file touched a live database and called SystemExit, so merely
importing it -- which any tooling that walks the package will do -- mutated
data and aborted the importing process.
"""
import os
import re
import sys

import pymysql
from dotenv import load_dotenv

SEEDER = {
    "CMS": "src/database/seeders/cms/module_seeder.py",
}


def _connect(dbname=None):
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USERNAME"),
        password=os.getenv("DB_PASSWORD"),
        database=dbname,
    )


def main():
    load_dotenv()

    from src.config import get_config
    dbname = (get_config().DATABASE_URL or "").rsplit("/", 1)[-1].split("?")[0]

    with open(SEEDER["CMS"], encoding="utf-8") as fh:
        keep = {n for _i, n in re.findall(
            r'"id":\s*(\d+),\s*\n\s*"module_name":\s*"(\w+)"', fh.read()
        )}

    with _connect(dbname).cursor() as cur:
        cur.execute("SELECT id, module_name FROM modules WHERE is_deleted=0")
        present = cur.fetchall()

    extra = [(i, n) for i, n in present if n not in keep]

    print(f"database : {dbname}")
    print(f"expected : {len(keep)} modules")
    print(f"present  : {len(present)} modules")
    print()
    print("belongs to CMS:")
    for i, n in sorted(present):
        if n in keep:
            print(f"    id={i:<4} {n}")

    if not extra:
        print("\nNothing to prune.")
        return

    print(f"\nNOT A CMS MODULE ({len(extra)}):")
    for i, n in sorted(extra):
        print(f"    id={i:<4} {n}")

    if "--apply" not in sys.argv:
        print(f"\nDry run. Re-run with --apply to delete {len(extra)} row(s).")
        return

    ids = [i for i, _ in extra]
    conn = _connect(dbname)
    with conn.cursor() as cur:
        placeholders = ",".join(["%s"] * len(ids))
        # role_module_access rows referencing these cascade via FK.
        cur.execute(f"DELETE FROM modules WHERE id IN ({placeholders})", ids)
        deleted = cur.rowcount
    conn.commit()
    conn.close()

    print(f"\nDeleted {deleted} foreign module row(s).")
    print("Re-run the seeders to restore this instance's role permissions.")


if __name__ == "__main__":
    main()