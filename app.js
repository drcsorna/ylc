// ===== GLOBAL VARIABLES =====
var searchTimeout;
var selectedFoods = [];
var currentSearchQuery = '';
var currentPagination = null;
var currentFood = null;
var currentQuantity = 1;
var currentUnit = 'g';
var currentUnitGrams = 1;
var currentMeal = 'ebed';
var editingFoodId = null;
var currentDate = new Date();
var calendarDate = new Date();
var availablePortions = [];
var currentUser = null;
var expandedMealGroups = {};
var notifications = [];
var unreadNotificationCount = 0;
var isCalorieExpanded = false;
var weightChart = null;
var selectedGoalType = null;
var goalStatus = null;

// API URL configuration
var API_BASE_URL = '';
if (window.location.pathname.includes('/proxy/')) {
    var pathParts = window.location.pathname.split('/');
    var proxyIndex = pathParts.indexOf('proxy');
    if (proxyIndex !== -1 && pathParts[proxyIndex + 1]) {
        API_BASE_URL = '/' + pathParts.slice(1, proxyIndex + 2).join('/');
    }
}

function apiUrl(endpoint) {
    if (endpoint.startsWith('/')) {
        endpoint = endpoint.substring(1);
    }
    return API_BASE_URL + '/' + endpoint;
}

// Unit conversion factors
var unitConversions = {
    'g': 1,
    'dkg': 10,
    'kg': 1000,
    'slice': 30,
    'piece': 50,
    'cup': 250
};

// ===== INITIALIZATION =====

window.addEventListener('load', function() {
    checkAuthStatus();
    
    // Set up macro preset change handler
    setTimeout(function() {
        var macroPreset = document.getElementById('settings-macro-preset');
        if (macroPreset) {
            macroPreset.addEventListener('change', toggleCustomMacros);
        }
    }, 1000);
});

// ===== AUTHENTICATION FUNCTIONS =====

function checkAuthStatus() {
    fetch(apiUrl('check_auth'))
        .then(function(response) { 
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json(); 
        })
        .then(function(data) {
            if (data.authenticated) {
                currentUser = data.user;
                showApp();
            } else {
                showLogin();
            }
        })
        .catch(function(error) {
            console.error('Auth check failed:', error);
            showLogin();
        });
}

function showLogin() {
    document.getElementById('initial-loading').style.display = 'none';
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

function showApp() {
    document.getElementById('initial-loading').style.display = 'none';
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.body.style.background = '#f0f0f0';
    
    if (currentUser) {
        document.getElementById('user-welcome').textContent = 'Welcome, ' + currentUser.first_name + '!';
    }
    
    updateDateDisplay();
    loadMealsForDate(currentDate);
    loadGoalStatus();
    loadNotifications();
}

function login() {
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    fetch(apiUrl('login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
    })
    .then(function(response) { 
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json(); 
    })
    .then(function(data) {
        if (data.success) {
            currentUser = data.user;
            showApp();
        } else {
            showError(data.error || 'Login failed');
        }
    })
    .catch(function(error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
    });
}

function register() {
    var username = document.getElementById('reg-username').value;
    var email = document.getElementById('reg-email').value;
    var password = document.getElementById('reg-password').value;
    var firstName = document.getElementById('reg-first-name').value;
    var lastName = document.getElementById('reg-last-name').value;
    
    if (!username || !email || !password) {
        showError('Please fill in required fields');
        return;
    }
    
    fetch(apiUrl('register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: username,
            email: email,
            password: password,
            first_name: firstName,
            last_name: lastName
        })
    })
    .then(function(response) { 
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json(); 
    })
    .then(function(data) {
        if (data.success) {
            showLoginForm();
            showSuccess('Account created successfully! Please log in with your new credentials.');
            
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-email').value = '';
            document.getElementById('reg-password').value = '';
            document.getElementById('reg-first-name').value = '';
            document.getElementById('reg-last-name').value = '';
        } else {
            showError(data.error || 'Registration failed');
        }
    })
    .catch(function(error) {
        console.error('Registration error:', error);
        showError('Registration failed: ' + error.message);
    });
}

function logout() {
    fetch(apiUrl('api/logout'), { method: 'POST' })
        .then(function() {
            currentUser = null;
            showLogin();
        })
        .catch(function(error) {
            console.error('Logout failed:', error);
            currentUser = null;
            showLogin();
        });
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('loading-state').style.display = 'none';
    hideMessages();
}

function showLoginForm() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('loading-state').style.display = 'none';
    hideMessages();
}

function hideMessages() {
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('success-message').style.display = 'none';
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-message').style.display = 'block';
    document.getElementById('success-message').style.display = 'none';
}

function showSuccess(message) {
    document.getElementById('success-message').textContent = message;
    document.getElementById('success-message').style.display = 'block';
    document.getElementById('error-message').style.display = 'none';
}

// ===== ENHANCED FUNCTIONALITY =====

function toggleCalorieExpansion() {
    var expandable = document.getElementById('calorie-expandable');
    var toggle = document.getElementById('calorie-toggle');
    
    isCalorieExpanded = !isCalorieExpanded;
    
    if (isCalorieExpanded) {
        expandable.classList.add('expanded');
        toggle.style.transform = 'rotate(180deg)';
        
        setTimeout(function() {
            loadWeightHistory();
            if (weightChart) {
                weightChart.resize();
            }
        }, 400);
    } else {
        expandable.classList.remove('expanded');
        toggle.style.transform = 'rotate(0deg)';
    }
}

function showGoalSetting() {
    var overlay = document.getElementById('goal-modal-overlay');
    var modal = overlay.querySelector('.modal');
    
    overlay.style.display = 'flex';
    overlay.classList.add('show');
    setTimeout(function() {
        modal.classList.add('show');
    }, 10);
    
    setupGoalSelection();
}

function closeGoalModal() {
    var overlay = document.getElementById('goal-modal-overlay');
    var modal = overlay.querySelector('.modal');
    
    modal.classList.remove('show');
    setTimeout(function() {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
        
        selectedGoalType = null;
        document.querySelectorAll('.goal-option').forEach(function(opt) {
            opt.classList.remove('selected');
        });
        document.querySelectorAll('.goal-details').forEach(function(det) {
            det.classList.remove('active');
        });
    }, 300);
}

