#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

# Database initialization (if needed)
# In our app.py, we have db.create_all() inside 'if __name__ == "__main__"'
# For gunicorn, we might want to run it explicitly or ensure it runs on app import.
# I'll update app.py to ensure db.create_all() runs on every initialization for simplicity in this project.
