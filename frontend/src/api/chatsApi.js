/**
 * chatsApi.js  –  Chat management API calls
 */
import { API_BASE_URL, commonHeaders } from './config';

/**
 * Fetch all chats for a user.
 * @param {string} userId
 * @returns {Promise<{ pinned: [], normal: [], archived: [], all: [] }>}
 */
export async function fetchChats(userId) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}`, { headers: commonHeaders });
    if (!res.ok) throw new Error('Failed to load chats');
    return res.json();
}

/**
 * Create a new chat.
 * @param {string} userId
 * @param {string} title  – must be ≥ 5 chars
 * @returns {Promise<object>} created chat document
 */
export async function createChat(userId, title) {
    const res = await fetch(`${API_BASE_URL}/chats`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ userId, title }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to create chat');
    return data;
}

/**
 * Fetch messages for a chat.
 * @param {string} userId
 * @param {string} chatId
 * @returns {Promise<{ messages: object[] }>}
 */
export async function fetchMessages(userId, chatId) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}/${chatId}/messages`, {
        headers: commonHeaders,
    });
    if (!res.ok) throw new Error('Failed to load messages');
    return res.json();
}

/**
 * Rename a chat.
 * @param {string} userId
 * @param {string} chatId
 * @param {string} newTitle – must be ≥ 5 chars
 */
export async function renameChat(userId, chatId, newTitle) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}/${chatId}/rename`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ userId, title: newTitle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to rename chat');
    return data;
}

/**
 * Toggle pin state.
 * @param {string} userId
 * @param {string} chatId
 * @param {boolean} isPinned
 */
export async function pinChat(userId, chatId, isPinned) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}/${chatId}/pin`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ userId, isPinned }),
    });
    if (!res.ok) throw new Error('Failed to update pin status');
    return res.json();
}

/**
 * Toggle archive state.
 * @param {string} userId
 * @param {string} chatId
 * @param {boolean} isArchived
 */
export async function archiveChat(userId, chatId, isArchived) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}/${chatId}/archive`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ userId, isArchived }),
    });
    if (!res.ok) throw new Error('Failed to update archive status');
    return res.json();
}

/**
 * Delete a chat.
 * @param {string} userId
 * @param {string} chatId
 */
export async function deleteChat(userId, chatId) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}/${chatId}`, {
        method: 'DELETE',
        headers: commonHeaders,
    });
    if (!res.ok) throw new Error('Failed to delete chat');
    return res.json();
}

/**
 * Delete all chats for a user.
 * @param {string} userId
 */
export async function deleteAllChats(userId) {
    const res = await fetch(`${API_BASE_URL}/chats/${userId}`, {
        method: 'DELETE',
        headers: commonHeaders,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete all chats');
    return data;
}

/**
 * Submit a message rating.
 * @param {string} messageId
 * @param {string} userId
 * @param {number} rating   – 1-5
 * @param {string} [comment]
 */
export async function rateMessage(messageId, userId, rating, comment) {
    const res = await fetch(`${API_BASE_URL}/messages/rate`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ messageId, userId, rating, comment }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to submit rating');
    return data;
}
