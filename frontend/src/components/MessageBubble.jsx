import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MessageBubble.module.css';
import ImageModal from './ImageModal';
import { getReferenceImage } from '../api/getReferenceImage';
import { showToast } from './Toast';

/**
 * Animated AI Brain Icon for Message Bubbles
 */
function AiAvatarIcon() {
    return (
        <div className={styles.avatar}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '22px', height: '22px' }}>
                <path d="M12 2L15 5H9L12 2Z" fill="#7B6FDE" opacity="0.4" />
                <path d="M12 22L9 19H15L12 22Z" fill="#7B6FDE" opacity="0.4" />
                <circle cx="12" cy="12" r="4" fill="#7B6FDE" />
                <path d="M12 8V4M12 20V16M8 12H4M20 12H16" stroke="#7B6FDE" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M17.65 6.35L14.82 9.18M9.18 14.82L6.35 17.65M6.35 6.35L9.18 9.18M14.82 14.82L17.65 17.65"
                    stroke="#7B6FDE" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                <circle cx="12" cy="12" r="9" stroke="#7B6FDE" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />
            </svg>
        </div>
    );
}

/**
 * 5-star feedback component
 */
function FeedbackWidget() {
    const [rating, setRating] = useState(0);
    const [hovered, setHovered] = useState(0);
    const [showComment, setShowComment] = useState(false);
    const [comment, setComment] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        setSubmitted(true);
        showToast('✅ Feedback submitted — thank you!');
    };

    if (submitted) {
        return <div className={styles.feedbackDone}>Thank you for your feedback!</div>;
    }

    return (
        <div className={styles.feedbackSection}>
            <div className={styles.starRow}>
                {[1, 2, 3, 4, 5].map(star => (
                    <span
                        key={star}
                        className={`${styles.star} ${star <= (hovered || rating) ? styles.filled : ''}`}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setRating(star)}
                    >
                        ⭐
                    </span>
                ))}
            </div>

            {rating > 0 && !showComment && (
                <>
                    <button className={styles.commentToggle} onClick={() => setShowComment(true)} title="Add a comment">
                        💬
                    </button>
                    <button className={styles.commentSubmit} onClick={handleSubmit} style={{ padding: '4px 12px', fontSize: '11px' }}>
                        ✓
                    </button>
                </>
            )}

            {showComment && (
                <div className={styles.commentBox}>
                    <input
                        className={styles.commentInput}
                        placeholder="Your feedback…"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        autoFocus
                    />
                    <button className={styles.commentSubmit} onClick={handleSubmit}>Submit</button>
                </div>
            )}
        </div>
    );
}


/**
 * Message bubble component with inline sources, images, and feedback
 */
