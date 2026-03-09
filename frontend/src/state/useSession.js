import { useState, useEffect } from 'react';
import * as store from './sessionStore';

/**
 * Custom hook for reactive session state
 * @returns {import('./sessionTypes').AppState}
 */
export function useSession() {
    const [state, setState] = useState(store.getState());

    useEffect(() => {
        const unsubscribe = store.subscribe(setState);
        return unsubscribe;
    }, []);

    return state;
}

// Re-export store functions for convenience
export {
    createSession,
    setActiveSession,
    appendMessage,
    updateSessionTitle,
    deleteSession,
    toggleSidebar
} from './sessionStore';
