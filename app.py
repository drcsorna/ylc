#!/usr/bin/env python3
"""
Complete Enhanced Food Search App - Backend
==========================================
Flask backend with all features combined
"""

from flask import Flask, request, jsonify, session, redirect, url_for
import requests
import json
import sqlite3
import os
from datetime import datetime, date, timedelta
import hashlib
import math
from functools import wraps

__version__ = "2.2.4"

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'
DB_PATH = 'food_app.db'

# ========================
# DATABASE INITIALIZATION
# ========================

def init_database():
    """Initialize SQLite database with all features"""
    try:
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                height REAL,
                weight REAL,
                age INTEGER,
                activity_level TEXT DEFAULT 'moderate',
                daily_calorie_goal INTEGER DEFAULT 2000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Check existing columns and add new ones
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        migrations_applied = []
        
        # Add macro columns if missing
        if 'macro_preset' not in columns:
            cursor.execute('ALTER TABLE users ADD COLUMN macro_preset TEXT DEFAULT "balanced"')
            cursor.execute('ALTER TABLE users ADD COLUMN carbs_percent INTEGER DEFAULT 40')
            cursor.execute('ALTER TABLE users ADD COLUMN protein_percent INTEGER DEFAULT 30')
            cursor.execute('ALTER TABLE users ADD COLUMN fat_percent INTEGER DEFAULT 30')
            migrations_applied.append('macro_tracking')
        
        # Add goal tracking columns
        if 'goal_type' not in columns:
            cursor.execute('ALTER TABLE users ADD COLUMN goal_type TEXT DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN target_weight REAL DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN target_date DATE DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN goal_created_date DATE DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN calculated_daily_calories INTEGER DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN bmr REAL DEFAULT NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN tdee REAL DEFAULT NULL')
            migrations_applied.append('goal_tracking')
        
        # Weight logs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS weight_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                weight REAL NOT NULL,
                log_date DATE NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                UNIQUE(user_id, log_date)
            )
        ''')
        
        # Notifications table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                is_read BOOLEAN DEFAULT 0,
                action_url TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Food MDM table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS food_mdm (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                food_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                cal REAL,
                protein REAL,
                carbo REAL,
                fat REAL,
                piece TEXT,
                portions TEXT,
                api_response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Meal log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meal_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                food_id TEXT NOT NULL,
                food_name TEXT NOT NULL,
                meal_type TEXT NOT NULL,
                quantity REAL NOT NULL,
                calories REAL,
                protein REAL,
                carbohydrates REAL,
                fat REAL,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                date_eaten DATE,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs (user_id, log_date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_food_mdm_name ON food_mdm (name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_food_mdm_food_id ON food_mdm (food_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_meal_log_date ON meal_log (date_eaten)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_meal_log_user ON meal_log (user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id)')
        
        # Add notifications for new features
        if migrations_applied:
            if 'goal_tracking' in migrations_applied:
                cursor.execute('''
                    INSERT INTO notifications (user_id, title, message, type, action_url)
                    SELECT id, 
                           '🎯 New Feature: Goal Setting & Weight Tracking!',
                           'Set weight goals, track daily progress, and get personalized calorie targets based on scientific calculations. Click to set your goals!',
                           'feature',
                           'goals'
                    FROM users
                    WHERE id NOT IN (SELECT DISTINCT user_id FROM notifications WHERE title LIKE '%Goal Setting%')
                ''')
            
            if 'macro_tracking' in migrations_applied:
                cursor.execute('''
                    INSERT INTO notifications (user_id, title, message, type)
                    SELECT id, 
                           'New Feature: Macro Tracking! 🎯',
                           'We''ve added macro tracking to help you reach your nutrition goals! You can now set custom macro targets (carbs, protein, fat) in your settings. We''ve set you up with a balanced preset to start.',
                           'feature'
                    FROM users
                    WHERE id NOT IN (SELECT DISTINCT user_id FROM notifications WHERE title LIKE '%Macro Tracking%')
                ''')
        
        conn.commit()
        print(f"✅ Database initialized successfully with {len(migrations_applied)} new features")
        if migrations_applied:
            print(f"   Applied migrations: {', '.join(migrations_applied)}")
        return True
        
    except Exception as e:
        print(f"❌ Database initialization error: {e}")
        return False
    finally:
        conn.close()

# ========================
# SCIENTIFIC CALCULATIONS
# ========================

def calculate_bmr(weight, height, age, gender='unspecified'):
    """Calculate Basal Metabolic Rate using Mifflin-St Jeor Equation"""
    if not all([weight, height, age]):
        return None
    
    if gender.lower() == 'male':
        bmr = 10 * weight + 6.25 * height - 5 * age + 5
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    
    return round(bmr, 1)

def calculate_tdee(bmr, activity_level):
    """Calculate Total Daily Energy Expenditure"""
    if not bmr:
        return None
    
    activity_multipliers = {
        'sedentary': 1.2,
        'light': 1.375,
        'moderate': 1.55,
        'active': 1.725,
        'very_active': 1.9
    }
    
    multiplier = activity_multipliers.get(activity_level, 1.55)
    return round(bmr * multiplier, 1)

def calculate_daily_calories_for_goal(current_weight, target_weight, target_date, tdee, goal_created_date=None):
    """Calculate daily calorie intake needed to reach target weight by target date"""
    if not all([current_weight, target_weight, target_date, tdee]):
        return None
    
    start_date = goal_created_date or date.today()
    if isinstance(target_date, str):
        target_date = datetime.strptime(target_date, '%Y-%m-%d').date()
    
    days_to_goal = (target_date - start_date).days
    if days_to_goal <= 0:
        return tdee
    
    weight_change = target_weight - current_weight
    total_calorie_change = weight_change * 7700
    daily_calorie_change = total_calorie_change / days_to_goal
    
    target_daily_calories = tdee + daily_calorie_change
    target_daily_calories = max(1200, min(4000, target_daily_calories))
    
    return round(target_daily_calories)

# ========================
# AUTHENTICATION FUNCTIONS
# ========================

def hash_password(password):
    """Simple password hashing using SHA-256 with salt"""
    salt = "food_app_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def verify_password(password, hashed):
    """Verify password against hash"""
    return hash_password(password) == hashed

def require_auth(f):
    """Decorator to require authentication for protected routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# ========================
# FOOD DATA PROCESSING
# ========================

def clean_api_response(api_food):
    """Clean and normalize API response data for consistent storage"""
    def safe_float(value):
        if not value:
            return 0.0
        try:
            str_val = str(value).strip()
            str_val = str_val.replace('kcal', '').replace('cal', '').replace('g', '').strip()
            if not str_val or str_val.lower() in ['n/a', 'na', 'null', 'none', '']:
                return 0.0
            num_val = float(str_val)
            return max(0.0, num_val)
        except (ValueError, TypeError):
            print(f"Warning: Could not convert '{value}' to float, using 0.0")
            return 0.0
    
    return {
        'food_id': api_food.get('food_id') or api_food.get('ID') or api_food.get('id'),
        'name': api_food.get('name', ''),
        'cal': safe_float(api_food.get('cal', 0)),
        'protein': safe_float(api_food.get('protein', 0)),
        'carbo': safe_float(api_food.get('carbo', 0)),
        'fat': safe_float(api_food.get('fat', 0)),
        'piece': api_food.get('piece', '100g'),
        'original_response': api_food
    }

def save_food_to_mdm(food_data, portions_data=None):
    """Save food data to master data management table for caching"""
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    cursor = conn.cursor()
    
    try:
        cleaned = clean_api_response(food_data)
        food_id = cleaned['food_id']
        
        if not food_id:
            return False
            
        cursor.execute('SELECT id FROM food_mdm WHERE food_id = ?', (food_id,))
        if cursor.fetchone():
            return True
            
        cursor.execute('''
            INSERT INTO food_mdm 
            (food_id, name, cal, protein, carbo, fat, piece, portions, api_response)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            food_id,
            cleaned['name'],
            cleaned['cal'],
            cleaned['protein'],
            cleaned['carbo'],
            cleaned['fat'],
            cleaned['piece'],
            json.dumps(portions_data) if portions_data else None,
            json.dumps(cleaned['original_response'])
        ))
        
        conn.commit()
        return True
        
    except Exception as e:
        print(f"Error saving to MDM: {e}")
        return False
    finally:
        conn.close()

