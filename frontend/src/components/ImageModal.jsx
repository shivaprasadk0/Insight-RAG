import { useEffect } from 'react';

/**
 * Modal to display a reference image or PDF — glass style
 */
function ImageModal({ isOpen, imageUrl, isPdf, onClose }) {
    // Close on Escape key
    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !imageUrl) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 5000,
                animation: 'fadeIn 0.2s ease',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    position: 'relative',
                    width: '90%',
                    height: '90%',
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderRadius: '20px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)',
                    animation: 'scaleIn 0.25s ease',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    style={{
                        position: 'absolute',
                        top: '14px',
                        right: '18px',
                        background: 'rgba(0,0,0,0.06)',
                        border: 'none',
                        fontSize: '18px',
                        cursor: 'pointer',
                        color: '#666',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        transition: 'background 0.2s',
                    }}
                    onClick={onClose}
                    onMouseEnter={e => e.target.style.background = 'rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.target.style.background = 'rgba(0,0,0,0.06)'}
                >
                    ✕
                </button>
                {isPdf ? (
                    <iframe
                        src={imageUrl}
                        title="Reference PDF"
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            borderRadius: '12px'
                        }}
                    />
                ) : (
                    <img
                        src={imageUrl}
                        alt="Reference Page"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            borderRadius: '8px'
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default ImageModal;
