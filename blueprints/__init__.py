"""Blueprints package"""
from flask import Blueprint

from .auth import auth_bp
from .posts import posts_bp
from .chat import chat_bp
from .profile import profile_bp
from .misc import misc_bp
from .dirty import dirty_bp  # NUOVO


all_blueprints = [
    (auth_bp, {}),
    (posts_bp, {}),
    (chat_bp, {}),
    (profile_bp, {}),
    (misc_bp, {}),
    (dirty_bp, {}),  # NUOVO
]

