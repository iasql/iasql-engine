import os
from flask import Flask, current_app, jsonify, make_response, session
from flask_session import Session
        
def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'sqlpal'
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_PERMANENT'] = True
    app.config['SESSION_FILE_DIR'] = '/tmp'
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

    Session(app)

    app.config.from_pyfile('../config.py')

    from .routes import api_bp
    app.register_blueprint(api_bp)

    return app