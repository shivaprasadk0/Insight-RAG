import { useState, useEffect, useCallback } from 'react';
import { subscribeChat, getChatState, loadChats, createChat, setActiveChat } from '../state/chatStore';
import SQLSidebar from '../components/SQLSidebar';
import SQLChatWindow from '../components/SQLChatWindow';
import { ToastContainer } from '../components/Toast';
import styles from './ChatPage.module.css';

/**
 * Main chat page for SQL chatbot.
 * @param {{ user: { userId: string, username: string, token: string } }} props
 */
function ChatPage({ user }) {
    const [chatState, setChatState] = useState(getChatState());

    // Subscribe to chatStore
    useEffect(() => {
        const unsub = subscribeChat(setChatState);
        return unsub;
    }, []);

    // On mount: load chats for this user and start a new one
    useEffect(() => {
        if (user?.userId) {
            loadChats(user.userId).then(() => {
                // Always try to create/reuse an empty chat on start
                createChat(user.userId, 'New Chat');
            });
        }
    }, [user?.userId]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyboard = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                createChat(user.userId, 'New Chat');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('sidebar-search')?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyboard);
        return () => window.removeEventListener('keydown', handleKeyboard);
    }, [user?.userId]);

    const { chats, activeChatId, messages, loadingChats, loadingMsgs, openMenuId } = chatState;
    const allChats = [...(chats.pinned || []), ...(chats.normal || []), ...(chats.archived || [])];
    const activeChat = allChats.find(c => c.chatId === activeChatId) || null;

    // Global click-outside handler
    useEffect(() => {
        const handleClick = (e) => {
            // If some menu is open, and we clicked somewhere that is NOT an action button or part of a menu
            if (openMenuId) {
                // Check if click was NOT on an action button, context menu, or profile button
                // (Using data attributes or classes is safest)
                const isActionBtn = e.target.closest(`[data-menu-toggle]`);
                const isMenu = e.target.closest(`[data-menu-content]`);

                if (!isActionBtn && !isMenu) {
                    console.log('[ChatPage] Clicking outside, closing menu:', openMenuId);
                    import('../state/chatStore').then(m => m.setOpenMenuId(null));
                }
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [openMenuId]);

    return (
        <div className={styles.chatPage}>
            <div className={styles.mainCard}>
                <SQLSidebar
                    user={user}
                    chats={chats}
                    activeChatId={activeChatId}
                    loadingChats={loadingChats}
                    openMenuId={openMenuId}
                />
                <div className={styles.mainContent}>
                    <SQLChatWindow
                        user={user}
                        activeChatId={activeChatId}
                        activeChatTitle={activeChat?.title}
                        messages={messages[activeChatId] || []}
                        loadingMsgs={loadingMsgs}
                    />
                </div>
            </div>
            <ToastContainer />
        </div>
    );
}

export default ChatPage;
