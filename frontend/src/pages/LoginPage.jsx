import { useState, useRef } from 'react';
import { loginUser } from '../api/auth';
import { setUser } from '../state/authStore';
import styles from './LoginPage.module.css';

/**
 * Microsoft-style login page.
 * Calls /auth/login, stores userId + token in authStore.
 */
function LoginPage({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);
    const usernameRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!username.trim()) {
            setError('Please enter your username.');
            usernameRef.current?.focus();
            return;
        }
        if (!password.trim()) {
            setError('Please enter your password.');
            return;
        }

        setError('');
        setLoading(true);

        try {
            const user = await loginUser(username.trim(), password);
            setUser(user);
            setLoading(false);
            setSuccess(true);

            setTimeout(() => setFadeOut(true), 400);
            setTimeout(() => onLoginSuccess(user), 900);
        } catch (err) {
            setLoading(false);
            setError(err.message || 'Login failed. Please try again.');
        }
    };

    return (
        <div className={`${styles.loginWrapper} ${fadeOut ? styles.fadeOut : ''}`}>
            <form
                className={`${styles.loginCard} ${success ? styles.success : ''}`}
                onSubmit={handleSubmit}
                autoComplete="off"
            >
                {/* Microsoft Logo */}
                <div className={styles.logoArea}>
                    <div className={styles.msLogo}>
                        <span></span><span></span><span></span><span></span>
                    </div>
                    <span className={styles.logoText}>Microsoft</span>
                </div>

                {/* Heading */}
                <h1 className={styles.heading}>Sign in</h1>
                <p className={styles.subheading}>Use your SQL chatbot account</p>

                {/* Error Message */}
                {error && (
                    <div className={`${styles.errorMessage} ${styles.visible}`}>
                        {error}
                    </div>
                )}

                {/* Username Input */}
                <div className={styles.inputGroup}>
                    <input
                        ref={usernameRef}
                        id="login-username"
                        type="text"
                        className={styles.passwordInput}
                        placeholder="Username"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
                        disabled={loading || success}
                        autoFocus
                    />
                </div>

                {/* Password Input */}
                <div className={styles.inputGroup}>
                    <input
                        id="login-password"
                        type="password"
                        className={styles.passwordInput}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                        disabled={loading || success}
                    />
                </div>

                {/* Forgot Password */}
                <button
                    type="button"
                    className={styles.forgotPassword}
                    onClick={() => alert('Please contact your IT administrator to reset your password.')}
                >
                    Forgot my password
                </button>

                {/* Sign In Button */}
                <div className={styles.actions}>
                    <button
                        id="sign-in-button"
                        type="submit"
                        className={`${styles.signInButton} ${loading ? styles.loading : ''}`}
                        disabled={loading || success}
                    >
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default LoginPage;
