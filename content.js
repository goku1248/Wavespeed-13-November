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

function showEditReplyInput(replyId) {
    document.querySelectorAll('.edit-reply-input-container').forEach(el => el.style.display = 'none');
    const container = document.getElementById('edit-reply-input-' + replyId);
    const textDiv = document.querySelector(`.reply[data-reply-id="${replyId}"] .reply-text`);
    if (container && textDiv) {
        container.innerHTML = `
            <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
            <button class="save-edit-reply-btn" style="margin-top:4px;">Save</button>
            <button class="cancel-edit-reply-btn" style="margin-top:4px;">Cancel</button>
        `;
        container.style.display = 'block';
        const saveBtn = container.querySelector('.save-edit-reply-btn');
        const cancelBtn = container.querySelector('.cancel-edit-reply-btn');
        saveBtn.addEventListener('click', async function() {
            const newText = container.querySelector('.edit-textarea').value;
            const commentId = container.closest('.comment').getAttribute('data-comment-id');
            await saveEditReply(commentId, replyId, newText);
            container.style.display = 'none';
        });
        cancelBtn.addEventListener('click', function() {
            container.style.display = 'none';
        });
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
        const userEmail = result.user ? result.user.email : null;
        if (!userEmail) {
            alert('Please sign in to delete replies');
            return;
        }
        const response = await fetch(`${API_BASE_URL}/comments/${commentId}/replies/${replyId}?userEmail=${encodeURIComponent(userEmail)}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete reply');
        loadComments();
    } catch (error) {
        console.error('Failed to delete reply:', error);
    }
}

// Modify renderComments to use comment IDs
function renderComments(comments, userEmail, currentUrl) {
    return comments.map(comment => {
        const isLiked = comment.likedBy && comment.likedBy.includes(userEmail);
        const isDisliked = comment.dislikedBy && comment.dislikedBy.includes(userEmail);
        const isTrusted = comment.trustedBy && comment.trustedBy.includes(userEmail);
        const isDistrusted = comment.distrustedBy && comment.distrustedBy.includes(userEmail);
        
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
                    <button class="trust-btn ${isTrusted ? 'trusted' : ''}" data-comment-id="${comment._id}">
                        ✅ ${comment.trusts || 0}
                    </button>
                    <button class="distrust-btn ${isDistrusted ? 'distrusted' : ''}" data-comment-id="${comment._id}">
                        ❌ ${comment.distrusts || 0}
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
                            const isReplyTrusted = reply.trustedBy && reply.trustedBy.includes(userEmail);
                            const isReplyDistrusted = reply.distrustedBy && reply.distrustedBy.includes(userEmail);
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
                                        <button class="like-btn ${isReplyLiked ? 'liked' : ''}" data-reply-id="${reply._id}" data-comment-id="${comment._id}">
                                            👍 ${reply.likes || 0}
                                        </button>
                                        <button class="dislike-btn ${isReplyDisliked ? 'disliked' : ''}" data-reply-id="${reply._id}" data-comment-id="${comment._id}">
                                            👎 ${reply.dislikes || 0}
                                        </button>
                                        <button class="trust-btn ${isReplyTrusted ? 'trusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${comment._id}">
                                            ✅ ${reply.trusts || 0}
                                        </button>
                                        <button class="distrust-btn ${isReplyDistrusted ? 'distrusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${comment._id}">
                                            ❌ ${reply.distrusts || 0}
                                        </button>
                                        <button class="reply-btn" data-comment-id="${comment._id}">Reply</button>
                                        ${reply.user.email === userEmail ? `
                                            <button class="edit-reply-btn" data-reply-id="${reply._id}" data-comment-id="${comment._id}">Edit</button>
                                            <button class="delete-reply-btn" data-reply-id="${reply._id}" data-comment-id="${comment._id}">Delete</button>
                                        ` : ''}
                                    </div>
                                    <div class="edit-reply-input-container" id="edit-reply-input-${reply._id}" style="display:none;"></div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Add event listeners for reply like/dislike
document.querySelectorAll('.reply .like-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const replyId = this.getAttribute('data-reply-id');
        const commentId = this.closest('.comment').getAttribute('data-comment-id');
        await handleReplyReaction(commentId, replyId, 'like');
    });
});
document.querySelectorAll('.reply .dislike-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const replyId = this.getAttribute('data-reply-id');
        const commentId = this.closest('.comment').getAttribute('data-comment-id');
        await handleReplyReaction(commentId, replyId, 'dislike');
    });
});

// Add event listeners for reply edit/delete
document.querySelectorAll('.edit-reply-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const replyId = this.getAttribute('data-reply-id');
        showEditReplyInput(replyId);
    });
});

document.querySelectorAll('.delete-reply-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const replyId = this.getAttribute('data-reply-id');
        const commentId = this.closest('.comment').getAttribute('data-comment-id');
        if (confirm('Are you sure you want to delete this reply?')) {
            await deleteReply(commentId, replyId);
        }
    });
});