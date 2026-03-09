/**
 * Session Store - Centralized state management with pub/sub pattern
 */
import { API_BASE_URL, commonHeaders } from '../api/config';

const STORAGE_KEY = 'rag_app_state';

/** @type {import('./sessionTypes').AppState} */
let state = {
    sessions: [],
    activeSessionId: null,
    sidebarCollapsed: false
};

const listeners = new Set();

/**
 * Get current app state
 * @returns {import('./sessionTypes').AppState}
 */
export function getState() {
    return state;
}

/**
 * Update state and notify all listeners
 * @param {Partial<import('./sessionTypes').AppState>} newState
 */
export function setState(newState) {
    state = { ...state, ...newState };
    saveState();
    listeners.forEach(listener => listener(state));
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function to be called on state changes
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Create a new session with default values
 * @returns {string} The ID of the newly created session
 */
export function createSession() {
    const newSession = {
        id: crypto.randomUUID(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now()
    };

    setState({
        sessions: [...state.sessions, newSession],
        activeSessionId: newSession.id
    });

    saveSessionToDisk(newSession);

    return newSession.id;
}

/**
 * Set the active session
 * @param {string} sessionId
 */
export function setActiveSession(sessionId) {
    setState({ activeSessionId: sessionId });
}

/**
 * Append a message to a specific session
 * @param {string} sessionId
 * @param {import('./sessionTypes').Message} message
 */
export function appendMessage(sessionId, message) {
    let updatedSession = null;
    const sessions = state.sessions.map(session => {
        if (session.id === sessionId) {
            updatedSession = {
                ...session,
                messages: [...session.messages, message]
            };
            return updatedSession;
        }
        return session;
    });

    setState({ sessions });
    if (updatedSession) {
        saveSessionToDisk(updatedSession);
    }
}

/**
 * Update session title
 * @param {string} sessionId
 * @param {string} title
 */
export function updateSessionTitle(sessionId, title) {
    let updatedSession = null;
    const sessions = state.sessions.map(session => {
        if (session.id === sessionId) {
            updatedSession = { ...session, title };
            return updatedSession;
        }
        return session;
    });

    setState({ sessions });
    if (updatedSession) {
        saveSessionToDisk(updatedSession);
    }
}

/**
 * Delete a session by ID
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
    const sessions = state.sessions.filter(s => s.id !== sessionId);
    const newActive = state.activeSessionId === sessionId
        ? (sessions.length > 0 ? sessions[0].id : null)
        : state.activeSessionId;

    setState({ sessions, activeSessionId: newActive });

    // Fire-and-forget delete on backend
    try {
        fetch(`${API_BASE_URL}/delete_session/${sessionId}`, { method: 'DELETE' })
            .catch(err => console.error('Failed to delete session on server:', err));
    } catch (err) {
        console.error('Failed to delete session:', err);
    }
}

/**
 * Toggle sidebar collapsed state
 */
export function toggleSidebar() {
    setState({ sidebarCollapsed: !state.sidebarCollapsed });
}

/**
 * Load sessions from backend API (ChatHistory folder)
 */
export async function loadState() {
    try {
        const response = await fetch(`${API_BASE_URL}/list_sessions`);
        if (response.ok) {
            const data = await response.json();
            state.sessions = data.sessions || [];

            // If there are sessions but no active one, activate the first
            if (state.sessions.length > 0 && !state.activeSessionId) {
                state.activeSessionId = state.sessions[0].id;
            }

            listeners.forEach(listener => listener(state));
            console.log(`Loaded ${state.sessions.length} sessions from disk`);
        }
    } catch (error) {
        console.error('Failed to load sessions from backend:', error);
        // Fallback to empty state
        state.sessions = [];
    }
}

/**
 * Save UI state (sidebar collapsed) to localStorage
 * Note: Sessions are saved to disk via saveSessionToDisk
 */
function saveState() {
    try {
        // Only save UI preferences, not sessions
        const uiState = {
            activeSessionId: state.activeSessionId,
            sidebarCollapsed: state.sidebarCollapsed
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(uiState));
    } catch (error) {
        console.error('Failed to save UI state to localStorage:', error);
    }
}

/**
 * Save session to disk via API
 * @param {import('./sessionTypes').Session} session 
 */
async function saveSessionToDisk(session) {
    try {
        // Debounce or fire-and-forget
        // For now, we fire and forget, ignoring errors to not block UI
        await fetch(`${API_BASE_URL}/save_session`, {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(session)
        });
    } catch (error) {
        console.error('Failed to save session to disk:', error);
    }
}
