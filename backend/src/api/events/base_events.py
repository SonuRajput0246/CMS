"""Timestamp and soft-delete maintenance, applied to every mapped model.

This replaces five modules that each hand-registered a `before_insert` /
`before_update` pair for a specific model or small list of models:
user_events, role_events, inventory_events, email_otp_events and cms_events.

Why it was worth collapsing:

  * `BaseModel.created_at` / `updated_at` are `nullable=False` with no column
    default. A model inserted without a listener raises
    `MySQLdb.IntegrityError (1048, "Column 'created_at' cannot be null")`, and
    `updated_at` silently stops advancing. The old arrangement therefore made a
    new model fail at runtime unless someone remembered to add it to a list --
    five lists, spread across five files, with nothing to catch a miss. Five
    models (RoleModuleAccess, Template, Token, AccountDeletions, Prefixes) had
    no listener at all and survived only because every writer set `created_at`
    by hand. That is a coincidence, not a guarantee.

  * Registering once against the declarative base covers every current and
    future subclass. Adding a model is now a model file, not a model file plus
    an edit to an event list.

  * Soft-delete timestamping lived in some listeners and not others, so
    `deleted_at` was set on some tables and silently left NULL on others. It
    is now uniform.

Listener placement is deliberately early in `models/__init__.py`: the registry
imports this module for its side effect, and any entry point that touches
models (app.py, an alembic env, a seeder, a management command) imports the
registry. Putting it at the bottom keeps the import acyclic -- the model modules
must all be resolved before `Base` has subclasses to attach to.
"""
from sqlalchemy import event

from src.api.utils.datetime_helper import utcnow
from src.database.base import Base


def _before_insert(mapper, connection, target):
    """Stamp created_at / updated_at on insert.

    `utcnow()` is NAIVE on purpose. These are MySQL DATETIME columns, so the
    driver drops any offset anyway; writing naive keeps what Python holds
    identical to what the row holds, which means a later reload compares
    cleanly against a fresh utcnow().

    An explicit value already on the instance wins, so a backfill or a seeder
    that needs a historical timestamp is not silently overwritten.
    """
    now = utcnow()
    if getattr(target, "created_at", None) is None:
        target.created_at = now
    if getattr(target, "updated_at", None) is None:
        target.updated_at = now


def _before_update(mapper, connection, target):
    now = utcnow()
    target.updated_at = now

    ## Soft-delete timestamp. Set only once, so an undelete-then-redelete cycle
    ## keeps the first deletion time rather than losing the original.
    if getattr(target, "is_deleted", False) and getattr(target, "deleted_at", None) is None:
        target.deleted_at = now


## Registering against the declarative base means every subclass inherits these.
## `propagate=True` is the default for mapper events on a base class; it is
## stated here because the whole module's value depends on it.
event.listen(Base, "before_insert", _before_insert, propagate=True)
event.listen(Base, "before_update", _before_update, propagate=True)
