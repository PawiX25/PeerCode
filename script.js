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
let isHtmlPreview = false;
let unreadMessages = 0;
let isTypingTimeout = null;

let settings = {
    theme: 'green',
    fontSize: 14,
    fontFamily: "'JetBrains Mono'",
    tabSize: 2,
    autoSave: 5,
    cursorColor: '#00ff9d',
    showPeerActivity: true
};

let peerFiles = {};
let peerVersions = {};
let currentFileOwner = 'local';
let peerActiveFiles = new Set();

function loadSettings() {
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        applySettings();
    }
}

function saveSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function applySettings() {
    setTheme(settings.theme);
    
    editor.getWrapperElement().style.fontSize = settings.fontSize + 'px';
    editor.setOption('tabSize', settings.tabSize);
    editor.setOption('lineWrapping', settings.lineWrap);
    editor.getWrapperElement().style.fontFamily = settings.fontFamily;
    
    document.getElementById('font-size').value = settings.fontSize;
    document.getElementById('font-size').nextElementSibling.textContent = settings.fontSize + 'px';
    document.getElementById('tab-size').value = settings.tabSize;
    document.getElementById('line-wrap').checked = settings.lineWrap;
    document.getElementById('font-family').value = settings.fontFamily;
    document.getElementById('cursorColor').value = settings.cursorColor;
    document.getElementById('auto-save').value = settings.autoSave;
    document.getElementById('auto-save').nextElementSibling.textContent = settings.autoSave + 's';
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('bg-[var(--accent)]/10', btn.dataset.theme === settings.theme);
    });
    
    localCursorColor = settings.cursorColor;
}

function toggleSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    const chatPanel = document.getElementById('chat-panel');
    
    if (chatPanel.classList.contains('open')) {
        chatPanel.classList.remove('open');
    }
    
    settingsPanel.classList.toggle('open');
}

function setTheme(theme) {
    const defaultThemes = {
        'green': {
            accent: '#00ff9d',
            gradientStart: '#00ff9d',
            gradientEnd: '#00a6ff'
        },
        'purple': {
            accent: '#bd00ff',
            gradientStart: '#bd00ff',
            gradientEnd: '#4c00ff'
        }
    };

    if (defaultThemes[theme]) {
        const defaultTheme = defaultThemes[theme];
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.setProperty('--accent', defaultTheme.accent);
        document.documentElement.style.setProperty('--accent-gradient', 
            `linear-gradient(to right, ${defaultTheme.gradientStart}, ${defaultTheme.gradientEnd})`
        );
        settings.theme = theme;
        settings.cursorColor = defaultTheme.accent;
        localCursorColor = defaultTheme.accent;
    } else {

        const customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
        if (customThemes[theme]) {
            const customTheme = customThemes[theme];
            document.documentElement.style.setProperty('--accent', customTheme.accent);
            document.documentElement.style.setProperty('--accent-gradient', 
                `linear-gradient(to right, ${customTheme.gradientStart}, ${customTheme.gradientEnd})`
            );
            settings.theme = theme;
            settings.cursorColor = customTheme.accent;
            localCursorColor = customTheme.accent;
        }
    }

    document.getElementById('cursorColor').value = settings.cursorColor;
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('bg-[var(--accent)]/10', btn.dataset.theme === theme);
    });
    
    saveSettings();
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'green';
    const newTheme = currentTheme === 'green' ? 'purple' : 'green';
    setTheme(newTheme);
}

function getFiles(owner = 'local') {
    if (owner === 'local') {
        return JSON.parse(localStorage.getItem('files')) || {};
    }
    return peerFiles;
}

function saveFile(name, content, owner = 'local') {
    if (owner === 'local') {
        const files = getFiles('local');
        files[name] = content;
        localStorage.setItem('files', JSON.stringify(files));
    } else {
        peerFiles[name] = content;
    }
    updateSaveIndicator(true);
}

function getCurrentFileName() {
    return {
        name: localStorage.getItem('currentFile') || '',
        owner: currentFileOwner
    };
}

function setCurrentFileName(name, owner = 'local') {
    localStorage.setItem('currentFile', name);
    currentFileOwner = owner;
}

function renderFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    const localFiles = getFiles('local');
    const peerFiles = getFiles('peer');
    const current = getCurrentFileName();

    if (Object.keys(localFiles).length > 0) {
        const localSection = createFileSection('Local Files');
        Object.keys(localFiles).forEach(name => {
            const li = createFileListItem(name, 'local', current);
            localSection.querySelector('ul').appendChild(li);
        });
        fileList.appendChild(localSection);
    }

    if (Object.keys(peerFiles).length > 0) {
        const peerSection = createFileSection('Peer Files');
        Object.keys(peerFiles).forEach(name => {
            const li = createFileListItem(name, 'peer', current);
            peerSection.querySelector('ul').appendChild(li);
        });
        fileList.appendChild(peerSection);
    }
}

function createFileSection(title) {
    const section = document.createElement('div');
    section.className = 'mb-4';
    section.innerHTML = `
        <h3 class="text-sm font-medium text-gray-400 px-2 mb-2">${title}</h3>
        <ul class="space-y-1"></ul>
    `;
    return section;
}

function createFileListItem(name, owner, current) {
    const li = document.createElement('li');
    li.className = 'mx-2 mb-1 group transition-all duration-200';
    li.setAttribute('data-filename', name);
    li.setAttribute('data-owner', owner);

    const isActive = name === current.name && owner === current.owner;
    
    const fileContent = document.createElement('div');
    fileContent.className = `flex items-center px-3 py-2 rounded-md text-sm cursor-pointer transition-all ${
        isActive 
            ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-lg shadow-[var(--accent)]/10' 
            : 'text-gray-400 hover:bg-white/5'
    }`;

    const key = `${owner === 'local' ? 'peer' : 'local'}:${name}`;
    const isPeerActive = peerActiveFiles.has(key);
    
    if (isPeerActive && settings.showPeerActivity) {
        const indicator = document.createElement('div');
        indicator.className = 'peer-active-indicator';
        indicator.style.backgroundColor = owner === 'local' ? '#bd00ff' : '#00ff9d';
        fileContent.appendChild(indicator);
    }

    const ownerBadge = document.createElement('span');
    ownerBadge.className = `text-xs px-1.5 py-0.5 rounded ${
        owner === 'local' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-purple-500/10 text-purple-400'
    } mr-2`;
    ownerBadge.textContent = owner === 'local' ? 'Local' : 'Peer';

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
    
    icon.className = `${iconClass} mr-3 ${isActive ? 'text-[var(--accent)]' : 'text-gray-400'}`;
    
    const fileName = document.createElement('span');
    fileName.textContent = name;
    fileName.className = 'flex-1';

    fileContent.appendChild(ownerBadge);
    fileContent.appendChild(icon);
    fileContent.appendChild(fileName);

    if (owner === 'local') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSelectedFile(name);
        };
        fileContent.appendChild(deleteBtn);
    }

    li.appendChild(fileContent);
    li.onclick = () => switchFile(name, owner);
    return li;
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

function switchFile(name, owner = 'local') {
    try {
        const current = getCurrentFileName();
        if (current.name) {
            saveFile(current.name, editor.getValue(), current.owner);
        }
        
        setCurrentFileName(name, owner);
        const files = getFiles(owner);
        editor.setValue(files[name] || '', 'localSwitchFile');
        
        const mode = getFileMode(name);
        editor.setOption('mode', mode);
        
        const previewBtn = document.getElementById('preview-toggle-btn');
        const previewContainer = document.getElementById('preview-container');
        const editorWrapper = editor.getWrapperElement().parentNode;
        
        if (mode === 'xml' || mode === 'markdown') {
            previewBtn.classList.remove('hidden');
            previewBtn.innerHTML = `<i class="fas fa-eye mr-2"></i>${mode === 'markdown' ? 'Preview Markdown' : 'Preview HTML'}`;
        } else {
            previewBtn.classList.add('hidden');
        }
        
        if (!previewContainer.classList.contains('hidden')) {
            previewContainer.classList.add('hidden');
            editorWrapper.classList.remove('hidden');
        }
        
        if (conn?.open) {
            conn.send({
                type: 'switchFile',
                filename: name,
                owner: owner,
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
                mode: mode,
                owner: 'local'
            });
        }
        
        closeNewFileModal();
        renderFileList();
    } catch (error) {
        alert(error.message);
    }
}

let fileToDelete = null;

function showDeleteFileModal(name) {
    fileToDelete = name;
    const modal = document.getElementById('delete-file-modal');
    const filenameSpan = document.getElementById('delete-filename');
    filenameSpan.textContent = name;
    modal.classList.remove('hidden');
}

