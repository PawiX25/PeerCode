let versions = {};
let pendingOperations = {};
let editor;
let peer;
let conn;
let isReceiving = false;
let peerCursorMarker = null;
let peerCursorTimeout = null;

function getFiles() {
    return JSON.parse(localStorage.getItem('files')) || {};
}

function saveFile(name, content) {
    const files = getFiles();
    files[name] = content;
    localStorage.setItem('files', JSON.stringify(files));
}

function getCurrentFileName() {
    return localStorage.getItem('currentFile') || '';
}

function setCurrentFileName(name) {
    localStorage.setItem('currentFile', name);
}

function renderFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    const files = getFiles();
    const currentFile = getCurrentFileName();
    
    Object.keys(files).forEach(name => {
        const li = document.createElement('li');
        li.className = 'mx-2 mb-1 group transition-all duration-200';
        
        const fileContent = document.createElement('div');
        fileContent.className = `flex items-center px-3 py-2 rounded-md text-sm cursor-pointer transition-all ${
            name === currentFile 
                ? 'bg-[#00ff9d]/10 text-[#00ff9d] shadow-lg shadow-[#00ff9d]/10' 
                : 'text-gray-400 hover:bg-white/5'
        }`;
        
        const icon = document.createElement('i');
        const ext = name.split('.').pop().toLowerCase();
        const iconClass = {
            'js': 'fab fa-js',
            'css': 'fab fa-css3',
            'html': 'fab fa-html5',
            'json': 'fas fa-code',
            'txt': 'fas fa-file-alt',
            'md': 'fas fa-file-alt'
        }[ext] || 'fas fa-file-code';
        
        icon.className = `${iconClass} mr-3 ${name === currentFile ? 'text-[#00ff9d]' : 'text-gray-400'}`;
        
        const fileName = document.createElement('span');
        fileName.textContent = name;
        fileName.className = 'flex-1';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSelectedFile(name);
        };
        
        fileContent.appendChild(icon);
        fileContent.appendChild(fileName);
        fileContent.appendChild(deleteBtn);
        li.appendChild(fileContent);
        li.onclick = () => switchFile(name);
        fileList.appendChild(li);
    });
}

function switchFile(name) {
    try {
        const currentFile = getCurrentFileName();
        if (currentFile) {
            saveFile(currentFile, editor.getValue());
        }
        
        setCurrentFileName(name);
        const files = getFiles();
        editor.setValue(files[name] || '');
        
        const ext = name.split('.').pop().toLowerCase();
        const mode = {
            'js': 'javascript',
            'css': 'css',
            'html': 'xml',
            'json': 'javascript'
        }[ext] || 'text';
        editor.setOption('mode', mode);
        
        if (conn?.open) {
            conn.send({
                type: 'switchFile',
                filename: name,
                content: files[name] || ''
            });
        }
        
        renderFileList();
    } catch (error) {
        alert('Failed to switch file: ' + error.message);
    }
}

function createNewFile() {
    const modal = document.getElementById('new-file-modal');
    modal.classList.remove('hidden');
}

function closeNewFileModal() {
    const modal = document.getElementById('new-file-modal');
    modal.classList.add('hidden');
    document.getElementById('new-file-name').value = '';
    document.querySelectorAll('.file-type-btn').forEach(btn => {
        btn.classList.remove('bg-[#00ff9d]/10', 'text-[#00ff9d]');
    });
}

function setFileType(ext) {
    const input = document.getElementById('new-file-name');
    const fileName = input.value.split('.')[0] || 'untitled';
    input.value = `${fileName}.${ext}`;
    
    document.querySelectorAll('.file-type-btn').forEach(btn => {
        btn.classList.remove('bg-[#00ff9d]/10', 'text-[#00ff9d]');
    });
    event.currentTarget.classList.add('bg-[#00ff9d]/10', 'text-[#00ff9d]');
}

function handleNewFile(event) {
    event.preventDefault();
    
    try {
        const fileName = document.getElementById('new-file-name').value;
        if (!fileName) throw new Error('Please enter a file name');
        
        const finalName = fileName.includes('.') ? fileName : `${fileName}.txt`;
        
        const files = getFiles();
        if (finalName in files) {
            throw new Error('File already exists!');
        }
        
        saveFile(finalName, '');
        setCurrentFileName(finalName);
        editor.setValue('');
        
        if (conn?.open) {
            conn.send({
                type: 'createFile',
                filename: finalName,
                content: ''
            });
        }
        
        const ext = finalName.split('.').pop().toLowerCase();
        const mode = {
            'js': 'javascript',
            'css': 'css',
            'html': 'xml',
            'json': 'javascript'
        }[ext] || 'text';
        editor.setOption('mode', mode);
        
        closeNewFileModal();
        renderFileList();
    } catch (error) {
        alert(error.message);
    }
}