function setupGoalSelection() {
    document.querySelectorAll('.goal-option').forEach(function(option) {
        option.addEventListener('click', function() {
            document.querySelectorAll('.goal-option').forEach(function(opt) {
                opt.classList.remove('selected');
            });
            document.querySelectorAll('.goal-details').forEach(function(det) {
                det.classList.remove('active');
            });
            
            this.classList.add('selected');
            selectedGoalType = this.dataset.goal;
            
            var detailsDiv = document.getElementById(selectedGoalType + '_details');
            if (detailsDiv) {
                detailsDiv.classList.add('active');
            }
            
            if (selectedGoalType === 'weight_loss' || selectedGoalType === 'weight_gain') {
                var targetDateInput = document.getElementById('target_date_' + (selectedGoalType === 'weight_loss' ? 'loss' : 'gain'));
                if (targetDateInput && !targetDateInput.value) {
                    var futureDate = new Date();
                    futureDate.setMonth(futureDate.getMonth() + 3);
                    targetDateInput.value = futureDate.toISOString().split('T')[0];
                }
            }
        });
    });
}

function saveGoal() {
    if (!selectedGoalType) {
        alert('Please select a goal type');
        return;
    }
    
    var goalData = { goal_type: selectedGoalType };
    
    if (selectedGoalType === 'weight_loss') {
        goalData.target_weight = parseFloat(document.getElementById('target_weight_loss').value);
        goalData.target_date = document.getElementById('target_date_loss').value;
    } else if (selectedGoalType === 'weight_gain') {
        goalData.target_weight = parseFloat(document.getElementById('target_weight_gain').value);
        goalData.target_date = document.getElementById('target_date_gain').value;
    } else if (selectedGoalType === 'custom_calories') {
        goalData.custom_calories = parseInt(document.getElementById('custom_calories').value);
    }
    
    if ((selectedGoalType === 'weight_loss' || selectedGoalType === 'weight_gain') && 
        (!goalData.target_weight || !goalData.target_date)) {
        alert('Please fill in target weight and date');
        return;
    }
    
    if (selectedGoalType === 'custom_calories' && !goalData.custom_calories) {
        alert('Please enter a calorie target');
        return;
    }
    
    fetch(apiUrl('api/set_goal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            closeGoalModal();
            loadGoalStatus();
            updateCalorieTracker();
            showNotification('Goal set successfully!', 'success');
        } else {
            alert('Failed to set goal: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(function(error) {
        alert('Error setting goal: ' + error.message);
    });
}

function logWeight() {
    var weightInput = document.getElementById('weight-input');
    var weight = parseFloat(weightInput.value);
    
    if (!weight || weight < 30 || weight > 300) {
        alert('Please enter a valid weight (30-300 kg)');
        return;
    }
    
    fetch(apiUrl('api/log_weight'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            weight: weight,
            date: new Date().toISOString().split('T')[0]
        })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            weightInput.value = '';
            loadWeightHistory();
            loadGoalStatus();
            updateCalorieTracker();
            showNotification('Weight logged successfully!', 'success');
        } else {
            alert('Failed to log weight: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(function(error) {
        alert('Error logging weight: ' + error.message);
    });
}

function loadWeightHistory() {
    fetch(apiUrl('api/weight_history?days=30'))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                updateWeightChart(data);
                updateLatestWeightDisplay(data.weight_logs);
            }
        })
        .catch(function(error) {
            console.error('Error loading weight history:', error);
        });
}

function updateWeightChart(data) {
    var ctx = document.getElementById('weight-chart');
    var noDataMsg = document.getElementById('no-data-message');
    
    if (!ctx) return;
    
    if (data.weight_logs.length === 0) {
        noDataMsg.style.display = 'block';
        ctx.style.display = 'none';
        return;
    } else {
        noDataMsg.style.display = 'none';
        ctx.style.display = 'block';
    }
    
    if (weightChart) {
        weightChart.destroy();
    }
    
    var actualData = data.weight_logs.map(function(log) {
        return { x: log.date, y: log.weight };
    });
    
    var projectedData = data.projected_progress ? data.projected_progress.map(function(point) {
        return { x: point.date, y: point.weight };
    }) : [];
    
    var datasets = [{
        label: 'Actual Weight',
        data: actualData,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#e74c3c',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        tension: 0.3
    }];
    
    if (projectedData.length > 0) {
        datasets.push({
            label: 'Projected Goal',
            data: projectedData,
            borderColor: 'rgba(255,255,255,0.8)',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderWidth: 2,
            borderDash: [8, 4],
            pointRadius: 3,
            pointBackgroundColor: 'rgba(255,255,255,0.8)',
            tension: 0.2
        });
    }
    
    weightChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    labels: { 
                        color: 'white',
                        usePointStyle: true,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { 
                        unit: 'day',
                        displayFormats: { day: 'MMM dd' }
                    },
                    ticks: { 
                        color: 'rgba(255,255,255,0.8)',
                        maxTicksLimit: 6
                    },
                    grid: { 
                        color: 'rgba(255,255,255,0.2)',
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: { 
                        color: 'rgba(255,255,255,0.8)',
                        callback: function(value) {
                            return value + ' kg';
                        }
                    },
                    grid: { 
                        color: 'rgba(255,255,255,0.2)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

function updateLatestWeightDisplay(weightLogs) {
    var latestWeightDisplay = document.getElementById('latest-weight-display');
    
    if (weightLogs.length > 0) {
        var latest = weightLogs[weightLogs.length - 1];
        var logDate = new Date(latest.date);
        var today = new Date();
        var isToday = logDate.toDateString() === today.toDateString();
        
        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        var isYesterday = logDate.toDateString() === yesterday.toDateString();
        
        var dateText = isToday ? 'today' : isYesterday ? 'yesterday' : logDate.toLocaleDateString();
        latestWeightDisplay.textContent = 'Last: ' + latest.weight + ' kg (' + dateText + ')';
    } else {
        latestWeightDisplay.textContent = 'Enter your weight to start tracking';
    }
}

function loadGoalStatus() {
    fetch(apiUrl('api/goal_status'))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                goalStatus = data;
                updateGoalDisplay();
            }
        })
        .catch(function(error) {
            console.error('Error loading goal status:', error);
        });
}

function updateGoalDisplay() {
    var goalSection = document.getElementById('goal-progress-section');
    var currentWeightDisplay = document.getElementById('current-weight-display');
    var targetWeightDisplay = document.getElementById('target-weight-display');
    var goalProgressFill = document.getElementById('goal-progress-fill');
    var goalProgressText = document.getElementById('goal-progress-text');
    
    if (goalStatus && goalStatus.has_goal && goalStatus.goal_type !== 'custom_calories' && goalStatus.goal_type !== 'maintain') {
        goalSection.style.display = 'block';
        
        currentWeightDisplay.textContent = 'Current: ' + (goalStatus.latest_logged_weight || goalStatus.current_weight || '--') + ' kg';
        targetWeightDisplay.textContent = 'Target: ' + (goalStatus.target_weight || '--') + ' kg';
        
        if (goalStatus.progress_percentage !== undefined) {
            var percentage = Math.max(0, Math.min(100, goalStatus.progress_percentage));
            goalProgressFill.style.width = percentage + '%';
            
            var remaining = Math.abs(goalStatus.weight_remaining || 0);
            var daysRemaining = goalStatus.days_remaining || 0;
            var weightChange = Math.abs(goalStatus.weight_change || 0);
            
            goalProgressText.textContent = weightChange.toFixed(1) + ' kg ' + 
                (goalStatus.goal_type === 'weight_loss' ? 'lost' : 'gained') + ' • ' +
                remaining.toFixed(1) + ' kg to go' + 
                (daysRemaining > 0 ? ' • ' + daysRemaining + ' days remaining' : '');
        } else {
            goalProgressFill.style.width = '0%';
            goalProgressText.textContent = 'Track your progress by logging weight daily';
        }
    } else {
        goalSection.style.display = 'none';
    }
    
    if (goalStatus && goalStatus.daily_calorie_target) {
        currentUser.daily_calorie_goal = goalStatus.daily_calorie_target;
        updateCalorieTracker();
    }
}

function showNotification(message, type) {
    console.log(type.toUpperCase() + ': ' + message);
}

function showWeightHistory() {
    alert('Weight history feature would show detailed weight logs and trends');
}

function exportData() {
    alert('Export feature would generate CSV/PDF of your nutrition and weight data');
}

// ===== NOTIFICATION SYSTEM =====

function loadNotifications() {
    if (!currentUser) return;
    
    fetch(apiUrl('api/notifications?limit=20'))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                notifications = data.notifications;
                unreadNotificationCount = data.unread_count;
                updateNotificationBadge();
                renderNotifications();
            }
        })
        .catch(function(error) {
            console.error('Error loading notifications:', error);
        });
}

