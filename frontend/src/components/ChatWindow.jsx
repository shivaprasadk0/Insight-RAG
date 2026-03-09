import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession } from '../state/useSession';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import styles from './ChatWindow.module.css';

const esgQuestions = [
    "What does ESG stand for, and how does it relate to our organization's sustainability goals?",
    "How is sustainability different from ESG?",
    "What are the key ESG focus areas for our organization?",
    "What initiatives has the organization undertaken to achieve sustainability excellence?",
    "How do we measure performance against sustainability targets?",
    "What certifications or recognitions support our excellence in sustainability?",
    "How does the organization ensure that products are environmentally responsible throughout their lifecycle?",
    "What are the policies for circular economy or product recycling?",
    "How do we evaluate product impact on end users and environment?",
    "What are our supplier sustainability criteria?",
    "How does the company monitor ESG compliance among suppliers?",
    "Are there any responsible sourcing or green procurement policies in place?",
    "What is the governance framework for ESG management?",
    "Which committees oversee ESG and sustainability functions?",
    "How are ESG responsibilities distributed across the organization?",
    "What are the key sustainability policies in our organization?",
    "How often are these policies reviewed and updated?",
    "How do these policies align with national and global standards (like UN SDGs)?",
    "What is the overall approach towards achieving long-term sustainability?",
    "Can you share the roadmap or milestones for 2025/2030 targets?",
    "How are progress and results monitored?",
    "What are the major ESG metrics tracked by the organization?",
    "How are these metrics reported and validated?",
    "What tools or platforms are used for ESG data management?",
    "What initiatives are in place to reduce the organization's environmental footprint?",
    "How do we manage energy, waste, and emissions reduction programs?",
    "What is our renewable energy adoption target?",
    "What are the key social responsibility initiatives?",
    "How does the organization promote an ethical workplace culture?",
    "Are there mechanisms for whistleblowing and grievance redressal?",
    "What major sustainability awards or recognitions has the organization received?",
    "Which teams or projects were recognized recently?",
    "What is the purpose of the Sustainability Report and BRSR (Business Responsibility and Sustainability Report)?",
    "How frequently are reports published and who approves them?",
    "Where can employees access past reports?",
    "How does the company track and reduce greenhouse gas (GHG) emissions?",
    "What steps are being taken for water conservation and reuse?",
    "How do we manage waste responsibly?",
    "Are there biodiversity preservation projects ongoing?",
    "What sustainability trainings are available for employees?",
    "How can employees contribute to sustainability programs?",
    "What internal campaigns promote ESG awareness?",
    "Who are the key sustainability champions or achievers in our organization?",
    "How are sustainability efforts recognized internally?",
    "What are the latest ESG-related news or updates within the organization?",
    "How can I find recent posts or campaigns on social media related to sustainability?",
    "How do sustainability goals align with business strategy?",
    "Which departments play a key role in driving ESG initiatives?"
];

/** Pick 4 random unique questions from the pool */
function getRandomQuestions(pool, count = 4) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/** Leaf / ESG icon for question cards */
function LeafIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2 1.5-1 5.5-.5 7 0C18 7 15 5 10 7c3-1 6 1 6 1z"
                fill="currentColor"
            />
        </svg>
    );
}

/** Atom icon used in the empty state header */
function AtomIcon() {
    return (
        <div className={styles.atomIcon}>
            <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Orbits */}
                <ellipse cx="60" cy="60" rx="50" ry="20" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4"
                    transform="rotate(0 60 60)" />
                <ellipse cx="60" cy="60" rx="50" ry="20" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4"
                    transform="rotate(60 60 60)" />
                <ellipse cx="60" cy="60" rx="50" ry="20" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4"
                    transform="rotate(-60 60 60)" />
                {/* Core */}
                <circle cx="60" cy="60" r="8" fill="var(--accent-light)" opacity="0.7" />
                <circle cx="60" cy="60" r="4" fill="var(--accent)" />
                {/* Electron dots */}
                <circle cx="110" cy="60" r="4" fill="var(--accent)" opacity="0.8">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 60 60" to="360 60 60" dur="6s" repeatCount="indefinite" />
                </circle>
                <circle cx="35" cy="17" r="3.5" fill="var(--accent-light)" opacity="0.7">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 60 60" to="-360 60 60" dur="8s" repeatCount="indefinite" />
                </circle>
                <circle cx="85" cy="103" r="3" fill="var(--accent)" opacity="0.6">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 60 60" to="360 60 60" dur="10s" repeatCount="indefinite" />
                </circle>
            </svg>
        </div>
    );
}

/**
 * Empty / new-chat welcome screen
 */
function WelcomeScreen({ onQuestionClick }) {
    const randomQuestions = useMemo(() => getRandomQuestions(esgQuestions, 4), []);

    return (
        <div className={styles.welcomeWrapper}>
            {/* ── Greeting block ── */}
            <div className={styles.greetingBlock}>
                <AtomIcon />
                <h1 className={styles.greetingTitle}>
                    Hi there! 👋
                </h1>
                <p className={styles.greetingSubtitle}>
                    I'm <strong>ResGen 24/7</strong> — your assistant for fast, accurate, and seamless
                    ESG insights across your organization. Ask me anything about sustainability, governance, or reporting.
                </p>
            </div>

            {/* ── Suggestion cards ── */}
            <div className={styles.suggestionsSection}>
                <p className={styles.suggestionsLabel}>Here are a few questions to get you started:</p>
                <div className={styles.suggestionsGrid}>
                    {randomQuestions.map((q, i) => (
                        <button
                            key={i}
                            className={styles.suggestionCard}
                            onClick={() => onQuestionClick(q)}
                        >
                            <span className={styles.suggestionIcon}><LeafIcon /></span>
                            <span className={styles.suggestionText}>{q}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Main chat window component
 */
function ChatWindow() {
    const { sessions, activeSessionId } = useSession();
    const messagesEndRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const chatInputRef = useRef(null);

    const activeSession = sessions.find(s => s.id === activeSessionId);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages, isGenerating]);

    /** Called when user clicks a suggestion card */
    const handleQuestionClick = (question) => {
        chatInputRef.current?.submitQuestion(question);
    };

    if (!activeSession) {
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
            <div className={styles.messagesContainer}>
                {activeSession.messages.length === 0 ? (
                    <WelcomeScreen onQuestionClick={handleQuestionClick} />
                ) : (
                    activeSession.messages.map((message, index) => (
                        <MessageBubble
                            key={index}
                            role={message.role}
                            content={message.content}
                            timestamp={message.timestamp}
                            sources={message.sources}
                            images={message.images}
                        />
                    ))
                )}

                {isGenerating && (
                    <div className={styles.loadingBubble}>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <ChatInput
                ref={chatInputRef}
                sessionId={activeSession.id}
                onGenerating={setIsGenerating}
            />
        </div>
    );
}

export default ChatWindow;

