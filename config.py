import os
from datetime import timedelta

# ============================================================================
# SECURITY & SESSION
# ============================================================================

SECRET_KEY = "r0Kr6RjOXUmG63Vf4iXbRqlh7yDi2RzxkAPIGp0PSrvP9WyAmDqFaM0muP0vFfM5EeAFf1hwxAg3lxxvtaaGrHLqLez5RoUTipRLhhopM7IItRnfBwvSzSxYesB57mdoZbIfFl5OkZE1CFsCM0K1NPkySgOkydyYMiexwksS0N0QqFmjQR7hpDQg0rlTqrM3p7HiTvoHQ8ELTqA2o99O7OzMTRgxw1JRhKMdIt3jhnaKqZY97EUkyOrdlXv1j49X"

SESSION_LIFETIME_DAYS = 365
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = False  # True HTTPS

# ============================================================================
# DATABASE
# ============================================================================

DB_CONFIG = {
    'dbname': 'moment2',
    'user': 'postgres',
    'password': 'elektro',
    'host': 'localhost',
    'port': '5432'
}

DB_POOL_MIN = 1
DB_POOL_MAX = 1024

# ============================================================================
# UPLOAD & FILES
# ============================================================================

UPLOAD_FOLDER = "uploads/avif"
AVATARS_FOLDER = os.path.join(UPLOAD_FOLDER, 'avatars')
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16 MB
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# ============================================================================
# SECURITY LIMITS
# ============================================================================

MAX_CONTENT_LENGTH = 5000
MAX_BIO_LENGTH = 1000
MAX_USERNAME_LENGTH = 50
MAX_EMAIL_LENGTH = 100
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_LENGTH = 6
MAX_SOCIAL_LINKS = 8
MAX_POLL_OPTIONS = 6
MAX_POLL_QUESTION_LENGTH = 500
MAX_POLL_OPTION_LENGTH = 200

# Rate limits (requests, seconds)
RATE_LIMIT_LOGIN = (5, 60)
RATE_LIMIT_REGISTER = (20, 300)
RATE_LIMIT_POST = (50, 3600)
RATE_LIMIT_COMMENT = (60, 60)
RATE_LIMIT_MESSAGE = (60, 60)
RATE_LIMIT_LIKE = (40, 60)
RATE_LIMIT_PIN = (20, 60)
RATE_LIMIT_POLL_VOTE = (10, 60)
RATE_LIMIT_VIEW = (400, 60)
RATE_LIMIT_PROFILE_UPDATE = (10, 60)
RATE_LIMIT_CRONO = (30, 60)

# ============================================================================
# APP SETTINGS
# ============================================================================

MAX_POST_DURATION_SECONDS = 2 * 24 * 3600
DEFAULT_POST_DURATION = 3600

SEARCH_LIMIT_USERS = 15
SEARCH_LIMIT_POSTS = 50
SEARCH_LIMIT_COMMENTS = 100

LOAD_POSTS_LIMIT = 20
LOAD_POSTS_MAX = 50

COMMENTS_PER_PAGE = 20
COMMENTS_MAX_PER_PAGE = 100

# ============================================================================
# SOCKETIO
# ============================================================================

SOCKETIO_CORS_ORIGINS = "*"

# ============================================================================
# SECURITY HEADERS
# ============================================================================

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': ""
}

HSTS_HEADER = 'max-age=31536000; includeSubDomains'

# ============================================================================
# DEBUG
# ============================================================================

DEBUG = True
HOST = "0.0.0.0"
PORT = 5000
