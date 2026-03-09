import { useState } from 'react';
import { showToast } from './Toast';
import {
    createChat,
    setActiveChat,
    renameChat,
    togglePin,
    toggleArchive,
    deleteChat,
    deleteAllChats,
    setOpenMenuId,
} from '../state/chatStore';
import { clearUser } from '../state/authStore';
import { USE_LOGIN } from '../api/config';
import GlobalSearchModal from './GlobalSearchModal';
import styles from './Sidebar.module.css';

function SQLSidebar({ user, chats, activeChatId, loadingChats, openMenuId }) {
    const [search, setSearch] = useState('');
    const [pinnedOpen, setPinnedOpen] = useState(true);
    const [archivedOpen, setArchivedOpen] = useState(false);
    const [yourChatsOpen, setYourChatsOpen] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [searchModalOpen, setSearchModalOpen] = useState(false);

    const userId = user?.userId;
    const query = search.toLowerCase().trim();

    const filter = (list) => (query ? list.filter(c => c.title?.toLowerCase().includes(query)) : list);

    const pinned = filter(chats.pinned || []);
    const normal = filter(chats.normal || []);
    const archived = filter(chats.archived || []);

    const handleNewChat = async () => {
        try {
            await createChat(userId, 'New Chat');
            showToast('New chat created');
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
    };

    const handleRename = async (chatId) => {
        const trimmed = renameValue.trim();
        if (trimmed.length < 5) {
            showToast('Title must be at least 5 characters');
            return;
        }
        try {
            await renameChat(userId, chatId, trimmed);
            showToast('Chat renamed');
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
        setRenamingId(null);
        setRenameValue('');
    };

    const handlePin = async (chatId, isPinned) => {
        try {
            await togglePin(userId, chatId, !isPinned);
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
    };

    const handleArchive = async (chatId, isArchived) => {
        try {
            await toggleArchive(userId, chatId, !isArchived);
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteChat(userId, deleteTarget);
            showToast('Chat deleted');
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
        setDeleteTarget(null);
    };

    const handleDeleteAllChats = async () => {
        try {
            await deleteAllChats(userId);
            await createChat(userId, 'New Chat');
            showToast('All chats deleted');
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
        setConfirmDeleteAll(false);
    };

    const handleChatClick = (chatId) => setActiveChat(userId, chatId);

    const renderChat = (chat) => {
        const isActive = chat.chatId === activeChatId;
        const isRenaming = renamingId === chat.chatId;

        return (
            <div
                key={chat.chatId}
                className={`${styles.sessionItem} ${isActive ? styles.active : ''}`}
                onClick={() => !isRenaming && handleChatClick(chat.chatId)}
            >
                {isRenaming ? (
                    <input
                        className={styles.renameInput}
                        value={renameValue}
                        autoFocus
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(chat.chatId);
                            if (e.key === 'Escape') {
                                setRenamingId(null);
                                setRenameValue('');
                            }
                        }}
                        onBlur={() => handleRename(chat.chatId)}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.sessionTitle}>{chat.title}</span>
                )}

                <div
                    className={`${styles.itemActions} ${openMenuId === chat.chatId ? styles.itemActionsOpen : ''}`}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        className={styles.actionBtn}
                        title="Options"
                        data-menu-toggle
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === chat.chatId ? null : chat.chatId);
                        }}
                    >
                        ...
                    </button>
                    {openMenuId === chat.chatId && (
                        <div className={styles.chatContextMenu} data-menu-content onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setRenamingId(chat.chatId); setRenameValue(chat.title); setOpenMenuId(null); }}>
                                Rename
                            </button>
                            <button onClick={() => { handlePin(chat.chatId, chat.isPinned); setOpenMenuId(null); }}>
                                {chat.isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button onClick={() => { handleArchive(chat.chatId, chat.isArchived); setOpenMenuId(null); }}>
                                {chat.isArchived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button className={styles.deleteOption} onClick={() => { setDeleteTarget(chat.chatId); setOpenMenuId(null); }}>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const Folder = ({ label, items, open, setOpen }) => (
        items.length > 0 && (
            <div className={styles.folder}>
                <div className={styles.folderHeader} onClick={() => setOpen(!open)}>
                    <span className={styles.folderLabel}>{label}</span>
                    <span className={styles.folderCount}>{items.length}</span>
                </div>
                {open && <div className={styles.folderContent}>{items.map(renderChat)}</div>}
            </div>
        )
    );

    return (
        <div className={styles.sidebar}>
            <div className={styles.brand}>
                <div className={styles.brandTitle}>
                    <span className={styles.brandLogo} aria-hidden="true">
                        <span className={styles.brandLogoInner}>IQ</span>
                    </span>
                    <span className={styles.brandWordmark}>Insight Query</span>
                </div>
                <div className={styles.statusDot}>
                    {pinned.length + normal.length + archived.length} chats
                </div>
            </div>

            <button className={styles.newChatButton} onClick={handleNewChat}>
                + New Chat
            </button>

            <button className={styles.dangerGhostButton} onClick={() => setConfirmDeleteAll(true)}>
                Delete All Chats
            </button>

            <div className={styles.searchWrapper}>
                <input
                    id="sidebar-search"
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search chats"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchModalOpen(true)}
                />
            </div>

            {!loadingChats && (
                <div className={styles.sessionList}>
                    <Folder label="Pinned" items={pinned} open={pinnedOpen} setOpen={setPinnedOpen} />
                    <Folder label="Archived" items={archived} open={archivedOpen} setOpen={setArchivedOpen} />
                    <div className={styles.folder}>
                        <div className={styles.folderHeader} onClick={() => setYourChatsOpen(!yourChatsOpen)}>
                            <span className={styles.folderLabel}>Your Chats</span>
                            <span className={styles.folderCount}>{normal.length}</span>
                        </div>
                        {yourChatsOpen && (
                            <div className={styles.folderContent}>
                                {normal.length > 0 ? normal.map(renderChat) : <div>No chats yet</div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {user && (
                <div style={{ marginTop: 'auto' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === 'user-menu' ? null : 'user-menu');
                        }}
                        className={styles.userProfileBtn}
                        data-menu-toggle
                    >
                        {user.username}
                    </button>
                    {openMenuId === 'user-menu' && USE_LOGIN && (
                        <div className={styles.popoverMenu} data-menu-content>
                            <button className={styles.popoverMenuItem} onClick={() => { clearUser(); setOpenMenuId(null); }}>
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            )}

            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <h3>Delete chat?</h3>
                        <p>This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button className="cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                            <button className="confirm" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDeleteAll && (
                <div className="modal-overlay" onClick={() => setConfirmDeleteAll(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <h3>Delete all chats?</h3>
                        <p>This will permanently remove every chat for this user.</p>
                        <div className="modal-actions">
                            <button className="cancel" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
                            <button className="confirm" onClick={handleDeleteAllChats}>Delete All</button>
                        </div>
                    </div>
                </div>
            )}

            <GlobalSearchModal
                isOpen={searchModalOpen}
                onClose={() => setSearchModalOpen(false)}
                userId={userId}
                onNavigate={handleChatClick}
            />
        </div>
    );
}

export default SQLSidebar;