function updateNotificationBadge() {
    var badge = document.getElementById('notification-badge');
    if (unreadNotificationCount > 0) {
        badge.textContent = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifications() {
    var container = document.getElementById('notification-list');
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
    }
    
    var html = '';
    notifications.forEach(function(notification) {
        var timeAgo = formatTimeAgo(notification.created_at);
        var unreadClass = notification.is_read ? '' : 'unread';
        var typeClass = 'notification-type-' + notification.type;
        
        html += '<div class="notification-item ' + unreadClass + ' ' + typeClass + '" onclick="markNotificationRead(' + notification.id + ')">';
        html += '<div class="notification-title">' + notification.title + '</div>';
        html += '<div class="notification-message">' + notification.message + '</div>';
        html += '<div class="notification-time">' + timeAgo + '</div>';
        html += '</div>';
    });
    
    container.innerHTML = html;
}

function toggleNotifications() {
    var dropdown = document.getElementById('notification-dropdown');
    
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        dropdown.classList.add('show');
        loadNotifications();
    }
}

function markNotificationRead(notificationId) {
    fetch(apiUrl('api/notifications/' + notificationId + '/read'), {
        method: 'POST'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var notification = notifications.find(function(n) { return n.id === notificationId; });
            if (notification && !notification.is_read) {
                notification.is_read = true;
                unreadNotificationCount = Math.max(0, unreadNotificationCount - 1);
                updateNotificationBadge();
                renderNotifications();
            }
        }
    })
    .catch(function(error) {
        console.error('Error marking notification as read:', error);
    });
}

function markAllNotificationsRead() {
    fetch(apiUrl('api/notifications/read_all'), {
        method: 'POST'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            notifications.forEach(function(notification) {
                notification.is_read = true;
            });
            unreadNotificationCount = 0;
            updateNotificationBadge();
            renderNotifications();
        }
    })
    .catch(function(error) {
        console.error('Error marking all notifications as read:', error);
    });
}

function formatTimeAgo(dateString) {
    var now = new Date();
    var notificationDate = new Date(dateString);
    var diffMs = now - notificationDate;
    var diffMins = Math.floor(diffMs / (1000 * 60));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min' + (diffMins === 1 ? '' : 's') + ' ago';
    if (diffHours < 24) return diffHours + ' hour' + (diffHours === 1 ? '' : 's') + ' ago';
    if (diffDays < 7) return diffDays + ' day' + (diffDays === 1 ? '' : 's') + ' ago';
    
    return notificationDate.toLocaleDateString();
}

// ===== SETTINGS MANAGEMENT =====

function showSettings() {
    if (!currentUser) return;
    
    document.getElementById('settings-first-name').value = currentUser.first_name || '';
    document.getElementById('settings-last-name').value = currentUser.last_name || '';
    document.getElementById('settings-height').value = currentUser.height || '';
    document.getElementById('settings-weight').value = currentUser.weight || '';
    document.getElementById('settings-age').value = currentUser.age || '';
    document.getElementById('settings-calorie-goal').value = currentUser.daily_calorie_goal || 2000;
    document.getElementById('settings-activity').value = currentUser.activity_level || 'moderate';
    
    document.getElementById('settings-macro-preset').value = currentUser.macro_preset || 'balanced';
    document.getElementById('settings-carbs-percent').value = currentUser.carbs_percent || 40;
    document.getElementById('settings-protein-percent').value = currentUser.protein_percent || 30;
    document.getElementById('settings-fat-percent').value = currentUser.fat_percent || 30;
    
    toggleCustomMacros();
    
    var overlay = document.getElementById('settings-modal-overlay');
    var modal = overlay.querySelector('.modal');
    
    overlay.style.display = 'flex';
    overlay.classList.add('show');
    setTimeout(function() {
        modal.classList.add('show');
    }, 10);
}

function toggleCustomMacros() {
    var preset = document.getElementById('settings-macro-preset').value;
    var customMacros = document.getElementById('custom-macros');
    
    if (preset === 'custom') {
        customMacros.style.display = 'flex';
    } else {
        customMacros.style.display = 'none';
    }
}