def search_local_mdm(query):
    """Search local food database for cached food items"""
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT food_id, name, cal, protein, carbo, fat, piece, portions, api_response
            FROM food_mdm 
            WHERE name LIKE ? 
            ORDER BY name
            LIMIT 20
        ''', (f'%{query}%',))
        
        results = []
        for row in cursor.fetchall():
            food_id, name, cal, protein, carbo, fat, piece, portions, api_response = row
            
            food = {
                'food_id': food_id,
                'name': name,
                'cal': cal,
                'protein': protein,
                'carbo': carbo,
                'fat': fat,
                'piece': piece,
                'source': 'local',
                'portions': json.loads(portions) if portions else None
            }
            
            if api_response:
                original = json.loads(api_response)
                food.update(original)
                food['source'] = 'local'
                
            results.append(food)
            
        return results
        
    except Exception as e:
        print(f"Error searching local MDM: {e}")
        return []
    finally:
        conn.close()

def log_meal(food_data, meal_type, quantity, date_eaten=None, user_id=None):
    """Log a meal entry to the database with calculated nutrition values"""
    print(f"=== LOGGING MEAL ===")
    print(f"Food data: {food_data}")
    print(f"Meal type: {meal_type}")
    print(f"Quantity: {quantity}")
    print(f"User ID: {user_id}")
    
    if not user_id:
        print("❌ Error: No user_id provided")
        return False
    
    if not food_data:
        print("❌ Error: No food_data provided")
        return False
    
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    cursor = conn.cursor()
    
    try:
        if date_eaten:
            if isinstance(date_eaten, str):
                try:
                    parsed_date = datetime.strptime(date_eaten, '%Y-%m-%d').date()
                    date_eaten = parsed_date
                except ValueError:
                    print(f"Invalid date format: {date_eaten}, using today")
                    date_eaten = datetime.now().date()
        else:
            date_eaten = datetime.now().date()
        
        food_id = food_data.get('food_id') or food_data.get('ID') or food_data.get('id') or food_data.get('fid')
        if not food_id:
            food_name = food_data.get('name', 'unknown')
            food_id = f"custom_{hashlib.md5(food_name.encode()).hexdigest()[:8]}"
            print(f"Generated food_id: {food_id}")
            
        try:
            multiplier = float(quantity) / 100.0
            print(f"Quantity multiplier: {multiplier}")
        except (ValueError, TypeError):
            print(f"❌ Error: Invalid quantity value: {quantity}")
            return False
        
        def safe_float(value):
            if not value:
                return 0.0
            try:
                str_val = str(value).strip()
                str_val = str_val.replace('kcal', '').replace('cal', '').replace('g', '').strip()
                if not str_val or str_val.lower() in ['n/a', 'na', 'null', 'none', '']:
                    return 0.0
                num_val = float(str_val)
                return max(0.0, min(num_val, 10000.0))
            except (ValueError, TypeError):
                print(f"Warning: Could not convert '{value}' to float, using 0.0")
                return 0.0
        
        cal = safe_float(food_data.get('cal', 0))
        protein = safe_float(food_data.get('protein', 0))
        carbo = safe_float(food_data.get('carbo', 0))
        fat = safe_float(food_data.get('fat', 0))
        
        print(f"Base nutrition - Cal: {cal}, Protein: {protein}, Carbo: {carbo}, Fat: {fat}")
        
        calculated_cal = cal * multiplier
        calculated_protein = protein * multiplier
        calculated_carbo = carbo * multiplier
        calculated_fat = fat * multiplier
        
        print(f"Calculated nutrition - Cal: {calculated_cal}, Protein: {calculated_protein}, Carbo: {calculated_carbo}, Fat: {calculated_fat}")
        
        cursor.execute('''
            INSERT INTO meal_log 
            (user_id, food_id, food_name, meal_type, quantity, calories, protein, carbohydrates, fat, date_eaten)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            food_id,
            food_data.get('name', ''),
            meal_type,
            float(quantity),
            calculated_cal,
            calculated_protein,
            calculated_carbo,
            calculated_fat,
            date_eaten
        ))
        
        conn.commit()
        row_id = cursor.lastrowid
        print(f"✅ Meal logged successfully with ID: {row_id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error logging meal: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return False
    finally:
        conn.close()

# ========================
# FLASK ROUTES
# ========================

@app.route('/')
def home():
    """Main route that serves the HTML page"""
    return open('index.html').read()

@app.route('/check_auth')
def check_auth():
    """Check if user is currently authenticated"""
    if 'user_id' in session:
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA table_info(users)")
            columns = [column[1] for column in cursor.fetchall()]
            
            base_columns = ['id', 'username', 'email', 'first_name', 'last_name', 'height', 'weight', 'age', 'activity_level', 'daily_calorie_goal']
            macro_columns = ['macro_preset', 'carbs_percent', 'protein_percent', 'fat_percent']
            
            available_macro_columns = [col for col in macro_columns if col in columns]
            all_columns = base_columns + available_macro_columns
            
            query = f"SELECT {', '.join(all_columns)} FROM users WHERE id = ?"
            cursor.execute(query, (session['user_id'],))
            user_data = cursor.fetchone()
            
            if user_data:
                user = {
                    'id': user_data[0],
                    'username': user_data[1],
                    'email': user_data[2],
                    'first_name': user_data[3],
                    'last_name': user_data[4],
                    'height': user_data[5],
                    'weight': user_data[6],
                    'age': user_data[7],
                    'activity_level': user_data[8],
                    'daily_calorie_goal': user_data[9]
                }
                
                if 'macro_preset' in columns:
                    macro_data_start = len(base_columns)
                    user['macro_preset'] = user_data[macro_data_start] if len(user_data) > macro_data_start else 'balanced'
                    user['carbs_percent'] = user_data[macro_data_start + 1] if len(user_data) > macro_data_start + 1 else 40
                    user['protein_percent'] = user_data[macro_data_start + 2] if len(user_data) > macro_data_start + 2 else 30
                    user['fat_percent'] = user_data[macro_data_start + 3] if len(user_data) > macro_data_start + 3 else 30
                else:
                    user['macro_preset'] = 'balanced'
                    user['carbs_percent'] = 40
                    user['protein_percent'] = 30
                    user['fat_percent'] = 30
                
                return jsonify({'authenticated': True, 'user': user})
        except Exception as e:
            print(f"Error checking auth: {e}")
        finally:
            conn.close()
    
    return jsonify({'authenticated': False})

@app.route('/register', methods=['POST'])
def register():
    """Handle user registration"""
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        
        if not all([username, email, password]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        password_hash = hash_password(password)
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT INTO users (username, email, password_hash, first_name, last_name)
                VALUES (?, ?, ?, ?, ?)
            ''', (username, email, password_hash, first_name, last_name))
            
            conn.commit()
            return jsonify({'success': True, 'message': 'User registered successfully'})
            
        except sqlite3.IntegrityError as e:
            if 'username' in str(e):
                return jsonify({'error': 'Username already exists'}), 400
            elif 'email' in str(e):
                return jsonify({'error': 'Email already exists'}), 400
            else:
                return jsonify({'error': 'Registration failed'}), 400
        finally:
            conn.close()
            
    except Exception as e:
        print(f"Registration error: {e}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not all([email, password]):
            return jsonify({'error': 'Missing email or password'}), 400
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        try:
            cursor.execute("PRAGMA table_info(users)")
            columns = [column[1] for column in cursor.fetchall()]
            
            base_columns = ['id', 'password_hash', 'username', 'first_name', 'last_name', 'height', 'weight', 'age', 'activity_level', 'daily_calorie_goal']
            macro_columns = ['macro_preset', 'carbs_percent', 'protein_percent', 'fat_percent']
            
            available_macro_columns = [col for col in macro_columns if col in columns]
            all_columns = base_columns + available_macro_columns
            
            query = f"SELECT {', '.join(all_columns)} FROM users WHERE email = ?"
            cursor.execute(query, (email,))
            user_data = cursor.fetchone()
            
            if user_data and verify_password(password, user_data[1]):
                session['user_id'] = user_data[0]
                user = {
                    'id': user_data[0],
                    'username': user_data[2],
                    'email': email,
                    'first_name': user_data[3],
                    'last_name': user_data[4],
                    'height': user_data[5],
                    'weight': user_data[6],
                    'age': user_data[7],
                    'activity_level': user_data[8],
                    'daily_calorie_goal': user_data[9]
                }
                
                if 'macro_preset' in columns:
                    macro_data_start = len(base_columns)
                    user['macro_preset'] = user_data[macro_data_start] if len(user_data) > macro_data_start else 'balanced'
                    user['carbs_percent'] = user_data[macro_data_start + 1] if len(user_data) > macro_data_start + 1 else 40
                    user['protein_percent'] = user_data[macro_data_start + 2] if len(user_data) > macro_data_start + 2 else 30
                    user['fat_percent'] = user_data[macro_data_start + 3] if len(user_data) > macro_data_start + 3 else 30
                else:
                    user['macro_preset'] = 'balanced'
                    user['carbs_percent'] = 40
                    user['protein_percent'] = 30
                    user['fat_percent'] = 30
                
                return jsonify({'success': True, 'user': user})
            else:
                return jsonify({'error': 'Invalid email or password'}), 401
                
        finally:
            conn.close()
            
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    session.pop('user_id', None)
    return jsonify({'success': True})

@app.route('/api/update_profile', methods=['POST'])
@require_auth
def update_profile():
    """Update user profile information"""
    try:
        data = request.get_json()
        user_id = session['user_id']
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        try:
            cursor.execute("PRAGMA table_info(users)")
            columns = [column[1] for column in cursor.fetchall()]
            
            base_fields = [
                'first_name = ?', 'last_name = ?', 'height = ?', 'weight = ?', 'age = ?',
                'activity_level = ?', 'daily_calorie_goal = ?', 'updated_at = CURRENT_TIMESTAMP'
            ]
            base_values = [
                data.get('first_name'),
                data.get('last_name'),
                data.get('height'),
                data.get('weight'),
                data.get('age'),
                data.get('activity_level'),
                data.get('daily_calorie_goal')
            ]
            
            if 'macro_preset' in columns:
                base_fields.extend(['macro_preset = ?', 'carbs_percent = ?', 'protein_percent = ?', 'fat_percent = ?'])
                base_values.extend([
                    data.get('macro_preset'),
                    data.get('carbs_percent'),
                    data.get('protein_percent'),
                    data.get('fat_percent')
                ])
            
            update_query = f"UPDATE users SET {', '.join(base_fields)} WHERE id = ?"
            cursor.execute(update_query, base_values + [user_id])
            conn.commit()
            
            # Return updated user data
            base_columns = ['id', 'username', 'email', 'first_name', 'last_name', 'height', 'weight', 'age', 'activity_level', 'daily_calorie_goal']
            macro_columns = ['macro_preset', 'carbs_percent', 'protein_percent', 'fat_percent']
            
            available_macro_columns = [col for col in macro_columns if col in columns]
            all_columns = base_columns + available_macro_columns
            
            query = f"SELECT {', '.join(all_columns)} FROM users WHERE id = ?"
            cursor.execute(query, (user_id,))
            user_data = cursor.fetchone()
            
            user = {
                'id': user_data[0],
                'username': user_data[1],
                'email': user_data[2],
                'first_name': user_data[3],
                'last_name': user_data[4],
                'height': user_data[5],
                'weight': user_data[6],
                'age': user_data[7],
                'activity_level': user_data[8],
                'daily_calorie_goal': user_data[9]
            }
            
            if 'macro_preset' in columns:
                macro_data_start = len(base_columns)
                user['macro_preset'] = user_data[macro_data_start] if len(user_data) > macro_data_start else 'balanced'
                user['carbs_percent'] = user_data[macro_data_start + 1] if len(user_data) > macro_data_start + 1 else 40
                user['protein_percent'] = user_data[macro_data_start + 2] if len(user_data) > macro_data_start + 2 else 30
                user['fat_percent'] = user_data[macro_data_start + 3] if len(user_data) > macro_data_start + 3 else 30
            else:
                user['macro_preset'] = 'balanced'
                user['carbs_percent'] = 40
                user['protein_percent'] = 30
                user['fat_percent'] = 30
            
            return jsonify({'success': True, 'user': user})
            
        finally:
            conn.close()
            
    except Exception as e:
        print(f"Profile update error: {e}")
        return jsonify({'error': 'Profile update failed'}), 500

# Goal setting routes
@app.route('/api/set_goal', methods=['POST'])
@require_auth
def set_goal():
    """Set user's weight and calorie goals with scientific calculations"""
    try:
        data = request.get_json()
        user_id = session['user_id']
        
        goal_type = data.get('goal_type')
        target_weight = data.get('target_weight')
        target_date = data.get('target_date')
        custom_calories = data.get('custom_calories')
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT weight, height, age, activity_level, daily_calorie_goal
            FROM users WHERE id = ?
        ''', (user_id,))
        user_data = cursor.fetchone()
        
        if not user_data:
            return jsonify({'error': 'User not found'}), 404
        
        current_weight, height, age, activity_level, current_calorie_goal = user_data
        
        bmr = calculate_bmr(current_weight, height, age)
        tdee = calculate_tdee(bmr, activity_level)
        
        if goal_type == 'custom_calories':
            calculated_daily_calories = custom_calories
            target_weight = current_weight
            target_date = None
        elif goal_type == 'maintain':
            calculated_daily_calories = int(tdee) if tdee else current_calorie_goal
            target_weight = current_weight
            target_date = None
        else:
            if not target_weight or not target_date:
                return jsonify({'error': 'Target weight and date required for weight goals'}), 400
            
            calculated_daily_calories = calculate_daily_calories_for_goal(
                current_weight, target_weight, target_date, tdee, date.today()
            )
        
        cursor.execute('''
            UPDATE users SET 
                goal_type = ?, 
                target_weight = ?, 
                target_date = ?, 
                goal_created_date = ?,
                calculated_daily_calories = ?,
                daily_calorie_goal = ?,
                bmr = ?,
                tdee = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (goal_type, target_weight, target_date, date.today(), 
              calculated_daily_calories, calculated_daily_calories, 
              bmr, tdee, user_id))
        
        if goal_type in ['weight_loss', 'weight_gain'] and current_weight:
            cursor.execute('''
                INSERT OR REPLACE INTO weight_logs (user_id, weight, log_date, notes)
                VALUES (?, ?, ?, ?)
            ''', (user_id, current_weight, date.today(), 'Goal setting - starting weight'))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'goal': {
                'goal_type': goal_type,
                'target_weight': target_weight,
                'target_date': target_date,
                'calculated_daily_calories': calculated_daily_calories,
                'bmr': bmr,
                'tdee': tdee
            }
        })
        
    except Exception as e:
        print(f"Error setting goal: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/log_weight', methods=['POST'])
@require_auth
def log_weight():
    """Log daily weight entry"""
    try:
        data = request.get_json()
        user_id = session['user_id']
        weight = data.get('weight')
        log_date = data.get('date', date.today().isoformat())
        notes = data.get('notes', '')
        
        if not weight:
            return jsonify({'error': 'Weight is required'}), 400
        
        if isinstance(log_date, str):
            log_date = datetime.strptime(log_date, '%Y-%m-%d').date()
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO weight_logs (user_id, weight, log_date, notes)
            VALUES (?, ?, ?, ?)
        ''', (user_id, float(weight), log_date, notes))
        
        if log_date == date.today():
            cursor.execute('''
                UPDATE users SET weight = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (float(weight), user_id))
        
        conn.commit()
        
        return jsonify({'success': True, 'message': 'Weight logged successfully'})
        
    except Exception as e:
        print(f"Error logging weight: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/weight_history')
@require_auth
def get_weight_history():
    """Get weight history for progress tracking"""
    try:
        user_id = session['user_id']
        days = int(request.args.get('days', 30))
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT weight, log_date, notes
            FROM weight_logs 
            WHERE user_id = ? AND log_date >= ?
            ORDER BY log_date ASC
        ''', (user_id, date.today() - timedelta(days=days)))
        
        weight_logs = []
        for row in cursor.fetchall():
            weight_logs.append({
                'weight': row[0],
                'date': row[1].isoformat(),
                'notes': row[2]
            })
        
        cursor.execute('''
            SELECT goal_type, target_weight, target_date, goal_created_date, weight
            FROM users WHERE id = ?
        ''', (user_id,))
        
        user_data = cursor.fetchone()
        goal_data = None
        projected_progress = []
        
        if user_data and user_data[0]:
            goal_type, target_weight, target_date, goal_created_date, current_weight = user_data
            
            goal_data = {
                'goal_type': goal_type,
                'target_weight': target_weight,
                'target_date': target_date.isoformat() if target_date else None,
                'goal_created_date': goal_created_date.isoformat() if goal_created_date else None
            }
            
            if goal_type in ['weight_loss', 'weight_gain'] and target_weight and target_date and goal_created_date:
                start_date = goal_created_date
                end_date = target_date
                days_total = (end_date - start_date).days
                
                if days_total > 0:
                    current_date = max(start_date, date.today() - timedelta(days=days))
                    while current_date <= min(end_date, date.today() + timedelta(days=30)):
                        days_elapsed = (current_date - start_date).days
                        progress_ratio = days_elapsed / days_total
                        projected_weight = current_weight + (target_weight - current_weight) * progress_ratio
                        
                        projected_progress.append({
                            'date': current_date.isoformat(),
                            'weight': round(projected_weight, 1)
                        })
                        
                        current_date += timedelta(days=1)
        
        return jsonify({
            'success': True,
            'weight_logs': weight_logs,
            'goal_data': goal_data,
            'projected_progress': projected_progress
        })
        
    except Exception as e:
        print(f"Error getting weight history: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/goal_status')
@require_auth
def get_goal_status():
    """Get current goal status and progress"""
    try:
        user_id = session['user_id']
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT goal_type, target_weight, target_date, goal_created_date, 
                   calculated_daily_calories, weight, bmr, tdee
            FROM users WHERE id = ?
        ''', (user_id,))
        
        user_data = cursor.fetchone()
        if not user_data or not user_data[0]:
            return jsonify({'success': True, 'has_goal': False})
        
        goal_type, target_weight, target_date, goal_created_date, daily_calories, current_weight, bmr, tdee = user_data
        
        cursor.execute('''
            SELECT weight, log_date FROM weight_logs 
            WHERE user_id = ? ORDER BY log_date DESC LIMIT 1
        ''', (user_id,))
        
        latest_weight_log = cursor.fetchone()
        
        goal_status = {
            'has_goal': True,
            'goal_type': goal_type,
            'target_weight': target_weight,
            'target_date': target_date.isoformat() if target_date else None,
            'goal_created_date': goal_created_date.isoformat() if goal_created_date else None,
            'daily_calorie_target': daily_calories,
            'current_weight': current_weight,
            'latest_logged_weight': latest_weight_log[0] if latest_weight_log else None,
            'latest_weight_date': latest_weight_log[1].isoformat() if latest_weight_log else None,
            'bmr': bmr,
            'tdee': tdee
        }
        
        if goal_type in ['weight_loss', 'weight_gain'] and target_weight and current_weight:
            if latest_weight_log:
                latest_weight = latest_weight_log[0]
                total_change_needed = target_weight - current_weight
                current_change = latest_weight - current_weight
                
                if total_change_needed != 0:
                    progress_percentage = (current_change / total_change_needed) * 100
                    goal_status['progress_percentage'] = round(progress_percentage, 1)
                    goal_status['weight_change'] = round(current_change, 1)
                    goal_status['weight_remaining'] = round(target_weight - latest_weight, 1)
        
        if target_date:
            days_remaining = (target_date - date.today()).days
            goal_status['days_remaining'] = days_remaining
        
        return jsonify({'success': True, **goal_status})
        
    except Exception as e:
        print(f"Error getting goal status: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Notification routes
@app.route('/api/notifications')
@require_auth
def get_notifications():
    """Get notifications for the current user"""
    try:
        user_id = session['user_id']
        limit = int(request.args.get('limit', 10))
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        where_clause = 'WHERE user_id = ?'
        params = [user_id]
        
        if unread_only:
            where_clause += ' AND is_read = 0'
        
        cursor.execute(f'''
            SELECT id, title, message, type, is_read, created_at
            FROM notifications 
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ?
        ''', params + [limit])
        
        notifications = []
        for row in cursor.fetchall():
            notifications.append({
                'id': row[0],
                'title': row[1],
                'message': row[2],
                'type': row[3],
                'is_read': bool(row[4]),
                'created_at': row[5]
            })
        
        cursor.execute('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', (user_id,))
        unread_count = cursor.fetchone()[0]
        
        return jsonify({
            'success': True,
            'notifications': notifications,
            'unread_count': unread_count
        })
        
    except Exception as e:
        print(f"Error getting notifications: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@require_auth
def mark_notification_read(notification_id):
    """Mark a notification as read"""
    try:
        user_id = session['user_id']
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE notifications 
            SET is_read = 1 
            WHERE id = ? AND user_id = ?
        ''', (notification_id, user_id))
        
        conn.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/notifications/read_all', methods=['POST'])
@require_auth
def mark_all_notifications_read():
    """Mark all notifications as read for the current user"""
    try:
        user_id = session['user_id']
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE notifications 
            SET is_read = 1 
            WHERE user_id = ? AND is_read = 0
        ''', (user_id,))
        
        conn.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error marking all notifications as read: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Meal logging routes
@app.route('/get_meals_for_date')
@require_auth
def get_meals_for_date():
    """Retrieve all meals logged for a specific date"""
    try:
        date_str = request.args.get('date', '')
        if not date_str:
            return jsonify({'error': 'No date provided'})
        
        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format'})
        
        user_id = session['user_id']
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT food_id, food_name, meal_type, quantity, calories, protein, carbohydrates, fat, logged_at
            FROM meal_log 
            WHERE user_id = ? AND date_eaten = ? 
            ORDER BY logged_at DESC
        ''', (user_id, selected_date))
        
        meals = []
        for row in cursor.fetchall():
            food_id, food_name, meal_type, quantity, calories, protein, carbs, fat, logged_at = row
            meals.append({
                'food_id': food_id,
                'food_name': food_name,
                'meal_type': meal_type,
                'quantity': quantity,
                'calories': calories,
                'protein': protein,
                'carbohydrates': carbs,
                'fat': fat,
                'logged_at': logged_at
            })
        
        return jsonify({'success': True, 'meals': meals, 'date': date_str})
        
    except Exception as e:
        print(f"Error getting meals for date {date_str}: {e}")
        return jsonify({'error': str(e)})
    finally:
        conn.close()

