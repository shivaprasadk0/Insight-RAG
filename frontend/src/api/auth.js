/**
 * auth.js  –  Login / logout helpers
 */
import { API_BASE_URL, commonHeaders } from './config';

const AUTH_KEY = 'rag_auth';

/** @typedef {{ userId: string, username: string, token: string }} AuthUser */

/**
 * Authenticate against the backend.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<AuthUser>}
 */
export async function loginUser(username, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(err.detail || 'Login failed');
    }

    /** @type {{ success: boolean, userId: string, username: string, token: string }} */
    const data = await res.json();
    const user = { userId: data.userId, username: data.username, token: data.token };
    persistAuth(user);
    return user;
}

/** Save auth to sessionStorage (cleared when tab closes). */
export function persistAuth(user) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

/** Load auth from sessionStorage, or null if not logged in. */
export function getAuth() {
    try {
        return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
    } catch {
        return null;
    }
}

/** Clear auth and redirect to login. */
export function logout() {
    sessionStorage.removeItem(AUTH_KEY);
}
