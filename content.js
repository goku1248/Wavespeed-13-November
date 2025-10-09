// WebSocket connection management
let socket = null;
let currentUser = null;
let typingTimer = null;
let scrollTimer = null;

// Initialize WebSocket connection
function initializeWebSocket() {
    if (socket) {
        socket.disconnect();
    }
    
    // Load Socket.IO client library
    const script = document.createElement('script');
    // Load from backend server port
    script.src = 'http://localhost:3001/socket.io/socket.io.js';
    script.onload = () => {
        console.log('Socket.IO loaded, connecting...');
        connectWebSocket();
    };
    document.head.appendChild(script);
}

function connectWebSocket() {
    // Guard against mixed-content errors on HTTPS pages by skipping WS init if blocked
    try {
        socket = io('http://localhost:3001');
    } catch (e) {
        console.warn('Socket.IO connection skipped due to mixed content:', e?.message || e);
        return;
    }
    
    socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        if (currentUser) {
            socket.emit('join-page', {
                url: window.location.href,
                user: currentUser
            });
            // Also join user-specific room for direct messages
            socket.emit('join-user', { email: currentUser.email });
        }
    });
    
    // Listen for real-time events
    setupWebSocketListeners();
}

function setupWebSocketListeners() {
    // Live comment notifications
    socket.on('comment-added', (data) => {
        console.log('New comment received:', data);
        showNotification(`${data.comment.user.name} added a comment`, 'comment');
        // Refresh comments to show the new one
        refreshComments();
    });
    
    // Live reply notifications  
    socket.on('reply-added', (data) => {
        console.log('New reply received:', data);
        showNotification(`${data.reply.user.name} replied to a comment`, 'reply');
        refreshComments();
    });
    
    // Live reaction updates
    socket.on('reaction-updated', (data) => {
        console.log('Reaction updated:', data);
        updateReactionUI(data);
    });
    
    // Typing indicators
    socket.on('user-typing', (data) => {
        console.log('User typing:', data);
        showTypingIndicator(data);
    });
    
    // Active users
    socket.on('active-users', (users) => {
        console.log('Active users:', users);
        updateActiveUsersUI(users);
    });
    
    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        showNotification(`${data.user.name} joined the page`, 'user-join');
        updateActiveUsersCount(data.activeCount);
    });
    
    socket.on('user-left', (data) => {
        console.log('User left:', data);
        updateActiveUsersCount(data.activeCount);
    });
    
    // Collaborative cursors
    socket.on('user-scroll', (data) => {
        console.log('User scroll:', data);
        showCollaborativeCursor(data);
    });

    // Real-time direct messages
    socket.on('message-received', async (msg) => {
        console.log('Message received via socket:', msg);
        try {
            if (!msg || !currentUser) return;
            // If the open thread is with the sender, append and scroll
            const list = document.getElementById('messages-thread-list');
            const header = document.getElementById('messages-thread-header');
            const activeEmail = header && header.textContent?.startsWith('Chat with ')
                ? header.textContent.replace('Chat with ', '')
                : null;
            if (list && activeEmail && msg.from && msg.from.email === activeEmail) {
                const item = document.createElement('div');
                item.className = 'message-item from-them';
                item.textContent = msg.text;
                list.appendChild(item);
                list.scrollTop = list.scrollHeight;
            } else {
                // Increment badge on Messages tab (if not in messages section)
                if (activeSectionKey !== 'messages') {
                    const tabsBar = document.getElementById('sections-tabs');
                    const messagesTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="messages"]');
                    if (messagesTab) {
                        let badge = messagesTab.querySelector('.tab-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'tab-badge';
                            badge.textContent = '1';
                            messagesTab.appendChild(badge);
                        } else {
                            const n = parseInt(badge.textContent || '0', 10) || 0;
                            badge.textContent = String(n + 1);
                        }
                    }
                }
                // In-panel toast notification
                try {
                    showNotification(`${msg.from?.name || msg.from?.email || 'Someone'} messaged you`, 'message');
                } catch (_) {}
            }
        } catch (e) {
            console.warn('Failed to render incoming message:', e);
        }
    });

    socket.on('message-sent', async (msg) => {
        console.log('Message sent ack via socket:', msg);
        try {
            if (!msg || !currentUser) return;
            const list = document.getElementById('messages-thread-list');
            const header = document.getElementById('messages-thread-header');
            const activeEmail = header && header.textContent?.startsWith('Chat with ')
                ? header.textContent.replace('Chat with ', '')
                : null;
            if (list && activeEmail && msg.to && msg.to.email === activeEmail) {
                const item = document.createElement('div');
                item.className = 'message-item from-me';
                item.textContent = msg.text;
                list.appendChild(item);
                list.scrollTop = list.scrollHeight;
            }
        } catch (e) {
            console.warn('Failed to render sent message:', e);
        }
    });
}

