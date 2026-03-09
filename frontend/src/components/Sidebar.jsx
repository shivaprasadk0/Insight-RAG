import { useState, useMemo } from 'react';
import { useSession, createSession, setActiveSession, updateSessionTitle, deleteSession } from '../state/useSession';
import { showToast } from './Toast';
import SessionItem from './SessionItem';
import styles from './Sidebar.module.css';

/**
 * Sidebar component – glassmorphism, with search, pinned/archived/your-chats folder sections
 */
function Sidebar({ user }) {
    const { sessions, activeSessionId } = useSession();
    const [search, setSearch] = useState('');
    const [pinnedIds, setPinnedIds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('pinned_chats') || '[]'); } catch { return []; }
    });
    const [archivedIds, setArchivedIds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('archived_chats') || '[]'); } catch { return []; }
    });
    const [pinnedOpen, setPinnedOpen] = useState(true);
    const [archivedOpen, setArchivedOpen] = useState(false);
    const [yourChatsOpen, setYourChatsOpen] = useState(true);

    // Confirmation modal state
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Persist pinned/archived
    const persistPinned = (ids) => { setPinnedIds(ids); localStorage.setItem('pinned_chats', JSON.stringify(ids)); };
    const persistArchived = (ids) => { setArchivedIds(ids); localStorage.setItem('archived_chats', JSON.stringify(ids)); };

    // Filtered and categorized sessions
    const { pinned, regular, archived } = useMemo(() => {
        const query = search.toLowerCase().trim();
        const filtered = sessions.filter(s => !query || s.title.toLowerCase().includes(query));
        return {
            pinned: filtered.filter(s => pinnedIds.includes(s.id) && !archivedIds.includes(s.id)),
            regular: filtered.filter(s => !pinnedIds.includes(s.id) && !archivedIds.includes(s.id)),
            archived: filtered.filter(s => archivedIds.includes(s.id)),
        };
    }, [sessions, search, pinnedIds, archivedIds]);

    const handleNewChat = () => createSession();

    const handleRename = (sessionId, newTitle) => {
        updateSessionTitle(sessionId, newTitle);
        showToast('✏️ Chat renamed');
    };

    const handleDelete = (sessionId) => {
        setDeleteTarget(sessionId);
    };

    const confirmDelete = () => {
        if (deleteTarget) {
            deleteSession(deleteTarget);
            persistPinned(pinnedIds.filter(id => id !== deleteTarget));
            persistArchived(archivedIds.filter(id => id !== deleteTarget));
            showToast('🗑️ Chat deleted');
            setDeleteTarget(null);
        }
    };

    const handlePin = (sessionId) => {
        if (pinnedIds.includes(sessionId)) {
            persistPinned(pinnedIds.filter(id => id !== sessionId));
            showToast('📌 Chat unpinned');
        } else {
            persistPinned([...pinnedIds, sessionId]);
            persistArchived(archivedIds.filter(id => id !== sessionId));
            showToast('📌 Chat pinned');
        }
    };

    const handleArchive = (sessionId) => {
        if (archivedIds.includes(sessionId)) {
            persistArchived(archivedIds.filter(id => id !== sessionId));
            showToast('📂 Chat unarchived');
        } else {
            persistArchived([...archivedIds, sessionId]);
            persistPinned(pinnedIds.filter(id => id !== sessionId));
            showToast('📦 Chat archived');
        }
    };

    const sessionItemProps = (session) => ({
        key: session.id,
        session,
        active: session.id === activeSessionId,
        isPinned: pinnedIds.includes(session.id),
        isArchived: archivedIds.includes(session.id),
        onClick: () => setActiveSession(session.id),
        onRename: handleRename,
        onDelete: handleDelete,
        onPin: handlePin,
        onArchive: handleArchive,
    });

    // ─── Expanded sidebar ───
    return (
        <div className={styles.sidebar}>
            {/* Brand */}
            <div className={styles.brand}>
                <div className={styles.brandTitle}><img src="/logo.png" alt="Logo" className={styles.logoImage} /></div>
            </div>

            {/* New Chat */}
            <button className={styles.newChatButton} onClick={handleNewChat} id="new-chat-btn">
                + New Chat
            </button>

            {/* Search */}
            <div className={styles.searchWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                    id="sidebar-search"
                    className={styles.searchInput}
                    type="text"
                    placeholder="Search chats…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Session Lists — Folder structure: Pinned → Archived → Your Chats */}
            <div className={styles.sessionList}>

                {/* ── Pinned Folder ── */}
                {pinned.length > 0 && (
                    <div className={styles.folder}>
                        <div className={styles.folderHeader} onClick={() => setPinnedOpen(!pinnedOpen)}>
                            <span className={styles.folderIcon}>{pinnedOpen ? '📂' : '📁'}</span>
                            <span className={styles.folderLabel}>Pinned</span>
                            <span className={styles.folderCount}>{pinned.length}</span>
                            <span className={`${styles.folderArrow} ${!pinnedOpen ? styles.collapsed : ''}`}>▾</span>
                        </div>
                        {pinnedOpen && (
                            <div className={styles.folderContent}>
                                {pinned.map(session => (
                                    <SessionItem {...sessionItemProps(session)} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Archived Folder ── */}
                {archived.length > 0 && (
                    <div className={styles.folder}>
                        <div className={styles.folderHeader} onClick={() => setArchivedOpen(!archivedOpen)}>
                            <span className={styles.folderIcon}>{archivedOpen ? '📂' : '📁'}</span>
                            <span className={styles.folderLabel}>Archived</span>
                            <span className={styles.folderCount}>{archived.length}</span>
                            <span className={`${styles.folderArrow} ${!archivedOpen ? styles.collapsed : ''}`}>▾</span>
                        </div>
                        {archivedOpen && (
                            <div className={styles.folderContent}>
                                {archived.map(session => (
                                    <SessionItem {...sessionItemProps(session)} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Your Chats Folder ── */}
                <div className={styles.folder}>
                    <div className={styles.folderHeader} onClick={() => setYourChatsOpen(!yourChatsOpen)}>
                        <span className={styles.folderIcon}>{yourChatsOpen ? '📂' : '📁'}</span>
                        <span className={styles.folderLabel}>Your Chats</span>
                        <span className={styles.folderCount}>{regular.length}</span>
                        <span className={`${styles.folderArrow} ${!yourChatsOpen ? styles.collapsed : ''}`}>▾</span>
                    </div>
                    {yourChatsOpen && (
                        <div className={styles.folderContent}>
                            {regular.length > 0 ? (
                                regular.map(session => (
                                    <SessionItem {...sessionItemProps(session)} />
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                    No chats yet
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <h3>Delete chat?</h3>
                        <p>This action cannot be undone. The chat history will be permanently removed.</p>
                        <div className="modal-actions">
                            <button className="cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                            <button className="confirm" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sidebar;
