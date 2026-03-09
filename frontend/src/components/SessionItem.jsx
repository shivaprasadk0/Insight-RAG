import { useState, useRef, useEffect } from 'react';
import styles from './SessionItem.module.css';

function SessionItem({
    session,
    active,
    collapsed,
    isPinned,
    isArchived,
    onClick,
    onRename,
    onDelete,
    onPin,
    onArchive
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuFlip, setMenuFlip] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(session.title);

    const menuBtnRef = useRef(null);
    const menuRef = useRef(null);
    const renameRef = useRef(null);

    // Focus rename input
    useEffect(() => {
        if (renaming && renameRef.current) {
            renameRef.current.focus();
            renameRef.current.select();
        }
    }, [renaming]);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;

        const handleOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
        };
    }, [menuOpen]);

    const formatTime = (ts) => {
        if (!ts) return '';
        const date = new Date(ts);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0)
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7)
            return date.toLocaleDateString('en-US', { weekday: 'short' });

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const handleRenameSubmit = () => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== session.title) {
            onRename?.(session.id, trimmed);
        }
        setRenaming(false);
    };

    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') {
            setRenaming(false);
            setRenameValue(session.title);
        }
    };

    const toggleMenu = (e) => {
        e.stopPropagation();

        if (menuBtnRef.current) {
            const rect = menuBtnRef.current.getBoundingClientRect();
            setMenuFlip(window.innerHeight - rect.bottom < 200);
        }

        setMenuOpen(prev => !prev);
    };

    const doAction = (e, action) => {
        e.stopPropagation();
        setMenuOpen(false);
        action();
    };

    // Collapsed mode
    if (collapsed) {
        return (
            <div
                className={`${styles.collapsedItem} ${active ? styles.active : ''}`}
                onClick={onClick}
                title={session.title}
            >
                💬
            </div>
        );
    }

    const iconClass = isPinned
        ? styles.pinned
        : isArchived
        ? styles.archived
        : '';

    return (
        <div
            className={`${styles.sessionItem} ${active ? styles.active : ''}`}
            onClick={onClick}
        >
            <div className={`${styles.chatIcon} ${iconClass}`}>
                {isPinned ? '📌' : isArchived ? '📦' : '💬'}
            </div>

            <div
                className={styles.textArea}
                onClick={e => renaming && e.stopPropagation()}
            >
                {renaming ? (
                    <input
                        ref={renameRef}
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={handleRenameKeyDown}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.title}>
                        {session.title}
                    </span>
                )}
            </div>

            <span className={styles.timestamp}>
                {formatTime(session.createdAt)}
            </span>

            {onRename && (
                <div
                    className={styles.menuWrapper}
                    ref={menuRef}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        ref={menuBtnRef}
                        className={`${styles.menuButton} ${
                            menuOpen ? styles.menuButtonActive : ''
                        }`}
                        onClick={toggleMenu}
                        title="More options"
                    >
                        ⋯
                    </button>

                    {menuOpen && (
                        <div
                            className={`${styles.dropdown} ${
                                menuFlip ? styles.dropdownUp : ''
                            }`}
                        >
                            <button
                                className={styles.dropdownItem}
                                onClick={e =>
                                    doAction(e, () => {
                                        setRenameValue(session.title);
                                        setRenaming(true);
                                    })
                                }
                            >
                                ✏️ Rename
                            </button>

                            <button
                                className={styles.dropdownItem}
                                onClick={e =>
                                    doAction(e, () =>
                                        onPin?.(session.id)
                                    )
                                }
                            >
                                {isPinned ? '📌 Unpin' : '📌 Pin Chat'}
                            </button>

                            <button
                                className={styles.dropdownItem}
                                onClick={e =>
                                    doAction(e, () =>
                                        onArchive?.(session.id)
                                    )
                                }
                            >
                                {isArchived
                                    ? '📂 Unarchive'
                                    : '📦 Archive'}
                            </button>

                            <button
                                className={`${styles.dropdownItem} ${styles.danger}`}
                                onClick={e =>
                                    doAction(e, () =>
                                        onDelete?.(session.id)
                                    )
                                }
                            >
                                🗑️ Delete
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SessionItem;