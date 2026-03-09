import { useState, useEffect } from 'react';
import { subscribeAuth, getAuthState, setUser } from './state/authStore';
import { getAuth } from './api/auth';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import './index.css';

/**
 * Root App component – handles auth routing.
 * If the user is authenticated (token in sessionStorage) → show ChatPage.
 * Otherwise → show LoginPage.
 */
function App() {
    const [authState, setAuthState] = useState(getAuthState());

    useEffect(() => {
        const unsub = subscribeAuth(setAuthState);
        return unsub;
    }, []);

    const { user } = authState;

    if (!user) {
        return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
    }

    return <ChatPage user={user} />;
}

export default App;
