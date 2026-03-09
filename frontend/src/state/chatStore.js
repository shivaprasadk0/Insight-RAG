/**
 * chatStore.js  –  State management for the structured chat/message data
 *
 * State shape
 * -----------
 * {
 *   chats:         { pinned: [], normal: [], archived: [] }
 *   activeChatId:  string | null
 *   messages:      { [chatId]: Message[] }
 *   loadingChats:  boolean
 *   loadingMsgs:   boolean
 * }
 *
 * All mutations call the relevant chatsApi then update local state.
 */
import {
    fetchChats,
    createChat as apiCreateChat,
    fetchMessages as apiFetchMessages,
    renameChat as apiRenameChat,
    pinChat as apiPinChat,
    archiveChat as apiArchiveChat,
    deleteChat as apiDeleteChat,
    deleteAllChats as apiDeleteAllChats,
} from '../api/chatsApi';

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let state = {
    chats: { pinned: [], normal: [], archived: [] },
    activeChatId: null,
    messages: {},          // keyed by chatId
    loadingChats: false,
    loadingMsgs: false,
    openMenuId: null, // Global ID for tracking open context menus (chatId or 'user-menu')
};

const listeners = new Set();

export function getChatState() {
    return state;
}

export function setOpenMenuId(id) {
    setState({ openMenuId: id });
}

function setState(patch) {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn(state));
}

export function subscribeChat(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function allChats() {
    const { pinned, normal, archived } = state.chats;
    return [...pinned, ...normal, ...archived];
}

function rebuildGroups(chats) {
    return {
        pinned: chats.filter(c => c.isPinned && !c.isArchived),
        normal: chats.filter(c => !c.isPinned && !c.isArchived),
        archived: chats.filter(c => c.isArchived),
    };
}

// ─────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────

/**
 * Load all chats for a user from backend.
 * @param {string} userId
 */
export async function loadChats(userId) {
    setState({ loadingChats: true });
    try {
        const data = await fetchChats(userId);
        let pinned = data.pinned || [];
        let normal = data.normal || [];
        let archived = data.archived || [];

        // Hard cap: always show exactly 50 normal chats newest-first.
        // Pinned and archived are never counted or trimmed.
        if (normal.length > 50) {
            normal = normal.slice(0, 50);
        }

        const groups = { pinned, normal, archived };
        setState({ chats: groups, loadingChats: false });
    } catch (err) {
        console.error('[chatStore] loadChats:', err);
        setState({ loadingChats: false });
    }
}

/**
 * Create a new chat and make it active.
 * @param {string} userId
 * @param {string} title
 */
export async function createChat(userId, title = 'New Chat') {
    // Always create a fresh chat and make it active.
    const chat = await apiCreateChat(userId, title);
    const { pinned, archived } = state.chats;
    let normal = [chat, ...state.chats.normal];
    if (normal.length > 50) {
        normal = normal.slice(0, 50); // drop oldest — list is newest-first
    }
    setState({
        chats: { pinned, normal, archived },
        activeChatId: chat.chatId,
        messages: { ...state.messages, [chat.chatId]: [] },
    });
    return chat;
}

/**
 * Load messages for a chat (lazy, only if not already loaded).
 * @param {string} userId
 * @param {string} chatId
 * @param {boolean} [force] – reload even if already cached
 */
export async function loadMessages(userId, chatId, force = false) {
    if (!force && state.messages[chatId]) return;

    setState({ loadingMsgs: true });
    try {
        const data = await apiFetchMessages(userId, chatId);
        setState({
            messages: { ...state.messages, [chatId]: data.messages || [] },
            loadingMsgs: false,
        });
    } catch (err) {
        console.error('[chatStore] loadMessages:', err);
        setState({ loadingMsgs: false });
    }
}

/**
 * Set the active chat (and trigger message load).
 * @param {string} userId
 * @param {string} chatId
 */
export function setActiveChat(userId, chatId) {
    setState({ activeChatId: chatId });
    loadMessages(userId, chatId);
}

/**
 * Append a message to the local cache (optimistic update).
 * @param {string} chatId
 * @param {object} message
 */
export function appendMessageToChat(chatId, message) {
    const existing = state.messages[chatId] || [];
    setState({
        messages: { ...state.messages, [chatId]: [...existing, message] },
    });
}

/**
 * Update a message in the local cache (e.g., after rating).
 * @param {string} chatId
 * @param {string} messageId
 * @param {object} patch
 */
export function patchMessage(chatId, messageId, patch) {
    const msgs = (state.messages[chatId] || []).map(m =>
        m.messageId === messageId ? { ...m, ...patch } : m
    );
    setState({ messages: { ...state.messages, [chatId]: msgs } });
}

/**
 * Rename a chat in backend and update local state.
 * @param {string} userId
 * @param {string} chatId
 * @param {string} newTitle
 */
export async function renameChat(userId, chatId, newTitle) {
    const updated = await apiRenameChat(userId, chatId, newTitle);
    const chats = allChats().map(c => c.chatId === chatId ? { ...c, title: newTitle } : c);
    setState({ chats: rebuildGroups(chats) });
    return updated;
}

/**
 * Toggle pin state.
 * @param {string} userId
 * @param {string} chatId
 * @param {boolean} isPinned
 */
export async function togglePin(userId, chatId, isPinned) {
    await apiPinChat(userId, chatId, isPinned);
    const chats = allChats().map(c => c.chatId === chatId ? { ...c, isPinned } : c);
    setState({ chats: rebuildGroups(chats) });
}

/**
 * Toggle archive state.
 * @param {string} userId
 * @param {string} chatId
 * @param {boolean} isArchived
 */
export async function toggleArchive(userId, chatId, isArchived) {
    await apiArchiveChat(userId, chatId, isArchived);
    const chats = allChats().map(c =>
        c.chatId === chatId ? { ...c, isArchived, isPinned: isArchived ? false : c.isPinned } : c
    );
    setState({ chats: rebuildGroups(chats) });
}

/**
 * Delete a chat from backend and remove from local state.
 * @param {string} userId
 * @param {string} chatId
 */
export async function deleteChat(userId, chatId) {
    await apiDeleteChat(userId, chatId);
    const remaining = allChats().filter(c => c.chatId !== chatId);
    const newMessages = { ...state.messages };
    delete newMessages[chatId];
    const newActiveId = state.activeChatId === chatId
        ? (remaining.length > 0 ? remaining[0].chatId : null)
        : state.activeChatId;
    setState({ chats: rebuildGroups(remaining), messages: newMessages, activeChatId: newActiveId });
}

/**
 * Delete all chats for a user and reset local state.
 * @param {string} userId
 */
export async function deleteAllChats(userId) {
    await apiDeleteAllChats(userId);
    setState({
        chats: { pinned: [], normal: [], archived: [] },
        messages: {},
        activeChatId: null,
    });
}
