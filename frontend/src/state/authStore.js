/**
 * authStore.js  –  Centralised auth state with pub/sub
 *
 * State shape
 * -----------
 *   { user: { userId, username, token } | null }
 */
import { getAuth, logout as apiLogout } from '../api/auth';
import { USE_LOGIN, DEFAULT_USER_ID, DEFAULT_USERNAME } from '../api/config';

const DEFAULT_USER = { userId: DEFAULT_USER_ID, username: DEFAULT_USERNAME, token: 'fixed-token' };

let state = {
    user: USE_LOGIN ? getAuth() : DEFAULT_USER,   // use default user if login is disabled
};

const listeners = new Set();

export function getAuthState() {
    return state;
}

export function setAuthState(newState) {
    state = { ...state, ...newState };
    listeners.forEach(fn => fn(state));
}

export function subscribeAuth(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function setUser(user) {
    setAuthState({ user });
}

export function clearUser() {
    apiLogout();
    setAuthState({ user: USE_LOGIN ? null : DEFAULT_USER });
}
