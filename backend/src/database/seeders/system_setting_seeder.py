from sqlalchemy import select
from src.api.models import SystemSetting
from src.database.session import db_session

## Per-tenant settings. `default_currency` mirrors the tenant's `currency`
## column, which is the live source of truth -- this row is only the placeholder
## for a setting the service layer does not read yet. The value is a parameter so
## the two cannot disagree on a tenant that trades in something other than INR.
def seed_system_settings(default_currency: str = "INR"):
    settings = [
        {"key": "default_currency", "value": default_currency},
    ]
    try:
        for ss in settings:
            ## Modern 2.0 syntax: Check if category exists
            stmt = select(SystemSetting).filter_by(key=ss["key"])
            exists = db_session().execute(stmt).scalar_one_or_none()

            if not exists:
                system_setting = SystemSetting(
                    key=ss["key"],
                    value=ss["value"]
                )
                db_session.add(system_setting)

        db_session.commit()
        print("--- System settings seeded successfully. ---")

    except Exception as e:
        db_session.rollback()
        print("!!! Error seeding system settings:", str(e))
        ## Re-raise: this runs during tenant provisioning now, and a swallowed
        ## error leaves the tenant without its settings while the run reports
        ## success. Consistent with role_seeder and super_admin_seeder.
        raise

    finally:
        ## We use .remove() for scoped_sessions to return the connection to the pool
        db_session.remove()


if __name__ == "__main__":
    seed_system_settings()