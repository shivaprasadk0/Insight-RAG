import { useState } from 'react';
import styles from './SourcePanel.module.css';
import ImageModal from './ImageModal';
import { getReferenceImage } from '../api/getReferenceImage';

/**
 * Source panel component to display RAG sources and images
 * @param {Object} props
 * @param {Array} props.sources - Text and figure sources
 * @param {Array} props.images - Image sources with base64 data
 */
function SourcePanel({ sources, images }) {
    const [sourcesExpanded, setSourcesExpanded] = useState(true);
    const [imagesExpanded, setImagesExpanded] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);
    const [isPdf, setIsPdf] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSourceClick = async (source) => {
        if (!source.page_image_url) {
            console.log("No page_image_url for source:", source);
            return;
        }

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

    const hasSources = sources && sources.length > 0;
    const hasImages = images && images.length > 0;

    if (!hasSources && !hasImages) {
        return null;
    }

    return (
        <div className={styles.sourcePanel}>
            {/* Text Sources Section */}
            {hasSources && (
                <div className={styles.section}>
                    <div
                        className={styles.header}
                        onClick={() => setSourcesExpanded(!sourcesExpanded)}
                    >
                        <span className={styles.title}>
                            📚 Sources ({sources.length})
                        </span>
                        <span className={styles.toggle}>
                            {sourcesExpanded ? '▼' : '▶'}
                        </span>
                    </div>

                    {sourcesExpanded && (
                        <div className={styles.sourceList}>
                            {sources.map((source, index) => (
                                <div
                                    key={index}
                                    className={`${styles.sourceItem} ${source.page_image_url ? styles.clickable : ''}`}
                                    onClick={() => source.page_image_url && handleSourceClick(source)}
                                >
                                    <div className={styles.sourceIndex}>{index + 1}</div>
                                    <div className={styles.sourceContent}>
                                        <div className={styles.sourceHeader}>
                                            <span className={styles.sourceType}>{source.type}</span>
                                            <span className={styles.sourcePdf}>
                                                {source.pdf}
                                            </span>
                                        </div>
                                        <div className={styles.sourceDetails}>
                                            <span>Section: <em>{source.section}</em></span>
                                            <span className={styles.divider}>•</span>
                                            <span style={{ color: source.page_image_url ? 'inherit' : 'inherit' }}>
                                                Page {source.page}
                                            </span>
                                            {source.score && (
                                                <>
                                                    <span className={styles.divider}>•</span>
                                                    <span className={styles.score}>
                                                        Score: {(source.score * 100).toFixed(1)}%
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Images Section */}
            {hasImages && (
                <div className={styles.section}>
                    <div
                        className={styles.header}
                        onClick={() => setImagesExpanded(!imagesExpanded)}
                    >
                        <span className={styles.title}>
                            🖼️ Referenced Figures ({images.length})
                        </span>
                        <span className={styles.toggle}>
                            {imagesExpanded ? '▼' : '▶'}
                        </span>
                    </div>

                    {imagesExpanded && (
                        <div className={styles.imageList}>
                            {images.map((image, index) => (
                                <div key={index} className={styles.imageItem}>
                                    <div className={styles.imageHeader}>
                                        <strong>Figure {index + 1}</strong>
                                        <span className={styles.imageSource}>
                                            {image.pdf} (Page {image.page})
                                        </span>
                                    </div>

                                    {/* Display the image */}
                                    <div className={styles.imageContainer}>
                                        <img
                                            src={`data:image/png;base64,${image.image_base64}`}
                                            alt={image.caption || `Figure ${index + 1}`}
                                            className={styles.image}
                                        />
                                    </div>

                                    {/* Caption and summary */}
                                    {image.caption && (
                                        <div className={styles.imageCaption}>
                                            📝 {image.caption}
                                        </div>
                                    )}

                                    {image.image_summary && (
                                        <details className={styles.imageSummary}>
                                            <summary>🔍 Detailed Description</summary>
                                            <p>{image.image_summary}</p>
                                        </details>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {/* Image Modal */}
            <ImageModal
                isOpen={isModalOpen}
                imageUrl={selectedImage}
                isPdf={isPdf}
                onClose={handleCloseModal}
            />
        </div>
    );
}

export default SourcePanel;