function deleteSelectedFile(name) {
    try {
        if (!confirm(`Delete ${name}?`)) return;
        
        const files = getFiles();
        delete files[name];
        localStorage.setItem('files', JSON.stringify(files));
        
        if (conn?.open) {
            conn.send({
                type: 'deleteFile',
                filename: name
            });
        }
        
        const remainingFiles = Object.keys(files);
        if (remainingFiles.length > 0) {
            switchFile(remainingFiles[0]);
        } else {
            const defaultName = 'untitled.txt';
            saveFile(defaultName, '');
            setCurrentFileName(defaultName);
            editor.setValue('');
            editor.setOption('mode', 'text');
        }
        
        renderFileList();
    } catch (error) {
        alert('Failed to delete file: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const files = getFiles();
    if (Object.keys(files).length === 0) {
        const defaultName = 'untitled.txt';
        saveFile(defaultName, '');
        setCurrentFileName(defaultName);
    }
    renderFileList();
});

class TextOperation {
    constructor(operation, position, chars) {
        this.operation = operation;
        this.position = position;
        this.chars = chars;
        this.version = 0;
    }

    transform(other) {
        if (this.version < other.version) {
            if (other.operation === 'insert') {
                if (other.position <= this.position) {
                    this.position += other.chars.length;
                }
            } else if (other.operation === 'delete') {
                const lengthOfDelete = other.chars.length;
                if (other.position + lengthOfDelete <= this.position) {
                    this.position -= lengthOfDelete;
                } else if (other.position < this.position) {
                    // Handle partial overlap
                    const overlap = (other.position + lengthOfDelete) - this.position;
                    this.position -= Math.min(overlap, lengthOfDelete);
                    this.position = Math.max(0, this.position);
                }
            }
        }
        return this;
    }

    apply(text) {
        if (this.operation === 'insert') {
            return text.slice(0, this.position) + this.chars + text.slice(this.position);
        } else {
            return text.slice(0, this.position) + text.slice(this.position + this.chars.length);
        }
    }
}

function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('connection-status');
    const styles = {
        connected: 'bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/20',
        disconnected: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        error: 'bg-red-500/10 text-red-400 border border-red-500/20'
    };
    const icons = {
        connected: 'link',
        disconnected: 'unlink',
        error: 'exclamation-circle'
    };
    statusEl.className = `px-3 py-1.5 rounded-md text-sm flex items-center space-x-2 ${styles[status]}`;
    statusEl.innerHTML = `
        <i class="fas fa-${icons[status]} animate-pulse-slow"></i>
        <span>${message}</span>
    `;
}

try {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        lineNumbers: true,
        mode: 'text',
        theme: 'monokai',
        lineWrapping: true,
        tabSize: 2,
        styleActiveLine: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        extraKeys: {"Ctrl-Space": "autocomplete"},
        highlightSelectionMatches: {showToken: /\w/, annotateScrollbar: true}
    });
    
    editor.getWrapperElement().style.fontSize = '14px';
    
    const currentFile = getCurrentFileName();
    if (currentFile) {
        const files = getFiles();
        editor.setValue(files[currentFile] || '');
        const ext = currentFile.split('.').pop().toLowerCase();
        const mode = {
            'js': 'javascript',
            'css': 'css',
            'html': 'xml',
            'json': 'javascript'
        }[ext] || 'text';
        editor.setOption('mode', mode);
    }
} catch (error) {
    updateConnectionStatus('error', 'Failed to initialize editor: ' + error.message);
}

peer = new Peer({ debug: 2 });

peer.on('open', (id) => {
    document.getElementById('peer-id').value = id;
    updateConnectionStatus('disconnected', 'Ready to connect');
});

peer.on('error', (error) => {
    updateConnectionStatus('error', 'Peer error: ' + error.message);
});

peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
});

function connectToPeer() {
    try {
        const peerId = document.getElementById('connect-to').value;
        if (!peerId) throw new Error('Please enter a peer ID');
        conn = peer.connect(peerId);
        setupConnection();
    } catch (error) {
        updateConnectionStatus('error', 'Connection error: ' + error.message);
    }
}

function createCursorWidget() {
    const cursorEl = document.createElement('div');
    cursorEl.className = 'peer-cursor';
    return cursorEl;
}

function updatePeerCursor(position) {
    try {
        if (peerCursorMarker) {
            peerCursorMarker.clear();
        }
        const cursorPos = editor.posFromIndex(position);
        peerCursorMarker = editor.setBookmark(cursorPos, {
            widget: createCursorWidget(),
            insertLeft: true
        });

        if (peerCursorTimeout) {
            clearTimeout(peerCursorTimeout);
        }
        peerCursorTimeout = setTimeout(() => {
            if (peerCursorMarker) {
                peerCursorMarker.clear();
                peerCursorMarker = null;
            }
        }, 2000);
    } catch (error) {
        console.error('Failed to update peer cursor:', error);
    }
}

