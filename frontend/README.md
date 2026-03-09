# RAG UI Frontend

A modern ChatGPT/Slack-like RAG (Retrieval-Augmented Generation) chat interface built with React and Vite.

## Features

- 💬 **Multi-Session Chat**: Create and manage multiple chat sessions
- 📱 **Collapsible Sidebar**: Smooth sidebar transitions (260px ↔ 60px)
- 🎯 **Smart Title Generation**: Automatic chat title generation from first Q&A
- 💾 **localStorage Persistence**: All sessions persist across page refreshes
- 🔄 **Real-time Updates**: Reactive state management with pub/sub pattern
- 📚 **Source Display**: Collapsible source panel for RAG citations
- ⌨️ **Keyboard Shortcuts**: Enter to send, Shift+Enter for new line

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **JavaScript (ES6+)** - Modern JavaScript
- **CSS Modules** - Scoped component styling
- **fetch API** - Backend communication
- **localStorage** - Client-side persistence

## Project Structure

```
Frontend/
├── src/
│   ├── api/              # API layer
│   │   ├── config.js
│   │   ├── makeQuery.js
│   │   └── createChatTitle.js
│   ├── components/       # UI components
│   │   ├── Sidebar.jsx
│   │   ├── SessionItem.jsx
│   │   ├── ChatWindow.jsx
│   │   ├── MessageBubble.jsx
│   │   ├── ChatInput.jsx
│   │   └── SourcePanel.jsx
│   ├── pages/           # Page components
│   │   └── ChatPage.jsx
│   ├── state/           # State management
│   │   ├── sessionTypes.js
│   │   ├── sessionStore.js
│   │   └── useSession.js
│   ├── utils/           # Utility functions
│   │   └── windowHistory.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
└── vite.config.js
```

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure backend URL (optional):**

   Create a `.env` file in the Frontend directory:

   ```
   VITE_API_BASE_URL=http://localhost:8000
   ```

   Default is `http://localhost:8000`

3. **Start development server:**

   ```bash
   npm run dev
   ```

   The app will open at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## API Endpoints

The frontend expects the following backend endpoints:

### 1. RAG Query

**POST** `/make_query`

Request:

```json
{
  "history": [
    {"role": "user", "content": "...", "timestamp": 123456},
    {"role": "assistant", "content": "...", "timestamp": 123457}
  ],
  "query": "User question"
}
```

Response:

```json
{
  "answer": "Assistant response",
  "sources": ["source1", "source2"]
}
```

### 2. Chat Title Generation

**POST** `/create_chat_title`

Request:

```json
{
  "question": "First user question",
  "response": "First assistant response"
}
```

Response:

```json
{
  "title": "Generated chat title"
}
```

## How It Works

### Session Management

- Sessions are created with title "New Chat"
- Each session stores its own messages and sources
- Sessions persist in localStorage under key `rag_app_state`
- Active session state maintained globally

### Title Generation Flow

1. User sends first message
2. Assistant responds
3. Background API call to `/create_chat_title`
4. Title updates asynchronously when ready
5. If API fails, "New Chat" remains (silent failure)

### Message Send Flow

1. User message appended immediately
2. Last 6 messages extracted as context window
3. API call to `/make_query` with history + query
4. Assistant response appended
5. Sources updated in session
6. Auto-scroll to bottom

### Sidebar Behavior

- Toggle button collapses/expands sidebar
- Width animates smoothly (0.25s transition)
- Session titles show when expanded
- Icons only when collapsed (with tooltips)
- Active session highlighted
- Chat window remains unaffected

## State Architecture

The app uses a custom pub/sub state management pattern:

- **sessionStore.js** - Centralized state with subscriptions
- **useSession.js** - React hook for reactive updates
- All state changes trigger re-renders automatically
- localStorage sync on every state change

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Development Notes

- Hot Module Replacement (HMR) enabled
- React Fast Refresh for instant updates
- CSS Modules for scoped styles
- JSDoc comments for documentation

## License

MIT