// Create and inject the comments panel
async function createCommentsPanel() {
    console.log('Creating comments panel...');
    // Read persisted state before creating the panel to avoid flicker
    let initialIsMinimized = false;
    try {
        const result = await chrome.storage.local.get(['panelState']);
        initialIsMinimized = !!(result.panelState && result.panelState.isMinimized);
    } catch (e) {
        initialIsMinimized = false;
    }
    const panel = document.createElement('div');
    panel.id = 'webpage-comments-panel';
    panel.innerHTML = `
        <div id="comments-resizer"></div>
        <div class="comments-header" id="comments-header">
            <div class="header-left">
                <h3>💬 Comments</h3>
                <div id="user-info-header" class="user-info-header" style="display: none;">
                    <img id="user-avatar-header" class="user-avatar-header" src="" alt="User" />
                    <div class="user-details-header">
                        <div id="user-name-header" class="user-name-header"></div>
                        <div id="user-email-header" class="user-email-header"></div>
                    </div>
                </div>
            </div>
            <div class="comments-controls">
                <div class="custom-dropdown">
                    <button id="sort-dropdown-btn" class="sort-dropdown-btn">
                        <span id="sort-dropdown-text">Newest First</span>
                        <span class="dropdown-arrow">▼</span>
                    </button>
                    <div id="sort-dropdown-menu" class="sort-dropdown-menu">
                        <div class="dropdown-option" data-value="newest">Newest First</div>
                        <div class="dropdown-option" data-value="oldest">Oldest First</div>
                        <div class="dropdown-option" data-value="most-liked">Most Liked</div>
                        <div class="dropdown-option" data-value="most-disliked">Most Disliked</div>
                        <div class="dropdown-option" data-value="most-trusted">Most Trusted</div>
                        <div class="dropdown-option" data-value="most-distrusted">Most Distrusted</div>
                    </div>
                </div>
                <button id="minimize-comments" title="Minimize" style="font-size:28px; background:none; border:none; cursor:pointer;">-</button>
                <button id="maximize-comments" title="Maximize" style="font-size:24px; background:none; border:none; cursor:pointer; margin-left:4px;">⬜</button>
                <button id="close-comments" title="Close" style="font-size:20px; background:none; border:none; cursor:pointer; margin-left:4px; color:#ff4444;">✕</button>
            </div>
        </div>
        <div class="sections-tabs" id="sections-tabs">
            <button class="section-tab active" data-section="comments" title="Comments">💬</button>
            <button class="section-tab" data-section="messages" title="Messages">📨</button>
            <button class="section-tab" data-section="trending" title="Trending">🔥</button>
            <button class="section-tab" data-section="posts" title="Posts">📝</button>
            <button class="section-tab" data-section="followers" title="Followers">👥</button>
            <button class="section-tab" data-section="following" title="Following">➕</button>
            <button class="section-tab" data-section="search" title="Search">🔍</button>
            <button class="section-tab" data-section="notifications" title="Notifications">🔔</button>
            <button class="section-tab" data-section="profile" title="Profile">👤</button>
            <button class="section-tab" data-section="settings" title="Settings">⚙️</button>
        </div>
        <div class="sections-container hidden" id="sections-container">
            <div class="section-placeholder" data-section="messages">
                <div class="messages-panel-modern">
                    <div class="messages-sidebar-modern">
                        <div class="messages-header-modern">
                            <h4>Messages</h4>
                            <button id="new-message-btn" class="new-message-btn" title="New Message">✉️</button>
                        </div>
                        <div class="messages-search-modern">
                            <div class="search-input-wrapper">
                                <span class="search-icon">🔍</span>
                                <input id="messages-search-input" type="text" placeholder="Search conversations..." />
                            </div>
                        </div>
                        <div class="messages-tabs-modern">
                            <button id="direct-messages-tab" class="messages-tab-modern active">
                                <span class="tab-icon">💬</span>
                                <span>Chats</span>
                            </button>
                            <button id="group-messages-tab" class="messages-tab-modern">
                                <span class="tab-icon">👥</span>
                                <span>Groups</span>
                            </button>
                        </div>
                        <div id="conversations-list" class="conversations-list-modern"></div>
                        <div id="groups-list" class="groups-list-modern" style="display: none;">
                            <div class="groups-header-modern">
                                <button id="create-group-btn" class="create-group-btn-modern">
                                    <span>➕</span> Create New Group
                                </button>
                            </div>
                            <div id="groups-items" class="groups-items-modern"></div>
                        </div>
                    </div>
                    <div class="messages-thread-modern">
                        <div id="messages-thread-header" class="messages-thread-header-modern">
                            <div class="conversation-info">
                                <div class="conversation-avatar">👤</div>
                                <div class="conversation-details">
                                    <div class="conversation-name">Select a conversation</div>
                                    <div class="conversation-status">Start messaging</div>
                                </div>
                            </div>
                        </div>
                        <div id="messages-thread-list" class="messages-thread-list-modern"></div>
                        <div class="messages-input-modern">
                            <div class="input-actions">
                                <button class="input-action-btn" title="Attach">📎</button>
                                <button class="input-action-btn" title="Emoji">😊</button>
                            </div>
                            <input id="messages-input-text" type="text" placeholder="Type a message..." />
                            <button id="messages-send-btn" class="send-btn-modern">
                                <span>➤</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="trending">Trending coming soon</div>
            <div class="section-placeholder" data-section="posts">Posts coming soon</div>
            <div class="section-placeholder" data-section="followers">Followers coming soon</div>
            <div class="section-placeholder" data-section="following">Following coming soon</div>
            <div class="section-placeholder" data-section="search">Search coming soon</div>
            <div class="section-placeholder" data-section="notifications">Notifications coming soon</div>
            <div class="section-placeholder" data-section="profile">Profile coming soon</div>
            <div class="section-placeholder" data-section="settings">Settings coming soon</div>
        </div>
        <div class="comments-content">
            <div id="auth-message" class="auth-message hidden">
                Please sign in to add comments
            </div>
            <div id="comments-list"></div>
            <div class="comment-input-container">
                <div class="input-wrapper">
                    <textarea id="comment-input" placeholder="Add a comment..."></textarea>
                    <button class="emoji-btn" id="comment-emoji-btn">😊</button>
                    <button class="gif-btn" id="comment-gif-btn">🎬</button>
                </div>
                <button id="submit-comment">Post</button>
            </div>
        </div>
        <div id="comments-bottom-resizer"></div>
    `;
    // Apply initial minimized state BEFORE attaching to DOM to prevent flash
    panel.style.display = initialIsMinimized ? 'none' : 'flex';
    document.body.appendChild(panel);
    
    // Add emoji picker outside the panel to avoid clipping
    const emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-picker';
    emojiPicker.id = 'comment-emoji-picker';
    emojiPicker.style.display = 'none';
    emojiPicker.innerHTML = `
        <div class="emoji-categories">
            <button class="emoji-category active" data-category="smileys">😊</button>
            <button class="emoji-category" data-category="animals">🐶</button>
            <button class="emoji-category" data-category="food">🍕</button>
            <button class="emoji-category" data-category="activities">⚽</button>
            <button class="emoji-category" data-category="travel">🚗</button>
            <button class="emoji-category" data-category="objects">💡</button>
            <button class="emoji-category" data-category="symbols">❤️</button>
            <button class="emoji-category" data-category="flags">🏁</button>
        </div>
        <div class="emoji-grid" id="comment-emoji-grid"></div>
    `;
    document.body.appendChild(emojiPicker);
    
    // Add GIF picker outside the panel to avoid clipping
    const gifPicker = document.createElement('div');
    gifPicker.className = 'gif-picker';
    gifPicker.id = 'comment-gif-picker';
    gifPicker.style.display = 'none';
    gifPicker.innerHTML = `
        <div class="gif-search-container">
            <input type="text" class="gif-search-input" placeholder="Search GIFs..." id="comment-gif-search">
            <button class="gif-search-btn" id="comment-gif-search-btn">🔍</button>
        </div>
        <div class="gif-grid" id="comment-gif-grid"></div>
        <div class="gif-loading" id="comment-gif-loading" style="display: none;">Loading...</div>
    `;
    document.body.appendChild(gifPicker);

    // Set initial position
    panel.style.position = 'fixed';
    
    // Restore saved position and size state early (but not minimized state)
    await restorePanelPositionAndSize(panel);
    
    // Set default position if no saved state exists
    if (!panel.style.left && !panel.style.right) {
        panel.style.right = '20px';
        panel.style.top = '20px';
    }

    // Add resizer and drag functionality
    addPanelResizer(panel);
    addPanelBottomResizer(panel);
    addPanelDragger(panel);

    // Add event listeners
    // Minimize handler is set up later (after floating icon is created) to also persist state
    document.getElementById('close-comments').addEventListener('click', () => {
        // Remove the panel and floating icon completely
        panel.remove();
        const floatingIcon = document.getElementById('comments-floating-icon');
        if (floatingIcon) {
            floatingIcon.remove();
        }
        // Clear any stored panel state
        chrome.storage.local.remove(['panelState']);
    });
    document.getElementById('submit-comment').addEventListener('click', submitComment);
    
    // Add custom dropdown functionality
    const dropdownBtn = document.getElementById('sort-dropdown-btn');
    const dropdownMenu = document.getElementById('sort-dropdown-menu');
    const dropdownText = document.getElementById('sort-dropdown-text');
    
    if (dropdownBtn && dropdownMenu) {
        // Toggle dropdown menu
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
            console.log('Dropdown toggled');
        });
        
        // Handle option selection
        dropdownMenu.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-option');
            if (option) {
                const value = option.getAttribute('data-value');
                const text = option.textContent;
                
                console.log('Selected option:', value, text);
                
                // Update button text
                dropdownText.textContent = text;
                
                // Hide dropdown
                dropdownMenu.classList.remove('show');
                
                // Load comments with new sort
                loadComments(value);
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        });
    }

    // Sections tabs logic (top horizontal bar)
    const tabsBar = panel.querySelector('#sections-tabs');
    const tabs = tabsBar ? tabsBar.querySelectorAll('.section-tab') : [];
    const sectionsContainer = panel.querySelector('#sections-container');
    const commentsContentEl = panel.querySelector('.comments-content');
    const sortControlsEl = panel.querySelector('.custom-dropdown');

    // Messages state
    let selectedConversationEmail = null;
    let selectedGroupId = null;
    let selectedGroupName = null;
    let messagesPollTimer = null;
    let conversationsPollTimer = null;
    let groupsPollTimer = null;
    let messagesLastSeenByOther = {};
    let activeSectionKey = 'comments';
    let currentMessagesTab = 'direct'; // 'direct' or 'groups'

    function renderConversations(conversations) {
        const list = document.getElementById('conversations-list');
        if (!list) return;
        list.innerHTML = '';
        
        if (conversations.length === 0) {
            list.innerHTML = `
                <div class="empty-state-modern">
                    <div class="icon">💬</div>
                    <h3>No messages yet</h3>
                    <p>Search for users to start a conversation</p>
                </div>
            `;
            return;
        }
        
        conversations.forEach((c) => {
            const lastMsg = c.lastMessage;
            const other = c.otherEmail || (lastMsg && (lastMsg.from.email === currentUser?.email ? lastMsg.to.email : lastMsg.from.email));
            const otherName = lastMsg ? (lastMsg.from.email === currentUser?.email ? lastMsg.to.name : lastMsg.from.name) : other;
            const otherPicture = lastMsg ? (lastMsg.from.email === currentUser?.email ? lastMsg.to.picture : lastMsg.from.picture) : null;
            const messagePreview = lastMsg ? lastMsg.text.substring(0, 50) : 'No messages yet';
            const timestamp = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            
            const btn = document.createElement('button');
            btn.className = 'conversation-item-modern';
            btn.innerHTML = `
                <div class="conversation-avatar-modern">
                    ${otherPicture ? `<img src="${otherPicture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}
                </div>
                <div class="conversation-info-modern">
                    <div class="conversation-name-modern">
                        <span>${otherName || other}</span>
                        <span class="conversation-time">${timestamp}</span>
                    </div>
                    <div class="conversation-preview">${messagePreview}</div>
                </div>
            `;
            btn.addEventListener('click', async () => {
                selectedConversationEmail = other;
                await loadThread(other);
                // Mark as active
                document.querySelectorAll('.conversation-item-modern').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
            list.appendChild(btn);
        });
    }

    async function fetchConversations() {
        if (!currentUser?.email) return [];
        const response = await apiFetch(`${API_BASE_URL}/messages/conversations?email=${encodeURIComponent(currentUser.email)}`);
        if (response?.ok) {
            try { return JSON.parse(response.body || '[]'); } catch (_) { return []; }
        }
        return [];
    }

    async function fetchGroups() {
        if (!currentUser?.email) return [];
        const response = await apiFetch(`${API_BASE_URL}/groups?email=${encodeURIComponent(currentUser.email)}`);
        if (response?.ok) {
            try { return JSON.parse(response.body || '[]'); } catch (_) { return []; }
        }
        return [];
    }

    function renderGroups(groups) {
        const list = document.getElementById('groups-items');
        if (!list) return;
        list.innerHTML = '';
        
        if (groups.length === 0) {
            list.innerHTML = `
                <div class="empty-state-modern">
                    <div class="icon">👥</div>
                    <h3>No groups yet</h3>
                    <p>Create a group to start chatting with multiple people</p>
                </div>
            `;
            return;
        }
        
        groups.forEach((group) => {
            const btn = document.createElement('button');
            btn.className = 'group-item-modern';
            btn.innerHTML = `
                <div class="conversation-avatar-modern">👥</div>
                <div class="conversation-info-modern">
                    <div class="conversation-name-modern">${group.name}</div>
                    <div class="conversation-preview">${group.members.length} members</div>
                </div>
            `;
            btn.addEventListener('click', async () => {
                selectedGroupId = group._id;
                selectedGroupName = group.name;
                selectedConversationEmail = null; // Clear direct message selection
                await loadGroupThread(group._id, group.name);
                // Mark as active
                document.querySelectorAll('.group-item-modern').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
            list.appendChild(btn);
        });
    }

    async function loadGroupThread(groupId, groupName) {
        const header = document.getElementById('messages-thread-header');
        const list = document.getElementById('messages-thread-list');
        if (!groupId || !currentUser?.email || !list) return;
        
        const response = await apiFetch(`${API_BASE_URL}/groups/${groupId}/messages?userEmail=${encodeURIComponent(currentUser.email)}&limit=100`);
        let messages = [];
        if (response?.ok) { 
            try { messages = JSON.parse(response.body || '[]'); } catch (_) {} 
        }
        
        // Update header for group
        if (header) {
            header.innerHTML = `
                <div class="conversation-info">
                    <div class="conversation-avatar">👥</div>
                    <div class="conversation-details">
                        <div class="conversation-name">${groupName}</div>
                        <div class="conversation-status">Group chat</div>
                    </div>
                </div>
            `;
        }
        
        // Render group messages with modern bubbles
        list.innerHTML = '';
        messages.forEach((msg) => {
            const item = document.createElement('div');
            const isFromMe = msg.from.email === currentUser.email;
            item.className = `message-bubble-modern ${isFromMe ? 'sent' : 'received'}`;
            const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            item.innerHTML = `
                ${!isFromMe ? `<div style="font-size: 11px; font-weight: 600; color: #65676b; margin-bottom: 2px;">${msg.from.name || msg.from.email}</div>` : ''}
                <div>${msg.text}</div>
                <div class="message-time">${time}</div>
            `;
            list.appendChild(item);
        });
        list.scrollTop = list.scrollHeight;
    }

    async function createGroup() {
        const name = prompt('Enter group name:');
        if (!name || !name.trim()) return;
        
        const description = prompt('Enter group description (optional):') || '';
        
        if (!currentUser) {
            alert('Please log in to create a group');
            return;
        }
        
        try {
            const response = await apiFetch(`${API_BASE_URL}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: {
                    name: name.trim(),
                    description: description.trim(),
                    createdBy: currentUser,
                    members: [] // Start with just the creator
                }
            });
            
            if (response?.ok) {
                // Refresh groups list
                const groups = await fetchGroups();
                renderGroups(groups);
                alert('Group created successfully!');
            } else {
                alert('Failed to create group');
            }
        } catch (error) {
            console.error('Error creating group:', error);
            alert('Error creating group: ' + error.message);
        }
    }

    function updateMessagesBadge(unreadCount) {
        const tabsBar = document.getElementById('sections-tabs');
        const messagesTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="messages"]');
        if (!messagesTab) return;
        let badge = messagesTab.querySelector('.tab-badge');
        if (unreadCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'tab-badge';
                messagesTab.appendChild(badge);
            }
            badge.textContent = String(unreadCount);
        } else if (badge) {
            badge.remove();
        }
    }

    async function loadThread(otherEmail) {
        const header = document.getElementById('messages-thread-header');
        const list = document.getElementById('messages-thread-list');
        if (!otherEmail || !currentUser?.email || !list) return;
        
        const response = await apiFetch(`${API_BASE_URL}/messages?userEmail=${encodeURIComponent(currentUser.email)}&otherEmail=${encodeURIComponent(otherEmail)}&limit=100`);
        let messages = [];
        if (response?.ok) { try { messages = JSON.parse(response.body || '[]'); } catch (_) {} }
        
        // Get user info from messages or use email
        const otherName = messages.length > 0 ? (messages[0].from.email === otherEmail ? messages[0].from.name : messages[0].to.name) : otherEmail;
        const otherPicture = messages.length > 0 ? (messages[0].from.email === otherEmail ? messages[0].from.picture : messages[0].to.picture) : null;
        
        // Update header with modern design
        if (header) {
            header.innerHTML = `
                <div class="conversation-info">
                    <div class="conversation-avatar">
                        ${otherPicture ? `<img src="${otherPicture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-name">${otherName || otherEmail}</div>
                        <div class="conversation-status online">Active now</div>
                    </div>
                </div>
            `;
        }
        
        // Render messages with modern bubbles
        list.innerHTML = '';
        messages.forEach((m) => {
            const item = document.createElement('div');
            const isFromMe = m.from?.email === currentUser.email;
            item.className = `message-bubble-modern ${isFromMe ? 'sent' : 'received'}`;
            const time = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            item.innerHTML = `
                <div>${m.text}</div>
                <div class="message-time">${time}</div>
            `;
            list.appendChild(item);
        });
        list.scrollTop = list.scrollHeight;

        // Update last-seen for this conversation
        try {
            const latestTs = messages.length ? new Date(messages[messages.length - 1].timestamp).getTime() : Date.now();
            messagesLastSeenByOther[otherEmail] = latestTs;
            await chrome.storage.local.set({ messagesLastSeenByOther });
            // Clear badge since thread is open
            updateMessagesBadge(0);
        } catch (_) {}
    }

    async function sendMessage() {
        const input = document.getElementById('messages-input-text');
        if (!input || !input.value.trim() || !currentUser) return;
        
        const text = input.value.trim();
        let payload;
        
        if (selectedGroupId) {
            // Send group message
            payload = { 
                from: currentUser, 
                text, 
                groupId: selectedGroupId, 
                groupName: selectedGroupName 
            };
        } else if (selectedConversationEmail) {
            // Send direct message
            payload = { 
                from: currentUser, 
                to: { email: selectedConversationEmail }, 
                text 
            };
        } else {
            return; // No conversation selected
        }
        
        const res = await apiFetch(`${API_BASE_URL}/messages`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: payload 
        });
        
        if (res?.ok) {
            input.value = '';
            if (selectedGroupId) {
                await loadGroupThread(selectedGroupId, selectedGroupName);
            } else {
                await loadThread(selectedConversationEmail);
            }
        }
    }

    function clearMessagePolling() {
        if (messagesPollTimer) { clearInterval(messagesPollTimer); messagesPollTimer = null; }
        if (conversationsPollTimer) { clearInterval(conversationsPollTimer); conversationsPollTimer = null; }
        if (groupsPollTimer) { clearInterval(groupsPollTimer); groupsPollTimer = null; }
    }

    function switchMessagesTab(tab) {
        currentMessagesTab = tab;
        const directTab = document.getElementById('direct-messages-tab');
        const groupsTab = document.getElementById('group-messages-tab');
        const conversationsList = document.getElementById('conversations-list');
        const groupsList = document.getElementById('groups-list');
        
        if (tab === 'direct') {
            directTab?.classList.add('active');
            groupsTab?.classList.remove('active');
            conversationsList?.style.setProperty('display', 'block');
            groupsList?.style.setProperty('display', 'none');
        } else {
            directTab?.classList.remove('active');
            groupsTab?.classList.add('active');
            conversationsList?.style.setProperty('display', 'none');
            groupsList?.style.setProperty('display', 'block');
        }
    }

    async function initMessagesUI() {
        const sendBtn = document.getElementById('messages-send-btn');
        const input = document.getElementById('messages-input-text');
        const searchInput = document.getElementById('messages-search-input');
        const directTab = document.getElementById('direct-messages-tab');
        const groupsTab = document.getElementById('group-messages-tab');
        const createGroupBtn = document.getElementById('create-group-btn');
        
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
        if (directTab) directTab.addEventListener('click', () => switchMessagesTab('direct'));
        if (groupsTab) groupsTab.addEventListener('click', () => switchMessagesTab('groups'));
        if (createGroupBtn) createGroupBtn.addEventListener('click', createGroup);
        if (searchInput) {
            async function handleSearch() {
                const q = (searchInput.value || '').trim();
                if (!q) {
                    // If search is cleared, reload conversations
                    const convs = await fetchConversations();
                    renderConversations(convs);
                    return;
                }
                // Query users for prefix match and unique detection
                const res = await apiFetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(q)}`);
                if (res?.ok) {
                    let payload = {};
                    try { payload = JSON.parse(res.body || '{}'); } catch (_) {}
                    const unique = payload.unique;
                    const results = payload.results || [];
                    const list = document.getElementById('conversations-list');
                    
                    if (unique && unique.email) {
                        // Show the resolved username immediately and select conversation
                        selectedConversationEmail = unique.email;
                        await loadThread(unique.email);
                        // Prepend to conversations list for quick access
                        if (list) {
                            const btn = document.createElement('button');
                            btn.className = 'conversation-item-modern';
                            btn.innerHTML = `
                                <div class="conversation-avatar-modern">${unique.picture ? `<img src="${unique.picture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}</div>
                                <div class="conversation-info-modern">
                                    <div class="conversation-name-modern">${unique.name || unique.email}</div>
                                    <div class="conversation-preview">${unique.email}</div>
                                </div>
                            `;
                            btn.addEventListener('click', async () => {
                                selectedConversationEmail = unique.email;
                                await loadThread(unique.email);
                            });
                            list.prepend(btn);
                        }
                    } else if (results.length > 0) {
                        // Render top results for disambiguation
                        if (list) {
                            list.innerHTML = '';
                            results.forEach((u) => {
                                const btn = document.createElement('button');
                                btn.className = 'conversation-item-modern';
                                btn.innerHTML = `
                                    <div class="conversation-avatar-modern">${u.picture ? `<img src="${u.picture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}</div>
                                    <div class="conversation-info-modern">
                                        <div class="conversation-name-modern">${u.name || u.email}</div>
                                        <div class="conversation-preview">${u.email}</div>
                                    </div>
                                `;
                                btn.addEventListener('click', async () => {
                                    selectedConversationEmail = u.email;
                                    await loadThread(u.email);
                                });
                                list.appendChild(btn);
                            });
                        }
                    } else {
                        // No results found
                        if (list) {
                            list.innerHTML = `
                                <div class="empty-state-modern">
                                    <div class="icon">🔍</div>
                                    <h3>No users found</h3>
                                    <p>The user "${q}" hasn't used Wavespeed yet. They need to install the extension first.</p>
                                </div>
                            `;
                        }
                    }
                }
            }
            // Trigger search on Enter key
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleSearch();
                }
            });
            
            // Real-time search as user types
            let searchTimeout;
            searchInput.addEventListener('input', async () => {
                const q = (searchInput.value || '').trim();
                
                // Clear previous timeout
                if (searchTimeout) clearTimeout(searchTimeout);
                
                // If empty, clear search immediately
                if (q.length === 0) {
                    const convs = await fetchConversations();
                    renderConversations(convs);
                    return;
                }
                
                // Debounce search for better performance
                if (q.length < 2) return;
                
                searchTimeout = setTimeout(async () => {
                    await handleSearch();
                }, 300); // Wait 300ms after user stops typing
            });
        }
        // Register/update the user to ensure they are searchable
        if (currentUser?.email) {
            apiFetch(`${API_BASE_URL}/users/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: { email: currentUser.email, name: currentUser.name, picture: currentUser.picture }
            }).catch(() => {});
        }

        // Load last-seen map
        try {
            const stored = await chrome.storage.local.get(['messagesLastSeenByOther']);
            messagesLastSeenByOther = stored?.messagesLastSeenByOther || {};
        } catch (_) { messagesLastSeenByOther = {}; }

        // initial data
        fetchConversations().then(renderConversations);
        fetchGroups().then(renderGroups);

        // Start polling conversations every 12s
        clearMessagePolling();
        conversationsPollTimer = setInterval(async () => {
            const convs = await fetchConversations();
            renderConversations(convs);
            // Compute unread if not on messages section
            if (activeSectionKey !== 'messages') {
                let unread = 0;
                convs.forEach((c) => {
                    const other = c.otherEmail || (c.lastMessage && (c.lastMessage.from.email === currentUser?.email ? c.lastMessage.to.email : c.lastMessage.from.email));
                    const lastSeen = messagesLastSeenByOther[other] || 0;
                    const msgTs = c.lastMessage ? new Date(c.lastMessage.timestamp).getTime() : 0;
                    if (other && msgTs > lastSeen) unread += 1;
                });
                updateMessagesBadge(unread);
            }
        }, 12000);

        // Start polling groups every 15s
        groupsPollTimer = setInterval(async () => {
            const groups = await fetchGroups();
            renderGroups(groups);
        }, 15000);

        // Start polling current thread every 3s
        messagesPollTimer = setInterval(async () => {
            if (selectedConversationEmail) {
                await loadThread(selectedConversationEmail);
            }
        }, 3000);
    }

    async function setActiveSection(sectionKey) {
        activeSectionKey = sectionKey;
        // Update tab active state
        tabs.forEach((btn) => {
            const isActive = btn.getAttribute('data-section') === sectionKey;
            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle containers: show comments for 'comments', else show sections container
        if (sectionKey === 'comments') {
            if (sectionsContainer) sectionsContainer.classList.add('hidden');
            if (commentsContentEl) commentsContentEl.style.display = 'block';
            if (sortControlsEl) sortControlsEl.style.display = '';
        } else {
            if (sectionsContainer) sectionsContainer.classList.remove('hidden');
            if (commentsContentEl) commentsContentEl.style.display = 'none';
            if (sortControlsEl) sortControlsEl.style.display = 'none';

            // Show only the selected placeholder inside sections container
            if (sectionsContainer) {
                const allPlaceholders = sectionsContainer.querySelectorAll('.section-placeholder');
                allPlaceholders.forEach((el) => {
                    const match = el.getAttribute('data-section') === sectionKey;
                    el.style.display = match ? 'block' : 'none';
                });
            }

            // Initialize messages UI when entering messages tab
            if (sectionKey === 'messages') {
                // Clear badge when opening messages
                const tabsBar = document.getElementById('sections-tabs');
                const messagesTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="messages"]');
                if (messagesTab) {
                    const badge = messagesTab.querySelector('.tab-badge');
                    if (badge) badge.remove();
                }
                initMessagesUI();
            } else {
                // Leaving messages: stop polling
                clearMessagePolling();
            }
        }

        try {
            const state = await chrome.storage.local.get(['activeSection']);
            await chrome.storage.local.set({ activeSection: sectionKey });
        } catch (e) {}
    }

    // Initialize active section from storage
    try {
        chrome.storage.local.get(['activeSection']).then((res) => {
            const initial = res && res.activeSection ? res.activeSection : 'comments';
            setActiveSection(initial);
        }).catch(() => setActiveSection('comments'));
    } catch (e) {
        setActiveSection('comments');
    }

    // Wire click handlers
    if (tabs && tabs.length) {
        tabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-section') || 'comments';
                setActiveSection(key);
            });
        });
    }

    // Add window resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce the resize handler to improve performance
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            ensurePanelInViewport(panel);
        }, 100);
    });

    // Initial viewport check
    ensurePanelInViewport(panel);

    // Load existing comments
    await loadComments();
    await checkAuthStatus();
    
    // Initialize emoji picker functionality
    initializeEmojiPicker();
    
    // Initialize GIF picker functionality
    initializeGifPicker();

    // Add floating icon for minimized state
    const floatingIcon = document.createElement('div');
    floatingIcon.id = 'comments-floating-icon';
    floatingIcon.title = 'Show Comments';
    floatingIcon.innerHTML = '💬';
    floatingIcon.style.display = initialIsMinimized ? 'flex' : 'none';
    document.body.appendChild(floatingIcon);

    // Add minimize/restore logic after panel is added to DOM
    setTimeout(async () => {
        const panel = document.getElementById('webpage-comments-panel');
        const minimizeBtn = document.getElementById('minimize-comments');
        const maximizeBtn = document.getElementById('maximize-comments');
        const closeBtn = document.getElementById('close-comments');
        const floatingIcon = document.getElementById('comments-floating-icon');
        
        // Store state in panel data attributes for persistence
        if (!panel.dataset.isMaximized) {
            panel.dataset.isMaximized = 'false';
        }
        
        // Minimized state already restored above
        
        if (minimizeBtn && panel && floatingIcon) {
            minimizeBtn.addEventListener('click', async () => {
                panel.style.display = 'none';
                floatingIcon.style.display = 'flex';
                // Save minimized state
                await savePanelState(panel, true);
            });
            floatingIcon.addEventListener('click', async () => {
                panel.style.display = 'flex';
                floatingIcon.style.display = 'none';
                // Save restored state
                await savePanelState(panel, false);
            });
        }
        
        if (maximizeBtn && panel) {
            maximizeBtn.addEventListener('click', () => {
                const isMaximized = panel.dataset.isMaximized === 'true';
                
                if (!isMaximized) {
                    // Save current state before maximizing
                    const currentRect = panel.getBoundingClientRect();
                    panel.dataset.prevStyle = JSON.stringify({
                        top: panel.style.top,
                        left: panel.style.left,
                        right: panel.style.right,
                        bottom: panel.style.bottom,
                        width: panel.style.width,
                        height: panel.style.height,
                        borderRadius: panel.style.borderRadius,
                        boxShadow: panel.style.boxShadow,
                        position: panel.style.position,
                        zIndex: panel.style.zIndex,
                        // Store computed dimensions as fallback
                        computedWidth: currentRect.width + 'px',
                        computedHeight: currentRect.height + 'px',
                        computedLeft: currentRect.left + 'px',
                        computedTop: currentRect.top + 'px'
                    });
                    
                    // Maximize
                    panel.style.position = 'fixed';
                    panel.style.top = '0';
                    panel.style.left = '0';
                    panel.style.right = '0';
                    panel.style.bottom = '0';
                    panel.style.width = '100vw';
                    panel.style.height = '100vh';
                    panel.style.borderRadius = '0';
                    panel.style.boxShadow = 'none';
                    panel.style.zIndex = '2147483647';
                    maximizeBtn.textContent = '🗗';
                    panel.dataset.isMaximized = 'true';
                } else {
                    // Restore previous state
                    try {
                        const prevStyle = JSON.parse(panel.dataset.prevStyle || '{}');
                        
                        // Restore position and dimensions
                        panel.style.position = prevStyle.position || 'fixed';
                        panel.style.top = prevStyle.top || prevStyle.computedTop || '20px';
                        panel.style.left = prevStyle.left || prevStyle.computedLeft || '';
                        panel.style.right = prevStyle.right || '';
                        panel.style.bottom = prevStyle.bottom || '';
                        panel.style.width = prevStyle.width || prevStyle.computedWidth || '300px';
                        panel.style.height = prevStyle.height || prevStyle.computedHeight || '500px';
                        panel.style.borderRadius = prevStyle.borderRadius || '8px';
                        panel.style.boxShadow = prevStyle.boxShadow || '0 2px 10px rgba(0, 0, 0, 0.1)';
                        panel.style.zIndex = prevStyle.zIndex || '2147483647';
                        
                        maximizeBtn.textContent = '⬜';
                        panel.dataset.isMaximized = 'false';
                        
                        // Ensure panel is within viewport after restore
                        ensurePanelInViewport(panel);
                        savePanelState(panel);
                    } catch (error) {
                        console.error('Error restoring panel state:', error);
                        // Fallback to default state
                        panel.style.position = 'fixed';
                        panel.style.top = '20px';
                        panel.style.right = '20px';
                        panel.style.width = '300px';
                        panel.style.height = '500px';
                        panel.style.borderRadius = '8px';
                        panel.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
                        panel.style.zIndex = '2147483647';
                        maximizeBtn.textContent = '⬜';
                        panel.dataset.isMaximized = 'false';
                    }
                }
            });
        }
        
        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                // Remove the panel and floating icon completely
                panel.remove();
                const floatingIcon = document.getElementById('comments-floating-icon');
                if (floatingIcon) {
                    floatingIcon.remove();
                }
                // Clear any stored panel state
                chrome.storage.local.remove(['panelState']);
            });
        }
    }, 100);
}

function addPanelResizer(panel) {
    const resizer = panel.querySelector('#comments-resizer');
    console.log('Resizer element:', resizer);
    
    if (!resizer) {
        console.error('Resizer element not found!');
        return;
    }
    
    let minWidth = 220;
    let maxWidth = 0;

    resizer.addEventListener('mousedown', function(e) {
        console.log('Resizer mousedown event triggered');
        const panelRect = panel.getBoundingClientRect();
        const startX = e.clientX;
        const startLeft = panelRect.left;
        const startWidth = panelRect.width;
        minWidth = 220;
        maxWidth = window.innerWidth;
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        e.stopPropagation();

        function onMouseMove(e) {
            let deltaX = e.clientX - startX;
            let newLeft = startLeft + deltaX;
            let newWidth = startWidth - deltaX;
            // Clamp
            if (newLeft < 0) {
                newWidth += newLeft;
                newLeft = 0;
            }
            newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
            if (newWidth === minWidth) {
                newLeft = startLeft + (startWidth - minWidth);
            }
            panel.style.left = newLeft + 'px';
            panel.style.width = newWidth + 'px';
        }

        function onMouseUp() {
            console.log('Resizer mouseup event triggered');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            savePanelState(panel);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
    
    // Add click event for debugging
    resizer.addEventListener('click', function(e) {
        console.log('Resizer clicked');
    });
}

function addPanelBottomResizer(panel) {
    const resizer = panel.querySelector('#comments-bottom-resizer');
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        startY = e.clientY;
        startHeight = panel.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        let newHeight = startHeight + (e.clientY - startY);
        const panelRect = panel.getBoundingClientRect();
        const bottomEdge = panelRect.bottom;
        const viewportHeight = window.innerHeight;
        const minHeight = 300;
        const maxHeight = Math.min(800, viewportHeight - panelRect.top - 20);
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        panel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            savePanelState(panel);
        }
    });
}

function addPanelDragger(panel) {
    const header = panel.querySelector('#comments-header');
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', function(e) {
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.right = 'unset';
        document.body.style.cursor = 'move';
        e.preventDefault();

        function onMouseMove(e) {
            if (!isDragging) return;
            let newLeft = startLeft + (e.clientX - startX);
            let newTop = startTop + (e.clientY - startY);
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        }

        function onMouseUp() {
            isDragging = false;
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            ensurePanelInViewport(panel);
            savePanelState(panel);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

// Toggle comments panel visibility
function toggleComments() {
    const panel = document.getElementById('webpage-comments-panel');
    const content = panel.querySelector('.comments-content');
    const toggleBtn = document.getElementById('toggle-comments');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggleBtn.textContent = '−';
    } else {
        content.style.display = 'none';
        toggleBtn.textContent = '+';
    }
    savePanelState(panel);
}

// Check authentication status
async function checkAuthStatus() {
    const authMessage = document.getElementById('auth-message');
    const commentInput = document.getElementById('comment-input');
    const submitButton = document.getElementById('submit-comment');
    
    try {
        const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
        const isAuthenticated = result.isAuthenticated || false;
        
        if (isAuthenticated) {
            currentUser = result.user;
            authMessage.classList.add('hidden');
            commentInput.disabled = false;
            submitButton.disabled = false;
            
            // Update user info in header
            const userInfoHeader = document.getElementById('user-info-header');
            const userAvatarHeader = document.getElementById('user-avatar-header');
            const userNameHeader = document.getElementById('user-name-header');
            const userEmailHeader = document.getElementById('user-email-header');
            
            if (userInfoHeader && currentUser) {
                userInfoHeader.style.display = 'flex';
                if (userAvatarHeader && currentUser.picture) {
                    userAvatarHeader.src = currentUser.picture;
                }
                if (userNameHeader && currentUser.name) {
                    userNameHeader.textContent = currentUser.name;
                }
                if (userEmailHeader && currentUser.email) {
                    userEmailHeader.textContent = currentUser.email;
                }
            }
            
            // Initialize WebSocket if user is authenticated
            if (!socket) {
                initializeWebSocket();
            } else if (socket.connected) {
                socket.emit('join-page', {
                    url: window.location.href,
                    user: currentUser
                });
            }
        } else {
            currentUser = null;
            authMessage.classList.remove('hidden');
            commentInput.disabled = true;
            submitButton.disabled = true;
            
            // Hide user info in header
            const userInfoHeader = document.getElementById('user-info-header');
            if (userInfoHeader) {
                userInfoHeader.style.display = 'none';
            }
            
            // Disconnect WebSocket if not authenticated
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }
    } catch (error) {
        console.error('Failed to check auth status:', error);
    }
}

// Helper: Create a new comment object
function createComment({text, user, timestamp}) {
    return {
        text,
        timestamp,
        user,
        likes: 0,
        dislikes: 0,
        likedBy: [],
        dislikedBy: [],
        replies: []
    };
}

const API_BASE_URL = 'http://localhost:3001/api';
// Base server URL (without /api) for endpoints like /health
const SERVER_BASE_URL = 'http://localhost:3001';

// Server health check function
async function checkServerHealth() {
    try {
        const response = await apiFetch(`${SERVER_BASE_URL}/health`);
        return response && response.ok;
    } catch (error) {
        console.log('Server health check failed:', error.message);
        return false;
    }
}

// Background-proxied fetch to avoid mixed content/CORS on HTTPS pages
async function apiFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Add timeout to prevent hanging requests
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout - server may be unavailable'));
            }, 15000); // 15 second timeout
            
            chrome.runtime.sendMessage({ action: 'apiFetch', url, options }, (response) => {
                clearTimeout(timeout);
                
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message;
                    console.error('Chrome runtime error:', errorMsg);
                    
                    // Provide more specific error messages
                    if (errorMsg.includes('Extension context invalidated')) {
                        reject(new Error('Extension needs to be reloaded. Please refresh the page.'));
                    } else if (errorMsg.includes('Receiving end does not exist')) {
                        reject(new Error('Background service unavailable. Please refresh the page.'));
                    } else {
                        reject(new Error(`Extension error: ${errorMsg}`));
                    }
                    return;
                }
                
                if (!response) {
                    reject(new Error('No response received from background script'));
                    return;
                }
                
                resolve(response);
            });
        } catch (err) {
            console.error('apiFetch error:', err);
            reject(new Error(`Network error: ${err.message}`));
        }
    });
}

// Add this at the top of the file with other global variables
let currentSortBy = 'newest';

// Track expanded replies state
let expandedReplies = new Set();

// Load and display comments with retry logic
async function loadComments(sortBy = currentSortBy, retryCount = 0) {
    console.log('Loading comments with sort:', sortBy, retryCount > 0 ? `(retry ${retryCount})` : '');
    currentSortBy = sortBy;
    const commentsList = document.getElementById('comments-list');
    const sortDropdown = document.getElementById('sort-comments');
    const currentUrl = window.location.href;
    let userEmail = null;
    
    if (sortDropdown) {
        sortDropdown.value = sortBy;
    }
    
    // Show loading state
    if (commentsList && retryCount === 0) {
        commentsList.innerHTML = `
            <div class="loading-message" style="text-align: center; padding: 20px; color: #666;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <div style="margin-top: 10px;">Loading comments...</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>`;
    }
    
    try {
        const authResult = await chrome.storage.local.get(['user']);
        userEmail = authResult.user ? authResult.user.email : null;
        console.log('Current user:', userEmail);
    } catch (error) {
        console.error('Error getting user:', error);
    }

    try {
        console.log('Fetching comments for URL:', currentUrl);
        const response = await apiFetch(`${API_BASE_URL}/comments?url=${encodeURIComponent(currentUrl)}`);
        
        if (!response || response.error) {
            const message = response?.error || 'Unknown error';
            console.error('Background apiFetch failed:', message);
            
            // Check if this is a network error that might be retryable
            if (retryCount < 3 && (message.includes('fetch') || message.includes('network') || message.includes('timeout'))) {
                console.log(`Retrying in ${(retryCount + 1) * 2} seconds...`);
                setTimeout(() => loadComments(sortBy, retryCount + 1), (retryCount + 1) * 2000);
                return;
            }
            
            throw new Error(`Failed to load comments: ${message}`);
        }
        
        if (!response.ok) {
            console.error('Server response not OK:', {
                status: response.status,
                statusText: response.statusText,
                body: response.body
            });
            
            // Retry on server errors (5xx) or temporary issues
            if (retryCount < 2 && (response.status >= 500 || response.status === 429)) {
                console.log(`Retrying due to server error ${response.status} in ${(retryCount + 1) * 3} seconds...`);
                setTimeout(() => loadComments(sortBy, retryCount + 1), (retryCount + 1) * 3000);
                return;
            }
            
            throw new Error(`Failed to load comments: ${response.body || response.statusText || 'Request failed'}`);
        }
        
        let comments = [];
        try {
            comments = JSON.parse(response.body || '[]');
        } catch (e) {
            console.error('Failed to parse comments JSON:', response.body);
            throw new Error('Invalid response format from server');
        }
        console.log('Received comments:', comments);
        console.log('Raw comments data structure:', JSON.stringify(comments, null, 2));
        
        if (!Array.isArray(comments)) {
            console.error('Invalid comments data received:', comments);
            throw new Error('Invalid response format from server');
        }

        comments = sortComments(comments, sortBy);
        console.log('Sorted comments by:', sortBy);

        if (comments.length === 0) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
            return;
        }

        commentsList.innerHTML = renderComments(comments, userEmail, currentUrl);
        console.log('Comments rendered successfully');
        addRepliesToggleListeners();
        
        // Restore expanded replies state after rendering
        restoreExpandedRepliesState();

        // Debug: Check all reply buttons after rendering
        const allReplyButtons = document.querySelectorAll('.reply-btn');
        console.log('Found', allReplyButtons.length, 'reply buttons');
        allReplyButtons.forEach((btn, index) => {
            console.log(`Reply button ${index}:`, {
                html: btn.outerHTML,
                'data-comment-id': btn.getAttribute('data-comment-id'),
                'data-parent-reply-id': btn.getAttribute('data-parent-reply-id'),
                hasParentReplyId: btn.hasAttribute('data-parent-reply-id')
            });
        });

        // A single, unified event listener for all reply buttons
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('=== REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': this.getAttribute('data-parent-reply-id'),
                    'class': this.className
                });
                
                const commentId = this.getAttribute('data-comment-id');
                const parentReplyIdAttr = this.getAttribute('data-parent-reply-id');
                
                console.log('Raw attributes:', {
                    commentId,
                    parentReplyIdAttr,
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': this.getAttribute('data-parent-reply-id'),
                    'has-data-parent-reply-id': this.hasAttribute('data-parent-reply-id')
                });
                
                // Check if this is a reply to a comment (top-level) or to another reply (nested)
                const isNestedReply = parentReplyIdAttr !== null && 
                                    parentReplyIdAttr !== undefined && 
                                    parentReplyIdAttr !== 'undefined' && 
                                    parentReplyIdAttr !== '' &&
                                    this.hasAttribute('data-parent-reply-id');
                
                const parentReplyId = isNestedReply ? parentReplyIdAttr : 'root';
                const containerId = isNestedReply ? parentReplyIdAttr : commentId;
                
                console.log('Reply button clicked. Data:', { 
                    commentId, 
                    parentReplyId, 
                    containerId, 
                    isNestedReply,
                    parentReplyIdAttr,
                    buttonElement: this,
                    buttonHTML: this.outerHTML
                });
                console.log('Button attributes:', {
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': parentReplyIdAttr,
                    'has-data-parent-reply-id': isNestedReply,
                    'all-attributes': Array.from(this.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
                });

                showReplyInput(commentId, containerId, parentReplyId);
            });
        });

        // Add event listeners for comment actions
        document.querySelectorAll('.comment > .comment-actions .like-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'like');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .dislike-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'dislike');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .trust-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'trust');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .distrust-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'distrust');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .flag-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'flag');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const commentId = this.getAttribute('data-comment-id');
                showEditInput(commentId);
            });
        });
        document.querySelectorAll('.comment > .comment-actions .delete-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                if (confirm('Are you sure you want to delete this comment and all its replies?')) {
                    await deleteComment(commentId);
                }
            });
        });

        // Add event listeners for reply actions (handles all reply levels)
        const replyLikeButtons = document.querySelectorAll('.reply .like-reply-btn');
        const replyDislikeButtons = document.querySelectorAll('.reply .dislike-reply-btn');
        const replyTrustButtons = document.querySelectorAll('.reply .trust-reply-btn');
        const replyDistrustButtons = document.querySelectorAll('.reply .distrust-reply-btn');
        const replyFlagButtons = document.querySelectorAll('.reply .flag-reply-btn');
        const replyEditButtons = document.querySelectorAll('.reply .edit-reply-btn');
        const replyDeleteButtons = document.querySelectorAll('.reply .delete-reply-btn');
        const replyButtons = document.querySelectorAll('.reply .reply-btn');
        
        console.log('=== REPLY BUTTONS FOUND ===');
        console.log('Reply like buttons:', replyLikeButtons.length);
        console.log('Reply dislike buttons:', replyDislikeButtons.length);
        console.log('Reply trust buttons:', replyTrustButtons.length);
        console.log('Reply distrust buttons:', replyDistrustButtons.length);
        console.log('Reply edit buttons:', replyEditButtons.length);
        console.log('Reply delete buttons:', replyDeleteButtons.length);
        console.log('Reply buttons (for nested replies):', replyButtons.length);
        
        // Log details of each button type
        replyEditButtons.forEach((btn, index) => {
            console.log(`Reply edit button ${index}:`, {
                html: btn.outerHTML,
                'data-reply-id': btn.getAttribute('data-reply-id')
            });
        });
        
        replyDeleteButtons.forEach((btn, index) => {
            console.log(`Reply delete button ${index}:`, {
                html: btn.outerHTML,
                'data-reply-id': btn.getAttribute('data-reply-id')
            });
        });
        
        replyButtons.forEach((btn, index) => {
            console.log(`Reply button (nested) ${index}:`, {
                html: btn.outerHTML,
                'data-comment-id': btn.getAttribute('data-comment-id'),
                'data-parent-reply-id': btn.getAttribute('data-parent-reply-id')
            });
        });
        
        // Add event listeners for reply reactions
        replyLikeButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'like');
            });
        });
        replyDislikeButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'dislike');
            });
        });
        replyTrustButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'trust');
            });
        });
        replyDistrustButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'distrust');
            });
        });
        replyFlagButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                if (!replyId || !commentId) return;
                await handleReplyReaction(commentId, replyId, 'flag');
            });
        });
        
        // Add event listeners for reply edit and delete
        replyEditButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('=== EDIT REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-reply-id': this.getAttribute('data-reply-id'),
                    'class': this.className
                });
                
                const replyId = this.getAttribute('data-reply-id');
                console.log('Reply ID for edit:', replyId);
                
                showEditReplyInput(replyId);
            });
        });
        
        replyDeleteButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                console.log('=== DELETE REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-reply-id': this.getAttribute('data-reply-id'),
                    'class': this.className
                });
                
                const replyId = this.getAttribute('data-reply-id');
                const commentId = this.closest('.comment').getAttribute('data-comment-id');
                console.log('Delete reply data:', { replyId, commentId });
                
                if (confirm('Are you sure you want to delete this reply?')) {
                    await deleteReply(commentId, replyId);
                }
            });
        });
        
        // Add replies toggle listeners after all other event listeners
        addRepliesToggleListeners();
        
        // Re-initialize emoji pickers for newly loaded content
        initializeEmojiPicker();
    } catch (error) {
        console.error('Failed to load comments:', error);
        
        // Create a more user-friendly error message with retry options
        const errorMessage = error.message || 'Unknown error occurred';
        const isNetworkError = errorMessage.toLowerCase().includes('fetch') || 
                              errorMessage.toLowerCase().includes('network') || 
                              errorMessage.toLowerCase().includes('timeout') ||
                              errorMessage.toLowerCase().includes('connection');
        
        commentsList.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 20px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; margin: 10px;">
                <div style="color: #dc3545; font-size: 18px; margin-bottom: 10px;">
                    <strong>Failed to load comments</strong>
                </div>
                <div style="color: #6c757d; margin-bottom: 15px;">
                    ${isNetworkError ? 
                        'Unable to connect to the server. This might be a temporary network issue.' : 
                        'An error occurred while loading comments.'}
                </div>
                <div style="margin-bottom: 15px;">
                    <button onclick="loadComments('${currentSortBy}')" 
                            style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        🔄 Try Again
                    </button>
                    <button onclick="window.location.reload()" 
                            style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        🔄 Refresh Page
                    </button>
                </div>
                <details style="text-align: left; margin-top: 10px;">
                    <summary style="cursor: pointer; color: #6c757d; font-size: 12px;">Technical Details</summary>
                    <div style="background: #f8f9fa; padding: 10px; margin-top: 5px; border-radius: 4px; font-family: monospace; font-size: 11px; color: #495057;">
                        Error: ${errorMessage}
                        <br>URL: ${currentUrl}
                        <br>Time: ${new Date().toLocaleString()}
                    </div>
                </details>
            </div>`;
    }
}

// Submit a new comment
async function submitComment() {
    const commentInput = document.getElementById('comment-input');
    const text = commentInput.value.trim();
    
    if (!text) return;
    
    try {
        let userData;
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
            userData = result;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in submitComment:', chromeError);
            alert('Please refresh the page and try again');
            return;
        }
        
        if (!userData.isAuthenticated) {
            alert('Please sign in to comment');
            return;
        }

        const currentUrl = window.location.href;
        const response = await apiFetch(`${API_BASE_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { url: currentUrl, text, user: userData.user }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to submit comment:', errMsg);
            throw new Error(`Failed to submit comment: ${errMsg}`);
        }

        const newComment = JSON.parse(response.body || '{}');
        console.log('Comment submitted successfully:', newComment);
        
        commentInput.value = '';
        await loadComments(currentSortBy);
        // Re-initialize emoji pickers after submitting comment
        initializeEmojiPicker();
    } catch (error) {
        console.error('Failed to submit comment:', error);
        alert('Failed to submit comment. Please try again. Error: ' + error.message);
    }
}

