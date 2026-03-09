import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { makeQuery } from '../api/makeQuery';
import { createChatTitle } from '../api/createChatTitle';
import { rateMessage } from '../api/chatsApi';
import { appendMessageToChat, patchMessage, renameChat } from '../state/chatStore';
import { showToast } from './Toast';
import styles from './ChatWindow.module.css';
import mbStyles from './MessageBubble.module.css';

const SQL_QUESTIONS = [
    { text: 'How many total bookings are in the dataset?', badge: 'BK' },
    { text: 'How many bookings were canceled?', badge: 'CX' },
    { text: 'What is the cancellation rate by month?', badge: 'RT' },
    { text: 'What is the average room price?', badge: 'AR' },
    { text: 'Show top 5 market segments by booking count.', badge: 'MS' },
    { text: 'How many repeated guests are there?', badge: 'RG' },
];

function RatingWidget({ messageId, userId, chatId, existingRating, existingComment }) {
    const [rating, setRating] = useState(existingRating || 0);
    const [comment, setComment] = useState(existingComment || '');
    const [submitted, setSubmitted] = useState(!!existingRating);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!rating) return;
        setLoading(true);
        try {
            await rateMessage(messageId, userId, rating, comment || undefined);
            patchMessage(chatId, messageId, { rating, feedback: { comment, createdAt: new Date().toISOString() } });
            setSubmitted(true);
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return <div className={mbStyles.feedbackDone}>Thanks for feedback.</div>;

    return (
        <div className={mbStyles.feedbackSection}>
            <div className={mbStyles.starRow}>
                {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} className={mbStyles.star} onClick={() => setRating(star)} type="button">
                        *
                    </button>
                ))}
            </div>
            <div className={mbStyles.commentBox}>
                <input
                    className={mbStyles.commentInput}
                    placeholder="Optional feedback"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                />
                <button className={mbStyles.commentSubmit} type="button" onClick={handleSubmit} disabled={loading}>
                    {loading ? '...' : 'Submit'}
                </button>
            </div>
        </div>
    );
}

function MessageBubble({ msg, userId, chatId }) {
    const { role, content, messageId, createdAt, timestamp, rating, feedback } = msg;
    const ts = createdAt || timestamp;
    const time = ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(content || '');
            showToast(role === 'assistant' ? 'Answer copied' : 'Question copied');
        } catch {
            showToast('Could not copy text');
        }
    };

    return (
        <div className={`${mbStyles.messageBubble} ${mbStyles[role]}`}>
            <div className={mbStyles.avatar}>{role === 'assistant' ? 'AI' : 'You'}</div>
            <div className={mbStyles.messageContent}>
                <div className={mbStyles.content}>
                    {role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    ) : (
                        <div className={styles.userQuestionText}>{(content || '').trim()}</div>
                    )}
                </div>

                <div className={styles.messageMetaRow}>
                    <button className={styles.metaActionBtn} type="button" onClick={copyText}>
                        Copy
                    </button>
                </div>

                {role === 'assistant' && messageId && userId && chatId && (
                    <RatingWidget
                        messageId={messageId}
                        userId={userId}
                        chatId={chatId}
                        existingRating={rating}
                        existingComment={feedback?.comment}
                    />
                )}
                <div className={mbStyles.timestamp}>{time}</div>
            </div>
        </div>
    );
}

function WelcomeScreen({ onQuestionClick }) {
    const randomQuestions = useMemo(() => [...SQL_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 4), []);
    return (
        <div className={styles.welcomeWrapper}>
            <div className={styles.greetingBlock}>
                <div className={styles.welcomeLogo} aria-hidden="true">
                    <span className={styles.welcomeLogoInner}>IQ</span>
                </div>
                <h2 className={styles.greetingTitle}>SQL Chatbot</h2>
                <p className={styles.greetingSubtitle}>Ask questions about your local MySQL table.</p>
            </div>
            <div className={styles.suggestionsSection}>
                <p className={styles.suggestionsLabel}>Try one of these:</p>
                <div className={styles.suggestionsGrid}>
                    {randomQuestions.map((q, i) => (
                        <button key={i} className={styles.suggestionCard} onClick={() => onQuestionClick(q.text)}>
                            <span className={styles.suggestionBadge}>{q.badge}</span>
                            <span className={styles.suggestionText}>{q.text}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SQLChatWindow({ user, activeChatId, activeChatTitle, messages, loadingMsgs }) {
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [lastQuestion, setLastQuestion] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isGenerating]);

    const submitQuestion = async (questionText) => {
        if (!questionText.trim() || isGenerating || !activeChatId) return;
        const userText = questionText.trim();
        setLastQuestion(userText);
        setIsGenerating(true);
        appendMessageToChat(activeChatId, { role: 'user', content: userText, timestamp: Date.now() });

        const cleanHistory = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));

        try {
            const data = await makeQuery(cleanHistory, userText, user?.userId || 'anonymous', activeChatId);
            appendMessageToChat(activeChatId, {
                messageId: data.message_id,
                role: 'assistant',
                content: data.answer,
                sources: data.sources || [],
                timestamp: Date.now(),
                rating: null,
                feedback: null,
            });

            if (messages.length === 0) {
                const titleRes = await createChatTitle(userText, data.answer);
                if (titleRes?.title) await renameChat(user?.userId, activeChatId, titleRes.title);
            }
        } catch (err) {
            appendMessageToChat(activeChatId, { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() });
            try {
                await renameChat(user?.userId, activeChatId, 'SQL Chat Assistant');
            } catch {
                // Ignore rename failures.
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        setInput('');
        await submitQuestion(text);
    };

    const handleRegenerate = async () => {
        if (!lastQuestion || isGenerating) return;
        await submitQuestion(lastQuestion);
    };

    if (!activeChatId) {
        return (
            <div className={styles.chatWindow}>
                <div className={styles.messagesContainer}>
                    <WelcomeScreen onQuestionClick={() => { }} />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.chatWindow}>
            <div className={styles.chatHeader}>
                <div>
                    <h3 className={styles.chatTitle}>{activeChatTitle || 'New Chat'}</h3>
                    <p className={styles.chatSubtitle}>{messages.length} messages</p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        type="button"
                        className={styles.headerBtn}
                        onClick={handleRegenerate}
                        disabled={!lastQuestion || isGenerating}
                    >
                        Regenerate
                    </button>
                </div>
            </div>

            <div className={styles.messagesContainer}>
                {loadingMsgs ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>Loading messages...</div>
                ) : messages.length === 0 ? (
                    <WelcomeScreen onQuestionClick={submitQuestion} />
                ) : (
                    messages.map((msg, i) => (
                        <MessageBubble key={msg.messageId || i} msg={msg} userId={user?.userId} chatId={activeChatId} />
                    ))
                )}
                {isGenerating && <div className={styles.loadingBubble}>...</div>}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Ask a SQL question..."
                        rows={2}
                        style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--surface-2)',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            resize: 'none',
                            outline: 'none',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setInput('')}
                        disabled={!input || isGenerating}
                        style={{ padding: '10px 12px', borderRadius: '10px' }}
                    >
                        Clear
                    </button>
                    <button type="submit" disabled={!input.trim() || isGenerating} style={{ padding: '10px 18px', borderRadius: '10px' }}>
                        {isGenerating ? '...' : 'Send'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default SQLChatWindow;
