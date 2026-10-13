"""Seeders.

This package deliberately imports nothing. Seeder modules open database sessions
at call time, so eagerly importing them here would make
`import src.database.seeders` a side-effecting operation.

Import the specific seeder you need directly:

    from src.database.seeders.currencies_seeder import seed_currencies

`run_base_seeders` is the entry point that runs everything in the right order:

    python -m src.database.seeders.run_base_seeders

Most modules expose a `seed_*` function and are also runnable directly:

    python -m src.database.seeders.recipe_seeder
"""
