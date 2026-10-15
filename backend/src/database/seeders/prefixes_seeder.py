from sqlalchemy import select
from src.api.models import Prefixes
from src.database.session import db_session
from datetime import datetime, timezone

prefixes_data = [
    {"code": "ORD", "purpose": "order", "description": "For Order Number"},
    {"code": "CUS", "purpose": "customer", "description": "For Customer Code"},
    {"code": "RCP", "purpose": "recipe", "description": "For Recipe Code"},
]

def seed_prefixes():
    try:
        for pd in prefixes_data:
            ## Must match on `purpose`, not `code`: the old filter_by(code=purpose)
            ## never matched anything (code is 'RES', purpose is 'reservation'),
            ## so every run inserted a duplicate. That would then make
            ## DocumentSequenceService's scalar_one_or_none() blow up with
            ## MultipleResultsFound the first time an order number is generated.
            stmt = select(Prefixes).filter_by(purpose=pd["purpose"], is_active=True)
            exists = db_session().execute(stmt).scalar_one_or_none()

            if not exists:
                prefix = Prefixes(
                    code=pd["code"],
                    purpose=pd["purpose"],
                    description=pd["description"],
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db_session.add(prefix)

        db_session.commit()
        print("--- Prefixes seeded successfully. ---")

    except Exception as e:
        db_session.rollback()
        print("!!! Error seeding prefixes:", str(e))
        ## Re-raise: this runs during tenant provisioning now, and a swallowed
        ## error leaves the tenant without the prefixes DocumentSequenceService
        ## needs, so the first order number fails far from the real cause.
        raise

    finally:
        ## We use .remove() for scoped_sessions to return the connection to the pool
        db_session.remove()


if __name__ == "__main__":
    seed_prefixes()