// Handle like/dislike actions
async function handleLikeDislike(commentId, action) {
    try {
        let userEmail;
        try {
            const result = await chrome.storage.local.get(['user']);
            userEmail = result.user ? result.user.email : null;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in handleLikeDislike:', chromeError);
            return; // Silently fail if we can't get user data
        }
        
        if (!userEmail) {
            // Silently fail if user is not logged in.
            return;
        }

        console.log(`Handling ${action} for comment:`, commentId);

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/reaction`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: { type: action, userEmail }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to update reaction:', errMsg);
            throw new Error(`Failed to update reaction: ${errMsg}`);
        }
        const updatedComment = JSON.parse(response.body || '{}');
        console.log('Reaction updated successfully:', updatedComment);
        
        // Update the UI without reloading all comments to prevent flashing
        const commentElement = document.querySelector(`.comment[data-comment-id="${commentId}"]`);
        if (commentElement && updatedComment) {
            // Update counts based on action type
            const likeBtn = commentElement.querySelector('.like-btn');
            const dislikeBtn = commentElement.querySelector('.dislike-btn');
            const trustBtn = commentElement.querySelector('.trust-btn');
            const distrustBtn = commentElement.querySelector('.distrust-btn');
            const flagBtn = commentElement.querySelector('.flag-btn');
            
            if (likeBtn) likeBtn.textContent = `👍 ${updatedComment.likes || 0}`;
            if (dislikeBtn) dislikeBtn.textContent = `👎 ${updatedComment.dislikes || 0}`;
            if (trustBtn) trustBtn.textContent = `✅ ${updatedComment.trusts || 0}`;
            if (distrustBtn) distrustBtn.textContent = `❌ ${updatedComment.distrusts || 0}`;
            if (flagBtn) flagBtn.textContent = `🚩 ${updatedComment.flags || 0}`;
        }
    } catch (error) {
        console.error('Failed to update like/dislike:', error);
        // The alert has been removed from here.
    }
}

// Handle reply reactions (like/dislike/trust/distrust)
async function handleReplyReaction(commentId, replyId, action) {
    try {
        let userEmail;
        try {
            const result = await chrome.storage.local.get(['user']);
            userEmail = result.user ? result.user.email : null;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in handleReplyReaction:', chromeError);
            return; // Silently fail if we can't get user data
        }
        
        if (!userEmail) {
            // Silently fail if user is not logged in.
            return;
        }

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/replies/${replyId}/reaction`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: { type: action, userEmail }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to update reply reaction:', errMsg);
            throw new Error(`Failed to update reply reaction: ${errMsg}`);
        }
        const updatedComment = JSON.parse(response.body || '{}');
        
        // Update the UI without reloading all comments to prevent flashing
        const replyElement = document.querySelector(`.reply[data-reply-id="${replyId}"]`);
        if (replyElement && updatedComment) {
            // Find the updated reply in the response
            const findReplyRecursive = (replies, id) => {
                if (!Array.isArray(replies)) return null;
                for (const reply of replies) {
                    if (reply._id === id) return reply;
                    if (reply.replies) {
                        const found = findReplyRecursive(reply.replies, id);
                        if (found) return found;
                    }
                }
                return null;
            };
            
            const updatedReply = findReplyRecursive(updatedComment.replies || [], replyId);
            if (updatedReply) {
                const likeBtn = replyElement.querySelector('.like-reply-btn');
                const dislikeBtn = replyElement.querySelector('.dislike-reply-btn');
                const trustBtn = replyElement.querySelector('.trust-reply-btn');
                const distrustBtn = replyElement.querySelector('.distrust-reply-btn');
                const flagBtn = replyElement.querySelector('.flag-reply-btn');
                
                if (likeBtn) likeBtn.textContent = `👍 ${updatedReply.likes || 0}`;
                if (dislikeBtn) dislikeBtn.textContent = `👎 ${updatedReply.dislikes || 0}`;
                if (trustBtn) trustBtn.textContent = `✅ ${updatedReply.trusts || 0}`;
                if (distrustBtn) distrustBtn.textContent = `❌ ${updatedReply.distrusts || 0}`;
                if (flagBtn) flagBtn.textContent = `🚩 ${updatedReply.flags || 0}`;
            }
        }
    } catch (error) {
        console.error('Failed to update reply reaction:', error);
        // The alert has been removed from here.
    }
}