function saveSettings() {
    var settings = {
        first_name: document.getElementById('settings-first-name').value,
        last_name: document.getElementById('settings-last-name').value,
        height: parseFloat(document.getElementById('settings-height').value) || null,
        weight: parseFloat(document.getElementById('settings-weight').value) || null,
        age: parseInt(document.getElementById('settings-age').value) || null,
        daily_calorie_goal: parseInt(document.getElementById('settings-calorie-goal').value) || 2000,
        activity_level: document.getElementById('settings-activity').value,
        macro_preset: document.getElementById('settings-macro-preset').value,
        carbs_percent: parseInt(document.getElementById('settings-carbs-percent').value) || 40,
        protein_percent: parseInt(document.getElementById('settings-protein-percent').value) || 30,
        fat_percent: parseInt(document.getElementById('settings-fat-percent').value) || 30
    };
    
    if (settings.macro_preset === 'custom') {
        var total = settings.carbs_percent + settings.protein_percent + settings.fat_percent;
        if (Math.abs(total - 100) > 1) {
            alert('Custom macro percentages must add up to 100%. Current total: ' + total + '%');
            return;
        }
    }
    
    fetch(apiUrl('api/update_profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            currentUser = data.user;
            document.getElementById('user-welcome').textContent = 'Welcome, ' + currentUser.first_name + '!';
            updateCalorieTracker();
            updateSelectedFoods();
            closeSettings();
        } else {
            alert('Failed to save settings: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(function(error) {
        alert('Failed to save settings: ' + error.message);
    });
}

function closeSettings() {
    var overlay = document.getElementById('settings-modal-overlay');
    var modal = overlay.querySelector('.modal');
    
    modal.classList.remove('show');
    setTimeout(function() {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
    }, 300);
}

// ===== NUTRITION TRACKING =====

function calculateMacroTargets(totalCalories) {
    var distribution = getMacroDistribution();
    
    return {
        carbs: {
            grams: Math.round((totalCalories * distribution.carbs / 100) / 4),
            percent: distribution.carbs
        },
        protein: {
            grams: Math.round((totalCalories * distribution.protein / 100) / 4),
            percent: distribution.protein
        },
        fat: {
            grams: Math.round((totalCalories * distribution.fat / 100) / 9),
            percent: distribution.fat
        }
    };
}

function getMacroDistribution() {
    if (!currentUser) {
        return { carbs: 40, protein: 30, fat: 30 };
    }
    
    var preset = currentUser.macro_preset || 'balanced';
    
    if (preset === 'custom') {
        return {
            carbs: currentUser.carbs_percent || 40,
            protein: currentUser.protein_percent || 30,
            fat: currentUser.fat_percent || 30
        };
    }
    
    var presets = {
        'balanced': { carbs: 40, protein: 30, fat: 30 },
        'low_carb': { carbs: 20, protein: 40, fat: 40 },
        'high_protein': { carbs: 30, protein: 40, fat: 30 },
        'keto': { carbs: 5, protein: 25, fat: 70 },
        'mediterranean': { carbs: 45, protein: 20, fat: 35 }
    };
    
    return presets[preset] || presets['balanced'];
}

function updateCalorieTracker() {
    if (!currentUser) return;
    
    var totalCalories = 0;
    var totalProtein = 0;
    var totalCarbs = 0;
    var totalFat = 0;
    
    selectedFoods.forEach(function(food) {
        totalCalories += food.adjustedCal || 0;
        totalProtein += food.adjustedProtein || 0;
        totalCarbs += food.adjustedCarbo || 0;
        totalFat += food.adjustedFat || 0;
    });
    
    var dailyGoal = currentUser.daily_calorie_goal || 2000;
    var remaining = Math.max(0, dailyGoal - totalCalories);
    var percentage = Math.min(100, (totalCalories / dailyGoal) * 100);
    
    document.getElementById('calorie-consumed').textContent = Math.round(totalCalories);
    document.getElementById('calorie-goal-text').textContent = 'of ' + dailyGoal + ' kcal';
    
    var progressFill = document.getElementById('calorie-progress-fill');
    progressFill.style.width = percentage + '%';
    
    if (totalCalories > dailyGoal) {
        progressFill.classList.add('over-goal');
    } else {
        progressFill.classList.remove('over-goal');
    }
    
    var remainingElement = document.getElementById('calorie-remaining');
    if (totalCalories >= dailyGoal) {
        var excess = Math.round(totalCalories - dailyGoal);
        remainingElement.textContent = '⚠️ ' + excess + ' kcal over goal';
    } else {
        remainingElement.textContent = Math.round(remaining) + ' kcal remaining';
    }
    
    var targets = calculateMacroTargets(dailyGoal);
    
    var proteinPercent = targets.protein.grams > 0 ? Math.min(100, (totalProtein / targets.protein.grams) * 100) : 0;
    document.getElementById('protein-progress').style.width = proteinPercent + '%';
    document.getElementById('protein-text').textContent = Math.round(totalProtein) + 'g / ' + targets.protein.grams + 'g';
    
    var carbsPercent = targets.carbs.grams > 0 ? Math.min(100, (totalCarbs / targets.carbs.grams) * 100) : 0;
    document.getElementById('carbs-progress').style.width = carbsPercent + '%';
    document.getElementById('carbs-text').textContent = Math.round(totalCarbs) + 'g / ' + targets.carbs.grams + 'g';
    
    var fatPercent = targets.fat.grams > 0 ? Math.min(100, (totalFat / targets.fat.grams) * 100) : 0;
    document.getElementById('fat-progress').style.width = fatPercent + '%';
    document.getElementById('fat-text').textContent = Math.round(totalFat) + 'g / ' + targets.fat.grams + 'g';
    
    var dateTitle = document.getElementById('calorie-date-title');
    var displayDate = formatDisplayDate(currentDate);
    if (displayDate === 'Today') {
        dateTitle.textContent = "Today's Progress";
    } else {
        dateTitle.textContent = displayDate + "'s Progress";
    }
}

// ===== DATE NAVIGATION =====

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function formatDisplayDate(date) {
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (formatDate(date) === formatDate(today)) {
        return 'Today';
    } else if (formatDate(date) === formatDate(yesterday)) {
        return 'Yesterday';
    } else if (formatDate(date) === formatDate(tomorrow)) {
        return 'Tomorrow';
    } else {
        return date.toLocaleDateString('hu-HU', { 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

function updateDateDisplay() {
    var dateBtn = document.getElementById('current-date');
    var mealsTitle = document.getElementById('meals-title');
    var displayText = formatDisplayDate(currentDate);
    
    dateBtn.textContent = displayText;
    dateBtn.classList.toggle('today', formatDate(currentDate) === formatDate(new Date()));
    
    if (displayText === 'Today') {
        mealsTitle.textContent = "Today's Meals";
    } else {
        mealsTitle.textContent = displayText + "'s Meals";
    }
}

function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateDateDisplay();
    loadMealsForDate(currentDate);
}

function goToToday() {
    var today = new Date();
    currentDate = new Date(today);
    calendarDate = new Date(today);
    updateDateDisplay();
    loadMealsForDate(currentDate);
    hideCalendar();
}

function showCalendar() {
    var dropdown = document.getElementById('calendar-dropdown');
    calendarDate = new Date(currentDate);
    renderCalendar();
    dropdown.classList.add('show');
}

function hideCalendar() {
    document.getElementById('calendar-dropdown').classList.remove('show');
}

function changeCalendarMonth(delta) {
    calendarDate.setMonth(calendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    var monthNames = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június',
                     'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December'];
    var weekdays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
    
    var headerHtml = '<button onclick="changeCalendarMonth(-1)">‹</button>';
    headerHtml += '<span>' + monthNames[calendarDate.getMonth()] + ' ' + calendarDate.getFullYear() + '</span>';
    headerHtml += '<button onclick="changeCalendarMonth(1)">›</button>';
    
    document.querySelector('#calendar-dropdown .calendar-header').innerHTML = headerHtml;
    
    var grid = document.getElementById('calendar-grid');
    var html = '';
    
    for (var w = 0; w < weekdays.length; w++) {
        html += '<div class="calendar-weekday">' + weekdays[w] + '</div>';
    }
    
    var firstDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    var startDay = (firstDay.getDay() + 6) % 7;
    
    for (var i = 0; i < startDay; i++) {
        var prevDate = new Date(firstDay);
        prevDate.setDate(prevDate.getDate() - (startDay - i));
        var prevDateStr = formatDate(prevDate);
        html += '<div class="calendar-day other-month" onclick="selectDate(\'' + 
               prevDateStr + '\')">' + prevDate.getDate() + '</div>';
    }
    
    var daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
    for (var day = 1; day <= daysInMonth; day++) {
        var date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
        var dateStr = formatDate(date);
        var todayStr = formatDate(new Date());
        var currentStr = formatDate(currentDate);
        
        var className = 'calendar-day';
        if (dateStr === todayStr) className += ' today';
        if (dateStr === currentStr) className += ' selected';
        
        html += '<div class="' + className + '" onclick="selectDate(\'' + 
               dateStr + '\')">' + day + '</div>';
    }
    
    grid.innerHTML = html;
}

function selectDate(dateStr) {
    currentDate = new Date(dateStr + 'T12:00:00');
    updateDateDisplay();
    loadMealsForDate(currentDate);
    hideCalendar();
}

// ===== FOOD SEARCH AND SELECTION =====

function searchFoods(query, page) {
    if (!page) page = 1;
    
    var dropdown = document.getElementById('autocomplete');
    dropdown.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
    dropdown.style.display = 'block';
    
    currentSearchQuery = query;
    
    fetch(apiUrl('search?q=' + encodeURIComponent(query) + '&p=' + page))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                dropdown.innerHTML = '<div class="no-results">Error: ' + data.error + '</div>';
                return;
            }
            
            currentPagination = data.pagination;
            
            if (data.foods && data.foods.length > 0) {
                showAutocompleteResults(data.foods, data.pagination);
            } else {
                dropdown.innerHTML = '<div class="no-results">No results found</div>';
            }
        })
        .catch(function(error) {
            dropdown.innerHTML = '<div class="no-results">Search failed: ' + error.message + '</div>';
        });
}

function showAutocompleteResults(foods, pagination) {
    var dropdown = document.getElementById('autocomplete');
    var html = '';
    
    for (var i = 0; i < foods.length; i++) {
        var food = foods[i];
        var icon = food.source === 'local' ? '💾' : '🍎';
        
        html += '<div class="autocomplete-item" onclick="selectFood(' + i + ')">';
        html += '<div class="food-info">';
        html += '<div class="food-icon">' + icon + '</div>';
        html += '<div class="food-name">' + (food.name || 'Unknown') + '</div>';
        html += '</div>';
        html += '<div class="food-calories">';
        html += '<span class="calories-number">' + (food.cal || 'N/A') + '</span>';
        html += '<span class="calories-unit">' + (food.piece || '100g') + '</span>';
        html += '</div>';
        html += '</div>';
    }
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
    window.currentSearchResults = foods;
}

function selectFood(index) {
    var food = window.currentSearchResults[index];
    currentFood = food;
    editingFoodId = null;
    
    currentQuantity = 1;
    currentUnitGrams = 1;
    currentMeal = 'ebed';
    
    showPortionModal(food);
    
    document.getElementById('query').value = '';
    hideAutocomplete();
}

function hideAutocomplete() {
    document.getElementById('autocomplete').style.display = 'none';
}

// ===== PORTION SELECTION MODAL =====

function showPortionModal(food) {
    var overlay = document.getElementById('modal-overlay');
    if (overlay.classList.contains('show')) {
        return;
    }
    
    var cleanName = food.name || 'Unknown Food';
    var dateText = formatDisplayDate(currentDate);
    document.getElementById('modal-food-title').textContent = cleanName + ' - ' + dateText;
    
    document.getElementById('quantity-input').value = currentQuantity;
    
    document.getElementById('portion-presets').innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div></div>';
    
    var modal = overlay.querySelector('.modal');
    overlay.style.display = 'flex';
    overlay.classList.add('show');
    setTimeout(function() {
        modal.classList.add('show');
        updateMealSelection();
    }, 10);
    
    setupPortionPresets(food);
}

function setupPortionPresets(food) {
    var container = document.getElementById('portion-presets');
    var foodId = food.food_id || food.ID || food.id || food.fid;
    
    if (!foodId) {
        renderDefaultPortions();
        return;
    }
    
    fetch(apiUrl('portions?id=' + encodeURIComponent(foodId)))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error || !data.portions || data.portions.length === 0) {
                renderDefaultPortions();
            } else {
                renderUnifiedPortions(data.portions);
            }
        })
        .catch(function(error) {
            renderDefaultPortions();
        });
}

