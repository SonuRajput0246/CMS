pip install Flask
pip install python-dotenv

### Object Relational Mapper (ORM)
pip install Flask-SQLAlchemy

### For MYSQL Database Connection
pip install mysqlclient

## Initial & setup migration
pip install Flask-Migrate

### For hashing the password
pip install Flask-Bcrypt

pip install PyJWT

pip install flask-cors

pip install marshmallow marshmallow-sqlalchemy


#--------------------------#-----------------------------#

### Commands:
alembic init src/database/migrations
alembic revision --autogenerate -m "[MESSAGE]"
alembic revision --autogenerate -m "initial_migrations"
alembic upgrade head
alembic downgrade -1

python -m src.database.seeders.[SEEDER_FILE_NAME]
python -m src.database.seeders.run_base_seeders

#--------------------------#-----------------------------#

### Cookies variables for production
# COOKIE_SECURE=true
# COOKIE_SAMESITE=None
## response.set_cookie(
##     key="cms_refreshToken",
##     value=refresh_token,
##     httponly=True,
##     secure=False,  ## True in production (HTTPS)
##     samesite="Lax",  ## set "Lax" for localhost and "None" for production
##     max_age=60 * 60 * 24 * current_app.config["JWT_REFRESH_TOKEN_EXPIRE_DAYS"],
##     path="/"
## )


#--------------------------#-----------------------------#

### To Do:
## Filter users by roles (if required)
## Loader in selection formfield

Reports Page
Route
/reports
Reports
*	Sales summary
*	Item sales
*	Daily trend
*	Void report
*	Kitchen performance
*	Customer report
--------------------------

## if you want to insert fake data
pip install faker