function setupConnection() {
    conn.on('open', () => {
        updateConnectionStatus('connected', 'Connected to peer');
        conn.send({ 
            type: 'init',
            files: getFiles(),
            versions: versions,
            currentFile: getCurrentFileName()
        });
    });

    conn.on('close', () => {
        updateConnectionStatus('disconnected', 'Disconnected from peer');
        if (peerCursorMarker) {
            peerCursorMarker.clear();
            peerCursorMarker = null;
        }
        if (peerCursorTimeout) clearTimeout(peerCursorTimeout);
    });

    conn.on('error', (error) => {
        updateConnectionStatus('error', 'Connection error: ' + error.message);
    });

    conn.on('data', (data) => {
        isReceiving = true;
        try {
            if (data.type === 'operation') {
                const targetFile = data.filename;
                const files = getFiles();
                let content = files[targetFile] || '';

                const operation = new TextOperation(data.operation, data.position, data.chars);
                operation.version = data.version;
                const pending = pendingOperations[targetFile] || [];
                pending.forEach(op => operation.transform(op));
                content = operation.apply(content);
                saveFile(targetFile, content);

                if (targetFile === getCurrentFileName()) {
                    editor.setValue(content);
                    
                    const cursorPosition = data.operation === 'insert' 
                        ? data.position + data.chars.length 
                        : data.position;
                    updatePeerCursor(cursorPosition);
                }

                versions[targetFile] = (versions[targetFile] || 0) + 1;
                pendingOperations[targetFile] = pendingOperations[targetFile] || [];
                pendingOperations[targetFile].push(operation);

                if (targetFile === getCurrentFileName()) {
                    const cursorPosition = data.operation === 'insert' 
                        ? data.position + data.chars.length 
                        : data.position;
                    updatePeerCursor(cursorPosition);
                }
            } else if (data.type === 'switchFile') {
                const current = getCurrentFileName();
                if (current) {
                    saveFile(current, editor.getValue());
                }
                saveFile(data.filename, data.content);
                setCurrentFileName(data.filename);
                editor.setValue(data.content);
                renderFileList();
            } else if (data.type === 'createFile') {
                saveFile(data.filename, data.content);
                renderFileList();
            } else if (data.type === 'deleteFile') {
                const files = getFiles();
                delete files[data.filename];
                localStorage.setItem('files', JSON.stringify(files));
                renderFileList();
            } else if (data.type === 'init') {
                localStorage.setItem('files', JSON.stringify(data.files));
                versions = data.versions || {};
                switchFile(data.currentFile);
                renderFileList();
            } else if (data.type === 'cursor' && getCurrentFileName() === data.filename) {
                updatePeerCursor(data.position);
            }
        } catch (error) {
            updateConnectionStatus('error', 'Sync error: ' + error.message);
        }
        isReceiving = false;
    });
}

editor.on('change', (cm, change) => {
    if (!isReceiving && conn?.open) {
        try {
            const currentFile = getCurrentFileName();
            const fromIndex = editor.indexFromPos(change.from);
            const toIndex = editor.indexFromPos(change.to);

            let operation;
            if (change.origin === '+delete') {
                const removedText = change.removed.join('\n');
                operation = new TextOperation('delete', fromIndex, removedText);
            } else {
                const insertedText = change.text.join('\n');
                operation = new TextOperation('insert', fromIndex, insertedText);
            }

            versions[currentFile] = (versions[currentFile] || 0) + 1;
            operation.version = versions[currentFile];
            
            pendingOperations[currentFile] = pendingOperations[currentFile] || [];
            pendingOperations[currentFile].push(operation);

            conn.send({
                type: 'operation',
                filename: currentFile,
                operation: operation.operation,
                position: operation.position,
                chars: operation.chars,
                version: operation.version
            });

            const cursorPos = editor.getCursor();
            conn.send({
                type: 'cursor',
                filename: currentFile,
                position: editor.indexFromPos(cursorPos)
            });

            if (pendingOperations[currentFile].length > 50) {
                pendingOperations[currentFile] = pendingOperations[currentFile].slice(-50);
            }
        } catch (error) {
            updateConnectionStatus('error', 'Failed to send changes: ' + error.message);
        }
    }
    
    const currentFile = getCurrentFileName();
    if (currentFile) {
        saveFile(currentFile, editor.getValue());
    }
});

window.addEventListener('unload', () => {
    const currentFile = getCurrentFileName();
    if (currentFile) {
        saveFile(currentFile, editor.getValue());
    }
    
    if (conn) conn.close();
    if (peer) peer.destroy();
});