function renderDefaultPortions() {
    var defaultPortions = [
        { label: 'kicsi', weight: 80 },
        { label: 'közepes', weight: 150 },
        { label: 'nagy', weight: 220 }
    ];
    renderUnifiedPortions(defaultPortions);
}

function createUnifiedPortions(apiPortions) {
    var portions = [];
    
    portions.push({
        label: 'g',
        value: currentQuantity,
        type: 'unit',
        grams: currentQuantity
    });
    
    if (currentQuantity >= 10) {
        portions.push({
            label: 'dkg',
            value: Math.round(currentQuantity / 10 * 10) / 10,
            type: 'unit',
            grams: currentQuantity
        });
    }
    
    if (apiPortions && apiPortions.length > 0) {
        var limitedPortions = apiPortions.slice(0, 4);
        for (var i = 0; i < limitedPortions.length; i++) {
            var portion = limitedPortions[i];
            portions.push({
                label: portion.label,
                value: portion.weight,
                type: 'portion',
                grams: portion.weight,
                unit: 'g'
            });
        }
    } else {
        portions.push({
            label: 'kicsi',
            value: 80,
            type: 'portion',
            grams: 80,
            unit: 'g'
        });
        portions.push({
            label: 'közepes',
            value: 150,
            type: 'portion',
            grams: 150,
            unit: 'g'
        });
        portions.push({
            label: 'nagy',
            value: 220,
            type: 'portion',
            grams: 220,
            unit: 'g'
        });
    }
    
    var hasLargePortion = portions.some(function(p) { return p.grams > 500; });
    if (hasLargePortion || currentQuantity > 500) {
        portions.push({
            label: 'kg',
            value: Math.round(currentQuantity / 1000 * 100) / 100,
            type: 'unit',
            grams: currentQuantity
        });
    }
    
    return portions;
}

