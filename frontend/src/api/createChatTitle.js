import { API_BASE_URL, commonHeaders } from './config';

/**
 * Create a chat title from the first question and response
 * @param {string} question - First user question
 * @param {string} response - First assistant response
 * @returns {Promise<{title: string} | null>}
 */
export async function createChatTitle(question, response) {
    try {
        const res = await fetch(`${API_BASE_URL}/create_chat_title`, {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify({
                question,
                response
            })
        });

        if (!res.ok) {
            console.warn('Title generation failed with status:', res.status);
            return null;
        }

        const data = await res.json();
        return { title: data.title };
    } catch (error) {
        // Silent failure - keep "New Chat" title
        console.warn('Title generation error:', error);
        return null;
    }
}
