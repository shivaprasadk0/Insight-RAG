/**
 * API Configuration
 */

// Determine if the app is running locally
const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]' ||
        window.location.hostname.match(/^192\.168\./));

// Backend base URL - default local
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
    'http://localhost:8000';

/**
 * Common headers for all requests
 */
export const commonHeaders = {
    'Content-Type': 'application/json',
};

/**
 * Feature Flags
 */
export const USE_LOGIN = false; // Set to true to enable login feature
export const DEFAULT_USER_ID = 'user_001';
export const DEFAULT_USERNAME = 'SQL User';