// Submit a reply
async function submitReply(commentId, parentReplyId, replyText) {
    const text = replyText.trim();
    if (!text) return;
    try {
        // Add error handling for extension context
        let userData;
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
            userData = result;
        } catch (chromeError) {
            console.warn('Chrome storage access failed, trying to continue:', chromeError);
            // Try to get user data from a fallback source or use cached data
            userData = { isAuthenticated: true, user: { name: 'User' } };
        }
        
        if (!userData.isAuthenticated) {
            alert('Please sign in to reply to comments');
            return;
        }

        console.log('Submitting reply with data:', { commentId, parentReplyId, text, user: userData.user.name });

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/replies/${parentReplyId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                text,
                user: userData.user
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers || 'No headers');

        if (!response || !response.ok) {
            const errorText = response?.body || '';
            console.error('Failed to submit reply. Server response:', {
                status: response?.status,
                statusText: response?.statusText,
                error: errorText,
                url: `${API_BASE_URL}/comments/${commentId}/replies/${parentReplyId}`
            });
            throw new Error(`Server error (${response?.status || 'n/a'}): ${errorText}`);
        }

        const responseData = (() => { try { return JSON.parse(response.body || '{}'); } catch (_) { return {}; } })();
        console.log('Reply submitted successfully:', responseData);
        
        // Clear the specific input that was submitted
        const container = document.getElementById(`reply-input-${parentReplyId}`);
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        
        // Reload comments to show the new reply
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error in submitReply:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            commentId,
            parentReplyId,
            replyText: text.substring(0, 50)
        });
        
        // Don't show alert for extension context errors, just log them
        if (error.message.includes('Extension context invalidated')) {
            console.warn('Extension context was invalidated, this is usually temporary');
            // Try to reload comments anyway since the backend might have succeeded
            try {
                await loadComments(currentSortBy);
            } catch (reloadError) {
                console.error('Failed to reload comments after extension context error:', reloadError);
            }
        } else {
            alert('Failed to submit reply. Please try again. Error: ' + error.message);
        }
    }
}

