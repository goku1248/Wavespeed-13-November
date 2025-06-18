const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/webpage-comments';

// Add connection status tracking
let isConnected = false;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB Atlas');
    isConnected = true;
}).catch((error) => {
    console.error('MongoDB connection error:', error);
    isConnected = false;
});

// Add connection monitoring
mongoose.connection.on('disconnected', () => {
    console.error('MongoDB disconnected');
    isConnected = false;
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isConnected = true;
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        database: isConnected ? 'connected' : 'disconnected'
    });
});

// Comment Schema
const commentSchema = new mongoose.Schema({
    url: String,
    text: String,
    user: {
        name: String,
        email: String,
        picture: String
    },
    timestamp: Date,
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    likedBy: [String],
    dislikedBy: [String],
    replies: [{
        text: String,
        user: {
            name: String,
            email: String,
            picture: String
        },
        timestamp: Date,
        likes: { type: Number, default: 0 },
        dislikes: { type: Number, default: 0 },
        likedBy: [String],
        dislikedBy: [String]
    }]
});

const Comment = mongoose.model('Comment', commentSchema);

// API Routes

// Get comments for a URL
app.get('/api/comments', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

        const { url } = req.query;
        console.log('Fetching comments for URL:', url);
        
        if (!url) {
            console.error('URL parameter is missing');
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log('Querying MongoDB for comments...');
        const comments = await Comment.find({ url }).sort({ timestamp: -1 });
        console.log(`Found ${comments.length} comments for URL:`, url);
        
        if (!comments) {
            console.log('No comments found, returning empty array');
            return res.json([]);
        }

        console.log('Sending comments response');
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message });
    }
});

// Create a new comment
app.post('/api/comments', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

        const { url, text, user } = req.body;
        console.log('Creating new comment:', { url, text, user });

        if (!url || !text || !user) {
            console.error('Missing required fields:', { url, text, user });
            return res.status(400).json({ error: 'URL, text, and user are required' });
        }

        const comment = new Comment({
            url,
            text,
            user,
            timestamp: new Date()
        });

        console.log('Saving comment to database...');
        const savedComment = await comment.save();
        console.log('Comment created successfully:', savedComment._id);
        res.json(savedComment);
    } catch (error) {
        console.error('Error creating comment:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message });
    }
});

// Add a reply to a comment
app.post('/api/comments/:commentId/replies', async (req, res) => {
    try {
        const { text, user } = req.body;
        const commentId = req.params.commentId;
        console.log('Adding reply to comment:', { commentId, text, user });

        if (!text || !user) {
            return res.status(400).json({ error: 'Text and user are required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        comment.replies.push({
            text,
            user,
            timestamp: new Date()
        });
        await comment.save();
        console.log('Reply added successfully');
        res.json(comment);
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update like/dislike status
app.put('/api/comments/:commentId/reaction', async (req, res) => {
    try {
        const { type, userEmail } = req.body;
        const commentId = req.params.commentId;
        console.log('Updating reaction:', { commentId, type, userEmail });

        if (!type || !userEmail) {
            return res.status(400).json({ error: 'Type and userEmail are required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (type === 'like') {
            if (!comment.likedBy.includes(userEmail)) {
                comment.likes += 1;
                comment.likedBy.push(userEmail);
                // Remove dislike if exists
                if (comment.dislikedBy.includes(userEmail)) {
                    comment.dislikes -= 1;
                    comment.dislikedBy = comment.dislikedBy.filter(email => email !== userEmail);
                }
            }
        } else if (type === 'dislike') {
            if (!comment.dislikedBy.includes(userEmail)) {
                comment.dislikes += 1;
                comment.dislikedBy.push(userEmail);
                // Remove like if exists
                if (comment.likedBy.includes(userEmail)) {
                    comment.likes -= 1;
                    comment.likedBy = comment.likedBy.filter(email => email !== userEmail);
                }
            }
        }

        await comment.save();
        console.log('Reaction updated successfully');
        res.json(comment);
    } catch (error) {
        console.error('Error updating reaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// Edit a comment
app.put('/api/comments/:commentId', async (req, res) => {
    try {
        const { text, userEmail } = req.body;
        const commentId = req.params.commentId;
        console.log('Editing comment:', { commentId, text, userEmail });

        if (!text || !userEmail) {
            return res.status(400).json({ error: 'Text and userEmail are required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.user.email !== userEmail) {
            return res.status(403).json({ error: 'Not authorized to edit this comment' });
        }
        comment.text = text;
        await comment.save();
        console.log('Comment edited successfully');
        res.json(comment);
    } catch (error) {
        console.error('Error editing comment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a comment
app.delete('/api/comments/:commentId', async (req, res) => {
    try {
        const { userEmail } = req.query;
        const commentId = req.params.commentId;
        console.log('Deleting comment:', { commentId, userEmail });

        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.user.email !== userEmail) {
            return res.status(403).json({ error: 'Not authorized to delete this comment' });
        }
        await comment.remove();
        console.log('Comment deleted successfully');
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 