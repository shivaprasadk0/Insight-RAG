/**
 * @typedef {Object} Message
 * @property {"user" | "assistant"} role - The role of the message sender
 * @property {string} content - The message content
 * @property {number} timestamp - Unix timestamp when message was created
 * @property {Source[]} [sources] - Sources for this specific message (assistant only)
 * @property {ImageSource[]} [images] - Images for this specific message (assistant only)
 */

/**
 * @typedef {Object} Source
 * @property {string} id - Source identifier (e.g., "Source 1")
 * @property {string} pdf - PDF document name
 * @property {string} section - Section title
 * @property {number} page - Page number
 * @property {string} type - Source type (📊 FIGURE or 📄 TEXT)
 * @property {number} [score] - Relevance score
 */

/**
 * @typedef {Object} ImageSource
 * @property {string} id - Image identifier
 * @property {string} pdf - PDF document name
 * @property {number} page - Page number
 * @property {string} [caption] - Image caption
 * @property {string} [image_summary] - Detailed description of the image
 * @property {string} image_base64 - Base64 encoded image data
 * @property {string} section - Section title
 */

/**
 * @typedef {Object} Session
 * @property {string} id - Unique session identifier
 * @property {string} title - Session title (initially "New Chat")
 * @property {Message[]} messages - Array of messages in this session
 * @property {number} createdAt - Unix timestamp when session was created
 */

/**
 * @typedef {Object} AppState
 * @property {Session[]} sessions - Array of all sessions
 * @property {string | null} activeSessionId - ID of currently active session
 * @property {boolean} sidebarCollapsed - Whether sidebar is collapsed
 */

export { };