function selectPortion(portion) {
    if (portion.type === 'unit') {
        currentUnit = portion.label;
        currentQuantity = portion.value;
        currentUnitGrams = portion.grams;
    } else {
        currentUnit = portion.unit || 'g';
        currentQuantity = portion.value;
        currentUnitGrams = portion.grams;
    }
    
    document.getElementById('quantity-input').value = currentQuantity;
    renderUnifiedPortions();
}

function selectPortionByIndex(index) {
    if (availablePortions[index]) {
        selectPortion(availablePortions[index]);
    }
}

function renderUnifiedPortions(apiPortions) {
    var portions = createUnifiedPortions(apiPortions);
    availablePortions = portions;
    var container = document.getElementById('portion-presets');
    var html = '';
    
    for (var i = 0; i < portions.length; i++) {
        var portion = portions[i];
        var isSelected = (portion.type === 'unit' && portion.label === currentUnit) || 
                        (portion.type === 'portion' && Math.abs(portion.grams - currentUnitGrams) < 1);
        
        var className = 'portion-preset';
        if (portion.type === 'unit') {
            className += ' unit';
        } else if (portion.grams < 150) {
            className += ' small';
        }
        if (isSelected) {
            className += ' selected';
        }
        
        html += '<button class="' + className + '" onclick="selectPortionByIndex(' + i + ')">';
        if (portion.type === 'unit') {
            html += portion.label;
        } else {
            html += portion.label;
            if (portion.value !== portion.grams) {
                html += '<br>' + portion.value + ' ' + (portion.unit || 'g');
            }
        }
        html += '</button>';
    }
    
    container.innerHTML = html;
}

function adjustQuantity(delta) {
    var input = document.getElementById('quantity-input');
    var value = parseFloat(input.value) || 0;
    
    var stepSize = 1;
    if (currentUnit === 'dkg') {
        stepSize = 0.1;
    } else if (currentUnit === 'kg') {
        stepSize = 0.1;
    }
    
    value = Math.max(0.1, value + (delta * stepSize));
    value = Math.round(value * 10) / 10;
    input.value = value;
    currentQuantity = value;
    currentUnitGrams = value * (unitConversions[currentUnit] || 1);
    
    renderUnifiedPortions();
}

function updateMealSelection() {
    document.querySelectorAll('.meal-btn').forEach(function(btn) {
        var isSelected = btn.dataset.meal === currentMeal;
        btn.classList.toggle('selected', isSelected);
    });
}

function closeModal() {
    var overlay = document.getElementById('modal-overlay');
    var modal = overlay.querySelector('.modal');
    
    modal.classList.remove('show');
    setTimeout(function() {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
        
        currentFood = null;
        editingFoodId = null;
        currentQuantity = 1;
        currentUnitGrams = 1;
        currentMeal = 'ebed';
    }, 300);
}

function confirmSelection() {
    if (!currentFood) {
        console.error('No current food selected');
        alert('Error: No food selected');
        return;
    }
    
    if (!currentUser || !currentUser.id) {
        console.error('No user logged in');
        alert('Error: You must be logged in to save meals');
        return;
    }
    
    var gramsQuantity = currentUnitGrams;
    console.log('Current quantity:', currentQuantity, currentUnit);
    console.log('Grams quantity:', gramsQuantity);
    
    var multiplier = gramsQuantity / 100.0;
    
    console.log('=== CONFIRMING SELECTION ===');
    console.log('Current food:', currentFood);
    console.log('Current meal:', currentMeal);
    console.log('Grams quantity:', gramsQuantity);
    console.log('Multiplier for nutrition:', multiplier);
    console.log('Current user ID:', currentUser.id);
    console.log('Editing mode:', editingFoodId);
    
    var baseCal = validateNutritionValue(currentFood.cal, 0);
    var baseProtein = validateNutritionValue(currentFood.protein, 0);
    var baseCarbo = validateNutritionValue(currentFood.carbo, 0);
    var baseFat = validateNutritionValue(currentFood.fat, 0);
    
    if (editingFoodId) {
        selectedFoods = selectedFoods.filter(function(food) {
            return food.uniqueId !== editingFoodId;
        });
    }
    
    var foodEntry = {
        food_id: currentFood.food_id || currentFood.ID || currentFood.id,
        name: currentFood.name,
        cal: baseCal,
        protein: baseProtein,
        carbo: baseCarbo,
        fat: baseFat,
        originalQuantity: gramsQuantity,
        displayQuantity: currentQuantity,
        displayUnit: currentUnit,
        meal: currentMeal,
        mealLabel: getMealLabel(currentMeal),
        adjustedCal: Math.round(baseCal * multiplier),
        adjustedProtein: Math.round(baseProtein * multiplier * 10) / 10,
        adjustedCarbo: Math.round(baseCarbo * multiplier * 10) / 10,
        adjustedFat: Math.round(baseFat * multiplier * 10) / 10,
        uniqueId: editingFoodId || (Date.now() + '_' + Math.random().toString(36).substr(2, 9))
    };
    
    console.log('Food entry to log:', foodEntry);
    
    var cleanedFood = {
        ...currentFood,
        cal: baseCal,
        protein: baseProtein,
        carbo: baseCarbo,
        fat: baseFat
    };
    
    var requestData = {
        food: cleanedFood,
        meal_type: currentMeal,
        quantity: gramsQuantity,
        date_eaten: formatDate(currentDate)
    };
    
    console.log('Request data:', requestData);
    
    selectedFoods.push(foodEntry);
    updateSelectedFoods();
    closeModal();
    
    fetch(apiUrl('log_meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(function(response) { 
        console.log('Server response status:', response.status);
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json(); 
    })
    .then(function(data) {
        console.log('Server response data:', data);
        if (data.success) {
            console.log('✅ Meal saved successfully');
        } else {
            console.error('❌ Failed to save meal:', data.error);
            alert('Failed to save meal: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(function(error) {
        console.error('❌ Error saving meal:', error);
        alert('Error saving meal: ' + error.message);
    });
    
    editingFoodId = null;
}

// ===== MEAL DISPLAY AND MANAGEMENT =====

function validateNutritionValue(value, defaultValue = 0) {
    if (!value || value === null || value === undefined || isNaN(value)) {
        return defaultValue;
    }
    var numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
        return defaultValue;
    }
    return numValue;
}

function loadMealsForDate(date) {
    var debugResult = document.getElementById('debug-result');
    var dateStr = formatDate(date);
    
    debugResult.innerHTML = '<div class="loading"><div class="spinner"></div>Loading meals for ' + formatDisplayDate(date) + '...</div>';
    
    fetch(apiUrl('get_meals_for_date?date=' + encodeURIComponent(dateStr)))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success && data.meals) {
                selectedFoods = data.meals.map(function(meal) {
                    var baseCal = validateNutritionValue(meal.calories / (meal.quantity / 100), 0);
                    var baseProtein = validateNutritionValue(meal.protein / (meal.quantity / 100), 0);
                    var baseCarbo = validateNutritionValue(meal.carbohydrates / (meal.quantity / 100), 0);
                    var baseFat = validateNutritionValue(meal.fat / (meal.quantity / 100), 0);
                    
                    return {
                        food_id: meal.food_id,
                        name: meal.food_name,
                        cal: baseCal,
                        protein: baseProtein,
                        carbo: baseCarbo,
                        fat: baseFat,
                        originalQuantity: meal.quantity,
                        displayQuantity: meal.quantity,
                        displayUnit: 'g',
                        meal: meal.meal_type,
                        mealLabel: getMealLabel(meal.meal_type),
                        adjustedCal: Math.round(validateNutritionValue(meal.calories, 0)),
                        adjustedProtein: Math.round(validateNutritionValue(meal.protein, 0) * 10) / 10,
                        adjustedCarbo: Math.round(validateNutritionValue(meal.carbohydrates, 0) * 10) / 10,
                        adjustedFat: Math.round(validateNutritionValue(meal.fat, 0) * 10) / 10,
                        uniqueId: meal.food_id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
                    };
                });
                
                updateSelectedFoods();
                
                debugResult.innerHTML = 
                    '<h3>✅ Loaded ' + formatDisplayDate(date) + '\'s Meals</h3>' +
                    '<p><strong>Count:</strong> ' + data.meals.length + '</p>';
            } else {
                selectedFoods = [];
                updateSelectedFoods();
                debugResult.innerHTML = 
                    '<h3>No meals found for ' + formatDisplayDate(date) + '</h3>';
            }
        })
        .catch(function(error) {
            debugResult.innerHTML = '<p style="color:red;">Load meals failed: ' + error.message + '</p>';
        });
}