// Show reply input for a comment
function showReplyInput(commentId, containerId, apiParentId) {
    console.log('showReplyInput called with:', { commentId, containerId, apiParentId });
    console.log('Looking for container with ID:', `reply-input-${containerId}`);
    
    const container = document.getElementById(`reply-input-${containerId}`);
    console.log('Container found:', container);
    
    if (container) {
        // Check if this container is already visible and has content
        const existingTextarea = container.querySelector('.reply-textarea');
        const existingText = existingTextarea ? existingTextarea.value : '';
        
        // Hide any other open input boxes but preserve their content
        document.querySelectorAll('.reply-input-container, .edit-input-container').forEach(c => {
            if (c !== container) {
                // Store the current text before hiding
                const textarea = c.querySelector('.reply-textarea, .edit-textarea');
                if (textarea && textarea.value.trim()) {
                    c.setAttribute('data-preserved-text', textarea.value);
                }
                c.style.display = 'none';
            }
        });

        // Only recreate the HTML if the container is empty or not visible
        if (!existingTextarea || container.style.display === 'none') {
            container.innerHTML = `
                <div class="input-wrapper">
                    <textarea class="reply-textarea" placeholder="Write a reply..." rows="3">${existingText}</textarea>
                    <button class="emoji-btn reply-emoji-btn">😊</button>
                    <button class="gif-btn reply-gif-btn">🎬</button>
                </div>
                <div class="emoji-picker reply-emoji-picker" style="display: none;">
                    <div class="emoji-categories">
                        <button class="emoji-category active" data-category="smileys">😊</button>
                        <button class="emoji-category" data-category="animals">🐶</button>
                        <button class="emoji-category" data-category="food">🍕</button>
                        <button class="emoji-category" data-category="activities">⚽</button>
                        <button class="emoji-category" data-category="travel">🚗</button>
                        <button class="emoji-category" data-category="objects">💡</button>
                        <button class="emoji-category" data-category="symbols">❤️</button>
                        <button class="emoji-category" data-category="flags">🏁</button>
                    </div>
                    <div class="emoji-grid reply-emoji-grid"></div>
                </div>
                <div class="gif-picker reply-gif-picker" style="display: none;">
                    <div class="gif-search-container">
                        <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                        <button class="gif-search-btn">🔍</button>
                    </div>
                    <div class="gif-grid reply-gif-grid"></div>
                    <div class="gif-loading reply-gif-loading" style="display: none;">Loading...</div>
                </div>
                <button class="submit-reply-btn" style="margin-top:4px;">Reply</button>
                <button class="cancel-reply-btn" style="margin-top:4px;">Cancel</button>
            `;
            
            // Re-attach event listeners
            const submitBtn = container.querySelector('.submit-reply-btn');
            const cancelBtn = container.querySelector('.cancel-reply-btn');
            
            // Remove existing listeners to prevent duplicates
            submitBtn.replaceWith(submitBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            
            const newSubmitBtn = container.querySelector('.submit-reply-btn');
            const newCancelBtn = container.querySelector('.cancel-reply-btn');
            
            newSubmitBtn.addEventListener('click', async () => {
                const replyText = container.querySelector('.reply-textarea').value;
                console.log('Submitting reply with data:', { commentId, apiParentId, replyText });
                await submitReply(commentId, apiParentId, replyText);
            });
            
            newCancelBtn.addEventListener('click', () => {
                container.style.display = 'none';
                container.innerHTML = '';
            });
        }
        
        container.style.display = 'block';
        const textarea = container.querySelector('.reply-textarea');
        textarea.focus();
        
        // Restore the text if it was preserved
        if (existingText && !textarea.value) {
            textarea.value = existingText;
        }
        
        // Check for preserved text from other containers
        const preservedText = container.getAttribute('data-preserved-text');
        if (preservedText && !textarea.value) {
            textarea.value = preservedText;
            container.removeAttribute('data-preserved-text');
        }
        
        // Initialize emoji picker for this reply input
        initializeEmojiPicker();
        
        // Set up emoji button for this specific reply input
        const replyEmojiBtn = container.querySelector('.reply-emoji-btn');
        const replyEmojiPicker = container.querySelector('.reply-emoji-picker');
        const replyEmojiGrid = container.querySelector('.reply-emoji-grid');
        const replyTextarea = container.querySelector('.reply-textarea');
        
        console.log('Reply emoji elements found:', {
            replyEmojiBtn: replyEmojiBtn ? 'Found' : 'NOT FOUND',
            replyEmojiPicker: replyEmojiPicker ? 'Found' : 'NOT FOUND',
            replyEmojiGrid: replyEmojiGrid ? 'Found' : 'NOT FOUND',
            replyTextarea: replyTextarea ? 'Found' : 'NOT FOUND'
        });
        
        if (replyEmojiBtn && replyEmojiPicker && replyEmojiGrid && replyTextarea) {
            console.log('Setting up emoji picker for reply input');
            let currentCategory = 'smileys';
            
            replyEmojiBtn.addEventListener('click', (e) => {
                console.log('=== REPLY EMOJI BUTTON CLICKED ===');
                console.log('Event:', e);
                console.log('Button element:', replyEmojiBtn);
                console.log('Button HTML:', replyEmojiBtn.outerHTML);
                e.stopPropagation();
                const isVisible = replyEmojiPicker.style.display === 'block';
                console.log('Emoji picker visibility check:', {
                    isVisible,
                    currentDisplay: replyEmojiPicker.style.display,
                    computedDisplay: window.getComputedStyle(replyEmojiPicker).display
                });
                
                if (isVisible) {
                    console.log('Hiding emoji picker');
                    replyEmojiPicker.style.display = 'none';
                } else {
                    console.log('Showing emoji picker');
                    // Position the emoji picker relative to the button
                    const buttonRect = replyEmojiBtn.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    replyEmojiPicker.style.left = `${leftPos}px`;
                    replyEmojiPicker.style.top = `${topPos}px`;
                    replyEmojiPicker.style.display = 'block';
                    
                    console.log('Reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                    
                    console.log('Emoji picker element after positioning:', {
                        display: replyEmojiPicker.style.display,
                        left: replyEmojiPicker.style.left,
                        top: replyEmojiPicker.style.top,
                        zIndex: replyEmojiPicker.style.zIndex,
                        computedStyle: window.getComputedStyle(replyEmojiPicker).display,
                        boundingRect: replyEmojiPicker.getBoundingClientRect(),
                        isVisible: replyEmojiPicker.getBoundingClientRect().width > 0 && replyEmojiPicker.getBoundingClientRect().height > 0
                    });
                    
                    // Force the picker to be visible
                    replyEmojiPicker.style.zIndex = '2147483647';
                    replyEmojiPicker.style.position = 'fixed';
                    replyEmojiPicker.style.display = 'block';
                    
                    console.log('Final emoji picker state:', {
                        display: replyEmojiPicker.style.display,
                        zIndex: replyEmojiPicker.style.zIndex,
                        position: replyEmojiPicker.style.position,
                        boundingRect: replyEmojiPicker.getBoundingClientRect()
                    });
                }
                
                if (!isVisible) {
                    console.log('Rendering emoji grid for reply picker');
                    console.log('Category:', currentCategory);
                    console.log('Grid element:', replyEmojiGrid);
                    console.log('Grid element HTML before rendering:', replyEmojiGrid.innerHTML);
                    renderEmojiGrid(currentCategory, replyEmojiGrid, (emoji) => {
                        console.log('Emoji selected in reply picker:', emoji);
                        insertAtCursor(replyTextarea, emoji);
                        replyEmojiPicker.style.display = 'none';
                        replyTextarea.focus();
                    });
                    console.log('Grid element HTML after rendering:', replyEmojiGrid.innerHTML);
                    console.log('Grid element children count:', replyEmojiGrid.children.length);
                }
                
                // Set up category switching for this picker
                replyEmojiPicker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        replyEmojiPicker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, replyEmojiGrid, (emoji) => {
                            insertAtCursor(replyTextarea, emoji);
                            replyEmojiPicker.style.display = 'none';
                            replyTextarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!replyEmojiPicker.contains(event.target) && !replyEmojiBtn.contains(event.target)) {
                        replyEmojiPicker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            });
        }
        
        // Set up GIF button for this specific reply input
        const replyGifBtn = container.querySelector('.reply-gif-btn');
        const replyGifPicker = container.querySelector('.reply-gif-picker');
        const replyGifGrid = container.querySelector('.reply-gif-grid');
        const replyGifSearch = container.querySelector('.gif-search-input');
        const replyGifSearchBtn = container.querySelector('.gif-search-btn');
        const replyGifLoading = container.querySelector('.reply-gif-loading');
        
        if (replyGifBtn && replyGifPicker && replyGifGrid && replyTextarea) {
            console.log('Setting up GIF picker for reply input');
            
            replyGifBtn.addEventListener('click', (e) => {
                console.log('Reply GIF button clicked!');
                e.stopPropagation();
                const isVisible = replyGifPicker.style.display === 'block';
                
                if (isVisible) {
                    replyGifPicker.style.display = 'none';
                } else {
                    // Position the GIF picker relative to the button
                    const buttonRect = replyGifBtn.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 300;
                    const pickerHeight = 400;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    replyGifPicker.style.left = `${leftPos}px`;
                    replyGifPicker.style.top = `${topPos}px`;
                    replyGifPicker.style.display = 'block';
                    
                    console.log('Reply GIF picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    // Load trending GIFs
                    getTrendingGifs().then(gifs => {
                        renderGifGrid(gifs, replyGifGrid, (gifUrl) => {
                            insertAtCursor(replyTextarea, gifUrl);
                            replyGifPicker.style.display = 'none';
                            replyTextarea.focus();
                        });
                    });
                }
                
                // Set up GIF search functionality
                if (replyGifSearch && replyGifSearchBtn) {
                    replyGifSearchBtn.onclick = async (e) => {
                        e.stopPropagation();
                        const query = replyGifSearch.value.trim();
                        if (query) {
                            replyGifLoading.style.display = 'block';
                            try {
                                const gifs = await searchGifs(query);
                                renderGifGrid(gifs, replyGifGrid, (gifUrl) => {
                                    insertAtCursor(replyTextarea, gifUrl);
                                    replyGifPicker.style.display = 'none';
                                    replyTextarea.focus();
                                });
                            } catch (error) {
                                console.error('Error searching GIFs:', error);
                            } finally {
                                replyGifLoading.style.display = 'none';
                            }
                        }
                    };
                    
                    // Allow Enter key to search
                    replyGifSearch.onkeypress = (e) => {
                        if (e.key === 'Enter') {
                            replyGifSearchBtn.click();
                        }
                    };
                }
                
                // Close picker when clicking outside
                const closeGifPicker = (event) => {
                    if (!replyGifPicker.contains(event.target) && !replyGifBtn.contains(event.target)) {
                        replyGifPicker.style.display = 'none';
                        document.removeEventListener('click', closeGifPicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closeGifPicker);
                }, 10);
            });
        }
    } else {
        console.error('Container not found for ID:', `reply-input-${containerId}`);
        console.log('Available containers:', Array.from(document.querySelectorAll('.reply-input-container')).map(c => c.id));
    }
}

// Show edit input for a comment/reply
function showEditInput(commentId) {
    // Hide all other edit inputs
    document.querySelectorAll('.edit-input-container').forEach(el => el.style.display = 'none');
    const container = document.getElementById('edit-input-' + commentId);
    const textDiv = document.getElementById('comment-text-' + commentId);
    if (container && textDiv) {
        container.innerHTML = `
            <div class="input-wrapper">
                <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
                <button class="emoji-btn edit-emoji-btn">😊</button>
                <button class="gif-btn edit-gif-btn">🎬</button>
            </div>
            <div class="emoji-picker edit-emoji-picker" style="display: none;">
                <div class="emoji-categories">
                    <button class="emoji-category active" data-category="smileys">😊</button>
                    <button class="emoji-category" data-category="animals">🐶</button>
                    <button class="emoji-category" data-category="food">🍕</button>
                    <button class="emoji-category" data-category="activities">⚽</button>
                    <button class="emoji-category" data-category="travel">🚗</button>
                    <button class="emoji-category" data-category="objects">💡</button>
                    <button class="emoji-category" data-category="symbols">❤️</button>
                    <button class="emoji-category" data-category="flags">🏁</button>
                </div>
                <div class="emoji-grid edit-emoji-grid"></div>
            </div>
            <div class="gif-picker edit-gif-picker" style="display: none;">
                <div class="gif-search-container">
                    <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                    <button class="gif-search-btn">🔍</button>
                </div>
                <div class="gif-grid edit-gif-grid"></div>
                <div class="gif-loading edit-gif-loading" style="display: none;">Loading...</div>
            </div>
            <button class="save-edit-btn" style="margin-top:4px;">Save</button>
            <button class="cancel-edit-btn" style="margin-top:4px;">Cancel</button>
        `;
        container.style.display = 'block';
        const saveBtn = container.querySelector('.save-edit-btn');
        const cancelBtn = container.querySelector('.cancel-edit-btn');
        saveBtn.addEventListener('click', async function() {
            const newText = container.querySelector('.edit-textarea').value;
            await saveEdit(commentId, newText);
            container.style.display = 'none';
        });
        cancelBtn.addEventListener('click', function() {
            container.style.display = 'none';
        });
        
        // Initialize emoji picker for this edit input
        initializeEmojiPicker();
    }
}

// Save edited comment
async function saveEdit(commentId, newText) {
    const text = newText.trim();
    if (!text) return;
    try {
        const result = await chrome.storage.local.get(['user']);
        const userEmail = result.user ? result.user.email : null;
        if (!userEmail) {
            alert('Please sign in to edit comments');
            return;
        }

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                text,
                userEmail
            }
        });

        if (!response || !response.ok) {
            throw new Error(response?.body || 'Failed to save edit');
        }

        loadComments();
    } catch (error) {
        console.error('Failed to save edit:', error);
    }
}

// Delete comment
async function deleteComment(commentId) {
    try {
        const result = await chrome.storage.local.get(['user']);
        const userEmail = result.user?.email;
        if (!userEmail) {
            alert('You must be logged in to delete comments.');
            return;
        }
        console.log(`Attempting to delete comment ${commentId} by user ${userEmail}`);
        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: { userEmail }
        });
        if (!response || !response.ok) {
            let errorMsg = 'Failed to delete comment';
            try { errorMsg = JSON.parse(response?.body || '{}')?.error || errorMsg; } catch (_) {}
            throw new Error(errorMsg);
        }
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert(`Error: ${error.message}`);
    }
}

