# PeerCode

A real-time collaborative code editor that enables peer-to-peer coding sessions without the need for a central server. Built with WebRTC technology for direct browser-to-browser communication.

## Features

-  Real-time collaborative editing
-  Peer-to-peer connection using WebRTC
-  Multi-file support with different syntax highlighting
-  Live cursor tracking
-  Automatic local saving
-  Beautiful dark theme interface
-  Zero server dependency
-  Custom color themes
-  HTML file preview

## Technologies Used

- PeerJS for WebRTC communication
- CodeMirror for the code editor
- TailwindCSS for styling
- Font Awesome for icons

## Getting Started

1. Open the application in your browser
2. Your unique Peer ID will be displayed at the top right
3. To start collaborating:
   - Share your Peer ID with your coding partner
   - Have them enter your ID in the "CONNECT TO" field
   - Click "Connect" to establish the peer-to-peer connection

## File Management

- Create new files using the + button in the sidebar
- Choose from multiple file types (JS, HTML, CSS, TXT, PY, RB, PHP, MD)
- Switch between files using the sidebar
- Files are automatically saved locally

## Security & Privacy

- All communication is peer-to-peer encrypted
- No data is stored on any server
- Session data is only stored locally in your browser

## Browser Support

Works best in modern browsers that support WebRTC:
- Chrome
- Firefox
- Edge
- Safari

## Local Development

1. Clone the repository
2. Open `index.html` in your browser
3. No build process required!