@app.route('/log_meal', methods=['POST'])
@require_auth
def log_meal_route():
    """Log a meal entry for the current user"""
    try:
        data = request.get_json()
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'No user session found'}), 401
        
        food_data = data.get('food')
        meal_type = data.get('meal_type')
        quantity = data.get('quantity')
        date_eaten = data.get('date_eaten')
        
        if not food_data:
            return jsonify({'error': 'Missing food data'}), 400
        if not meal_type:
            return jsonify({'error': 'Missing meal type'}), 400
        if not quantity:
            return jsonify({'error': 'Missing quantity'}), 400
        
        try:
            quantity = float(quantity)
            if quantity <= 0:
                return jsonify({'error': 'Quantity must be greater than 0'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid quantity format'}), 400
        
        if food_data.get('source') == 'api':
            save_food_to_mdm(food_data)
        
        success = log_meal(food_data, meal_type, quantity, date_eaten, user_id)
        
        if success:
            return jsonify({'success': True, 'message': 'Meal logged successfully'})
        else:
            return jsonify({'error': 'Failed to log meal to database'}), 500
            
    except Exception as e:
        print(f"Log meal route error: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/delete_meal', methods=['POST'])
@require_auth
def delete_meal_route():
    """Delete a specific meal entry for the current user"""
    try:
        data = request.get_json()
        user_id = session['user_id']
        food_id = data.get('food_id')
        meal_type = data.get('meal_type')
        quantity = data.get('quantity')
        date_eaten = data.get('date_eaten', datetime.now().date().isoformat())
        
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute('''
            DELETE FROM meal_log 
            WHERE user_id = ? AND food_id = ? AND meal_type = ? AND quantity = ? AND date_eaten = ?
            LIMIT 1
        ''', (user_id, food_id, meal_type, float(quantity), date_eaten))
        
        deleted_rows = cursor.rowcount
        conn.commit()
        
        return jsonify({'success': True, 'deleted_rows': deleted_rows})
        
    except Exception as e:
        print(f"❌ Error deleting meal: {e}")
        return jsonify({'error': str(e)})
    finally:
        conn.close()

# Food search routes
@app.route('/search')
def search():
    """Search for foods using both local cache and external API"""
    query = request.args.get('q', '').strip()
    page = int(request.args.get('p', 1))
    
    if not query:
        return jsonify({'error': 'No query provided'})
    
    try:
        local_results = search_local_mdm(query)
        print(f"Found {len(local_results)} local results for '{query}'")
        
        api_results = []
        
        try:
            session_req = requests.Session()
            
            main_url = 'https://kaloriabazis.hu/'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            main_response = session_req.get(main_url, headers=headers, timeout=10)
            
            api_url = 'https://kaloriabazis.hu/getfood.php'
            api_params = {
                'fav': 'false',
                'q': query,
                'p': page
            }
            api_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://kaloriabazis.hu/',
                'X-Requested-With': 'XMLHttpRequest',
            }
            
            response = session_req.get(api_url, params=api_params, headers=api_headers, timeout=10)
            
            if response.status_code == 200:
                text = response.text
                
                if 'die_with_text' not in text and len(text) >= 50:
                    data = json.loads(text)
                    
                    if 'results2' in data and isinstance(data['results2'], list):
                        api_results = data['results2']
                    elif 'results1' in data and isinstance(data['results1'], list):
                        api_results = data['results1']
                    
                    for result in api_results:
                        result['source'] = 'api'
                    
                    local_food_ids = {r.get('food_id') for r in local_results}
                    api_results = [r for r in api_results if r.get('food_id') not in local_food_ids and r.get('ID') not in local_food_ids]
                    
        except Exception as api_error:
            print(f"API search failed: {api_error}")
        
        all_results = []
        
        if page == 1:
            all_results.extend(local_results[:8])
        
        remaining_slots = 8 - len(all_results)
        if remaining_slots > 0:
            all_results.extend(api_results[:remaining_slots])
        
        total_local = len(local_results) if page == 1 else 0
        total_api = len(api_results)
        combined_total = total_local + total_api
        
        pagination = {
            'current_page': page,
            'total_results': combined_total,
            'total_pages': max(1, (combined_total + 7) // 8),
            'local_count': len([r for r in all_results if r.get('source') == 'local']),
            'api_count': len([r for r in all_results if r.get('source') == 'api'])
        }
        
        return jsonify({
            'query': query,
            'foods': all_results,
            'pagination': pagination
        })
        
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({'error': str(e)})

@app.route('/portions')
def get_portions():
    """Get portion sizes for a specific food item"""
    food_id = request.args.get('id', '').strip()
    
    if not food_id:
        return jsonify({'error': 'No food ID provided'})
    
    default_portions = [
        {'label': 'kicsi', 'weight': 80},
        {'label': 'közepes', 'weight': 150},
        {'label': 'nagy', 'weight': 220}
    ]
    
    return jsonify({'food_id': food_id, 'portions': default_portions, 'source': 'default'})

# Debug routes
@app.route('/debug')
def debug():
    """Debug endpoint for testing"""
    query = request.args.get('q', 'alma')
    return jsonify({
        'query': query,
        'status': 'debug endpoint working',
        'message': 'API connection test'
    })

@app.route('/test_db')
def test_database():
    """Test database connectivity"""
    try:
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        table_info = {}
        for (table_name,) in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            table_info[table_name] = count
        
        return jsonify({
            'database_path': DB_PATH,
            'database_exists': os.path.exists(DB_PATH),
            'tables': table_info
        })
        
    except Exception as e:
        return jsonify({'error': str(e)})
    finally:
        conn.close()

@app.route('/test')
def test():
    """Simple test endpoint"""
    return {'status': 'ok', 'message': 'Flask is working!'}

# Initialize database on startup
init_database()

if __name__ == '__main__':
    print("🚀 Starting Complete Enhanced Food Search App...")
    print("📊 Features: ALL FEATURES COMBINED")
    print("🎯 Goal Setting: Scientific BMR/TDEE calculations, weight tracking")
    print("🍽️ Food Tracking: Complete meal logging with portion control")
    print("📱 UI: Enhanced mobile-responsive design with expandable layouts")
    print("🔔 Notifications: Real-time notification system")
    print("⚙️ Settings: Complete user profile and macro management")
    print("📅 Navigation: Full date navigation with calendar system")
    print("🔍 Search: Advanced food search with local caching")
    
    print("✅ Backend ready - http://localhost:5000")
    
    app.run(debug=True, host='127.0.0.1', port=5000)