function showEditReplyInput(replyId) {
    document.querySelectorAll('.edit-reply-input-container').forEach(el => el.style.display = 'none');
    const container = document.getElementById('edit-reply-input-' + replyId);
    const textDiv = document.querySelector(`.reply[data-reply-id="${replyId}"] .reply-text`);

    if (container && textDiv) {
        container.innerHTML = `
            <div class="input-wrapper">
                <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
                <button class="emoji-btn edit-reply-emoji-btn">😊</button>
                <button class="gif-btn edit-reply-gif-btn">🎬</button>
            </div>
            <div class="emoji-picker edit-reply-emoji-picker" style="display: none;">
                <div class="emoji-categories">
                    <button class="emoji-category active" data-category="smileys">😊</button>
                    <button class="emoji-category" data-category="animals">🐶</button>
                    <button class="emoji-category" data-category="food">🍕</button>
                    <button class="emoji-category" data-category="activities">⚽</button>
                    <button class="emoji-category" data-category="travel">🚗</button>
                    <button class="emoji-category" data-category="objects">💡</button>
                    <button class="emoji-category" data-category="symbols">❤️</button>
                    <button class="emoji-category" data-category="flags">🏁</button>
                </div>
                <div class="emoji-grid edit-reply-emoji-grid"></div>
            </div>
            <div class="gif-picker edit-reply-gif-picker" style="display: none;">
                <div class="gif-search-container">
                    <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                    <button class="gif-search-btn">🔍</button>
                </div>
                <div class="gif-grid edit-reply-gif-grid"></div>
                <div class="gif-loading edit-reply-gif-loading" style="display: none;">Loading...</div>
            </div>
            <button class="save-edit-reply-btn" style="margin-top:4px;">Save</button>
            <button class="cancel-edit-reply-btn" style="margin-top:4px;">Cancel</button>
        `;
        container.style.display = 'block';

        const saveBtn = container.querySelector('.save-edit-reply-btn');
        const cancelBtn = container.querySelector('.cancel-edit-reply-btn');
        const commentId = container.closest('.comment').getAttribute('data-comment-id');

        saveBtn.addEventListener('click', async () => {
            const newText = container.querySelector('.edit-textarea').value;
            await saveEditReply(commentId, replyId, newText);
            container.style.display = 'none';
        });

        cancelBtn.addEventListener('click', () => {
            container.style.display = 'none';
        });
        
        // Initialize emoji picker for this edit reply input
        initializeEmojiPicker();
    }
}

async function saveEditReply(commentId, replyId, newText) {
    const text = newText.trim();
    if (!text) return;

    try {
        const result = await chrome.storage.local.get(['user']);
        const userEmail = result.user ? result.user.email : null;
        if (!userEmail) {
            alert('Please sign in to edit replies');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/replies/${replyId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, userEmail })
        });

        if (!response.ok) throw new Error('Failed to save reply edit');
        loadComments();
    } catch (error) {
        console.error('Failed to save reply edit:', error);
    }
}

