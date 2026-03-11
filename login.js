/**
 * LoginManager - Best-in-Class Login System
 * Features:
 * - Real-time validation with visual feedback
 * - Password strength meter
 * - Secure password visibility toggle
 * - Email typo detection
 * - Rate limiting awareness
 * - OAuth integration ready
 * - Accessibility-first
 * - Mobile-optimized
 */

class LoginManager {
    constructor() {
        this.form = document.getElementById('login-form');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.submitBtn = document.getElementById('submit-btn');
        this.toggleBtn = document.getElementById('toggle-password');
        this.rememberCheckbox = document.getElementById('remember');
        this.rememberInfo = document.getElementById('remember-info');
        this.alertEl = document.getElementById('alert');
        
        this.validationState = {
            email: false,
            password: false
        };
        
        this.isSubmitting = false;
        this.attemptCount = 0;
        this.maxAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000; // 15 minutes
        
        this.init();
    }

    init() {
        // Form submission
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Email validation
        this.emailInput.addEventListener('blur', () => this.validateEmail(true));
        this.emailInput.addEventListener('input', () => {
            this.validateEmail(false);
            this.updateInputWrapper(this.emailInput);
        });
        
        // Password validation
        this.passwordInput.addEventListener('input', () => {
            this.validatePassword();
            this.updateInputWrapper(this.passwordInput);
        });
        this.passwordInput.addEventListener('blur', () => this.updatePasswordStrength());
        
        // Password visibility toggle
        this.toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.togglePasswordVisibility();
        });
        
        // Input wrapper focus states
        this.emailInput.addEventListener('focus', () => this.updateInputWrapper(this.emailInput));
        this.emailInput.addEventListener('blur', () => this.updateInputWrapper(this.emailInput));
        this.passwordInput.addEventListener('focus', () => this.updateInputWrapper(this.passwordInput));
        this.passwordInput.addEventListener('blur', () => this.updateInputWrapper(this.passwordInput));
        
        // Remember me info
        this.rememberInfo.addEventListener('click', (e) => {
            e.preventDefault();
            this.showAlert('You\'ll stay signed in for 30 days on this device', 'info');
        });
        
        // Restore saved email (with user consent check)
        this.restoreEmail();
        
        // Setup social buttons
        this.setupSocialLogin();
        
        // Check for locked account
        this.checkLockout();
    }

    updateInputWrapper(input) {
        const wrapper = input.closest('.input-wrapper');
        if (input === document.activeElement) {
            wrapper.classList.add('focused');
        } else {
            wrapper.classList.remove('focused');
        }
    }

    /* ===== EMAIL VALIDATION ===== */

    validateEmail(isBlur = false) {
        const email = this.emailInput.value.trim();
        const errorEl = document.getElementById('email-error');
        const hintEl = document.getElementById('email-hint');
        
        let isValid = true;
        let errorMsg = '';
        let hintMsg = '';
        
        if (!email) {
            if (isBlur) {
                errorMsg = 'Email is required';
                isValid = false;
            }
        } else if (!this.isValidEmail(email)) {
            errorMsg = 'Please enter a valid email address';
            isValid = false;
        } else {
            // Check for common typos
            const suggestion = this.getEmailSuggestion(email);
            if (suggestion && suggestion !== email) {
                hintMsg = `Did you mean <strong>${this.escapeHtml(suggestion)}</strong>?`;
            }
        }
        
        this.emailInput.setAttribute('aria-invalid', !isValid);
        errorEl.textContent = errorMsg;
        errorEl.classList.toggle('show', !!errorMsg);
        
        hintEl.innerHTML = hintMsg;
        hintEl.classList.toggle('show', !!hintMsg);
        
        this.validationState.email = isValid;
        
        return isValid;
    }

    isValidEmail(email) {
        // RFC 5322 simplified but practical
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    // Suggest correct domain for common email typos
    getEmailSuggestion(email) {
        const [local, domain] = email.split('@');
        if (!domain) return null;
        
        const commonDomains = {
            'gmial.com': 'gmail.com',
            'gmai.com': 'gmail.com',
            'yahooo.com': 'yahoo.com',
            'hotmial.com': 'hotmail.com',
            'outlok.com': 'outlook.com',
            'gmil.com': 'gmail.com',
            'gmai.co': 'gmail.com'
        };
        
        if (commonDomains[domain]) {
            return `${local}@${commonDomains[domain]}`;
        }
        
        return null;
    }

    /* ===== PASSWORD VALIDATION ===== */

    validatePassword() {
        const password = this.passwordInput.value;
        const errorEl = document.getElementById('password-error');
        
        let isValid = true;
        let errorMsg = '';
        
        if (!password) {
            // Don't show error until blur
        } else if (password.length < 6) {
            errorMsg = 'Password must be at least 6 characters';
            isValid = false;
        }
        
        this.passwordInput.setAttribute('aria-invalid', !isValid);
        errorEl.textContent = errorMsg;
        errorEl.classList.toggle('show', !!errorMsg);
        
        this.validationState.password = isValid;
        this.updatePasswordStrength();
        
        return isValid;
    }

    updatePasswordStrength() {
        const password = this.passwordInput.value;
        const strengthEl = document.getElementById('password-strength');
        
        if (password.length === 0) {
            strengthEl.innerHTML = '';
            return;
        }
        
        const strength = this.calculatePasswordStrength(password);
        const strengthTexts = ['Weak', 'Fair', 'Strong'];
        const strengthClasses = ['weak', 'fair', 'strong'];
        
        strengthEl.innerHTML = `
            <div class="strength-bar">
                <div class="strength-fill ${strengthClasses[strength]}"></div>
            </div>
            <span>${strengthTexts[strength]}</span>
        `;
    }

    calculatePasswordStrength(password) {
        let strength = 0;
        
        // Length
        if (password.length >= 8) strength++;
        
        // Character variety
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        
        // Numbers and symbols
        if (/\d/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;
        
        return Math.min(strength, 2); // Cap at 2 (strong)
    }

    /* ===== PASSWORD VISIBILITY ===== */

    togglePasswordVisibility() {
        const isPassword = this.passwordInput.type === 'password';
        this.passwordInput.type = isPassword ? 'text' : 'password';
        
        const isPressed = this.toggleBtn.getAttribute('aria-pressed') === 'true';
        this.toggleBtn.setAttribute('aria-pressed', !isPressed);
        this.toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        this.toggleBtn.textContent = isPassword ? '🙈' : '👁️';
        
        // Keep focus and cursor position
        this.passwordInput.focus();
        const len = this.passwordInput.value.length;
        this.passwordInput.setSelectionRange(len, len);
    }

    /* ===== FORM SUBMISSION ===== */

    async handleSubmit(e) {
        e.preventDefault();
        
        // Check for lockout
        if (this.isLockedOut()) {
            const timeRemaining = this.getTimeUntilUnlock();
            this.showAlert(
                `Too many attempts. Please try again in ${timeRemaining} minute${timeRemaining !== 1 ? 's' : ''}.`,
                'error'
            );
            return;
        }
        
        // Validate
        const emailValid = this.validateEmail(true);
        const passwordValid = this.validatePassword();
        
        if (!emailValid || !passwordValid) {
            this.focusFirstError();
            return;
        }
        
        // Prevent double submission
        if (this.isSubmitting) return;
        
        this.isSubmitting = true;
        this.submitBtn.disabled = true;
        
        try {
            // Simulate login attempt (replace with real API call)
            const response = await this.attemptLogin(
                this.emailInput.value,
                this.passwordInput.value
            );
            
            if (response.success) {
                // Save email if remember me is checked
                if (this.rememberCheckbox.checked) {
                    this.saveEmail();
                }
                
                // Clear attempt counter
                this.clearAttemptCount();
                
                // Show success
                this.showAlert('Login successful! Redirecting...', 'success');
                
                // Redirect
                setTimeout(() => {
                    window.location.href = response.redirect || '/dashboard';
                }, 800);
            } else {
                // Handle error
                this.handleLoginError(response);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showAlert('An error occurred. Please try again.', 'error');
        } finally {
            this.isSubmitting = false;
            this.submitBtn.disabled = false;
        }
    }

    async attemptLogin(email, password) {
        // Simulate API call - replace with real endpoint
        return new Promise((resolve) => {
            setTimeout(() => {
                // Demo: accept test@example.com / password123
                if (email === 'test@example.com' && password === 'password123') {
                    resolve({
                        success: true,
                        redirect: '/dashboard'
                    });
                } else {
                    resolve({
                        success: false,
                        code: 'INVALID_CREDENTIALS',
                        message: 'Invalid email or password'
                    });
                }
            }, 1500); // Simulate network delay
        });
    }

    handleLoginError(response) {
        const message = response.message || 'Login failed';
        
        switch (response.code) {
            case 'INVALID_CREDENTIALS':
                this.recordFailedAttempt();
                this.showAlert('Invalid email or password', 'error');
                this.passwordInput.value = '';
                this.passwordInput.focus();
                break;
                
            case 'ACCOUNT_LOCKED':
                this.showAlert('Account locked. Please reset your password.', 'error');
                break;
                
            case 'REQUIRES_2FA':
                // Redirect to 2FA page
                window.location.href = `/auth/2fa?session=${response.sessionToken}`;
                break;
                
            case 'RATE_LIMITED':
                this.recordFailedAttempt();
                this.showAlert('Too many attempts. Please try again in a few minutes.', 'error');
                break;
                
            default:
                this.showAlert(message, 'error');
        }
    }

    /* ===== RATE LIMITING ===== */

    recordFailedAttempt() {
        this.attemptCount++;
        const now = Date.now();
        try {
            localStorage.setItem('login_attempts', JSON.stringify({
                count: this.attemptCount,
                timestamp: now
            }));
        } catch (e) {
            console.warn('Could not record attempt:', e);
        }
    }

    clearAttemptCount() {
        this.attemptCount = 0;
        try {
            localStorage.removeItem('login_attempts');
        } catch (e) {
            console.warn('Could not clear attempts:', e);
        }
    }

    checkLockout() {
        try {
            const data = JSON.parse(localStorage.getItem('login_attempts') || '{}');
            const timeSinceAttempt = Date.now() - (data.timestamp || 0);
            
            if (data.count >= this.maxAttempts && timeSinceAttempt < this.lockoutTime) {
                this.submitBtn.disabled = true;
                const timeRemaining = this.getTimeUntilUnlock();
                this.showAlert(
                    `Account temporarily locked. Try again in ${timeRemaining} minute${timeRemaining !== 1 ? 's' : ''}.`,
                    'error'
                );
            } else if (timeSinceAttempt > this.lockoutTime) {
                this.clearAttemptCount();
            }
            
            this.attemptCount = data.count || 0;
        } catch (e) {
            console.warn('Could not check lockout:', e);
        }
    }

    isLockedOut() {
        try {
            const data = JSON.parse(localStorage.getItem('login_attempts') || '{}');
            const timeSinceAttempt = Date.now() - (data.timestamp || 0);
            return data.count >= this.maxAttempts && timeSinceAttempt < this.lockoutTime;
        } catch (e) {
            return false;
        }
    }

    getTimeUntilUnlock() {
        try {
            const data = JSON.parse(localStorage.getItem('login_attempts') || '{}');
            const timeSinceAttempt = Date.now() - (data.timestamp || 0);
            const minutesRemaining = Math.ceil((this.lockoutTime - timeSinceAttempt) / 60000);
            return minutesRemaining;
        } catch (e) {
            return 0;
        }
    }

    /* ===== UI HELPERS ===== */

    showAlert(message, type = 'error') {
        this.alertEl.textContent = message;
        this.alertEl.className = `alert alert-${type}`;
        this.alertEl.classList.remove('alert-hidden');
        this.alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Auto-hide non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                this.alertEl.classList.add('alert-hidden');
            }, 3000);
        }
    }

    focusFirstError() {
        if (!this.validationState.email) {
            this.emailInput.focus();
        } else if (!this.validationState.password) {
            this.passwordInput.focus();
        }
    }

    /* ===== LOCAL STORAGE ===== */

    saveEmail() {
        try {
            localStorage.setItem('login_email', this.emailInput.value);
        } catch (e) {
            console.warn('Could not save email:', e);
        }
    }

    restoreEmail() {
        try {
            const saved = localStorage.getItem('login_email');
            if (saved) {
                this.emailInput.value = saved;
                this.rememberCheckbox.checked = true;
                this.passwordInput.focus();
            }
        } catch (e) {
            console.warn('Could not restore email:', e);
        }
    }

    /* ===== SECURITY ===== */

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /* ===== OAUTH ===== */

    setupSocialLogin() {
        const googleBtn = document.getElementById('google-btn');
        const githubBtn = document.getElementById('github-btn');
        
        if (googleBtn) {
            googleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAlert('Google login demo - configure with real OAuth credentials', 'info');
            });
        }
        
        if (githubBtn) {
            githubBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAlert('GitHub login demo - configure with real OAuth credentials', 'info');
            });
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});
