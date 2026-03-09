import { useState, useEffect, useCallback } from 'react';

let toastIdCounter = 0;
const toastListeners = new Set();
let toasts = [];

function notifyListeners() {
    toastListeners.forEach(fn => fn([...toasts]));
}

/**
 * Show a toast notification
 * @param {string} message - Text to display
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, duration = 3000) {
    const id = ++toastIdCounter;
    toasts.push({ id, message, fadeOut: false });
    notifyListeners();

    setTimeout(() => {
        toasts = toasts.map(t => t.id === id ? { ...t, fadeOut: true } : t);
        notifyListeners();
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id);
            notifyListeners();
        }, 300);
    }, duration);
}

/**
 * Toast container component – render once in the app tree
 */
export function ToastContainer() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        toastListeners.add(setItems);
        return () => toastListeners.delete(setItems);
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="toast-container">
            {items.map(t => (
                <div key={t.id} className={`toast ${t.fadeOut ? 'fade-out' : ''}`}>
                    {t.message}
                </div>
            ))}
        </div>
    );
}
