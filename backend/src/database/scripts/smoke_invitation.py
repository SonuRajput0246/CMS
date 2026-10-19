"""End-to-end smoke test for the tenant-admin invitation flow.

Exercises, in order, against the real database with SMTP captured:

  1. CreateTenantSchema no longer requires (or keeps) a password
  2. reserved slug rejected
  3. create_tenant -> full provisioning (baseline + invitation row) + email
  4. the emailed URL's token hashes to the stored token_hash
  5. resend revokes the old link; preview/accept/re-accept behave
  6. create_invitation supersedes an outstanding link; expired -> 410
  7. unknown token -> 404; audit trail written for all three verbs
  8. full cleanup of every row the test created (finally block, always)

Run from backend/:

    python -m src.database.scripts.smoke_invitation

Exits 0 on PASS, 1 on FAIL. Creates a throwaway tenant, then removes it.
"""
import re
import sys
from types import SimpleNamespace

from sqlalchemy import text

from app import create_app
from src.api.schemas.invitation_schema import AcceptInvitationSchema
from src.api.schemas.tenant_management_schema import CreateTenantSchema
from src.api.services.tenant_invitation_service import (
    TenantInvitationService,
    create_invitation,
)
from src.api.services.tenant_management_service import TenantManagementService
from src.api.utils.security import hash_value
from src.database.session import db_session, engine

## ---------------------------------------------------------------------------
## SMTP capture: every "sent" email is recorded, none leaves the machine.
## ---------------------------------------------------------------------------
CAPTURED = []


def _fake_send_email(receiver_email, subject, html_body):
    CAPTURED.append({"to": receiver_email, "subject": subject, "body": html_body})
    return True


import src.api.services.tenant_invitation_service as tis_module
tis_module.send_email = _fake_send_email

CHECKS = {"passed": 0, "failed": 0}


def check(label: str, ok: bool, detail: str = ""):
    if ok:
        CHECKS["passed"] += 1
        print(f"  PASS  {label}")
    else:
        CHECKS["failed"] += 1
        print(f"  FAIL  {label} {('-- ' + detail) if detail else ''}")


def token_from_email(body: str) -> str:
    m = re.search(r"token=([A-Za-z0-9_\-]+)", body)
    assert m, "no accept link in the email body"
    return m.group(1)