function MessageBubble({ role, content, timestamp, sources, images, onImageLoad }) {
    const [sourcesExpanded, setSourcesExpanded] = useState(false);
    const [expandedImages, setExpandedImages] = useState(new Set());
    const [selectedImage, setSelectedImage] = useState(null);
    const [isPdf, setIsPdf] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSourceClick = async (source) => {
        if (!source.page_image_url) return;

        const result = await getReferenceImage(source.page_image_url);
        if (result && result.url) {
            setSelectedImage(result.url);
            setIsPdf(result.isPdf || false);
            setIsModalOpen(true);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        if (selectedImage) {
            URL.revokeObjectURL(selectedImage);
            setSelectedImage(null);
            setIsPdf(false);
        }
    };

    const formatTime = (ts) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const toggleImageExpand = (index) => {
        const newExpanded = new Set(expandedImages);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedImages(newExpanded);
        // Retrigger scroll adjustment
        setTimeout(() => onImageLoad?.(), 100);
    };

    const hasSources = sources && sources.length > 0;
    const hasImages = images && images.length > 0;

    // Filter out "Sources" section from content
    const filterSourcesFromContent = (text) => {
        if (!text) return text;
        const sourcesRegex = /\n*Sources:?\s*(\[Source\s*\d+\][,\s]*)+/gi;
        let filtered = text.replace(sourcesRegex, '').trim();
        if (filtered.toLowerCase().includes('sources')) {
            const lines = filtered.split('\n');
            const lastSourcesIndex = lines.findLastIndex(line => {
                const cleanLine = line.trim().toLowerCase().replace(/[*#_:]/g, '');
                return cleanLine === 'sources';
            });
            if (lastSourcesIndex !== -1) {
                const followingContent = lines.slice(lastSourcesIndex).join('\n');
                if (/\[Source\s*\d+\]/i.test(followingContent)) {
                    filtered = lines.slice(0, lastSourcesIndex).join('\n').trim();
                }
            }
        }
        return filtered;
    };

    const displayContent = role === 'assistant' ? filterSourcesFromContent(content) : content;

    return (
        <div className={`${styles.messageBubble} ${styles[role]}`}>
            {role === 'assistant' ? <AiAvatarIcon /> : <div className={styles.avatar}>👤</div>}

            <div className={styles.messageContent}>
                <div className={styles.content}>
                    {role === 'assistant' ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                p: ({ node, ...props }) => <p style={{ margin: '0.5em 0', lineHeight: '1.6' }} {...props} />,
                                ul: ({ node, ...props }) => <ul style={{ margin: '0.5em 0', paddingLeft: '1.4em' }} {...props} />,
                                ol: ({ node, ...props }) => <ol style={{ margin: '0.5em 0', paddingLeft: '1.4em' }} {...props} />,
                                li: ({ node, ...props }) => <li style={{ margin: '0.2em 0', lineHeight: '1.6' }} {...props} />,
                                h1: ({ node, ...props }) => <h1 style={{ marginTop: '0.8em', marginBottom: '0.3em', fontSize: '1.3em', fontWeight: '700' }} {...props} />,
                                h2: ({ node, ...props }) => <h2 style={{ marginTop: '0.7em', marginBottom: '0.25em', fontSize: '1.2em', fontWeight: '700' }} {...props} />,
                                h3: ({ node, ...props }) => <h3 style={{ marginTop: '0.7em', marginBottom: '0.2em', fontSize: '1.1em', fontWeight: '700' }} {...props} />,
                                table: ({ node, ...props }) => (
                                    <table style={{ borderCollapse: 'collapse', width: '100%', margin: '1em 0', border: '1px solid rgba(0,0,0,0.08)' }} {...props} />
                                ),
                                thead: ({ node, ...props }) => (
                                    <thead style={{ backgroundColor: 'rgba(123, 111, 222, 0.06)' }} {...props} />
                                ),
                                th: ({ node, ...props }) => (
                                    <th style={{ border: '1px solid rgba(0,0,0,0.06)', padding: '8px 12px', textAlign: 'left', fontWeight: '600' }} {...props} />
                                ),
                                td: ({ node, ...props }) => (
                                    <td style={{ border: '1px solid rgba(0,0,0,0.06)', padding: '8px 12px', textAlign: 'left' }} {...props} />
                                ),
                            }}
                        >
                            {displayContent}
                        </ReactMarkdown>
                    ) : (
                        displayContent
                    )}
                </div>

                {role === 'assistant' && hasImages && (
                    <div className={styles.imagesContainer}>
                        <div style={{ marginTop: '4px', marginBottom: '4px', fontWeight: '600', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            🖼️ Referenced Figures ({images.length})
                        </div>
                        {images.map((image, index) => (
                            <div key={index} className={styles.imageWrapper}>
                                <div
                                    className={`${styles.imagePreview} ${expandedImages.has(index) ? styles.expanded : ''}`}
                                    onClick={() => toggleImageExpand(index)}
                                >
                                    <img
                                        src={`data:image/png;base64,${image.image_base64}`}
                                        alt={image.caption || `Figure ${index + 1}`}
                                        className={styles.image}
                                        onLoad={() => onImageLoad?.()}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    {!expandedImages.has(index) && <div className={styles.expandHint}>Click to expand</div>}
                                </div>
                                {image.caption && <div className={styles.imageCaption}>📝 {image.caption}</div>}
                                {expandedImages.has(index) && image.image_summary && <div className={styles.imageSummary}>{image.image_summary}</div>}
                            </div>
                        ))}
                    </div>
                )}

                {role === 'assistant' && (hasSources || (content && !content.startsWith('Error:'))) && (
                    <div className={styles.sourcesAndFeedbackRow}>
                        {hasSources && (
                            <button className={styles.sourcesButton} onClick={() => setSourcesExpanded(!sourcesExpanded)}>
                                📚 Sources ({sources.length})
                                <span className={styles.arrow}>{sourcesExpanded ? '▼' : '▶'}</span>
                            </button>
                        )}
                        {content && !content.startsWith('Error:') && <FeedbackWidget />}
                    </div>
                )}

                {role === 'assistant' && hasSources && sourcesExpanded && (
                    <div className={styles.sourcesList}>
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className={`${styles.sourceItem} ${source.page_image_url ? styles.clickable : ''}`}
                                onClick={() => source.page_image_url && handleSourceClick(source)}
                            >
                                <span className={styles.sourceType}>{source.type}</span>
                                <span className={styles.sourcePdf}>{source.pdf}</span>
                                <span className={styles.sourceDetails}>
                                    Section: <em>{source.section}</em> •
                                    <span>Page {source.page}</span>
                                    {source.score && ` • ${(source.score * 100).toFixed(0)}%`}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.timestamp}>{formatTime(timestamp)}</div>
            </div>

            <ImageModal isOpen={isModalOpen} imageUrl={selectedImage} isPdf={isPdf} onClose={handleCloseModal} />
        </div>
    );
}

export default MessageBubble;