function closeDeleteFileModal() {
    const modal = document.getElementById('delete-file-modal');
    modal.classList.add('hidden');
    fileToDelete = null;
}

function confirmDeleteFile() {
    try {
        const files = getFiles();
        delete files[fileToDelete];
        localStorage.setItem('files', JSON.stringify(files));
        
        if (conn?.open) {
            conn.send({
                type: 'deleteFile',
                filename: fileToDelete,
                owner: 'local'
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
        
        closeDeleteFileModal();
        renderFileList();
    } catch (error) {
        alert('Failed to delete file: ' + error.message);
    }
}

function deleteSelectedFile(name) {
    showDeleteFileModal(name);
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
    
    const previewBtn = document.getElementById('preview-toggle-btn');
    const currentFile = getCurrentFileName();
    if (currentFile.name && getFileMode(currentFile.name) === 'xml') {
        previewBtn.classList.remove('hidden');
    } else {
        previewBtn.classList.add('hidden');
    }
    
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

    loadSettings();
    
    const fontSizeSlider = document.getElementById('font-size');
    fontSizeSlider.addEventListener('input', (e) => {
        settings.fontSize = e.target.value;
        editor.getWrapperElement().style.fontSize = settings.fontSize + 'px';
        saveSettings();
        editor.refresh();
        updateSaveIndicator(false);
        e.target.nextElementSibling.textContent = settings.fontSize + 'px';
    });
    
    const tabSizeSelect = document.getElementById('tab-size');
    tabSizeSelect.addEventListener('change', (e) => {
        settings.tabSize = parseInt(e.target.value);
        editor.setOption('tabSize', settings.tabSize);
        saveSettings();
    });
    
    const lineWrapToggle = document.getElementById('line-wrap');
    lineWrapToggle.addEventListener('change', (e) => {
        settings.lineWrap = e.target.checked;
        editor.setOption('lineWrapping', settings.lineWrap);
        saveSettings();
    });
    
    const fontFamilySelect = document.getElementById('font-family');
    fontFamilySelect.addEventListener('change', (e) => {
        settings.fontFamily = e.target.value;
        editor.getWrapperElement().style.fontFamily = settings.fontFamily;
        saveSettings();
    });
    
    const autoSaveSlider = document.getElementById('auto-save');
    autoSaveSlider.addEventListener('input', (e) => {
        settings.autoSave = parseInt(e.target.value);
        e.target.nextElementSibling.textContent = settings.autoSave + 's';
        saveSettings();
    });

    const customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
    Object.entries(customThemes).forEach(([name, theme]) => {
        addCustomThemeButton(name, theme);
    });

    ['accent-color', 'gradient-start', 'gradient-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateThemePreview);
    });

    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('input', () => {
        if (conn?.open) {
            if (isTypingTimeout) {
                clearTimeout(isTypingTimeout);
            }
            
            conn.send({
                type: 'typing',
                isTyping: true
            });
            
            isTypingTimeout = setTimeout(() => {
                conn.send({
                    type: 'typing',
                    isTyping: false
                });
            }, 5000);
        }
    });

    const sidebar = document.getElementById('sidebar');
    ['dragover', 'dragleave', 'drop'].forEach(event => {
        sidebar.addEventListener(event, preventDefaults);
    });

    sidebar.addEventListener('dragover', handleDragOver);
    sidebar.addEventListener('dragleave', handleDragLeave);
    sidebar.addEventListener('drop', handleFileDrop);
    
    const showPeerActivity = document.getElementById('show-peer-activity');
    showPeerActivity.checked = settings.showPeerActivity;
    showPeerActivity.addEventListener('change', (e) => {
        settings.showPeerActivity = e.target.checked;
        saveSettings();
        renderFileList();
    });
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    
    if (!sidebar.classList.contains('drag-over')) {
        sidebar.classList.add('drag-over');
        const fileItems = document.querySelectorAll('#file-list li');
        fileItems.forEach(item => {
            item.style.opacity = '0.5';
            item.style.transform = 'scale(0.98)';
            item.style.transition = 'all 0.3s ease';
        });
    }

    const rect = sidebar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sidebar.style.setProperty('--mouse-x', `${x}px`);
    sidebar.style.setProperty('--mouse-y', `${y}px`);

    const before = sidebar.querySelector(':before');
    if (before) {
        before.style.left = `${x}px`;
        before.style.top = `${y}px`;
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    if (!e.relatedTarget || !sidebar.contains(e.relatedTarget)) {
        sidebar.classList.remove('drag-over');

        const fileItems = document.querySelectorAll('#file-list li');
        fileItems.forEach(item => {
            item.style.opacity = '1';
            item.style.transform = 'scale(1)';
        });
    }
}

function handleFileDrop(e) {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('drag-over');

    const fileItems = document.querySelectorAll('#file-list li');
    fileItems.forEach(item => {
        item.style.opacity = '1';
        item.style.transform = 'scale(1)';
    });

    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length === 0) return;

    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    const rect = sidebar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    sidebar.appendChild(ripple);

    requestAnimationFrame(() => {
        ripple.classList.add('ripple-animation');
    });

    ripple.addEventListener('animationend', () => {
        ripple.remove();
    });

    const flash = document.createElement('div');
    flash.style.cssText = `
        position: absolute;
        inset: 0;
        background: var(--accent);
        opacity: 0;
        z-index: 40;
        pointer-events: none;
    `;
    sidebar.appendChild(flash);
    
    flash.animate([
        { opacity: 0.1 },
        { opacity: 0 }
    ], {
        duration: 300,
        easing: 'ease-out'
    }).onfinish = () => flash.remove();

    handleFiles(Array.from(files));
}

async function handleFiles(files) {
    const supportedExtensions = /\.(js|css|html|txt|py|rb|php|md|json)$/i;
    const validFiles = files.filter(file => 
        file.type.startsWith('text/') || supportedExtensions.test(file.name)
    );

    if (validFiles.length === 0) {
        showNotification('No valid text files found', 'error');
        return;
    }

    for (const file of validFiles) {
        try {
            const content = await readFile(file);
            createFileFromDrop(file.name, content);
        } catch (error) {
            showNotification(`Error reading ${file.name}: ${error.message}`, 'error');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg glass z-50 transform transition-all duration-300 flex items-center space-x-3`;
    
    const icon = document.createElement('i');
    icon.className = `fas fa-${type === 'error' ? 'exclamation-circle text-red-400' : 'check-circle text-[var(--accent)]'}`;
    
    const text = document.createElement('span');
    text.textContent = message;
    text.className = 'text-sm';
    
    notification.appendChild(icon);
    notification.appendChild(text);
    document.body.appendChild(notification);

    notification.animate([
        { transform: 'translateY(100%)', opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 }
    ], {
        duration: 300,
        easing: 'ease-out'
    });
    
    setTimeout(() => {
        notification.animate([
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(100%)', opacity: 0 }
        ], {
            duration: 300,
            easing: 'ease-in'
        }).onfinish = () => notification.remove();
    }, 3000);
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function createFileFromDrop(name, content) {
    try {
        const files = getFiles();
        let finalName = name;
        let counter = 1;

        while (files[finalName]) {
            const parts = name.split('.');
            const ext = parts.length > 1 ? `.${parts.pop()}` : '';
            finalName = `${parts.join('.')} (${counter++})${ext}`;
        }

        saveFile(finalName, content);
        if (!getCurrentFileName().name) {
            setCurrentFileName(finalName);
            editor.setValue(content);
            const mode = getFileMode(finalName);
            editor.setOption('mode', mode);
        }
        renderFileList();
    } catch (error) {
        alert('Error creating file: ' + error.message);
    }
}

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
        const files = getFiles(currentFile.owner);
        editor.setValue(files[currentFile.name] || '');
        const ext = currentFile.name.split('.').pop().toLowerCase();
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

peer = new Peer({ 
    debug: 2,
    config: {
        'iceServers': [
            { 
                url: 'stun:138.68.182.24:3478',
                urls: 'stun:138.68.182.24:3478'
            },
            {
                url: 'turn:138.68.182.24:3478',
                urls: 'turn:138.68.182.24:3478',
                username: 'debianturn',
                credential: 'jaZxir-6fawje-remrot'
            }
        ]
    }
});

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
            files: getFiles('local'),
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
        clearPeerSelections();
        clearPeerFileActivity();
    });

    conn.on('error', (error) => {
        updateConnectionStatus('error', 'Connection error: ' + error.message);
    });

    conn.on('data', (data) => {
        isReceiving = true;
        try {
            let actualOwner = data.owner === 'local' ? 'peer' : 'local';
            if (data.type === 'operation') {
                const targetFile = data.filename;
                const files = getFiles(actualOwner);
                let content = files[targetFile] || '';
                const operation = new TextOperation(data.operation, data.position, data.chars);
                operation.version = data.version;
                const pending = pendingOperations[targetFile] || [];
                pending.forEach(op => operation.transform(op));
                content = operation.apply(content);
                saveFile(targetFile, content, actualOwner);
                const current = getCurrentFileName();
                if (targetFile === current.name && actualOwner === current.owner) {
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
                updatePeerFileActivity(data.filename, data.owner);
                const current = getCurrentFileName();
                if (current.name) {
                    saveFile(current.name, editor.getValue(), current.owner);
                }
                saveFile(data.filename, data.content, actualOwner);
                if (data.filename === current.name && actualOwner === current.owner) {
                    editor.setValue(data.content, 'peerSwitchFile');
                }
                renderFileList();
                clearPeerSelections();
            } else if (data.type === 'createFile') {
                saveFile(data.filename, data.content, actualOwner);
                renderFileList();
            } else if (data.type === 'deleteFile') {
                const files = getFiles(actualOwner);
                delete files[data.filename];
                if (actualOwner === 'local') {
                    localStorage.setItem('files', JSON.stringify(files));
                } else {
                    peerFiles = files;
                }
                renderFileList();
            } else if (data.type === 'init') {
                peerFiles = data.files;
                peerVersions = data.versions;
                renderFileList();
            } else if (data.type === 'cursor') {
                const currentFile = getCurrentFileName();
                if (currentFile.name === data.filename && currentFile.owner === actualOwner) {
                    updatePeerCursor(data.position, data.color || '#00ff9d');
                }
            } else if (data.type === 'selection') {
                const currentFile = getCurrentFileName();
                if (currentFile.name === data.filename && currentFile.owner === actualOwner) {
                    updatePeerSelection(data.start, data.end, data.color || '#00ff9d');
                }
            } else if (data.type === 'chat') {
                const message = {
                    type: 'chat',
                    content: data.content,
                    sender: 'Peer',
                    timestamp: data.timestamp
                };
                addMessageToChat(message);
            } else if (data.type === 'typing') {
                if (data.isTyping) {
                    showTypingIndicator();
                } else {
                    hideTypingIndicator();
                }
            }
        } catch (error) {
            updateConnectionStatus('error', 'Sync error: ' + error.message);
        }
        isReceiving = false;
    });
}

function sendOperation(filename, operation) {
    if (!conn || !conn.open) {
        console.warn('Cannot send operation: No active connection');
        return;
    }

    versions[filename] = (versions[filename] || 0) + 1;
    operation.version = versions[filename];
    
    pendingOperations[filename] = pendingOperations[filename] || [];
    pendingOperations[filename].push(operation);

    conn.send({
        type: 'operation',
        filename: filename,
        owner: currentFileOwner,
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
    if (change.origin === 'setValue' || change.origin === 'localSwitchFile') {
        return;
    }
    
    if (isReceiving) {
        return;
    }

    try {
        const currentFile = getCurrentFileName();
        const fromIndex = editor.indexFromPos(change.from);
        const toIndex = editor.indexFromPos(change.to);

        if (change.removed.some(line => line.length > 0)) {
            const removedText = change.removed.join('\n');
            const deleteOp = new TextOperation('delete', fromIndex, removedText);
            sendOperation(currentFile.name, deleteOp);
        }

        const insertedText = change.text.join('\n');
        if (insertedText.length > 0 && !(change.origin === '+delete' && insertedText === '')) {
            const insertOp = new TextOperation('insert', fromIndex, insertedText);
            sendOperation(currentFile.name, insertOp);
        }

        if (conn && conn.open) {
            const cursorPos = editor.getCursor();
            conn.send({
                type: 'cursor',
                filename: currentFile.name,
                owner: currentFileOwner,
                position: editor.indexFromPos(cursorPos),
                color: localCursorColor
            });
        }
    } catch (error) {
        updateConnectionStatus('error', 'Failed to send changes: ' + error.message);
    }
    
    if (saveTimeout) clearTimeout(saveTimeout);
    updateSaveIndicator(false);
    
    saveTimeout = setTimeout(() => {
        const currentFile = getCurrentFileName();
        if (currentFile.name) {
            saveFile(currentFile.name, editor.getValue(), currentFile.owner);
        }
    }, 1000);
    
    const currentFile = getCurrentFileName();
    if (currentFile.name) {
        saveFile(currentFile.name, editor.getValue(), currentFile.owner);
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
                    filename: getCurrentFileName().name,
                    owner: currentFileOwner,
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
    if (currentFile.name) {
        saveFile(currentFile.name, editor.getValue(), currentFile.owner);
    }
    
    if (conn) conn.close();
    if (peer) peer.destroy();
});

function filterFiles(searchTerm) {
    const fileList = document.getElementById('file-list');
    const localFiles = getFiles('local');
    const peerFiles = getFiles('peer');
    const terms = searchTerm.toLowerCase().split(' ');
    
    Object.keys(localFiles).forEach(name => {
        const li = fileList.querySelector(`[data-filename="${name}"][data-owner="local"]`);
        if (!li) return;
        
        const matches = terms.every(term => 
            name.toLowerCase().includes(term) || 
            localFiles[name].toLowerCase().includes(term)
        );
        
        li.style.display = matches ? 'block' : 'none';
    });

    Object.keys(peerFiles).forEach(name => {
        const li = fileList.querySelector(`[data-filename="${name}"][data-owner="peer"]`);
        if (!li) return;
        
        const matches = terms.every(term => 
            name.toLowerCase().includes(term) || 
            peerFiles[name].toLowerCase().includes(term)
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

function openThemeCreator() {
    const modal = document.getElementById('theme-creator-modal');
    modal.classList.remove('hidden');
    updateThemePreview();
}

function closeThemeCreator() {
    const modal = document.getElementById('theme-creator-modal');
    modal.classList.add('hidden');
}

function updateThemePreview() {
    const accentColor = document.getElementById('accent-color').value;
    const gradientStart = document.getElementById('gradient-start').value;
    const gradientEnd = document.getElementById('gradient-end').value;
    const preview = document.getElementById('theme-preview');
    preview.style.background = `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`;
}

function saveCustomTheme() {
    const name = document.getElementById('theme-name').value.trim();
    if (!name) {
        alert('Please enter a theme name');
        return;
    }

    const theme = {
        accent: document.getElementById('accent-color').value,
        gradientStart: document.getElementById('gradient-start').value,
        gradientEnd: document.getElementById('gradient-end').value
    };

    let customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
    customThemes[name] = theme;
    localStorage.setItem('customThemes', JSON.stringify(customThemes));

    addCustomThemeButton(name, theme);

    closeThemeCreator();
}

function addCustomThemeButton(name, theme) {
    const themeContainer = document.querySelector('.grid.grid-cols-2');
    const themeBtn = document.createElement('button');
    themeBtn.className = 'theme-btn relative p-4 rounded-lg transition-all group';
    themeBtn.setAttribute('data-theme', name);
    themeBtn.onclick = () => setCustomTheme(name, theme);
    themeBtn.innerHTML = `
        <div class="w-full h-2 rounded" style="background: linear-gradient(to right, ${theme.gradientStart}, ${theme.gradientEnd})"></div>
        <div class="flex items-center justify-between mt-2">
            <span class="text-sm">${name}</span>
        </div>
    `;
    themeContainer.appendChild(themeBtn);
}

function openDeleteThemeModal() {
    const customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
    const modal = document.getElementById('delete-theme-modal');
    const themeList = document.getElementById('custom-theme-list');
    
    themeList.innerHTML = '';
    
    Object.entries(customThemes).forEach(([name, theme]) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 rounded-md hover:bg-gray-700 transition-colors mb-2';
        item.setAttribute('data-name', name);
        item.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-2 rounded" style="background: linear-gradient(to right, ${theme.gradientStart}, ${theme.gradientEnd})"></div>
                <span class="text-sm">${name}</span>
            </div>
            <button onclick="deleteTheme('${name}')" class="px-3 py-1 rounded-md text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                Delete
            </button>
        `;
        themeList.appendChild(item);
    });
    
    modal.classList.remove('hidden');
}

function closeDeleteThemeModal() {
    const modal = document.getElementById('delete-theme-modal');
    modal.classList.add('hidden');
}

function deleteTheme(name) {
    const customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
    delete customThemes[name];
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    
    const themeList = document.getElementById('custom-theme-list');
    const themeItem = themeList.querySelector(`[data-name="${name}"]`);
    if (themeItem) {
        themeList.removeChild(themeItem);
    }
    
    const button = document.querySelector(`[data-theme="${name}"]`);
    if (button) {
        button.remove();
    }
    
    if (settings.theme === name) {
        setTheme('green');
    }
}

function setCustomTheme(name, theme) {
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(to right, ${theme.gradientStart}, ${theme.gradientEnd})`);
    settings.theme = name;
    settings.cursorColor = theme.accent;
    localCursorColor = theme.accent;
    document.getElementById('cursorColor').value = theme.accent;
    saveSettings();
}

function toggleHtmlPreview() {
    const previewContainer = document.getElementById('preview-container');
    const previewFrame = document.getElementById('preview-frame');
    const editorWrapper = editor.getWrapperElement().parentNode;
    const currentFile = getCurrentFileName();
    const mode = getFileMode(currentFile.name);
    
    if (previewContainer.classList.contains('hidden')) {
        previewContainer.classList.remove('hidden');
        editorWrapper.classList.add('hidden');
        
        if (mode === 'markdown') {
            const content = editor.getValue();
            previewFrame.classList.add('markdown-preview');
            previewFrame.srcdoc = `
                <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { 
                        background-color: rgba(20, 20, 20, 0.7);
                        margin: 0;
                        padding: 20px;
                    }
                    .markdown-preview {
                        color: #fff;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.6;
                        max-width: 900px;
                        margin: 0 auto;
                    }
                </style>
                <div class="markdown-preview">
                    ${marked.parse(content)}
                </div>
            `;
        } else {
            previewFrame.classList.remove('markdown-preview');
            previewFrame.srcdoc = `<style>body { background-color: #FFFDE7; }</style>` + editor.getValue();
        }
    } else {
        previewContainer.classList.add('hidden');
        editorWrapper.classList.remove('hidden');
    }
}

function toggleChat() {
    const chatPanel = document.getElementById('chat-panel');
    const settingsPanel = document.getElementById('settings-panel');
    
    if (settingsPanel.classList.contains('open')) {
        settingsPanel.classList.remove('open');
    }
    
    chatPanel.classList.toggle('open');
    if (chatPanel.classList.contains('open')) {
        document.getElementById('chat-notification').classList.add('hidden');
        document.getElementById('chat-icon').classList.remove('chat-icon-pulse');
        unreadMessages = 0;
        document.getElementById('chat-input').focus();
    } else {
        hideTypingIndicator();
    }
}

function sendChatMessage() {
    if (!conn?.open) {
        alert('No peer connected');
        return;
    }

    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatMessage = {
        type: 'chat',
        content: message,
        sender: 'You',
        timestamp: Date.now()
    };
    
    conn.send(chatMessage);
    conn.send({ type: 'typing', isTyping: false });
    addMessageToChat(chatMessage);
    
    input.value = '';
}

function addMessageToChat(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.sender === 'You' ? 'text-right' : ''}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString();
    
    messageEl.innerHTML = `
        <div class="inline-block max-w-[80%] ${message.sender === 'You' ? 'bg-[var(--accent)]/10' : 'bg-white/5'} rounded-lg px-4 py-2">
            <div class="text-sm ${message.sender === 'You' ? 'text-[var(--accent)]' : 'text-gray-400'}">${message.sender}</div>
            <div class="text-white break-words">${escapeHtml(message.content)}</div>
            <div class="text-xs text-gray-500 mt-1">${time}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    if (!document.getElementById('chat-panel').classList.contains('open')) {
        unreadMessages++;
        document.getElementById('chat-notification').classList.remove('hidden');
        document.getElementById('chat-icon').classList.add('chat-icon-pulse');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    let indicator = chatMessages.querySelector('.typing-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'typing-indicator message';
        indicator.innerHTML = `
            <div class="inline-block max-w-[80%] bg-white/5 rounded-lg px-4 py-2">
                <div class="flex space-x-1">
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function hideTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    const indicator = chatMessages.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function exportCurrentFile() {
    try {
        const currentFile = getCurrentFileName();
        if (!currentFile.name) {
            alert('No file to export!');
            return;
        }
        
        const content = editor.getValue();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        alert('Failed to export file: ' + error.message);
    }
}

function updatePeerFileActivity(filename, owner) {
    const key = `${owner}:${filename}`;
    peerActiveFiles.clear();
    peerActiveFiles.add(key);
    if (settings.showPeerActivity) renderFileList();
}

function clearPeerFileActivity() {
    peerActiveFiles.clear();
    if (settings.showPeerActivity) renderFileList();
}