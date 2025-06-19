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
                    </div>
                </div>
                <button id="toggle-comments">−</button>
            </div>
        </div>
        <div class="comments-content">
            <div id="auth-message" class="auth-message hidden">
                Please sign in to add comments
            </div>
            <div id="comments-list"></div>
            <div class="comment-input-container">
                <textarea id="comment-input" placeholder="Add a comment..."></textarea>
                <button id="submit-comment">Post</button>
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
    document.getElementById('toggle-comments').addEventListener('click', () => {
        toggleComments();
        savePanelState(panel);
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

const API_BASE_URL = 'https://wavespeed-final-for-render-com.onrender.com/api';

// Add this at the top of the file with other global variables
let currentSortBy = 'newest';

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

        // Add event listeners for like/dislike
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'like');
            });
        });
        document.querySelectorAll('.dislike-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'dislike');
            });
        });
        // Add event listeners for reply
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const commentId = this.getAttribute('data-comment-id');
                showReplyInput(commentId);
            });
        });
        // Add event listeners for edit
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const commentId = this.getAttribute('data-comment-id');
                showEditInput(commentId);
            });
        });
        // Add event listeners for delete
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                if (confirm('Are you sure you want to delete this comment and all its replies?')) {
                    await deleteComment(commentId);
                }
            });
        });
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
    const input = document.getElementById('comment-input');
    const comment = input.value.trim();
    
    if (comment) {
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
            if (!result.isAuthenticated) {
                alert('Please sign in to add comments');
                return;
            }

            const currentUrl = window.location.href;
            console.log('Submitting comment:', { url: currentUrl, text: comment, user: result.user });
            
            const response = await fetch(`${API_BASE_URL}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: currentUrl,
                    text: comment,
                    user: result.user
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

            const savedComment = await response.json();
            console.log('Comment submitted successfully:', savedComment);

            input.value = '';
            await loadComments(currentSortBy);
        } catch (error) {
            console.error('Failed to submit comment:', error);
            alert('Failed to submit comment. Please try again.');
        }
    }
}

// Handle like/dislike actions
async function handleLikeDislike(commentId, action) {
    try {
        const result = await chrome.storage.local.get(['user']);
        const userEmail = result.user ? result.user.email : null;
        if (!userEmail) {
            alert('Please sign in to like or dislike comments');
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
        alert('Failed to update reaction. Please try again.');
    }
}

// Submit a reply
async function submitReply(commentId, replyText) {
    const text = replyText.trim();
    if (!text) return;
    try {
        const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
        if (!result.isAuthenticated) {
            alert('Please sign in to reply to comments');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/replies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text,
                user: result.user
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit reply');
        }

        loadComments();
    } catch (error) {
        console.error('Failed to submit reply:', error);
    }
}

// Show reply input for a comment
function showReplyInput(commentId) {
    // Hide all other reply inputs
    document.querySelectorAll('.reply-input-container').forEach(el => el.style.display = 'none');
    const container = document.getElementById('reply-input-' + commentId);
    if (container) {
        container.innerHTML = `
            <textarea class="reply-textarea" style="width:100%;min-height:40px;"></textarea>
            <button class="submit-reply-btn" style="margin-top:4px;">Reply</button>
        `;
        container.style.display = 'block';
        const btn = container.querySelector('.submit-reply-btn');
        btn.addEventListener('click', async function() {
            const replyText = container.querySelector('.reply-textarea').value;
            await submitReply(commentId, replyText);
            container.style.display = 'none';
        });
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
            <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
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
        const userEmail = result.user ? result.user.email : null;
        if (!userEmail) {
            alert('Please sign in to delete comments');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/comments/${commentId}?userEmail=${encodeURIComponent(userEmail)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete comment');
        }

        loadComments();
    } catch (error) {
        console.error('Failed to delete comment:', error);
    }
}

// Modify renderComments to use comment IDs
function renderComments(comments, userEmail, currentUrl) {
    return comments.map(comment => {
        const isLiked = comment.likedBy && comment.likedBy.includes(userEmail);
        const isDisliked = comment.dislikedBy && comment.dislikedBy.includes(userEmail);
        
        return `
            <div class="comment" data-comment-id="${comment._id}">
                <div class="comment-header">
                    <img src="${comment.user.picture}" alt="Profile" class="comment-avatar">
                    <div class="comment-info">
                        <div class="comment-author">${comment.user.name}</div>
                        <div class="comment-time">${new Date(comment.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="comment-text" id="comment-text-${comment._id}">${comment.text}</div>
                <div class="comment-actions">
                    <button class="like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${comment._id}">
                        👍 ${comment.likes || 0}
                    </button>
                    <button class="dislike-btn ${isDisliked ? 'disliked' : ''}" data-comment-id="${comment._id}">
                        👎 ${comment.dislikes || 0}
                    </button>
                    <button class="reply-btn" data-comment-id="${comment._id}">Reply</button>
                    ${comment.user.email === userEmail ? `
                        <button class="edit-btn" data-comment-id="${comment._id}">Edit</button>
                        <button class="delete-btn" data-comment-id="${comment._id}">Delete</button>
                    ` : ''}
                </div>
                <div class="edit-input-container" id="edit-input-${comment._id}" style="display:none;"></div>
                <div class="reply-input-container" id="reply-input-${comment._id}" style="display:none;"></div>
                ${comment.replies && comment.replies.length > 0 ? `
                    <div class="replies">
                        ${comment.replies.map(reply => {
                            const isReplyLiked = reply.likedBy && reply.likedBy.includes(userEmail);
                            const isReplyDisliked = reply.dislikedBy && reply.dislikedBy.includes(userEmail);
                            return `
                                <div class="reply" data-reply-id="${reply._id}">
                                    <div class="reply-header">
                                        <img src="${reply.user.picture}" alt="Profile" class="reply-avatar">
                                        <div class="reply-info">
                                            <div class="reply-author">${reply.user.name}</div>
                                            <div class="reply-time">${new Date(reply.timestamp).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div class="reply-text">${reply.text}</div>
                                    <div class="reply-actions">
                                        <button class="like-btn ${isReplyLiked ? 'liked' : ''}" data-reply-id="${reply._id}">
                                            👍 ${reply.likes || 0}
                                        </button>
                                        <button class="dislike-btn ${isReplyDisliked ? 'disliked' : ''}" data-reply-id="${reply._id}">
                                            👎 ${reply.dislikes || 0}
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
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
                document.getElementById('toggle-comments').textContent = '+';
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
            case 'newest':
            default:
                return new Date(b.timestamp) - new Date(a.timestamp);
        }
    });
}

// Initialize the panel
createCommentsPanel(); 