let versions = {};
let pendingOperations = {};
let editor;
let peer;
let conn;
let isReceiving = false;
let peerCursorMarker = null;
let peerCursorTimeout = null;
let localCursorColor = '#00ff9d';
let saveTimeout = null;
let lastSaved = Date.now();
let peerSelectionMarkers = new Map();
let peerSelectionTimeout = null;

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    const colorPicker = document.getElementById('cursorColor');
    if (colorPicker) {
        colorPicker.value = theme === 'purple' ? '#bd00ff' : '#00ff9d';
        localCursorColor = colorPicker.value;
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'green';
    const newTheme = currentTheme === 'green' ? 'purple' : 'green';
    setTheme(newTheme);
}

function getFiles() {
    return JSON.parse(localStorage.getItem('files')) || {};
}

function saveFile(name, content) {
    const files = getFiles();
    files[name] = content;
    localStorage.setItem('files', JSON.stringify(files));
    updateSaveIndicator(true);
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
        li.setAttribute('data-filename', name);
        
        const fileContent = document.createElement('div');
        fileContent.className = `flex items-center px-3 py-2 rounded-md text-sm cursor-pointer transition-all ${
            name === currentFile 
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-lg shadow-[var(--accent)]/10' 
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
        
        icon.className = `${iconClass} mr-3 ${name === currentFile ? 'text-[var(--accent)]' : 'text-gray-400'}`;
        
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

function getFileMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return {
        'js': 'javascript',
        'css': 'css',
        'html': 'xml',
        'json': 'javascript',
        'py': 'python',
        'rb': 'ruby',
        'php': 'php',
        'md': 'markdown'
    }[ext] || 'text';
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
        
        const mode = getFileMode(name);
        editor.setOption('mode', mode);
        
        if (conn?.open) {
            conn.send({
                type: 'switchFile',
                filename: name,
                content: files[name] || '',
                color: localCursorColor,
                mode: mode 
            });
        }
        
        renderFileList();
        clearPeerSelections();
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
        btn.classList.remove('bg-[var(--accent)]/10', 'text-[var(--accent)]');
    });
    event.currentTarget.classList.add('bg-[var(--accent)]/10', 'text-[var(--accent)]');
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
        
        const mode = getFileMode(finalName);
        editor.setOption('mode', mode);
        
        if (conn?.open) {
            conn.send({
                type: 'createFile',
                filename: finalName,
                content: '',
                mode: mode 
            });
        }
        
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
   
    const savedTheme = localStorage.getItem('theme') || 'green';
    setTheme(savedTheme);
    
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    const colorPicker = document.getElementById('cursorColor');
    if (colorPicker) {
        colorPicker.value = savedTheme === 'purple' ? '#bd00ff' : '#00ff9d';
        localCursorColor = colorPicker.value;
        colorPicker.addEventListener('input', (e) => {
            localCursorColor = e.target.value;
        });
    }

    const searchInput = document.getElementById('file-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterFiles(e.target.value);
        });
    }
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

function createCursorWidget(color) {
    const cursorEl = document.createElement('div');
    cursorEl.className = 'peer-cursor';
    cursorEl.style.setProperty('--cursor-color', color);
    cursorEl.style.setProperty('--cursor-glow', `${color}77`);
    cursorEl.style.setProperty('--cursor-bg', `${color}26`);
    return cursorEl;
}

function updatePeerCursor(position, color = '#00ff9d') {
    try {
        if (peerCursorMarker) {
            peerCursorMarker.clear();
        }
        const cursorPos = editor.posFromIndex(position);
        const colorPicker = document.getElementById('cursorColor');
        const localColor = colorPicker ? colorPicker.value : '#00ff9d';
        peerCursorMarker = editor.setBookmark(cursorPos, {
            widget: createCursorWidget(localColor),
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

function createSelectionWidget(color) {
    const selectionEl = document.createElement('div');
    selectionEl.className = 'peer-selection';
    selectionEl.style.backgroundColor = `${color}26`;
    selectionEl.style.border = `1px solid ${color}40`;
    return selectionEl;
}

function updatePeerSelection(start, end, color = '#00ff9d') {
    clearPeerSelections();
    
    const doc = editor.getDoc();
    const startPos = editor.posFromIndex(start);
    const endPos = editor.posFromIndex(end);
    
    const colorPicker = document.getElementById('cursorColor');
    const localColor = colorPicker ? colorPicker.value : '#00ff9d';
    
    const marker = doc.markText(startPos, endPos, {
        className: 'peer-selection',
        css: `background-color: ${localColor}26; border: 1px solid ${localColor}40`,
        clearOnEnter: false
    });
    
    peerSelectionMarkers.set('current', marker);
    
    if (peerSelectionTimeout) {
        clearTimeout(peerSelectionTimeout);
    }
    peerSelectionTimeout = setTimeout(clearPeerSelections, 5000);
}

function clearPeerSelections() {
    peerSelectionMarkers.forEach(marker => marker.clear());
    peerSelectionMarkers.clear();
}

function setupConnection() {
    conn.on('open', () => {
        updateConnectionStatus('connected', 'Connected to peer');
        conn.send({ 
            type: 'init',
            files: getFiles(),
            versions: versions,
            currentFile: getCurrentFileName(),
            color: localCursorColor
        });
    });

    conn.on('close', () => {
        updateConnectionStatus('disconnected', 'Disconnected from peer');
        if (peerCursorMarker) {
            peerCursorMarker.clear();
            peerCursorMarker = null;
        }
        if (peerCursorTimeout) clearTimeout(peerCursorTimeout);
        clearPeerSelections();
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
                    editor.operation(() => {
                        const pos = editor.posFromIndex(operation.position);
                        if (operation.operation === 'insert') {
                            editor.replaceRange(operation.chars, pos);
                        } else {
                            const from = pos;
                            const to = editor.posFromIndex(operation.position + operation.chars.length);
                            editor.replaceRange('', from, to);
                        }
                    });
                    
                    const cursorPosition = data.operation === 'insert' 
                        ? data.position + data.chars.length 
                        : data.position;
                    updatePeerCursor(cursorPosition, data.color || '#00ff9d');
                }

                versions[targetFile] = (versions[targetFile] || 0) + 1;
                pendingOperations[targetFile] = pendingOperations[targetFile] || [];
                pendingOperations[targetFile].push(operation);
            } else if (data.type === 'switchFile') {
                const current = getCurrentFileName();
                if (current) {
                    saveFile(current, editor.getValue());
                }
                saveFile(data.filename, data.content);
                setCurrentFileName(data.filename);
                editor.setValue(data.content);
                editor.setOption('mode', data.mode || getFileMode(data.filename));
                renderFileList();
            } else if (data.type === 'createFile') {
                saveFile(data.filename, data.content);
                if (data.filename === getCurrentFileName()) {
                    editor.setOption('mode', data.mode || getFileMode(data.filename));
                }
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
                updatePeerCursor(data.position, data.color || '#00ff9d');
            } else if (data.type === 'selection' && getCurrentFileName() === data.filename) {
                updatePeerSelection(data.start, data.end, data.color || '#00ff9d');
            }
        } catch (error) {
            updateConnectionStatus('error', 'Sync error: ' + error.message);
        }
        isReceiving = false;
    });
}

function sendOperation(filename, operation) {
    versions[filename] = (versions[filename] || 0) + 1;
    operation.version = versions[filename];
    
    pendingOperations[filename] = pendingOperations[filename] || [];
    pendingOperations[filename].push(operation);

    conn.send({
        type: 'operation',
        filename: filename,
        operation: operation.operation,
        position: operation.position,
        chars: operation.chars,
        version: operation.version,
        color: localCursorColor
    });

    if (pendingOperations[filename].length > 50) {
        pendingOperations[filename] = pendingOperations[filename].slice(-50);
    }
}

editor.on('change', (cm, change) => {
    if (!isReceiving && conn?.open) {
        try {
            const currentFile = getCurrentFileName();
            const fromIndex = editor.indexFromPos(change.from);
            const toIndex = editor.indexFromPos(change.to);

            if (change.removed.some(line => line.length > 0)) {
                const removedText = change.removed.join('\n');
                const deleteOp = new TextOperation('delete', fromIndex, removedText);
                sendOperation(currentFile, deleteOp);
            }

            const insertedText = change.text.join('\n');
            if (insertedText.length > 0 && !(change.origin === '+delete' && insertedText === '')) {
                const insertOp = new TextOperation('insert', fromIndex, insertedText);
                sendOperation(currentFile, insertOp);
            }

            const cursorPos = editor.getCursor();
            conn.send({
                type: 'cursor',
                filename: currentFile,
                position: editor.indexFromPos(cursorPos),
                color: localCursorColor
            });
        } catch (error) {
            updateConnectionStatus('error', 'Failed to send changes: ' + error.message);
        }
    }
    
    if (saveTimeout) clearTimeout(saveTimeout);
    updateSaveIndicator(false);
    
    saveTimeout = setTimeout(() => {
        const currentFile = getCurrentFileName();
        if (currentFile) {
            saveFile(currentFile, editor.getValue());
        }
    }, 1000);
    
    const currentFile = getCurrentFileName();
    if (currentFile) {
        saveFile(currentFile, editor.getValue());
    }
});

editor.on('beforeSelectionChange', (cm, change) => {
    if (!isReceiving && conn?.open) {
        const ranges = change.ranges;
        if (ranges && ranges.length > 0) {
            const from = editor.indexFromPos(ranges[0].from());
            const to = editor.indexFromPos(ranges[0].to());
            
            if (from !== to) {
                conn.send({
                    type: 'selection',
                    filename: getCurrentFileName(),
                    start: from,
                    end: to,
                    color: localCursorColor
                });
            }
        }
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

function filterFiles(searchTerm) {
    const fileList = document.getElementById('file-list');
    const files = getFiles();
    const terms = searchTerm.toLowerCase().split(' ');
    
    Object.keys(files).forEach(name => {
        const li = fileList.querySelector(`[data-filename="${name}"]`);
        if (!li) return;
        
        const matches = terms.every(term => 
            name.toLowerCase().includes(term) || 
            files[name].toLowerCase().includes(term)
        );
        
        li.style.display = matches ? 'block' : 'none';
    });
}

function updateSaveIndicator(saved = false) {
    const indicator = document.getElementById('save-indicator');
    if (saved) {
        indicator.textContent = 'All changes saved';
        indicator.className = 'text-xs text-gray-400 transition-colors duration-200';
        lastSaved = Date.now();
    } else {
        indicator.textContent = 'Saving...';
        indicator.className = 'text-xs text-[var(--accent)] transition-colors duration-200';
    }
}