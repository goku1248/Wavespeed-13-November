// Create and inject the comments panel
async function createCommentsPanel() {
    console.log('Creating comments panel...');
    const panel = document.createElement('div');
    panel.id = 'webpage-comments-panel';
    panel.innerHTML = `
        <div id="comments-resizer"></div>
        <div class="comments-header" id="comments-header">
            <h3>Comments</h3>
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
            <div class="emoji-picker" id="comment-emoji-picker" style="display: none;">
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
            </div>
            <div class="gif-picker" id="comment-gif-picker" style="display: none;">
                <div class="gif-search-container">
                    <input type="text" class="gif-search-input" placeholder="Search GIFs..." id="comment-gif-search">
                    <button class="gif-search-btn" id="comment-gif-search-btn">🔍</button>
                </div>
                <div class="gif-grid" id="comment-gif-grid"></div>
                <div class="gif-loading" id="comment-gif-loading" style="display: none;">Loading...</div>
            </div>
        </div>
        <div id="comments-bottom-resizer"></div>
    `;
    document.body.appendChild(panel);

    // Set initial position
    panel.style.position = 'fixed';
    
    // Restore saved state
    await restorePanelState(panel);
    
    // If no saved state, set default position
    if (!panel.style.left && !panel.style.right) {
        panel.style.right = '20px';
        panel.style.top = '20px';
    }

    // Add resizer and drag functionality
    addPanelResizer(panel);
    addPanelBottomResizer(panel);
    addPanelDragger(panel);

    // Add event listeners
    document.getElementById('minimize-comments').addEventListener('click', () => {
        panel.style.display = 'none';
        const floatingIcon = document.getElementById('comments-floating-icon');
        floatingIcon.style.display = 'flex';
    });
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
    floatingIcon.style.display = 'none';
    document.body.appendChild(floatingIcon);

    // Add minimize/restore logic after panel is added to DOM
    setTimeout(() => {
        const panel = document.getElementById('webpage-comments-panel');
        const minimizeBtn = document.getElementById('minimize-comments');
        const maximizeBtn = document.getElementById('maximize-comments');
        const closeBtn = document.getElementById('close-comments');
        const floatingIcon = document.getElementById('comments-floating-icon');
        
        // Store state in panel data attributes for persistence
        if (!panel.dataset.isMaximized) {
            panel.dataset.isMaximized = 'false';
        }
        
        if (minimizeBtn && panel && floatingIcon) {
            minimizeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
                floatingIcon.style.display = 'flex';
            });
            floatingIcon.addEventListener('click', () => {
                panel.style.display = 'flex';
                floatingIcon.style.display = 'none';
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
            authMessage.classList.add('hidden');
            commentInput.disabled = false;
            submitButton.disabled = false;
        } else {
            authMessage.classList.remove('hidden');
            commentInput.disabled = true;
            submitButton.disabled = true;
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

// Add this at the top of the file with other global variables
let currentSortBy = 'newest';

// Track expanded replies state
let expandedReplies = new Set();

// Load and display comments
async function loadComments(sortBy = currentSortBy) {
    console.log('Loading comments with sort:', sortBy);
    currentSortBy = sortBy;
    const commentsList = document.getElementById('comments-list');
    const sortDropdown = document.getElementById('sort-comments');
    const currentUrl = window.location.href;
    let userEmail = null;
    
    if (sortDropdown) {
        sortDropdown.value = sortBy;
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
        const response = await fetch(`${API_BASE_URL}/comments?url=${encodeURIComponent(currentUrl)}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response not OK:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`Failed to load comments: ${errorText}`);
        }
        
        let comments = await response.json();
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
                
                const commentId = this.closest('.comment').getAttribute('data-comment-id');
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
                    parentReplyIdAttr 
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
        const replyLikeButtons = document.querySelectorAll('.reply .like-btn');
        const replyDislikeButtons = document.querySelectorAll('.reply .dislike-btn');
        const replyTrustButtons = document.querySelectorAll('.reply .trust-btn');
        const replyDistrustButtons = document.querySelectorAll('.reply .distrust-btn');
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
        commentsList.innerHTML = `
            <div class="error-message">
                Failed to load comments. Please try refreshing the page.
                <br>
                <small>Error: ${error.message}</small>
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
        const response = await fetch(`${API_BASE_URL}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: currentUrl,
                text,
                user: userData.user
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to submit comment:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to submit comment: ${errorText}`);
        }

        const newComment = await response.json();
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

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/reaction`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: action,
                userEmail
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to update reaction:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to update reaction: ${errorText}`);
        }

        const updatedComment = await response.json();
        console.log('Reaction updated successfully:', updatedComment);

        await loadComments(currentSortBy);
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

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/replies/${replyId}/reaction`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: action,
                userEmail
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to update reply reaction:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to update reply reaction: ${errorText}`);
        }

        const updatedComment = await response.json();
        await loadComments(currentSortBy);
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

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/replies/${parentReplyId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text,
                user: userData.user
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to submit reply. Server response:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                url: response.url
            });
            throw new Error(`Server error (${response.status}): ${errorText}`);
        }

        const responseData = await response.json();
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

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text,
                userEmail
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save edit');
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
        const response = await fetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: userEmail })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete comment');
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
                    <button class="like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${comment._id}">
                        👍 ${comment.likes || 0}
                    </button>
                    <button class="dislike-btn ${isDisliked ? 'disliked' : ''}" data-comment-id="${comment._id}">
                        👎 ${comment.dislikes || 0}
                    </button>
                    <button class="trust-btn ${isTrusted ? 'trusted' : ''}" data-comment-id="${comment._id}">
                        ✅ ${comment.trusts || 0}
                    </button>
                    <button class="distrust-btn ${isDistrusted ? 'distrusted' : ''}" data-comment-id="${comment._id}">
                        ❌ ${comment.distrusts || 0}
                    </button>
                    <button class="reply-btn" data-comment-id="${comment._id}">Reply</button>
                    ${comment.user?.email === userEmail ? `
                        <button class="edit-btn" data-comment-id="${comment._id}">Edit</button>
                        <button class="delete-btn" data-comment-id="${comment._id}">Delete</button>
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
        const replyButtonHtml = `<button class="reply-btn" data-comment-id="${commentId}" ${reply._id ? `data-parent-reply-id="${reply._id}"` : ''}>Reply</button>`;
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
                    <button class="like-btn ${isReplyLiked ? 'liked' : ''}" data-reply-id="${reply._id}">
                        👍 ${reply.likes || 0}
                    </button>
                    <button class="dislike-btn ${isReplyDisliked ? 'disliked' : ''}" data-reply-id="${reply._id}">
                        👎 ${reply.dislikes || 0}
                    </button>
                    <button class="trust-btn ${isReplyTrusted ? 'trusted' : ''}" data-reply-id="${reply._id}">
                        ✅ ${reply.trusts || 0}
                    </button>
                    <button class="distrust-btn ${isReplyDistrusted ? 'distrusted' : ''}" data-reply-id="${reply._id}">
                        ❌ ${reply.distrusts || 0}
                    </button>
                    <button class="reply-btn" data-comment-id="${commentId}" ${reply._id ? `data-parent-reply-id="${reply._id}"` : ''}>Reply</button>
                    ${reply.user?.email === userEmail ? `
                        <button class="edit-reply-btn" data-reply-id="${reply._id}">Edit</button>
                        <button class="delete-reply-btn" data-reply-id="${reply._id}">Delete</button>
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
async function savePanelState(panel) {
    const rect = panel.getBoundingClientRect();
    const state = {
        width: panel.style.width,
        height: panel.style.height,
        left: rect.left,
        top: rect.top,
        right: window.innerWidth - rect.right,
        isCollapsed: panel.querySelector('.comments-content').style.display === 'none'
    };
    await chrome.storage.local.set({ panelState: state });
}

// Restore panel state from storage
async function restorePanelState(panel) {
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
        console.error('Failed to restore panel state:', error);
    }
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
    
    emojis.forEach(emoji => {
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
    });
    console.log('Emoji grid rendered with', gridElem.children.length, 'items');
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
                const pickerWidth = 280; // Width of the emoji picker
                const viewportWidth = window.innerWidth;
                
                // Calculate left position to keep picker within viewport
                let leftPos = buttonRect.left;
                if (leftPos + pickerWidth > viewportWidth) {
                    leftPos = viewportWidth - pickerWidth - 10; // 10px margin from edge
                }
                if (leftPos < 10) {
                    leftPos = 10; // 10px margin from left edge
                }
                
                emojiPicker.style.left = leftPos + 'px';
                emojiPicker.style.top = (buttonRect.bottom + 4) + 'px';
                emojiPicker.style.display = 'block';
                
                console.log('Button position:', buttonRect);
                console.log('Emoji picker position:', {
                    left: emojiPicker.style.left,
                    top: emojiPicker.style.top,
                    viewportWidth,
                    pickerWidth
                });
                console.log('Emoji picker computed styles:', {
                    display: window.getComputedStyle(emojiPicker).display,
                    position: window.getComputedStyle(emojiPicker).position,
                    zIndex: window.getComputedStyle(emojiPicker).zIndex,
                    visibility: window.getComputedStyle(emojiPicker).visibility
                });
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
        
        // Test: Force emoji picker to be visible for debugging
        console.log('Testing emoji picker visibility...');
        emojiPicker.style.display = 'block';
        emojiPicker.style.left = '100px';
        emojiPicker.style.top = '100px';
        emojiPicker.style.backgroundColor = 'red'; // Make it very visible
        console.log('Emoji picker should now be visible at 100,100 with red background');
        setTimeout(() => {
            emojiPicker.style.display = 'none';
            emojiPicker.style.backgroundColor = '';
            console.log('Test complete - emoji picker hidden again');
        }, 3000);
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
                    const pickerWidth = 280; // Width of the emoji picker
                    const viewportWidth = window.innerWidth;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth) {
                        leftPos = viewportWidth - pickerWidth - 10; // 10px margin from edge
                    }
                    if (leftPos < 10) {
                        leftPos = 10; // 10px margin from left edge
                    }
                    
                    picker.style.left = leftPos + 'px';
                    picker.style.top = (buttonRect.bottom + 4) + 'px';
                    picker.style.display = 'block';
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
                    const pickerWidth = 280; // Width of the emoji picker
                    const viewportWidth = window.innerWidth;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth) {
                        leftPos = viewportWidth - pickerWidth - 10; // 10px margin from edge
                    }
                    if (leftPos < 10) {
                        leftPos = 10; // 10px margin from left edge
                    }
                    
                    picker.style.left = leftPos + 'px';
                    picker.style.top = (buttonRect.bottom + 4) + 'px';
                    picker.style.display = 'block';
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
                    const pickerWidth = 280; // Width of the emoji picker
                    const viewportWidth = window.innerWidth;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth) {
                        leftPos = viewportWidth - pickerWidth - 10; // 10px margin from edge
                    }
                    if (leftPos < 10) {
                        leftPos = 10; // 10px margin from left edge
                    }
                    
                    picker.style.left = leftPos + 'px';
                    picker.style.top = (buttonRect.bottom + 4) + 'px';
                    picker.style.display = 'block';
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