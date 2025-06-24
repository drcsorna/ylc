# Food Search App

A Flask-based food search and meal tracking application.

## Setup with UV

1. **Initialize UV project:**
   ```bash
   uv init
   ```

2. **Install dependencies:**
   ```bash
   uv add flask requests
   ```

3. **Install development dependencies:**
   ```bash
   uv add --dev pytest black flake8 mypy
   ```

4. **Run the application:**
   ```bash
   uv run python backend/app.py
   ```

## Project Structure

```
food_app/
├── backend/           # Flask backend
│   ├── app.py        # Main application
│   ├── database.py   # Database operations
│   ├── api_client.py # External API client
│   └── config.py     # Configuration
├── frontend/         # Static frontend files
│   ├── index.html    # Main HTML template
│   └── static/       # CSS, JS, assets
├── pyproject.toml    # UV project configuration
└── .env             # Environment variables
```

## Development

- Backend runs on http://localhost:5000
- Frontend is served from backend
- Database: SQLite (food_app.db)

## Migration Notes

After running this setup script:

1. Copy the full CSS from the original file to `frontend/static/css/style.css`
2. Copy the full JavaScript from the original file to `frontend/static/js/app.js`
3. Test the split application
4. Update imports in backend files if needed
