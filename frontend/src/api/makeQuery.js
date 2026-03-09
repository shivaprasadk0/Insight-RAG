import { API_BASE_URL, commonHeaders } from './config';

/**
 * Make a query to the SQL chatbot endpoint
 * @param {import('../state/sessionTypes').Message[]} history - Last 4-6 messages for context
 * @param {string} query - Current user question
 * @param {string} [userId] - Current user ID
 * @param {string} [chatId] - Current chat ID
 * @returns {Promise<{answer: string, sources: any[], message_id: string, images: any[]}>}
 */
export async function makeQuery(history, query, userId, chatId) {
    try {
        const response = await fetch(`${API_BASE_URL}/make_query`, {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify({
                history,
                query,
                user_id: userId,
                chat_id: chatId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Log full response for debugging
        console.log('makeQuery API response:', data);

        return {
            answer: data.answer,
            sources: data.sources || [],
            message_id: data.message_id,
            images: data.images || []
        };
    } catch (error) {
        console.error('Error making SQL chatbot query:', error);
        throw new Error('Failed to get response from SQL chatbot service. Please try again.');
    }
}
