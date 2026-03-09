import { useState, forwardRef, useImperativeHandle } from 'react';
import { useSession, appendMessage, updateSessionTitle } from '../state/useSession';
import { makeQuery } from '../api/makeQuery';
import { createChatTitle } from '../api/createChatTitle';
import { getWindow } from '../utils/windowHistory';
import styles from './ChatInput.module.css';

/**
 * Chat input component with send functionality – glass style
 */
const ChatInput = forwardRef(function ChatInput({ sessionId, onGenerating }, ref) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    // Expose submitQuestion so parent can trigger it from suggestion cards
    useImperativeHandle(ref, () => ({
        submitQuestion: (question) => {
            if (loading) return;
            // Simulate form submission with the given question
            handleDirectSubmit(question);
        }
    }));
    const { sessions } = useSession();

    const currentSession = sessions.find(s => s.id === sessionId);

    const handleDirectSubmit = async (questionText) => {
        if (!questionText.trim() || loading) return;
        const userMessage = questionText.trim();
        setInput('');
        setLoading(true);
        onGenerating?.(true);
        try {
            appendMessage(sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });
            const isFirstExchange = currentSession.messages.length === 0;
            const cleanHistory = currentSession.messages.map(msg => ({ role: msg.role, content: msg.content }));
            const history = getWindow(cleanHistory, 12);
            const response = await makeQuery(history, userMessage);
            const assistantMessage = {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
                sources: response.sources || [],
                images: response.images || []
            };
            appendMessage(sessionId, assistantMessage);
            if (isFirstExchange && currentSession.title === 'New Chat') {
                maybeGenerateTitle(sessionId, userMessage, response.answer);
            }
        } catch (error) {
            appendMessage(sessionId, { role: 'assistant', content: `Error: ${error.message}`, timestamp: Date.now() });
        } finally {
            setLoading(false);
            onGenerating?.(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setLoading(true);
        onGenerating?.(true);

        try {
            // 1. Append user message (no sources/images)
            appendMessage(sessionId, {
                role: 'user',
                content: userMessage,
                timestamp: Date.now()
            });

            // Check if this is the first Q&A BEFORE calling API
            const isFirstExchange = currentSession.messages.length === 0;
            console.log('Is first exchange?', isFirstExchange, 'Current messages:', currentSession.messages.length);

            // 2. Get context window - strip sources, images, and timestamps from history
            const cleanHistory = currentSession.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            const history = getWindow(cleanHistory, 12);  // Last 12 messages = 6 pairs

            // 3. Call RAG API
            const response = await makeQuery(history, userMessage);

            // 4. Append assistant response WITH sources and images
            const assistantMessage = {
                role: 'assistant',
                content: response.answer,
                timestamp: Date.now(),
                sources: response.sources || [],
                images: response.images || []
            };

            appendMessage(sessionId, assistantMessage);

            // 5. Generate title if this was the first Q&A exchange
            if (isFirstExchange && currentSession.title === "New Chat") {
                maybeGenerateTitle(sessionId, userMessage, response.answer);
            }
        } catch (error) {
            // Show error message
            appendMessage(sessionId, {
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: Date.now()
            });
        } finally {
            setLoading(false);
            onGenerating?.(false);
        }
    };

    const maybeGenerateTitle = async (sessionId, question, answer) => {
        try {
            const result = await createChatTitle(question, answer);
            if (result?.title) {
                console.log('Generated title:', result.title);
                updateSessionTitle(sessionId, result.title);
            }
        } catch (error) {
            console.error('Title generation failed:', error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className={styles.chatInputWrapper}>
            <form className={styles.chatInput} onSubmit={handleSubmit}>
                <textarea
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    disabled={false}
                />
                <button
                    type="submit"
                    className={styles.sendButton}
                    disabled={!input.trim() || loading}
                    title="Send message"
                >
                    <span className={styles.sendIcon}>
                        {loading ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10">
                                    <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="0.8s" repeatCount="indefinite" />
                                </circle>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        )}
                    </span>
                </button>
            </form>
        </div>
    );
});

export default ChatInput;