function toggleMealGroup(meal) {
    var items = document.getElementById('meal-group-' + meal);
    var toggle = document.getElementById('toggle-' + meal);
    var header = document.querySelector('.meal-group-header.' + meal);
    
    if (items && toggle && header) {
        var isExpanded = items.classList.contains('expanded');
        
        if (isExpanded) {
            items.classList.remove('expanded');
            toggle.classList.remove('expanded');
            header.classList.remove('expanded');
            expandedMealGroups[meal] = false;
        } else {
            items.classList.add('expanded');
            toggle.classList.add('expanded');
            header.classList.add('expanded');
            expandedMealGroups[meal] = true;
        }
    }
}

function editFood(uniqueId) {
    console.log('Editing food with ID:', uniqueId);
    
    var foodToEdit = selectedFoods.find(function(food) {
        return food.uniqueId === uniqueId;
    });
    
    if (!foodToEdit) {
        console.error('Food not found for editing');
        return;
    }
    
    editingFoodId = uniqueId;
    currentFood = {
        food_id: foodToEdit.food_id,
        name: foodToEdit.name,
        cal: foodToEdit.cal,
        protein: foodToEdit.protein,
        carbo: foodToEdit.carbo,
        fat: foodToEdit.fat
    };
    
    currentQuantity = foodToEdit.displayQuantity || foodToEdit.originalQuantity;
    currentUnit = foodToEdit.displayUnit || 'g';
    currentUnitGrams = foodToEdit.originalQuantity;
    currentMeal = foodToEdit.meal;
    
    showPortionModal(currentFood);
}

function removeFood(uniqueId) {
    console.log('Removing food with ID:', uniqueId);
    
    var foodToRemove = selectedFoods.find(function(food) {
        return food.uniqueId === uniqueId;
    });
    
    if (!foodToRemove) {
        console.log('Food not found in selectedFoods');
        return;
    }
    
    var initialLength = selectedFoods.length;
    selectedFoods = selectedFoods.filter(function(food) {
        return food.uniqueId !== uniqueId;
    });
    
    if (selectedFoods.length < initialLength) {
        console.log('Food removed from local array');
        updateSelectedFoods();
        
        var deleteData = {
            food_id: foodToRemove.food_id,
            meal_type: foodToRemove.meal,
            quantity: foodToRemove.originalQuantity,
            date_eaten: formatDate(currentDate)
        };
        
        console.log('Sending delete request:', deleteData);
        
        fetch(apiUrl('delete_meal'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deleteData)
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                console.log('✅ Meal deleted from database successfully');
            } else {
                console.log('⚠️ Failed to delete from database:', data.error);
                selectedFoods.push(foodToRemove);
                updateSelectedFoods();
                alert('Failed to delete meal from server');
            }
        })
        .catch(function(error) {
            console.error('❌ Error deleting meal:', error);
            selectedFoods.push(foodToRemove);
            updateSelectedFoods();
            alert('Error deleting meal: ' + error.message);
        });
    } else {
        console.log('Food not found in selectedFoods');
    }
}