async function deleteReply(commentId, replyId) {
    try {
        const result = await chrome.storage.local.get(['user']);
        const userEmail = result.user?.email;
        if (!userEmail) {
            alert('You must be logged in to delete replies.');
            return;
        }
        console.log(`Attempting to delete reply ${replyId} by user ${userEmail}`);
        const response = await fetch(`${API_BASE_URL}/replies/${replyId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: userEmail })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete reply');
        }
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error deleting reply:', error);
        alert(`Error: ${error.message}`);
    }
}

// Modify renderComments to use comment IDs
function renderComments(comments, userEmail, currentUrl) {
    return comments.map(comment => {
        const isLiked = comment.likedBy && comment.likedBy.includes(userEmail);
        const isDisliked = comment.dislikedBy && comment.dislikedBy.includes(userEmail);
        const isTrusted = comment.trustedBy && comment.trustedBy.includes(userEmail);
        const isDistrusted = comment.distrustedBy && comment.distrustedBy.includes(userEmail);
        // Convert markdown images to HTML <img> tags
        const commentTextWithImages = comment.text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; max-height: 200px; display: block; margin: 8px 0;">');
        const repliesCount = comment.replies && comment.replies.length ? comment.replies.length : 0;
        return `
            <div class="comment" data-comment-id="${comment._id}">
                <div class="comment-header">
                    <img src="${comment.user?.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="Profile" class="comment-avatar">
                    <div class="comment-info">
                        <div class="comment-author">${comment.user?.name || 'Anonymous'}</div>
                        <div class="comment-time">${new Date(comment.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="comment-text" id="comment-text-${comment._id}">${commentTextWithImages}</div>
                <div class="comment-actions">
                    <button class="action-btn reply-btn" data-comment-id="${comment._id}">💬</button>
                    <button class="action-btn like-btn ${comment.likedBy && comment.likedBy.includes(userEmail) ? 'liked' : ''}" data-comment-id="${comment._id}">👍 ${comment.likes || 0}</button>
                    <button class="action-btn dislike-btn ${comment.dislikedBy && comment.dislikedBy.includes(userEmail) ? 'disliked' : ''}" data-comment-id="${comment._id}">👎 ${comment.dislikes || 0}</button>
                    <button class="action-btn trust-btn ${comment.trustedBy && comment.trustedBy.includes(userEmail) ? 'trusted' : ''}" data-comment-id="${comment._id}">✅ ${comment.trusts || 0}</button>
                    <button class="action-btn distrust-btn ${comment.distrustedBy && comment.distrustedBy.includes(userEmail) ? 'distrusted' : ''}" data-comment-id="${comment._id}">❌ ${comment.distrusts || 0}</button>
                    <button class="action-btn flag-btn ${comment.flaggedBy && comment.flaggedBy.includes(userEmail) ? 'flagged' : ''}" data-comment-id="${comment._id}">🚩 ${comment.flags || 0}</button>
                    ${comment.user?.email === userEmail ? `
                        <button class="action-btn edit-btn" data-comment-id="${comment._id}">✏️</button>
                        <button class="action-btn delete-btn" data-comment-id="${comment._id}">🗑️</button>
                    ` : ''}
                </div>
                <div class="edit-input-container" id="edit-input-${comment._id}" style="display:none;"></div>
                <div class="reply-input-container" id="reply-input-${comment._id}" style="display:none;"></div>
                ${repliesCount > 0 ? `
                    <div class="replies-collapsible" id="replies-collapsible-${comment._id}">
                        <div class="replies-toggle" data-comment-id="${comment._id}" style="cursor:pointer; color:#007bff; font-weight:500; margin:8px 0;">Replies (${repliesCount}) ▼</div>
                        <div class="replies replies-collapsible-content" id="replies-content-${comment._id}" style="display:none;">
                            ${renderReplies(comment.replies, 1, comment._id, userEmail)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Recursive function to render replies with infinite nesting
function renderReplies(replies, level = 1, commentId, userEmail) {
    console.log(`Rendering replies at level ${level}:`, replies.length, 'replies');
    console.log('Full replies array:', JSON.stringify(replies, null, 2));
    
    return replies.map(reply => {
        // Ensure every reply has a replies array
        if (!Array.isArray(reply.replies)) reply.replies = [];
        
        console.log(`Processing reply:`, {
            id: reply._id,
            idType: typeof reply._id,
            text: reply.text?.substring(0, 50) + '...', 
            user: reply.user?.name,
            hasReplies: reply.replies && reply.replies.length > 0,
            fullReply: reply
        });
        
        // Debug: Check if reply._id is actually undefined
        if (!reply._id) {
            console.error('WARNING: reply._id is falsy!', {
                replyId: reply._id,
                replyIdType: typeof reply._id,
                fullReply: reply
            });
        }
        
        const isReplyLiked = reply.likedBy && reply.likedBy.includes(userEmail);
        const isReplyDisliked = reply.dislikedBy && reply.dislikedBy.includes(userEmail);
        const isReplyTrusted = reply.trustedBy && reply.trustedBy.includes(userEmail);
        const isReplyDistrusted = reply.distrustedBy && reply.distrustedBy.includes(userEmail);
        
        const marginLeft = level * 32;
        console.log(`Reply ${reply._id} at level ${level}, margin-left: ${marginLeft}px`);
        console.log(`Reply data:`, { 
            id: reply._id, 
            text: reply.text?.substring(0, 50) + '...', 
            user: reply.user?.name,
            hasReplies: reply.replies && reply.replies.length > 0
        });
        
        // Debug the reply button attributes
        const replyButtonHtml = `<button class="reply-btn" data-comment-id="${commentId}" data-parent-reply-id="${reply._id || ''}">Reply</button>`;
        console.log(`Reply button HTML for reply ${reply._id}:`, replyButtonHtml);
        
        // Convert markdown images to HTML <img> tags
        const replyTextWithImages = reply.text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; max-height: 200px; display: block; margin: 8px 0;">');
        
        return `
            <div class="reply" data-reply-id="${reply._id}" data-reply-level="${level}" style="margin-left: ${marginLeft}px !important;">
                <div class="reply-header">
                    <img src="${reply.user?.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="Profile" class="reply-avatar">
                    <div class="reply-info">
                        <div class="reply-author">${reply.user?.name || 'Anonymous'}</div>
                        <div class="reply-time">${new Date(reply.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="reply-text">${replyTextWithImages}</div>
                <div class="reply-actions">
                    <button class="action-btn like-reply-btn ${reply.likedBy && reply.likedBy.includes(userEmail) ? 'liked' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}">👍 ${reply.likes || 0}</button>
                    <button class="action-btn dislike-reply-btn ${reply.dislikedBy && reply.dislikedBy.includes(userEmail) ? 'disliked' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}">👎 ${reply.dislikes || 0}</button>
                    <button class="action-btn trust-reply-btn ${reply.trustedBy && reply.trustedBy.includes(userEmail) ? 'trusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}">✅ ${reply.trusts || 0}</button>
                    <button class="action-btn distrust-reply-btn ${reply.distrustedBy && reply.distrustedBy.includes(userEmail) ? 'distrusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}">❌ ${reply.distrusts || 0}</button>
                    <button class="action-btn flag-reply-btn ${reply.flaggedBy && reply.flaggedBy.includes(userEmail) ? 'flagged' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}">🚩 ${reply.flags || 0}</button>
                    <button class="action-btn reply-btn" data-comment-id="${commentId}" data-parent-reply-id="${reply._id || ''}">💬</button>
                    ${reply.user?.email === userEmail ? `
                        <button class="action-btn edit-reply-btn" data-reply-id="${reply._id}" data-comment-id="${commentId}">✏️</button>
                        <button class="action-btn delete-reply-btn" data-reply-id="${reply._id}" data-comment-id="${commentId}">🗑️</button>
                    ` : ''}
                </div>
                <div class="reply-input-container" id="reply-input-${reply._id}" style="display:none;"></div>
                <div class="edit-reply-input-container" id="edit-reply-input-${reply._id}" style="display:none;"></div>
                ${reply.replies && reply.replies.length > 0 ? `
                    <div class="nested-replies-container">
                        ${renderReplies(reply.replies, level + 1, commentId, userEmail)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Listen for authentication state changes from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'authChanged') {
        checkAuthStatus();
    }
});

// Save panel state to storage
async function savePanelState(panel, isMinimized = null) {
    const rect = panel.getBoundingClientRect();
    const state = {
        width: panel.style.width,
        height: panel.style.height,
        left: rect.left,
        top: rect.top,
        right: window.innerWidth - rect.right,
        isCollapsed: panel.querySelector('.comments-content').style.display === 'none',
        isMinimized: isMinimized !== null ? isMinimized : (panel.style.display === 'none')
    };
    await chrome.storage.local.set({ panelState: state });
}

// Restore panel position and size from storage (but not minimized state)
async function restorePanelPositionAndSize(panel) {
    try {
        const result = await chrome.storage.local.get(['panelState']);
        const state = result.panelState;
        
        if (state) {
            // Set dimensions
            if (state.width) panel.style.width = state.width;
            if (state.height) panel.style.height = state.height;
            
            // Set position
            if (state.left !== undefined) {
                panel.style.left = state.left + 'px';
                panel.style.right = 'unset';
            } else if (state.right !== undefined) {
                panel.style.right = state.right + 'px';
                panel.style.left = 'unset';
            }
            
            if (state.top !== undefined) {
                panel.style.top = state.top + 'px';
            }
            
            // Set collapsed state
            if (state.isCollapsed) {
                panel.querySelector('.comments-content').style.display = 'none';
                document.getElementById('minimize-comments').textContent = '🗕';
            }
        }
    } catch (error) {
        console.error('Failed to restore panel position and size:', error);
    }
}

// Restore only the minimized state (requires floating icon to be ready)
async function restorePanelMinimizedState(panel) {
    try {
        const result = await chrome.storage.local.get(['panelState']);
        const state = result.panelState;
        
        if (state && state.isMinimized) {
            console.log('Restoring minimized state');
            panel.style.display = 'none';
            const floatingIcon = document.getElementById('comments-floating-icon');
            if (floatingIcon) {
                console.log('Setting floating icon to visible');
                floatingIcon.style.display = 'flex';
            } else {
                console.error('Floating icon not found during restore');
            }
        }
    } catch (error) {
        console.error('Failed to restore panel minimized state:', error);
    }
}

// Restore panel state from storage (legacy function - kept for compatibility)
async function restorePanelState(panel) {
    await restorePanelPositionAndSize(panel);
    await restorePanelMinimizedState(panel);
}

// Ensure panel stays within viewport bounds
function ensurePanelInViewport(panel) {
    const rect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Handle horizontal position
    if (rect.left < 0) {
        panel.style.left = '0px';
    } else if (rect.right > viewportWidth) {
        panel.style.left = (viewportWidth - rect.width) + 'px';
    }
    
    // Handle vertical position
    if (rect.top < 0) {
        panel.style.top = '0px';
    } else if (rect.bottom > viewportHeight) {
        panel.style.top = (viewportHeight - rect.height) + 'px';
    }
    
    // Save the adjusted position
    savePanelState(panel);
}

// Add error message styling
const style = document.createElement('style');
style.textContent = `
    .error-message {
        color: #dc3545;
        padding: 10px;
        background: #f8d7da;
        border-radius: 4px;
        margin: 10px 0;
        text-align: center;
    }
`;
document.head.appendChild(style);

// Add sorting function
function sortComments(comments, sortBy) {
    return [...comments].sort((a, b) => {
        switch (sortBy) {
            case 'oldest':
                return new Date(a.timestamp) - new Date(b.timestamp);
            case 'most-liked':
                return (b.likes || 0) - (a.likes || 0);
            case 'most-disliked':
                return (b.dislikes || 0) - (a.dislikes || 0);
            case 'most-trusted':
                return (b.trusts || 0) - (a.trusts || 0);
            case 'most-distrusted':
                return (b.distrusts || 0) - (a.distrusts || 0);
            case 'newest':
            default:
                return new Date(b.timestamp) - new Date(a.timestamp);
        }
    });
}

// === Emoji Picker Support ===

const EMOJI_CATEGORIES = {
    smileys: ['😀','😁','😂','🤣','😊','😍','😎','😭','😡','😱','😴','😇','🥳','🤔','😅','😉','😘','😜','🤗','😏'],
    animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄','🐔','🐧','🐦','🐤'],
    food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🍍','🥭','🥝','🍅','🍆','🥑','🥦','🥕'],
    activities: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🏒','🏑','🏏','⛳','🏹','🎣','🥊','🥋','🎽'],
    travel: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🚨','✈️','🚀'],
    objects: ['💡','🔑','🔒','🔓','🛡️','🔨','⏰','📱','💻','🖨️','🕹️','📷','🎥','📺','📻','🎧','📡','🔋','🔌','💸'],
    symbols: ['❤️','💔','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💤','💢','💥','💦','💨','💫','💬','🗨️','🕳️'],
    flags: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇳','🇦🇺','🇧🇷','🇨🇦','🇨🇳','🇫🇷','🇩🇪','🇮🇳','🇯🇵','🇷🇺','🇬🇧','🇺🇸']
};

function renderEmojiGrid(category, gridElem, onEmojiClick) {
    console.log('renderEmojiGrid called with category:', category, 'gridElem:', gridElem);
    if (!gridElem) {
        console.error('Grid element not found');
        return;
    }
    
    gridElem.innerHTML = '';
    const emojis = EMOJI_CATEGORIES[category] || EMOJI_CATEGORIES.smileys;
    console.log('Emojis to render:', emojis.length);
    
    emojis.forEach((emoji, index) => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.type = 'button';
        btn.textContent = emoji;
        btn.style.fontSize = '20px';
        btn.style.padding = '4px';
        btn.style.border = 'none';
        btn.style.background = 'none';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
            console.log('Emoji clicked:', emoji);
            onEmojiClick(emoji);
        });
        gridElem.appendChild(btn);
        console.log(`Added emoji ${index + 1}/${emojis.length}: ${emoji}`);
    });
    console.log('Emoji grid rendered with', gridElem.children.length, 'items');
    console.log('Grid element HTML:', gridElem.innerHTML.substring(0, 200) + '...');
}

function initializeEmojiPicker() {
    console.log('Initializing emoji picker...');
    
    // Main comment input emoji picker
    const emojiBtn = document.getElementById('comment-emoji-btn');
    const emojiPicker = document.getElementById('comment-emoji-picker');
    const emojiGrid = document.getElementById('comment-emoji-grid');
    const textarea = document.getElementById('comment-input');
    
    console.log('Main emoji picker elements:', { 
        emojiBtn: emojiBtn ? 'Found' : 'NOT FOUND', 
        emojiPicker: emojiPicker ? 'Found' : 'NOT FOUND', 
        emojiGrid: emojiGrid ? 'Found' : 'NOT FOUND', 
        textarea: textarea ? 'Found' : 'NOT FOUND' 
    });
    
    if (emojiBtn && emojiPicker && emojiGrid && textarea) {
        console.log('All elements found, setting up event listener');
        let currentCategory = 'smileys';
        
        // Initialize the main emoji picker
        emojiBtn.addEventListener('click', (e) => {
            console.log('Main emoji button clicked!');
            console.log('Event target:', e.target);
            console.log('Button element:', emojiBtn);
            e.stopPropagation();
            const isVisible = emojiPicker.style.display === 'block';
            console.log('Current emoji picker display:', emojiPicker.style.display);
            console.log('Is visible:', isVisible);
            console.log('Emoji picker element:', emojiPicker);
            console.log('Emoji picker HTML:', emojiPicker.outerHTML);
            
            if (isVisible) {
                emojiPicker.style.display = 'none';
            } else {
                // Position the emoji picker relative to the button
                const buttonRect = emojiBtn.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const pickerWidth = 280;
                
                // Calculate left position to keep picker within viewport
                let leftPos = buttonRect.left;
                if (leftPos + pickerWidth > viewportWidth - 10) {
                    leftPos = viewportWidth - pickerWidth - 10;
                }
                if (leftPos < 10) {
                    leftPos = 10;
                }
                
                // Calculate top position
                let topPos = buttonRect.bottom + 5;
                const viewportHeight = window.innerHeight;
                const pickerHeight = 300;
                
                // If picker would go below viewport, position it above the button
                if (topPos + pickerHeight > viewportHeight - 10) {
                    topPos = buttonRect.top - pickerHeight - 5;
                }
                
                // Ensure minimum top position
                if (topPos < 10) {
                    topPos = 10;
                }
                
                emojiPicker.style.left = `${leftPos}px`;
                emojiPicker.style.top = `${topPos}px`;
                
                console.log('Emoji picker position:', {
                    left: `${leftPos}px`,
                    top: `${topPos}px`,
                    viewportWidth,
                    pickerWidth,
                    buttonLeft: buttonRect.left,
                    buttonBottom: buttonRect.bottom
                });
                
                emojiPicker.style.display = 'block';
            }
            
            console.log('New emoji picker display:', emojiPicker.style.display);
            console.log('Emoji picker computed style:', window.getComputedStyle(emojiPicker).display);
            console.log('Emoji picker position:', emojiPicker.getBoundingClientRect());
            
            if (!isVisible) {
                renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
                    insertAtCursor(textarea, emoji);
                    emojiPicker.style.display = 'none';
                    textarea.focus();
                });
            }
        });
        
        // Handle emoji picker clicks
        emojiPicker.addEventListener('click', e => e.stopPropagation());
        
        // Close main emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                emojiPicker.style.display = 'none';
            }
        });
        
        // Category switching for main emoji picker
        emojiPicker.querySelectorAll('.emoji-category').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                emojiPicker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentCategory = this.getAttribute('data-category');
                renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
                    insertAtCursor(textarea, emoji);
                    emojiPicker.style.display = 'none';
                    textarea.focus();
                });
            });
        });
        
        // Initialize main emoji grid
        renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
            insertAtCursor(textarea, emoji);
            emojiPicker.style.display = 'none';
            textarea.focus();
        });
        
        // Add click outside handler to close emoji picker
        document.addEventListener('click', function closeEmojiPicker(e) {
            const target = e.target;
            // Use the emoji button element we created earlier instead of undefined 'btn'
            if (!emojiPicker.contains(target) && !emojiBtn.contains(target)) {
                emojiPicker.style.display = 'none';
                document.removeEventListener('click', closeEmojiPicker);
            }
        });
    }

    // Global event delegation for all other emoji pickers
    document.body.addEventListener('click', function(e) {
        // Reply emoji button
        if (e.target.classList.contains('reply-emoji-btn')) {
            console.log('Reply emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.reply-input-container');
            const picker = container.querySelector('.reply-emoji-picker');
            const grid = container.querySelector('.reply-emoji-grid');
            const textarea = container.querySelector('.reply-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
        
        // Edit comment emoji button
        if (e.target.classList.contains('edit-emoji-btn')) {
            console.log('Edit comment emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.edit-input-container');
            const picker = container.querySelector('.edit-emoji-picker');
            const grid = container.querySelector('.edit-emoji-grid');
            const textarea = container.querySelector('.edit-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Edit comment emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
        
        // Edit reply emoji button
        if (e.target.classList.contains('edit-reply-emoji-btn')) {
            console.log('Edit reply emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.edit-reply-input-container');
            const picker = container.querySelector('.edit-reply-emoji-picker');
            const grid = container.querySelector('.edit-reply-emoji-grid');
            const textarea = container.querySelector('.edit-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Edit reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
    });
    
    console.log('Emoji picker initialization complete');
}

function insertAtCursor(textarea, text) {
    if (!textarea) {
        console.error('Textarea not found for emoji insertion');
        return;
    }
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    
    // Trigger input event to ensure any listeners are notified
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('Emoji inserted at cursor:', text);
}
// === END Emoji Picker Support ===

// === GIF Picker Support ===
const GIPHY_API_KEY = 'GlVGY86kr3Wt31Vq8NLj5zQYJzbcFQG'; // Public beta key - you can replace with your own
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Mock GIF data for testing when API is unavailable
const MOCK_GIFS = {
    'dog': [
        {
            title: 'Happy Dog',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Cute Puppy',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ],
    'cat': [
        {
            title: 'Sleepy Cat',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Playful Cat',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ],
    'default': [
        {
            title: 'Funny GIF',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Cool GIF',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ]
};

async function searchGifs(query, limit = 20) {
    try {
        // Try the real API first
        const response = await fetch(`${GIPHY_BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=g`);
        
        if (!response.ok) {
            console.log('Giphy API unavailable, using mock data');
            // Fallback to mock data
            const mockData = MOCK_GIFS[query.toLowerCase()] || MOCK_GIFS['default'];
            return mockData.slice(0, limit);
        }
        
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.log('Giphy API error, using mock data:', error);
        // Fallback to mock data
        const mockData = MOCK_GIFS[query.toLowerCase()] || MOCK_GIFS['default'];
        return mockData.slice(0, limit);
    }
}

async function getTrendingGifs(limit = 20) {
    try {
        // Try the real API first
        const response = await fetch(`${GIPHY_BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`);
        
        if (!response.ok) {
            console.log('Giphy API unavailable, using mock data');
            // Fallback to mock data
            return MOCK_GIFS['default'].slice(0, limit);
        }
        
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.log('Giphy API error, using mock data:', error);
        // Fallback to mock data
        return MOCK_GIFS['default'].slice(0, limit);
    }
}

function renderGifGrid(gifs, gridElem, onGifClick) {
    gridElem.innerHTML = '';
    
    if (!gifs || gifs.length === 0) {
        gridElem.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No GIFs found. Try a different search term.</div>';
        return;
    }
    
    gifs.forEach(gif => {
        const gifItem = document.createElement('div');
        gifItem.className = 'gif-item';
        gifItem.innerHTML = `
            <img src="${gif.images.fixed_height_small.url}" 
                 alt="${gif.title}" 
                 data-gif-url="${gif.images.original.url}"
                 data-gif-title="${gif.title}">
        `;
        gifItem.addEventListener('click', () => onGifClick(gif.images.original.url, gif.title));
        gridElem.appendChild(gifItem);
    });
}

function initializeGifPicker() {
    // Main comment input
    const gifBtn = document.getElementById('comment-gif-btn');
    const gifPicker = document.getElementById('comment-gif-picker');
    const gifGrid = document.getElementById('comment-gif-grid');
    const gifSearch = document.getElementById('comment-gif-search');
    const gifSearchBtn = document.getElementById('comment-gif-search-btn');
    const gifLoading = document.getElementById('comment-gif-loading');
    const textarea = document.getElementById('comment-input');
    
    console.log('GIF picker elements:', { gifBtn, gifPicker, gifGrid, gifSearch, gifSearchBtn, gifLoading, textarea });
    
    if (gifBtn && gifPicker && gifGrid && textarea) {
        // Load trending GIFs on first open
        let isFirstOpen = true;
        
        gifBtn.addEventListener('click', async (e) => {
            console.log('GIF button clicked!');
            e.stopPropagation();
            gifPicker.style.display = gifPicker.style.display === 'block' ? 'none' : 'block';
            
            if (isFirstOpen) {
                gifLoading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, gifGrid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    gifPicker.style.display = 'none';
                    textarea.focus();
                });
                gifLoading.style.display = 'none';
                isFirstOpen = false;
            }
        });
        
        // Search functionality
        gifSearchBtn.addEventListener('click', async () => {
            const query = gifSearch.value.trim();
            if (query) {
                gifLoading.style.display = 'block';
                const gifs = await searchGifs(query);
                renderGifGrid(gifs, gifGrid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    gifPicker.style.display = 'none';
                    textarea.focus();
                });
                gifLoading.style.display = 'none';
            }
        });
        
        // Search on Enter key
        gifSearch.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = gifSearch.value.trim();
                if (query) {
                    gifLoading.style.display = 'block';
                    const gifs = await searchGifs(query);
                    renderGifGrid(gifs, gifGrid, (gifUrl, gifTitle) => {
                        insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                        gifPicker.style.display = 'none';
                        textarea.focus();
                    });
                    gifLoading.style.display = 'none';
                }
            }
        });
        
        gifPicker.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => gifPicker.style.display = 'none');
    }

    // Delegate for reply and edit GIF pickers
    document.body.addEventListener('click', async function(e) {
        // Reply input
        if (e.target.classList.contains('reply-gif-btn')) {
            console.log('Reply GIF button clicked!');
            const container = e.target.closest('.reply-input-container');
            const picker = container.querySelector('.reply-gif-picker');
            const grid = container.querySelector('.reply-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.reply-gif-loading');
            const textarea = container.querySelector('.reply-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
        
        // Edit comment input
        if (e.target.classList.contains('edit-gif-btn')) {
            const container = e.target.closest('.edit-input-container');
            const picker = container.querySelector('.edit-gif-picker');
            const grid = container.querySelector('.edit-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.edit-gif-loading');
            const textarea = container.querySelector('.edit-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
        
        // Edit reply input
        if (e.target.classList.contains('edit-reply-gif-btn')) {
            const container = e.target.closest('.edit-reply-input-container');
            const picker = container.querySelector('.edit-reply-gif-picker');
            const grid = container.querySelector('.edit-reply-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.edit-reply-gif-loading');
            const textarea = container.querySelector('.edit-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
    });
    
    // GIF Search functionality - separate event delegation
    document.body.addEventListener('click', async function(e) {
        // Handle GIF search button clicks
        if (e.target.classList.contains('gif-search-btn')) {
            const container = e.target.closest('.gif-picker, .reply-gif-picker, .edit-gif-picker, .edit-reply-gif-picker');
            const search = container.querySelector('.gif-search-input');
            const grid = container.querySelector('.gif-grid, .reply-gif-grid, .edit-gif-grid, .edit-reply-gif-grid');
            const loading = container.querySelector('.gif-loading, .reply-gif-loading, .edit-gif-loading, .edit-reply-gif-loading');
            const textarea = container.closest('.comment-input-container, .reply-input-container, .edit-input-container, .edit-reply-input-container').querySelector('textarea');
            
            const query = search.value.trim();
            if (query) {
                loading.style.display = 'block';
                const gifs = await searchGifs(query);
                renderGifGrid(gifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    container.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
        }
    });
    
    // GIF Search Enter key functionality
    document.body.addEventListener('keypress', async function(e) {
        if (e.target.classList.contains('gif-search-input') && e.key === 'Enter') {
            const container = e.target.closest('.gif-picker, .reply-gif-picker, .edit-gif-picker, .edit-reply-gif-picker');
            const search = e.target;
            const grid = container.querySelector('.gif-grid, .reply-gif-grid, .edit-gif-grid, .edit-reply-gif-grid');
            const loading = container.querySelector('.gif-loading, .reply-gif-loading, .edit-gif-loading, .edit-reply-gif-loading');
            const textarea = container.closest('.comment-input-container, .reply-input-container, .edit-input-container, .edit-reply-input-container').querySelector('textarea');
            
            const query = search.value.trim();
            if (query) {
                loading.style.display = 'block';
                const gifs = await searchGifs(query);
                renderGifGrid(gifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    container.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
        }
    });
}
// === END GIF Picker Support ===

// Initialize the panel
console.log('=== EXTENSION LOADED ===');
console.log('Content script version:', Date.now());
createCommentsPanel();

// Listen for messages from popup to reopen panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openCommentsPanel') {
        console.log('Received request to open comments panel');
        
        // Check if panel already exists
        const existingPanel = document.getElementById('webpage-comments-panel');
        if (existingPanel) {
            console.log('Panel already exists, showing it');
            existingPanel.style.display = 'flex';
            const floatingIcon = document.getElementById('comments-floating-icon');
            if (floatingIcon) {
                floatingIcon.style.display = 'none';
            }
        } else {
            console.log('Panel does not exist, creating new one');
            createCommentsPanel();
        }
        
        sendResponse({ success: true });
    }
}); 

// Add event listener after rendering comments to handle replies toggle
function addRepliesToggleListeners() {
    console.log('=== ADDING REPLIES TOGGLE LISTENERS ===');
    const toggles = document.querySelectorAll('.replies-toggle');
    console.log('Found toggle elements:', toggles.length);
    
    if (toggles.length === 0) {
        console.error('❌ NO TOGGLE ELEMENTS FOUND!');
        console.log('All elements with "replies" in class:', 
            Array.from(document.querySelectorAll('[class*="replies"]')).map(el => ({
                element: el,
                className: el.className,
                innerHTML: el.innerHTML.substring(0, 100)
            }))
        );
        return;
    }
    
    toggles.forEach((toggle, index) => {
        console.log(`Toggle ${index}:`, {
            element: toggle,
            commentId: toggle.getAttribute('data-comment-id'),
            innerHTML: toggle.innerHTML,
            contentId: `replies-content-${toggle.getAttribute('data-comment-id')}`
        });
        
        // Remove any existing event listeners
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('=== REPLIES TOGGLE CLICKED ===');
            const commentId = this.getAttribute('data-comment-id');
            const content = document.getElementById(`replies-content-${commentId}`);
            
            console.log('Toggle clicked:', {
                commentId,
                contentElement: content,
                contentDisplay: content ? content.style.display : 'element not found',
                currentInnerHTML: this.innerHTML,
                contentComputedStyle: content ? window.getComputedStyle(content).display : 'element not found'
            });
            
            if (content) {
                const currentDisplay = content.style.display;
                const computedDisplay = window.getComputedStyle(content).display;
                
                console.log('Display states:', {
                    styleDisplay: currentDisplay,
                    computedDisplay: computedDisplay,
                    isHidden: currentDisplay === 'none' || currentDisplay === '' || computedDisplay === 'none'
                });
                
                if (currentDisplay === 'none' || currentDisplay === '' || computedDisplay === 'none') {
                    console.log('=== EXPANDING REPLIES ===');
                    
                    // Track expanded state
                    expandedReplies.add(commentId);
                    
                    // Log the content before expanding
                    console.log('Content before expanding:', {
                        innerHTML: content.innerHTML,
                        childNodes: content.childNodes.length,
                        firstChild: content.firstChild,
                        lastChild: content.lastChild
                    });
                    
                    // Clear any existing indicators first
                    const existingIndicators = content.querySelectorAll('div[data-replies-indicator="true"]');
                    existingIndicators.forEach(indicator => indicator.remove());
                    
                    // Make the content visible with proper styling
                    content.style.cssText = `
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        position: relative !important;
                        z-index: 1000 !important;
                        height: auto !important;
                        max-height: 500px !important;
                        min-height: 50px !important;
                        overflow-y: auto !important;
                        clip: auto !important;
                        clip-path: none !important;
                        background-color: #f8f9fa !important;
                        border: 1px solid #e9ecef !important;
                        border-radius: 4px !important;
                        padding: 10px !important;
                        margin-top: 5px !important;
                        margin-bottom: 5px !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        color: #333 !important;
                        font-weight: normal !important;
                        font-size: 14px !important;
                    `;
                    
                    this.innerHTML = this.innerHTML.replace('▼', '▲');
                    
                    // Force a reflow to ensure the display change takes effect
                    content.offsetHeight;
                    
                    // Add a subtle indicator with a unique data attribute
                    const indicator = document.createElement('div');
                    indicator.setAttribute('data-replies-indicator', 'true');
                    indicator.style.cssText = `
                        background: #e3f2fd !important;
                        color: #1976d2 !important;
                        padding: 8px !important;
                        margin: 8px 0 !important;
                        font-weight: 500 !important;
                        border: 1px solid #bbdefb !important;
                        border-radius: 4px !important;
                        font-size: 14px !important;
                        text-align: center !important;
                        position: relative !important;
                        z-index: 10000 !important;
                    `;
                    indicator.textContent = '📋 Replies expanded';
                    content.insertBefore(indicator, content.firstChild);
                    
                    console.log('After expanding:', {
                        newDisplay: content.style.display,
                        newComputedDisplay: window.getComputedStyle(content).display,
                        newInnerHTML: this.innerHTML,
                        contentVisible: content.offsetHeight > 0,
                        contentHeight: content.offsetHeight,
                        contentWidth: content.offsetWidth,
                        contentTop: content.offsetTop,
                        contentLeft: content.offsetLeft,
                        contentRect: content.getBoundingClientRect(),
                        parentDisplay: content.parentElement ? window.getComputedStyle(content.parentElement).display : 'no parent',
                        parentVisibility: content.parentElement ? window.getComputedStyle(content.parentElement).visibility : 'no parent',
                        contentHTML: content.innerHTML.substring(0, 500) + '...'
                    });
                } else {
                    console.log('=== COLLAPSING REPLIES ===');
                    
                    // Track collapsed state
                    expandedReplies.delete(commentId);
                    
                    // Remove all indicators using the data attribute
                    const indicators = content.querySelectorAll('div[data-replies-indicator="true"]');
                    indicators.forEach(indicator => indicator.remove());
                    
                    content.style.display = 'none';
                    this.innerHTML = this.innerHTML.replace('▲', '▼');
                    console.log('After collapsing:', {
                        newDisplay: content.style.display,
                        newComputedDisplay: window.getComputedStyle(content).display,
                        newInnerHTML: this.innerHTML
                    });
                }
            } else {
                console.error('Content element not found for commentId:', commentId);
                console.log('Available elements with similar IDs:', 
                    Array.from(document.querySelectorAll('[id*="replies-content"]')).map(el => el.id)
                );
            }
        });
    });
}

// Function to restore expanded replies state
function restoreExpandedRepliesState() {
    console.log('=== RESTORING EXPANDED REPLIES STATE ===');
    console.log('Expanded replies:', Array.from(expandedReplies));
    
    expandedReplies.forEach(commentId => {
        const toggle = document.querySelector(`.replies-toggle[data-comment-id="${commentId}"]`);
        const content = document.getElementById(`replies-content-${commentId}`);
        
        if (toggle && content) {
            console.log(`Restoring expanded state for comment: ${commentId}`);
            
            // Expand the replies
            content.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: relative !important;
                z-index: 1000 !important;
                height: auto !important;
                max-height: 500px !important;
                min-height: 50px !important;
                overflow-y: auto !important;
                clip: auto !important;
                clip-path: none !important;
                background-color: #f8f9fa !important;
                border: 1px solid #e9ecef !important;
                border-radius: 4px !important;
                padding: 10px !important;
                margin-top: 5px !important;
                margin-bottom: 5px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                color: #333 !important;
                font-weight: normal !important;
                font-size: 14px !important;
            `;
            
            toggle.innerHTML = toggle.innerHTML.replace('▼', '▲');
            
            // Add indicator
            const indicator = document.createElement('div');
            indicator.setAttribute('data-replies-indicator', 'true');
            indicator.style.cssText = `
                background: #e3f2fd !important;
                color: #1976d2 !important;
                padding: 8px !important;
                margin: 8px 0 !important;
                font-weight: 500 !important;
                border: 1px solid #bbdefb !important;
                border-radius: 4px !important;
                font-size: 14px !important;
                text-align: center !important;
                position: relative !important;
                z-index: 10000 !important;
            `;
            indicator.textContent = '📋 Replies expanded';
            content.insertBefore(indicator, content.firstChild);
        }
    });
}

// After rendering comments, call addRepliesToggleListeners
// In loadComments, after commentsList.innerHTML = renderComments(...), add:
// addRepliesToggleListeners();

// WebSocket helper functions
function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `websocket-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'comment': return '💬';
        case 'reply': return '↩️';
        case 'user-join': return '👋';
        default: return '🔔';
    }
}

function refreshComments() {
    // Reload comments without scrolling to top
    loadComments();
}

function updateReactionUI(data) {
    const { targetId, targetType, newCounts } = data;
    
    const targetElement = targetType === 'comment' 
        ? document.querySelector(`[data-comment-id="${targetId}"]`)
        : document.querySelector(`[data-reply-id="${targetId}"]`);
    
    if (!targetElement) return;
    
    if (targetType === 'comment') {
        const likeBtn = targetElement.querySelector('.like-btn');
        const dislikeBtn = targetElement.querySelector('.dislike-btn');
        const trustBtn = targetElement.querySelector('.trust-btn');
        const distrustBtn = targetElement.querySelector('.distrust-btn');
        const flagBtn = targetElement.querySelector('.flag-btn');
        if (likeBtn) likeBtn.textContent = `👍 ${newCounts.likes}`;
        if (dislikeBtn) dislikeBtn.textContent = `👎 ${newCounts.dislikes}`;
        if (trustBtn) trustBtn.textContent = `✅ ${newCounts.trusts}`;
        if (distrustBtn) distrustBtn.textContent = `❌ ${newCounts.distrusts}`;
        if (flagBtn) flagBtn.textContent = `🚩 ${newCounts.flags || 0}`;
    } else {
        const likeBtn = targetElement.querySelector('.like-reply-btn');
        const dislikeBtn = targetElement.querySelector('.dislike-reply-btn');
        const trustBtn = targetElement.querySelector('.trust-reply-btn');
        const distrustBtn = targetElement.querySelector('.distrust-reply-btn');
        const flagBtn = targetElement.querySelector('.flag-reply-btn');
        if (likeBtn) likeBtn.textContent = `👍 ${newCounts.likes}`;
        if (dislikeBtn) dislikeBtn.textContent = `👎 ${newCounts.dislikes}`;
        if (trustBtn) trustBtn.textContent = `✅ ${newCounts.trusts}`;
        if (distrustBtn) distrustBtn.textContent = `❌ ${newCounts.distrusts}`;
        if (flagBtn) flagBtn.textContent = `🚩 ${newCounts.flags || 0}`;
    }
}

function showTypingIndicator(data) {
    const { commentId, parentReplyId, typingUsers } = data;
    
    // Create typing indicator key
    const key = `${commentId || 'main'}-${parentReplyId || 'root'}`;
    
    // Find target container
    let container;
    if (commentId && parentReplyId !== 'root') {
        container = document.querySelector(`[data-reply-id="${parentReplyId}"]`);
    } else if (commentId) {
        container = document.querySelector(`[data-comment-id="${commentId}"]`);
    } else {
        container = document.getElementById('comments-list');
    }
    
    if (!container) return;
    
    // Remove existing typing indicator
    const existingIndicator = container.querySelector('.typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Show typing indicator if users are typing
    if (typingUsers.length > 0) {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        
        const names = typingUsers.map(u => u.user.name).join(', ');
        const verb = typingUsers.length === 1 ? 'is' : 'are';
        
        indicator.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span class="typing-text">${names} ${verb} typing...</span>
        `;
        
        container.appendChild(indicator);
    }
}

function updateActiveUsersUI(users) {
    // Update active users count in header
    const header = document.querySelector('.comments-header h3');
    if (header) {
        const count = users.length;
        const baseText = 'Comments';
        const userText = count > 0 ? ` (${count} online)` : '';
        header.textContent = baseText + userText;
    }
}

function updateActiveUsersCount(count) {
    const header = document.querySelector('.comments-header h3');
    if (header) {
        const baseText = 'Comments';
        const userText = count > 0 ? ` (${count} online)` : '';
        header.textContent = baseText + userText;
    }
}

function showCollaborativeCursor(data) {
    const { user, scrollY, viewportHeight } = data;
    
    // Remove existing cursor for this user
    const existingCursor = document.querySelector(`[data-user-id="${user.email}"]`);
    if (existingCursor) {
        existingCursor.remove();
    }
    
    // Create collaborative cursor
    const cursor = document.createElement('div');
    cursor.className = 'collaborative-cursor';
    cursor.setAttribute('data-user-id', user.email);
    cursor.innerHTML = `
        <div class="cursor-indicator"></div>
        <div class="cursor-label">${user.name}</div>
    `;
    
    // Position cursor based on scroll
    cursor.style.position = 'fixed';
    cursor.style.right = '10px';
    cursor.style.top = `${Math.min(scrollY / document.body.scrollHeight * window.innerHeight, window.innerHeight - 50)}px`;
    cursor.style.zIndex = '2147483647';
    
    document.body.appendChild(cursor);
    
    // Remove cursor after 5 seconds of inactivity
    setTimeout(() => {
        if (cursor.parentNode) {
            cursor.remove();
        }
    }, 5000);
}

// Add typing detection to input fields
function addTypingDetection() {
    document.addEventListener('input', (e) => {
        if (e.target.matches('#comment-input') || e.target.matches('.reply-input')) {
            if (!socket || !currentUser) return;
            
            // Clear existing timer
            if (typingTimer) clearTimeout(typingTimer);
            
            // Get context info
            const commentId = e.target.getAttribute('data-comment-id');
            const parentReplyId = e.target.getAttribute('data-parent-reply-id');
            
            // Emit typing start
            socket.emit('typing-start', {
                url: window.location.href,
                user: currentUser,
                commentId,
                parentReplyId
            });
            
            // Set timer to emit typing stop
            typingTimer = setTimeout(() => {
                socket.emit('typing-stop', {
                    url: window.location.href,
                    commentId,
                    parentReplyId
                });
            }, 2000);
        }
    });
}

// Add scroll tracking for collaborative cursors
function addScrollTracking() {
    let lastScrollY = 0;
    
    window.addEventListener('scroll', () => {
        if (!socket || !currentUser) return;
        
        // Clear existing timer
        if (scrollTimer) clearTimeout(scrollTimer);
        
        // Throttle scroll events
        scrollTimer = setTimeout(() => {
            const scrollY = window.scrollY;
            const viewportHeight = window.innerHeight;
            
            // Only emit if scroll position changed significantly
            if (Math.abs(scrollY - lastScrollY) > 50) {
                socket.emit('scroll-position', {
                    url: window.location.href,
                    scrollY,
                    viewportHeight
                });
                lastScrollY = scrollY;
            }
        }, 100);
    });
}

// Initialize WebSocket features
setTimeout(() => {
    addTypingDetection();
    addScrollTracking();
}, 1000);