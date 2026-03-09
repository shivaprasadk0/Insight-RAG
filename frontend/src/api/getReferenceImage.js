import { API_BASE_URL } from './config.js';

export async function getReferenceImage(url) {
    if (!url) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/get_reference_image?page_image_url=${encodeURIComponent(url)}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch reference: ${response.statusText}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        // Current backend contract returns JSON: { "url": "<direct-url>" }
        if (contentType.includes('application/json')) {
            const data = await response.json();
            const directUrl = data?.url || null;
            if (!directUrl) return null;
            const isPdf = directUrl.toLowerCase().includes('.pdf');
            return { url: directUrl, isPdf };
        }

        // Backward compatibility: if endpoint returns file bytes directly.
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const isPdf = contentType.includes('application/pdf');
        return { url: blobUrl, isPdf };
    } catch (error) {
        console.error("Error fetching reference:", error);
        return null;
    }
}
