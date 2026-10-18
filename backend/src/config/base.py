import os

from dotenv import load_dotenv


load_dotenv()


class BaseConfig:

    ## Database
    DATABASE_URL = os.getenv("DATABASE_URL")

    ## SQLAlchemy connection pool settings (VERY IMPORTANT)
    DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", 10))
    DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", 20))
    DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", 30))
    DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", 1800))  # 30 min

    ## JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ALGORITHM = os.getenv("JWT_ALGO", "HS256")
    JWT_ACCESS_TOKEN_EXPIRES_MIN = int(os.getenv("JWT_ACCESS_EXPIRES_MIN", 15))
    JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_EXPIRES_DAYS", 7))

    ## SMTP
    SMTP_HOST = os.getenv("SMTP_HOST")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_EMAIL = os.getenv("SMTP_EMAIL")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

    ## OTP
    OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", 10))
    OTP_ATTEMPTS = int(os.getenv("OTP_ATTEMPTS", 3))

    ## Platform (super admin) console.
    ##
    ## The platform admin has no refresh cookie of its own, so this expiry is
    ## the whole session lifetime. It defaults longer than the 15-minute tenant
    ## access token because an operator switching tenants would otherwise be
    ## logged out mid-work, but short enough that a stolen token goes stale.
    SUPER_ADMIN_TOKEN_EXPIRES_MIN = int(os.getenv("SUPER_ADMIN_TOKEN_EXPIRES_MIN", 60))

    ## Brute-force guard on the platform sign-in. After this many consecutive
    ## wrong passwords the account is locked for `SUPER_ADMIN_LOCKOUT_MINUTES`;
    ## a correct password clears the counter. The platform login is the most
    ## valuable one on the system -- it has no tenant scope -- so it is the one
    ## that most needs a ceiling on guesses.
    SUPER_ADMIN_MAX_LOGIN_ATTEMPTS = int(os.getenv("SUPER_ADMIN_MAX_LOGIN_ATTEMPTS", 5))
    SUPER_ADMIN_LOCKOUT_MINUTES = int(os.getenv("SUPER_ADMIN_LOCKOUT_MINUTES", 15))

    ## Bootstrap credentials for the FIRST platform admin, seeded by
    ## src/database/seeders/platform_admin_seeder.py. Overridable per
    ## environment; the defaults exist so a fresh database can be signed into
    ## at all, and MUST be changed before anything is exposed.
    PLATFORM_ADMIN_EMAIL = os.getenv("PLATFORM_ADMIN_EMAIL", "platform@admin.local")
    PLATFORM_ADMIN_PASSWORD = os.getenv("PLATFORM_ADMIN_PASSWORD", "Platform@123")
    PLATFORM_ADMIN_FIRST_NAME = os.getenv("PLATFORM_ADMIN_FIRST_NAME", "Platform")
    PLATFORM_ADMIN_LAST_NAME = os.getenv("PLATFORM_ADMIN_LAST_NAME", "Admin")

    ## The public origin this deployment is reached at, and the single value
    ## the platform console derives every tenant link from.
    ##
    ##   development  PUBLIC_BASE_URL=http://localhost:4200
    ##   production   PUBLIC_BASE_URL=https://console.example.com
    ##
    ## It exists because the panel used to hardcode `localhost:4200` in three
    ## places, so every subdomain it printed was wrong the moment the app was
    ## served from a real host. This is read at startup and handed to the
    ## browser by `GET /api/super-admin/config`; nothing on the client decides
    ## it for itself.
    ##
    ## Read ONCE, at process start: editing `.env` does not change a running
    ## server. Restart the backend, then reload the console -- the browser also
    ## reads it once per page load, so a tab left open keeps the old value.
    PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:4200")

    ## Cookies
    COOKIE_SECURE = os.getenv("COOKIE_SECURE")
    COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE")

    ## Timezone the business trades in. Every "today" boundary in a report is
    ## computed in THIS zone, not the server's: under Asia/Kolkata the report for
    ## 9 Oct begins at 18:30 UTC on 8 Oct. Get this wrong and the opening and
    ## closing hours of every daily figure land in the wrong bucket.
    ## IANA name, e.g. Asia/Kolkata, Europe/London, America/New_York.
    BUSINESS_TIMEZONE = os.getenv("BUSINESS_TIMEZONE", "Asia/Kolkata")