/**
 * Get a window of the last N messages from an array
 * @param {import('../state/sessionTypes').Message[]} messages - Array of messages
 * @param {number} windowSize - Number of messages to return
 * @returns {import('../state/sessionTypes').Message[]}
 */
export function getWindow(messages, windowSize = 6) {
    if (!messages || messages.length === 0) {
        return [];
    }

    if (messages.length <= windowSize) {
        return messages;
    }

    return messages.slice(-windowSize);
}
