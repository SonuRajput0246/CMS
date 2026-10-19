"""Seeds the DB-driven template store.

Replaces the hardcoded Jinja files that used to live in
templates/emails/{email_verification,account_activation,password_reset}.html.
The copy below is ported verbatim from those three files, including the inline
styling, so switching to this store changes nothing an end user sees. The outer
<!DOCTYPE html>/600px-table boilerplate those files repeated is now the single
static templates/emails/layout.html.

Four codes, email channel only = four rows: the three OTP flows plus
TENANT_ADMIN_INVITATION, which is the link a new tenant's first
administrator clicks to set their password (issued by
src/api/services/tenant_invitation_service.py).

The OTP flows are EMAIL-ONLY by design. An OTP is a possession factor
delivered to an address the user already controls, so an in-app counterpart
would only ever be reachable by someone already signed in -- who does not need
the code in the first place.

`channel='in_app'` remains fully supported for future notification templates;
this seeder just ships none, so `title_template` is unused here.

Each row is marked `is_system=True`, which makes the CRUD API refuse to change
its `code` or `channel` and refuse to delete it. Backend services resolve
templates by code, so a seeded row losing its identity would silently break the
flow it drives. The admin UI can still edit the name, subject, and body.

Runs against an empty table. Do not re-run against a populated one: the
existence check is by (code, channel) with `is_deleted=False`, so a row an admin
has since edited would not be refreshed, while a row an admin has soft-deleted
would get a fresh sibling inserted.
"""
from sqlalchemy import select

from src.api.models.template_model import Template
from src.api.utils.template_codes import (
    INVITATION_VARIABLES,
    OTP_VARIABLES,
    TemplateCode,
    default_sort_order,
)
from src.database.session import db_session
from datetime import datetime, timezone


## Values used to render the live preview in the admin UI. Also what a reviewer
## sees on a fresh install, so keep them obviously placeholder-like.
SAMPLE_CONTEXT = {
    "user_name": "John Doe",
    "otp": "123456",
    "expiry_minutes": 10,
}

## Row-specific preview values for the invitation template. It declares a
## different variable set, so it cannot share SAMPLE_CONTEXT: the CRUD API
## rejects a sample_context whose keys are not all declared on the row, and
## `invite_url` must look like a real link for the preview to be useful.
## The path matches `tenant_accept_url()` -- the link the send path emits.
INVITATION_SAMPLE_CONTEXT = {
    "user_name": "Jane Doe",
    "hotel_name": "Sunrise Cafe",
    "invite_url": "http://sunrise.localhost:4200/auth/accept-invitation?token=example-token",
    "expiry_hours": 72,
}

## The inline-styled OTP block, copied as-is from the original templates.
EMAIL_OTP_BLOCK = (
    '<p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; '
    'text-align: center; color: #2c3e50;">{{ otp }}</p>'
)

## Shared email body. Every original template used this identical wording.
EMAIL_BODY_TAIL = (
    "<p>This OTP is valid for <b>{{ expiry_minutes }} minutes</b>.</p>"
    "<p>If you did not request this, please ignore this email.</p>"
    "<br>"
    "<p>Regards,<br><b>CMS</b></p>"
)


def _email_message(heading):
    return (
        f'<h2 style="color:#333;">{heading}</h2>'
        "<p>Hello {{ user_name }},</p>"
        "<p>Your One-Time Password (OTP) is:</p>"
        f"{EMAIL_OTP_BLOCK}"
        f"{EMAIL_BODY_TAIL}"
    )


## Invitation copy. The button AND a plain-text copy of the link, because a
## mail client that strips buttons must not strand the only path to the
## account. Uses its own variables (INVITATION_VARIABLES), not the OTP set.
def _invitation_message():
    return (
        '<h2 style="color:#333;">Set up the administrator account for {{ hotel_name }}</h2>'
        "<p>Hello {{ user_name }},</p>"
        "<p>A workspace for <b>{{ hotel_name }}</b> has been created and you "
        "have been invited to be its administrator. Choose your password to "
        "activate the account:</p>"
        '<p style="text-align: center;">'
        '<a href="{{ invite_url }}" '
        'style="display:inline-block; padding:12px 24px; background-color:#2c3e50; '
        'color:#ffffff; text-decoration:none; border-radius:4px;">'
        "Accept invitation</a></p>"
        "<p>If the button does not work, copy this link into your browser:</p>"
        '<p style="word-break:break-all; color:#555;">{{ invite_url }}</p>'
        "<p>This invitation is valid for <b>{{ expiry_hours }} hours</b>.</p>"
        "<p>If you were not expecting this email, you can safely ignore it.</p>"
        "<br>"
        "<p>Regards,<br><b>CMS</b></p>"
    )


