import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./GlobalSearchModal.module.css";
import { showToast } from "./Toast";
import { setActiveChat } from "../state/chatStore";
import { API_BASE_URL } from "../api/config";

export default function GlobalSearchModal({ isOpen, onClose, userId, onNavigate }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setQuery("");
            setResults([]);
            return;
        }

        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timer = setTimeout(() => {
            handleSearch();
        }, 400);

        return () => clearTimeout(timer);
    }, [query, isOpen]);

    const handleSearch = async () => {
        if (!isOpen || !query.trim() || !userId) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            // Determine API URL
            const url = `${API_BASE_URL}/search_sessions`;

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    search_text: query.trim(),
                    limit: 20
                })
            });
            if (!response.ok) throw new Error("Search failed");
            const data = await response.json();
            setResults(data.sessions || []);
        } catch (err) {
            console.error(err);
            showToast("Search failed: " + err.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleSelect = (chatId) => {
        setActiveChat(userId, chatId);
        if (onNavigate) onNavigate(chatId);
        onClose();
    };

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.searchHeader}>
                    <span className={styles.searchIcon}>🔍</span>
                    <input
                        autoFocus
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search chats and projects"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSearch();
                        }}
                    />
                    <button
                        onClick={handleSearch}
                        className={styles.searchBtn}
                        disabled={loading}
                    >
                        Search
                    </button>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                <div className={styles.resultsContainer}>
                    {loading ? (
                        <div className={styles.message}>Searching...</div>
                    ) : results.length > 0 ? (
                        <ul className={styles.resultList}>
                            {results.map((r, i) => (
                                <li key={`${r.session_id}_${i}`} className={styles.resultItem} onClick={() => handleSelect(r.session_id)}>
                                    <span className={styles.itemIcon}>💬</span>
                                    <span className={styles.itemTitle}>{r.title || "Untitled conversation"}</span>
                                    <span className={styles.itemAction}>Enter</span>
                                </li>
                            ))}
                        </ul>
                    ) : query.trim() ? (
                        <div className={styles.message}>No matches found.</div>
                    ) : (
                        <div className={styles.message}>Type to search across previously processed chats...</div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