function updateSelectedFoods() {
    var container = document.getElementById('selected-items');
    
    var mealGroups = {
        'reggeli': [], 'tizorai': [], 'ebed': [],
        'uzsonna': [], 'vacsora': [], 'nasi': []
    };
    
    selectedFoods.forEach(function(food) {
        if (mealGroups[food.meal]) {
            mealGroups[food.meal].push(food);
        }
    });

    var html = '';
    var totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
    var hasAnyMeals = selectedFoods.length > 0;
    
    Object.keys(mealGroups).forEach(function(meal) {
        var foods = mealGroups[meal];
        var mealLabel = getMealLabel(meal);
        
        var categoryCalories = 0, categoryProtein = 0, categoryCarbs = 0, categoryFat = 0;
        foods.forEach(function(food) {
            categoryCalories += food.adjustedCal || 0;
            categoryProtein += food.adjustedProtein || 0;
            categoryCarbs += food.adjustedCarbo || 0;
            categoryFat += food.adjustedFat || 0;
        });
        
        var macroSummary = 'P:' + Math.round(categoryProtein) + 'g C:' + Math.round(categoryCarbs) + 'g F:' + Math.round(categoryFat) + 'g';
        
        var isExpanded = expandedMealGroups[meal];
        
        html += '<div class="meal-group-header ' + meal + (isExpanded ? ' expanded' : '') + '" onclick="toggleMealGroup(\'' + meal + '\')">';
        html += '<div class="meal-group-title">' + mealLabel + '</div>';
        html += '<div class="meal-group-calories">' + Math.round(categoryCalories) + ' kcal</div>';
        html += '<div class="meal-group-macros">' + macroSummary + '</div>';
        html += '<div class="meal-group-toggle' + (isExpanded ? ' expanded' : '') + '" id="toggle-' + meal + '">▼</div>';
        html += '</div>';
        
        var hasContent = foods.length > 0;
        html += '<div class="meal-group-items' + (hasContent ? ' has-content' : '') + (isExpanded ? ' expanded' : '') + '" id="meal-group-' + meal + '">';
        
        if (foods.length === 0) {
            html += '<div class="empty-state" style="padding: 20px; text-align: center; color: #999; font-style: italic;">';
            html += 'No ' + mealLabel.toLowerCase() + ' logged';
            html += '</div>';
        } else {
            foods.forEach(function(food) {
                var cleanName = food.name ? food.name.replace(/<\/?b>/g, '') : 'Unknown';
                
                totalCalories += food.adjustedCal || 0;
                totalProtein += food.adjustedProtein || 0;
                totalCarbs += food.adjustedCarbo || 0;
                totalFat += food.adjustedFat || 0;
                
                html += '<div class="selected-item" onclick="editFood(\'' + food.uniqueId + '\')" style="cursor: pointer;">';
                html += '<div class="selected-food-info">';
                html += '<div class="selected-food-name">';
                
                var displayText = cleanName;
                if (food.displayQuantity && food.displayUnit) {
                    displayText += ' <span style="color: #7f8c8d; font-weight: normal;">(' + food.displayQuantity + ' ' + food.displayUnit + ')</span>';
                } else {
                    displayText += ' <span style="color: #7f8c8d; font-weight: normal;">(' + food.originalQuantity + 'g)</span>';
                }
                
                html += displayText;
                html += '</div>';
                
                html += '<div class="selected-food-nutrients">';
                html += (food.adjustedCal || 'N/A') + ' kcal • ';
                html += 'Protein: ' + (food.adjustedProtein || '0') + 'g • ';
                html += 'Carbs: ' + (food.adjustedCarbo || '0') + 'g • ';
                html += 'Fat: ' + (food.adjustedFat || '0') + 'g';
                html += '</div>';
                html += '</div>';
                
                html += '<div class="selected-food-actions">';
                html += '<button class="remove-btn" onclick="event.stopPropagation(); removeFood(\'' + food.uniqueId + '\')" title="Remove item">×</button>';
                html += '</div>';
                
                html += '</div>';
            });
        }
        
        html += '</div>';
        
        setTimeout(function() {
            var toggle = document.getElementById('toggle-' + meal);
            var header = document.querySelector('.meal-group-header.' + meal);
            if (toggle && isExpanded) {
                toggle.classList.add('expanded');
            }
            if (header && isExpanded) {
                header.classList.add('expanded');
            }
        }, 0);
    });

    var dailyGoal = currentUser ? currentUser.daily_calorie_goal || 2000 : 2000;
    var targets = calculateMacroTargets(dailyGoal);
    
    html += '<div class="total-calories">';
    html += '<div class="total-calories-header">';
    html += '<div>';
    if (hasAnyMeals) {
        html += '🍽️ Daily Totals: ' + Math.round(totalCalories) + ' kcal';
    } else {
        html += '🍽️ Daily Totals: 0 kcal';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    if (!hasAnyMeals) {
        html += '<div class="overall-empty-state" style="background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; padding: 30px; text-align: center; color: #6c757d; margin-top: 20px;">';
        html += '<i class="fas fa-utensils" style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;"></i><br>';
        html += '<strong>No meals logged for this day</strong><br>';
        html += '<small>Start tracking by searching and selecting foods above</small>';
        html += '</div>';
    }
    
    container.innerHTML = html;
    
    updateCalorieTracker();
}

function getMealLabel(meal) {
    var labels = {
        'reggeli': 'Reggeli',
        'tizorai': 'Tízórai', 
        'ebed': 'Ebéd',
        'uzsonna': 'Uzsonna',
        'vacsora': 'Vacsora',
        'nasi': 'Nasi'
    };
    return labels[meal] || 'Unknown';
}

// ===== EVENT HANDLERS =====

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('query').addEventListener('input', function(e) {
        var query = e.target.value.trim();
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            hideAutocomplete();
            return;
        }
        
        searchTimeout = setTimeout(function() {
            searchFoods(query, 1);
        }, 300);
    });
    
    document.getElementById('quantity-input').addEventListener('input', function(e) {
        currentQuantity = parseFloat(e.target.value) || 0.1;
        currentUnitGrams = currentQuantity * (unitConversions[currentUnit] || 1);
        renderUnifiedPortions();
    });
    
    document.querySelectorAll('.meal-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            currentMeal = this.dataset.meal;
            updateMealSelection();
        });
    });
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            hideAutocomplete();
        }
        
        var calendarDropdown = document.getElementById('calendar-dropdown');
        var mainNavigation = document.querySelector('.main-navigation');
        
        if (calendarDropdown.classList.contains('show') && 
            !mainNavigation.contains(e.target)) {
            hideCalendar();
        }
        
        var notificationDropdown = document.getElementById('notification-dropdown');
        var notificationContainer = document.querySelector('.notification-container');
        
        if (notificationDropdown && notificationDropdown.classList.contains('show') && 
            !notificationContainer.contains(e.target)) {
            notificationDropdown.classList.remove('show');
        }
        
        var settingsModal = document.getElementById('settings-modal-overlay');
        if (settingsModal.classList.contains('show') && 
            e.target === settingsModal) {
            closeSettings();
        }
        
        var goalModal = document.getElementById('goal-modal-overlay');
        if (goalModal.classList.contains('show') && e.target === goalModal) {
            closeGoalModal();
        }
    });
});

// ===== DEBUG FUNCTIONS =====

function testDatabase() {
    fetch(apiUrl('test_db'))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            console.log('Database test:', data);
            alert('Database test completed - check console');
        })
        .catch(function(error) {
            console.error('Database test failed:', error);
        });
}

function debugAPI() {
    var query = document.getElementById('query').value || 'alma';
    fetch(apiUrl('debug?q=' + encodeURIComponent(query)))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            console.log('Debug API:', data);
            alert('API debug completed - check console');
        })
        .catch(function(error) {
            console.error('Debug API failed:', error);
        });
}

function loadTodayMeals() {
    loadMealsForDate(currentDate);
}

function goToPage(page) {
    if (currentSearchQuery && page > 0 && currentPagination && page <= currentPagination.total_pages) {
        searchFoods(currentSearchQuery, page);
    }
}