templates_data = [
    ## ---------------- EMAIL VERIFICATION ----------------
    {
        "code": TemplateCode.EMAIL_VERIFICATION_OTP.value,
        "channel": "email",
        "name": "Email Verification OTP",
        "description": (
            "Sent when a user registers, and again if they request a new "
            "verification code from the login screen."
        ),
        ## Subject preserved exactly as the previous hardcoded value.
        "subject_template": "User email verification",
        "title_template": None,
        "message_template": _email_message("Verify Your Email"),
    },

    ## ---------------- ACCOUNT ACTIVATION ----------------
    {
        "code": TemplateCode.ACCOUNT_ACTIVATION_OTP.value,
        "channel": "email",
        "name": "Account Activation OTP",
        "description": (
            "Sent when a deactivated user reactivates their account."
        ),
        "subject_template": "Account activation OTP",
        "title_template": None,
        "message_template": _email_message("Activate your account."),
    },

    ## ---------------- PASSWORD RESET ----------------
    {
        "code": TemplateCode.PASSWORD_RESET_OTP.value,
        "channel": "email",
        "name": "Password Reset OTP",
        "description": (
            "Sent from the forgot-password flow and from the re-authentication "
            "prompt for a deactivated account."
        ),
        "subject_template": "Password reset OTP",
        "title_template": None,
        "message_template": _email_message("Reset Your Password"),
    },

    ## ---------------- TENANT ADMIN INVITATION ----------------
    {
        "code": TemplateCode.TENANT_ADMIN_INVITATION.value,
        "channel": "email",
        "name": "Tenant Administrator Invitation",
        "description": (
            "Sent to the first administrator when the platform creates a new "
            "tenant. Contains the single-use link that sets their password."
        ),
        "subject_template": "Set up your administrator account",
        "title_template": None,
        "message_template": _invitation_message(),
        "variables": list(INVITATION_VARIABLES),
        "sample_context": dict(INVITATION_SAMPLE_CONTEXT),
    },
]


def seed_templates():
    """Insert any missing template row. Safe to call more than once."""
    try:
        now = datetime.now(timezone.utc)
        created = 0
        skipped = 0

        for td in templates_data:
            stmt = select(Template).filter_by(
                code=td["code"],
                channel=td["channel"],
                is_deleted=False,
            )
            exists = db_session.execute(stmt).scalar_one_or_none()

            if exists:
                skipped += 1
                continue

            new_template = Template(
                code=td["code"],
                channel=td["channel"],
                name=td["name"],
                description=td["description"],
                subject_template=td["subject_template"],
                title_template=td["title_template"],
                message_template=td["message_template"],
                ## Per-row where the row declares its own set (the invitation
                ## template does); the OTP rows keep the shared defaults.
                variables=list(td.get("variables", OTP_VARIABLES)),
                sample_context=dict(td.get("sample_context", SAMPLE_CONTEXT)),
                is_active=True,
                is_system=True,
                version=1,
                sort_order=default_sort_order(td["code"]),
                ## No acting user: seed rows are authored by the seeder.
                created_by=None,
                updated_by=None,
                is_deleted=False,
                deleted_at=None,
                created_at=now,
                updated_at=now,
            )
            db_session.add(new_template)
            created += 1

        db_session.commit()
        print(
            f"--- Templates seeded successfully "
            f"({created} created, {skipped} already present). ---"
        )

    except Exception as e:
        db_session.rollback()
        print("!!! Error seeding templates:", str(e))

    finally:
        ## Return the connection to the pool
        db_session.remove()


if __name__ == "__main__":
    seed_templates()