def main() -> int:
    app = create_app()
    ctx = app.app_context()
    ctx.push()

    actor = SimpleNamespace(id=None, email="smoke-operator@example.com")
    slug = "smoketest-inv"
    admin_email = "alice-invite-smoke@example.com"
    tid = None

    try:
        tenant_service = TenantManagementService(db=db_session)
        invitation_service = TenantInvitationService(db=db_session)

        ## ---- 1. schema: no password required, old password ignored -------
        print("[1] schema")
        loaded = CreateTenantSchema().load({
            "name": "Smoke Test Hotel", "slug": slug,
            "timezone": "Asia/Kolkata", "currency": "INR",
            "admin_first_name": "Alice", "admin_last_name": "Invite",
            "admin_email": admin_email,
            "admin_password": "legacy-field",  ## pre-migration frontend
        })
        check("CreateTenantSchema loads without admin_password",
              "admin_password" not in loaded)
        try:
            AcceptInvitationSchema().load({"token": "x" * 43, "password": "ab"})
            check("AcceptInvitationSchema rejects a short password", False)
        except Exception:
            check("AcceptInvitationSchema rejects a short password", True)

        ## ---- 2. reserved slug --------------------------------------------
        print("[2] reserved slug")
        result, code = tenant_service.create_tenant({
            "name": "Nope", "slug": "api", "timezone": "Asia/Kolkata",
            "currency": "INR",
            "admin_first_name": "A", "admin_last_name": "B",
            "admin_email": "x@example.com",
        }, actor)
        check("reserved slug -> 400", code == 400, f"got {code}")

        ## ---- 3. full create + provisioning --------------------------------
        print("[3] create_tenant")
        result, code = tenant_service.create_tenant({
            "name": "Smoke Test Hotel", "slug": slug,
            "timezone": "Asia/Kolkata", "currency": "INR",
            "admin_first_name": "Alice", "admin_last_name": "Invite",
            "admin_email": admin_email,
        }, actor)
        check("create -> 201", code == 201, f"{code}: {result.get('message')}")
        if code != 201:
            raise AssertionError("cannot continue without a tenant")
        tid = result["data"]["id"]
        check("response carries admin_invitation with email_sent",
              result["data"].get("admin_invitation", {}).get("email_sent") is True,
              str(result["data"].get("admin_invitation")))
        check("message names the invited address",
              admin_email in result["message"], result["message"])

        with engine.connect() as c:
            n_users = c.execute(text(
                "SELECT COUNT(*) FROM users WHERE tenant_id = :t"
            ), {"t": tid}).scalar()
            n_invites = c.execute(text(
                "SELECT COUNT(*) FROM tenant_admin_invitations WHERE tenant_id = :t"
            ), {"t": tid}).scalar()
            n_tmpl = c.execute(text(
                "SELECT COUNT(*) FROM message_templates WHERE tenant_id = :t "
                "AND code = 'TENANT_ADMIN_INVITATION' AND is_deleted = 0"
            ), {"t": tid}).scalar()
            n_roles = c.execute(text(
                "SELECT COUNT(*) FROM roles WHERE tenant_id = :t AND is_deleted = 0"
            ), {"t": tid}).scalar()
            n_prefixes = c.execute(text(
                "SELECT COUNT(*) FROM prefixes WHERE tenant_id = :t"
            ), {"t": tid}).scalar()
            n_settings = c.execute(text(
                "SELECT COUNT(*) FROM system_settings WHERE tenant_id = :t"
            ), {"t": tid}).scalar()
        check("no user exists before acceptance", n_users == 0, str(n_users))
        check("exactly one invitation issued", n_invites == 1, str(n_invites))
        check("invitation template seeded for the NEW tenant", n_tmpl == 1, str(n_tmpl))
        check("roles seeded", n_roles >= 5, str(n_roles))
        check("prefixes + system settings seeded",
              n_prefixes >= 1 and n_settings >= 1,
              f"{n_prefixes}/{n_settings}")

        ## ---- 4. emailed token hashes to the stored hash -------------------
        print("[4] email content")
        check("one email captured", len(CAPTURED) == 1, str(len(CAPTURED)))
        mail = CAPTURED[0]
        check("email addressed to the admin", mail["to"] == admin_email, mail["to"])
        token1 = token_from_email(mail["body"])
        check("accept URL carries the tenant slug",
              f"{slug}." in mail["body"] and "/auth/accept-invitation?token=" in mail["body"])
        with engine.connect() as c:
            stored_hash = c.execute(text(
                "SELECT token_hash FROM tenant_admin_invitations WHERE tenant_id = :t"
            ), {"t": tid}).scalar()
        check("emailed token matches stored hash",
              stored_hash == hash_value(token1))
        check("raw token is not stored anywhere",
              token1 not in stored_hash)

        ## ---- 5. resend BEFORE accepting: old link dies, new one works ------
        print("[5] resend / preview / accept")
        result, code = invitation_service.preview(token1)
        check("preview -> 200 pending", code == 200 and result["data"]["status"] == "pending",
              str(result))
        check("preview shows hotel name",
              result["data"].get("hotel_name") == "Smoke Test Hotel",
              str(result["data"].get("hotel_name")))

        result, code = tenant_service.resend_admin_invitation(tid, actor)
        check("resend (unaccepted) -> 200 with a fresh email",
              code == 200 and result["data"]["email_sent"] is True,
              f"{code}: {result.get('message')}")
        check("two emails captured", len(CAPTURED) == 2, str(len(CAPTURED)))
        token2 = token_from_email(CAPTURED[1]["body"])
        check("resend message names the recipient",
              admin_email in result["message"], result["message"])

        result, code = invitation_service.accept(token1, "Smoketest#123")
        check("pre-resend link -> 410 revoked", code == 410,
              f"{code}: {result.get('message')}")

        result, code = invitation_service.accept(token2, "Smoketest#123")
        check("resend link accepts -> 200", code == 200,
              f"{code}: {result.get('message')}")
        check("accept returns the hotel slug for redirect",
              result.get("data", {}).get("hotel_slug") == slug, str(result.get("data")))

        with engine.connect() as c:
            user = c.execute(text(
                "SELECT u.password, u.is_email_verified, u.is_active, r.role_code "
                "FROM users u JOIN roles r ON r.id = u.role_id "
                "WHERE u.tenant_id = :t AND u.email = :e"
            ), {"t": tid, "e": admin_email}).fetchone()
        check("user created with ADMIN role",
              user is not None and user[3] == "ADMIN", str(user))
        check("password hashed, email verified, active",
              user is not None and user[0].startswith("$2") and bool(user[1]) and bool(user[2]),
              str(user))

        result, code = invitation_service.accept(token2, "Smoketest#123")
        check("re-accept of same token -> 409", code == 409, f"{code}: {result.get('message')}")
        result, code = invitation_service.preview(token2)
        check("preview after accept -> accepted",
              code == 200 and result["data"]["status"] == "accepted", str(result["data"]["status"]))

        ## ---- 6. resend with an accepted record; create supersedes ---------
        print("[6] second resend + supersede")
        ## Latest invitation is Alice's ACCEPTED row, so resend still refuses:
        ## there is no unclaimed admin to resend to.
        result, code = tenant_service.resend_admin_invitation(tid, actor)
        check("resend after acceptance -> 400", code == 400,
              f"{code}: {result.get('message')}")

        ## A brand-new tenant admin invite (Bob) via the same issue path the
        ## seeder uses, then resend, which supersedes Bob's link.
        issued_b = create_invitation(db_session, _tenant(tid), {
            "first_name": "Bob", "last_name": "Resend",
            "email": "bob-invite-smoke@example.com",
        })
        result, code = tenant_service.resend_admin_invitation(tid, actor)
        check("resend (Bob unaccepted) -> 200",
              code == 200 and result["data"]["email_sent"] is True,
              f"{code}: {result.get('message')}")
        check("three emails captured", len(CAPTURED) == 3, str(len(CAPTURED)))
        token3 = token_from_email(CAPTURED[2]["body"])

        result, code = invitation_service.accept(issued_b["token"], "Smoketest#123")
        check("link superseded by resend -> 410", code == 410,
              f"{code}: {result.get('message')}")

        ## create_invitation also supersedes an outstanding link (Carol's
        ## mint revokes Bob's resend link before it is ever used).
        issued_c = create_invitation(db_session, _tenant(tid), {
            "first_name": "Carol", "last_name": "Final",
            "email": "carol-invite-smoke@example.com",
        })
        result, code = invitation_service.accept(token3, "Smoketest#456")
        check("link superseded by create_invitation -> 410", code == 410,
              f"{code}: {result.get('message')}")
        result, code = invitation_service.accept(issued_c["token"], "Smoketest#789")
        check("current link accepts -> 200", code == 200,
              f"{code}: {result.get('message')}")

        ## ---- 7. expired + unknown -----------------------------------------
        print("[7] expired / unknown")
        issued_exp = create_invitation(db_session, _tenant(tid), {
            "first_name": "Dave", "last_name": "Expired",
            "email": "dave-invite-smoke@example.com",
        })
        with engine.connect() as c:
            c.execute(text(
                "UPDATE tenant_admin_invitations SET expires_at = "
                "'2020-01-01 00:00:00' WHERE id = :i"
            ), {"i": issued_exp["invitation_id"]})
            c.commit()
        result, code = invitation_service.accept(issued_exp["token"], "Smoketest#123")
        check("expired link -> 410", code == 410, f"{code}: {result.get('message')}")
        with engine.connect() as c:
            n_dave = c.execute(text(
                "SELECT COUNT(*) FROM users WHERE tenant_id = :t "
                "AND email = 'dave-invite-smoke@example.com'"
            ), {"t": tid}).scalar()
        check("expired link created no user", n_dave == 0, str(n_dave))

        result, code = invitation_service.preview("z" * 43)
        check("unknown token -> 404", code == 404, f"{code}")

        ## ---- 8. audit trail ------------------------------------------------
        print("[8] audit")
        with engine.connect() as c:
            actions = [r[0] for r in c.execute(text(
                "SELECT action FROM audit_logs WHERE entity_type = 'tenant' "
                "AND entity_id = :t"
            ), {"t": tid}).fetchall()]
        check("CREATE_TENANT audited", "CREATE_TENANT" in actions, str(actions))
        check("RESEND_ADMIN_INVITATION audited", "RESEND_ADMIN_INVITATION" in actions, str(actions))
        check("ACCEPT_ADMIN_INVITATION audited", "ACCEPT_ADMIN_INVITATION" in actions, str(actions))

    finally:
        ## ---- cleanup: every row this test created --------------------------
        print("[cleanup]")
        if tid is not None:
            try:
                with engine.connect() as c:
                    c.execute(text(
                        "DELETE FROM role_module_access WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM users WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM tenant_admin_invitations WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM roles WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM prefixes WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM system_settings WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM message_templates WHERE tenant_id = :t"
                    ), {"t": tid})
                    c.execute(text(
                        "DELETE FROM audit_logs WHERE entity_type = 'tenant' "
                        "AND entity_id = :t"
                    ), {"t": tid})
                    c.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tid})
                    c.commit()
                print("  cleaned up tenant", tid)
            except Exception as exc:
                db_session.rollback()
                print("  CLEANUP FAILED:", exc)
        db_session.remove()
        ctx.pop()

    print(f"\n{CHECKS['passed']} passed, {CHECKS['failed']} failed")
    return 1 if CHECKS["failed"] else 0


def _tenant(tid: int):
    from src.api.models.tenant_model import Tenant
    return db_session.query(Tenant).filter(Tenant.id == tid).first()


if __name__ == "__main__":
    sys.exit(main())
