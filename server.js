const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Handle CORS and Private Network Access (Chrome preflight from https → http://localhost)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        // Required for Chrome Private Network Access when calling localhost from https pages
        res.header('Access-Control-Allow-Private-Network', 'true');
        return res.sendStatus(204);
    }
    next();
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI. Please set it in your environment (see .env.example).');
}

// Add connection status tracking
let isConnected = false;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000, // Increased from 5000
    socketTimeoutMS: 45000,
    bufferCommands: false,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    retryWrites: true,
    w: 'majority',
    connectTimeoutMS: 10000, // Added connection timeout
    heartbeatFrequencyMS: 10000 // Added heartbeat frequency
}).then(() => {
    console.log('Connected to MongoDB Atlas');
    isConnected = true;
    // Run the one-time fix after successful connection
    fixExistingReplies();
}).catch((error) => {
    console.error('MongoDB connection error:', error);
    isConnected = false;
});

// Add connection monitoring with reconnection logic
mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected - attempting to reconnect...');
    isConnected = false;
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
        if (!isConnected) {
            mongoose.connect(MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                maxPoolSize: 10,
                minPoolSize: 1,
                maxIdleTimeMS: 30000,
                retryWrites: true,
                w: 'majority'
            }).then(() => {
                console.log('MongoDB reconnected successfully');
                isConnected = true;
            }).catch((error) => {
                console.error('MongoDB reconnection failed:', error);
                isConnected = false;
            });
        }
    }, 5000);
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isConnected = true;
});

mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    isConnected = false;
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        database: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Recursive reply schema
const replySchema = new mongoose.Schema({
  text: String,
  user: {
    name: String,
    email: String,
    picture: String
  },
  timestamp: Date,
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  trusts: { type: Number, default: 0 },
  distrusts: { type: Number, default: 0 },
  likedBy: [String],
  dislikedBy: [String],
  trustedBy: [String],
  distrustedBy: [String],
  replies: [this] // Recursive!
}, { _id: true });

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
    trusts: { type: Number, default: 0 },
    distrusts: { type: Number, default: 0 },
    likedBy: [String],
    dislikedBy: [String],
    trustedBy: [String],
    distrustedBy: [String],
    replies: [replySchema]
});

const Comment = mongoose.model('Comment', commentSchema);

// Alternative Reply Schema for infinite nesting (separate documents)
const separateReplySchema = new mongoose.Schema({
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true },
  parentReplyId: { type: mongoose.Schema.Types.ObjectId, default: null }, // null for top-level replies
  text: { type: String, required: true },
  user: {
    name: String,
    email: String,
    picture: String
  },
  timestamp: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  trusts: { type: Number, default: 0 },
  distrusts: { type: Number, default: 0 },
  likedBy: [String],
  dislikedBy: [String],
  trustedBy: [String],
  distrustedBy: [String]
});

const SeparateReply = mongoose.model('SeparateReply', separateReplySchema);

// Recursively find a reply by ID in a nested replies array
function findReplyById(replies, replyId) {
  // Validate input
  if (!replyId || replyId === 'undefined' || replyId === 'null') {
    console.error('Invalid replyId provided to findReplyById:', replyId);
    return null;
  }
  
  console.log(`Searching for reply ${replyId} in ${replies.length} replies`);
  
  for (let reply of replies) {
    console.log(`Checking reply: ${reply._id} (${reply.text?.substring(0, 20)})`);
    if (reply._id && reply._id.toString() === replyId) {
      console.log(`Found reply ${replyId} at top level`);
      return reply;
    }
    if (reply.replies && reply.replies.length > 0) {
      console.log(`Searching nested replies for reply: ${reply.text?.substring(0, 20)}`);
      const found = findReplyById(reply.replies, replyId);
      if (found) {
        console.log(`Found reply ${replyId} in nested replies`);
        return found;
      }
    }
  }
  console.log(`Reply ${replyId} not found`);
  return null;
}

// Count nesting depth of a reply
function getReplyDepth(replies, replyId, currentDepth = 0) {
  for (let reply of replies) {
    if (reply._id.toString() === replyId) {
      return currentDepth;
    }
    if (reply.replies && reply.replies.length > 0) {
      const depth = getReplyDepth(reply.replies, replyId, currentDepth + 1);
      if (depth !== -1) return depth;
    }
  }
  return -1;
}

// Recursively fix replies that don't have _id fields
function fixReplyIds(replies) {
  if (!Array.isArray(replies)) return replies;
  
  console.log(`fixReplyIds called with ${replies.length} replies`);
  
  return replies.map(reply => {
    console.log(`Processing reply: ${reply.text?.substring(0, 30)} with ${reply.replies?.length || 0} nested replies`);
    
    // If reply doesn't have _id, add one
    if (!reply._id) {
      reply._id = new mongoose.Types.ObjectId();
      console.log('Fixed missing _id for reply:', reply.text?.substring(0, 30));
    }
    
    // Initialize missing fields - use more robust checks
    if (typeof reply.likes !== 'number') reply.likes = 0;
    if (typeof reply.dislikes !== 'number') reply.dislikes = 0;
    if (typeof reply.trusts !== 'number') reply.trusts = 0;
    if (typeof reply.distrusts !== 'number') reply.distrusts = 0;
    if (!Array.isArray(reply.likedBy)) reply.likedBy = [];
    if (!Array.isArray(reply.dislikedBy)) reply.dislikedBy = [];
    if (!Array.isArray(reply.trustedBy)) reply.trustedBy = [];
    if (!Array.isArray(reply.distrustedBy)) reply.distrustedBy = [];
    
    // CRITICAL FIX: Don't log this every time as it's causing confusion
    // Only log if we actually fixed something
    const needsLogging = typeof reply.likes !== 'number' || typeof reply.dislikes !== 'number' || 
                        typeof reply.trusts !== 'number' || typeof reply.distrusts !== 'number' ||
                        !Array.isArray(reply.likedBy) || !Array.isArray(reply.dislikedBy) ||
                        !Array.isArray(reply.trustedBy) || !Array.isArray(reply.distrustedBy);
    
    if (needsLogging) {
      console.log('Fixed reply fields for:', reply.text?.substring(0, 30), {
        likes: reply.likes,
        dislikes: reply.dislikes,
        trusts: reply.trusts,
        distrusts: reply.distrusts,
        likedByLength: reply.likedBy?.length || 0,
        dislikedByLength: reply.dislikedBy?.length || 0,
        trustedByLength: reply.trustedBy?.length || 0,
        distrustedByLength: reply.distrustedBy?.length || 0
      });
    }
    
    // CRITICAL FIX: Preserve existing nested replies before processing them
    const existingReplies = reply.replies || [];
    console.log(`Preserving existing replies for reply: ${reply.text?.substring(0, 30)} count: ${existingReplies.length}`);
    
    // Process nested replies recursively
    if (existingReplies.length > 0) {
      console.log(`Fixing nested replies for reply: ${reply.text?.substring(0, 30)}, count: ${existingReplies.length}`);
      reply.replies = fixReplyIds(existingReplies);
      console.log(`Nested replies for ${reply.text?.substring(0, 30)}: ${existingReplies.length} -> ${reply.replies.length}`);
    } else {
      // Ensure replies array exists even if empty
      reply.replies = [];
    }
    
    return reply;
  });
}

// Helper function to count total replies at all nesting levels
function countTotalReplies(replies) {
    if (!Array.isArray(replies)) return 0;
    let count = replies.length;
    for (const reply of replies) {
        if (reply.replies && Array.isArray(reply.replies)) {
            count += countTotalReplies(reply.replies);
        }
    }
    return count;
}

// API Routes

// Get comments for a URL
app.get('/api/comments', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected - attempting to reconnect...');
            // Try to reconnect
            try {
                await mongoose.connect(MONGODB_URI, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                    serverSelectionTimeoutMS: 10000,
                    socketTimeoutMS: 45000,
                    bufferCommands: false,
                    maxPoolSize: 10,
                    minPoolSize: 1,
                    maxIdleTimeMS: 30000,
                    retryWrites: true,
                    w: 'majority',
                    connectTimeoutMS: 10000,
                    heartbeatFrequencyMS: 10000
                });
                isConnected = true;
                console.log('Reconnected to MongoDB Atlas');
            } catch (reconnectError) {
                console.error('Failed to reconnect to MongoDB:', reconnectError);
                return res.status(500).json({ error: 'Database connection error' });
            }
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

        // Fix any existing replies that don't have _id fields
        let needsUpdate = false;
        for (let comment of comments) {
            if (comment.replies && Array.isArray(comment.replies)) {
                console.log('Before fixReplyIds - Comment replies count:', comment.replies.length);
                console.log('Before fixReplyIds - Reply structure:', JSON.stringify(comment.replies.map(r => ({
                    id: r._id,
                    text: r.text?.substring(0, 20),
                    hasReplies: !!r.replies,
                    repliesCount: r.replies?.length || 0,
                    nestedReplies: r.replies?.map(nr => ({
                        id: nr._id,
                        text: nr.text?.substring(0, 20),
                        hasReplies: !!nr.replies,
                        repliesCount: nr.replies?.length || 0,
                        nestedReplies: nr.replies?.map(nnr => ({
                            id: nnr._id,
                            text: nnr.text?.substring(0, 20),
                            hasReplies: !!nnr.replies,
                            repliesCount: nnr.replies?.length || 0
                        })) || []
                    })) || []
                })), null, 2));
                
                const originalReplies = JSON.parse(JSON.stringify(comment.replies));
                comment.replies = fixReplyIds(comment.replies);
                
                console.log('After fixReplyIds - Comment replies count:', comment.replies.length);
                console.log('After fixReplyIds - Reply structure:', JSON.stringify(comment.replies.map(r => ({
                    id: r._id,
                    text: r.text?.substring(0, 20),
                    hasReplies: !!r.replies,
                    repliesCount: r.replies?.length || 0,
                    nestedReplies: r.replies?.map(nr => ({
                        id: nr._id,
                        text: nr.text?.substring(0, 20),
                        hasReplies: !!nr.replies,
                        repliesCount: nr.replies?.length || 0,
                        nestedReplies: nr.replies?.map(nnr => ({
                            id: nnr._id,
                            text: nnr.text?.substring(0, 20),
                            hasReplies: !!nnr.replies,
                            repliesCount: nnr.replies?.length || 0
                        })) || []
                    })) || []
                })), null, 2));
                
                // Check if any replies were lost
                const originalTotal = countTotalReplies(originalReplies);
                const newTotal = countTotalReplies(comment.replies);
                if (originalTotal !== newTotal) {
                    console.log(`WARNING: Reply count changed from ${originalTotal} to ${newTotal}`);
                    needsUpdate = true;
                }
            }
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
        
        // Emit WebSocket event for real-time updates
        io.to(url).emit('comment-added', {
            comment: savedComment,
            timestamp: new Date()
        });
        
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

// Add a reply to a comment or to any reply (infinite nesting)
app.post('/api/comments/:commentId/replies/:parentReplyId', async (req, res) => {
  try {
    const { text, user } = req.body;
    const { commentId, parentReplyId } = req.params;
    console.log('Received reply submission:', { commentId, parentReplyId, user: user.name });

    if (!text || !user) {
      console.error('Missing required fields:', { text, user });
      return res.status(400).json({ error: 'Text and user are required' });
    }

    // Validate parentReplyId
    if (parentReplyId === 'undefined' || parentReplyId === 'null') {
      console.error('Invalid parentReplyId:', parentReplyId);
      return res.status(400).json({ error: 'Invalid parent reply ID' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      console.error('Parent comment not found for reply submission. Comment ID:', commentId);
      return res.status(404).json({ error: 'Comment not found' });
    }

    let parent;
    if (parentReplyId === 'root') {
      parent = comment;
      console.log('Replying to root comment.');
    } else {
      console.log(`Searching for parent reply with ID: ${parentReplyId} in comment ${commentId}`);
      parent = findReplyById(comment.replies, parentReplyId);
      console.log('Parent found:', parent ? { id: parent._id, text: parent.text?.substring(0, 50) } : 'Not found');
    }

    if (!parent) {
      console.error(`Parent reply not found: ${parentReplyId}`);
      console.log('Available top-level replies:', comment.replies.map(r => ({ id: r._id, text: r.text?.substring(0, 30) })));
      return res.status(404).json({ error: 'Parent reply not found' });
    }

    // Check nesting depth
    if (parentReplyId !== 'root') {
      const depth = getReplyDepth(comment.replies, parentReplyId);
      console.log('Current nesting depth:', depth);
      
      if (depth >= 10) {
        console.warn('Deep nesting detected:', depth, 'levels');
        // Still allow it, but warn in logs
      }
    }

    if (!parent.replies) {
      parent.replies = [];
      console.log('Initialized empty replies array for parent');
    }

    console.log('Parent reply structure before adding new reply:', {
      id: parent._id,
      text: parent.text?.substring(0, 30),
      hasReplies: !!parent.replies,
      repliesLength: parent.replies?.length || 0,
      replies: parent.replies
    });

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      text,
      user,
      timestamp: new Date(),
      replies: [], // Ensure new reply has replies array
      likes: 0,
      dislikes: 0,
      trusts: 0,
      distrusts: 0,
      likedBy: [],
      dislikedBy: [],
      trustedBy: [],
      distrustedBy: []
    };

    console.log('Adding new reply to parent:', { parentId: parent._id, newReplyText: text.substring(0, 50) });
    parent.replies.push(newReply);

    console.log('Parent reply structure after adding new reply:', {
      id: parent._id,
      text: parent.text?.substring(0, 30),
      hasReplies: !!parent.replies,
      repliesLength: parent.replies?.length || 0,
      newReplyId: newReply._id
    });

    // Check document size before saving
    const commentSize = JSON.stringify(comment).length;
    const maxSize = 15 * 1024 * 1024; // 15MB limit (leaving 1MB buffer)
    
    console.log('Document size before save:', commentSize, 'bytes');
    
    if (commentSize > maxSize) {
      console.error('Document size limit exceeded:', commentSize, 'bytes');
      return res.status(413).json({ 
        error: 'Document size limit exceeded. Too many nested replies. Please start a new comment thread.' 
      });
    }

    console.log('Saving comment to database...');
    
    // Force Mongoose to detect the change by marking the replies array as modified
    comment.markModified('replies');
    await comment.save();
    
    console.log('Reply saved successfully. Parent ID:', parent._id);
    
    // Emit WebSocket event for real-time updates
    io.to(comment.url).emit('reply-added', {
        reply: newReply,
        commentId,
        parentReplyId,
        timestamp: new Date()
    });
    
    res.json(comment);
  } catch (error) {
    console.error('Error adding reply:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      commentId: req.params.commentId,
      parentReplyId: req.params.parentReplyId
    });
    
    // Check for specific MongoDB errors
    if (error.message && error.message.includes('BSONObj')) {
      return res.status(413).json({ 
        error: 'Document size limit exceeded. Too many nested replies. Please start a new comment thread.' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Update like/dislike status
app.put('/api/comments/:commentId/reaction', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

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
            if (comment.likedBy.includes(userEmail)) {
                // User already liked, so unlike
                comment.likes -= 1;
                comment.likedBy = comment.likedBy.filter(email => email !== userEmail);
                console.log('User unliked the comment');
            } else {
                // User hasn't liked, so like
                comment.likes += 1;
                comment.likedBy.push(userEmail);
                // Remove dislike if exists
                if (comment.dislikedBy.includes(userEmail)) {
                    comment.dislikes -= 1;
                    comment.dislikedBy = comment.dislikedBy.filter(email => email !== userEmail);
                }
                console.log('User liked the comment');
            }
        } else if (type === 'dislike') {
            if (comment.dislikedBy.includes(userEmail)) {
                // User already disliked, so undislike
                comment.dislikes -= 1;
                comment.dislikedBy = comment.dislikedBy.filter(email => email !== userEmail);
                console.log('User undisliked the comment');
            } else {
                // User hasn't disliked, so dislike
                comment.dislikes += 1;
                comment.dislikedBy.push(userEmail);
                // Remove like if exists
                if (comment.likedBy.includes(userEmail)) {
                    comment.likes -= 1;
                    comment.likedBy = comment.likedBy.filter(email => email !== userEmail);
                }
                console.log('User disliked the comment');
            }
        } else if (type === 'trust') {
            if (comment.trustedBy.includes(userEmail)) {
                // User already trusted, so untrust
                comment.trusts -= 1;
                comment.trustedBy = comment.trustedBy.filter(email => email !== userEmail);
                console.log('User untrusted the comment');
            } else {
                // User hasn't trusted, so trust
                comment.trusts += 1;
                comment.trustedBy.push(userEmail);
                // Remove distrust if exists
                if (comment.distrustedBy.includes(userEmail)) {
                    comment.distrusts -= 1;
                    comment.distrustedBy = comment.distrustedBy.filter(email => email !== userEmail);
                }
                console.log('User trusted the comment');
            }
        } else if (type === 'distrust') {
            if (comment.distrustedBy.includes(userEmail)) {
                // User already distrusted, so undisdistrust
                comment.distrusts -= 1;
                comment.distrustedBy = comment.distrustedBy.filter(email => email !== userEmail);
                console.log('User undisdistrusted the comment');
            } else {
                // User hasn't distrusted, so distrust
                comment.distrusts += 1;
                comment.distrustedBy.push(userEmail);
                // Remove trust if exists
                if (comment.trustedBy.includes(userEmail)) {
                    comment.trusts -= 1;
                    comment.trustedBy = comment.trustedBy.filter(email => email !== userEmail);
                }
                console.log('User distrusted the comment');
            }
        }

        await comment.save();
        console.log('Reaction updated successfully');
        
        // Emit WebSocket event for real-time updates
        io.to(comment.url).emit('reaction-updated', {
            type,
            targetId: commentId,
            targetType: 'comment',
            user: { email: userEmail },
            newCounts: {
                likes: comment.likes,
                dislikes: comment.dislikes,
                trusts: comment.trusts,
                distrusts: comment.distrusts
            },
            timestamp: new Date()
        });
        
        res.json(comment);
    } catch (error) {
        console.error('Error updating reaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update like/dislike/trust/distrust status for replies
app.put('/api/comments/:commentId/replies/:replyId/reaction', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

        const { type, userEmail } = req.body;
        const commentId = req.params.commentId;
        const replyId = req.params.replyId;
        console.log('Updating reply reaction:', { commentId, replyId, type, userEmail });

        if (!type || !userEmail) {
            return res.status(400).json({ error: 'Type and userEmail are required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Use findReplyById to handle nested replies
        const reply = findReplyById(comment.replies, replyId);
        if (!reply) {
            console.error(`Reply not found: ${replyId}`);
            return res.status(404).json({ error: 'Reply not found' });
        }

        console.log('Found reply for reaction update:', {
            replyId: reply._id,
            text: reply.text?.substring(0, 30),
            hasReactionArrays: !!(reply.likedBy && reply.dislikedBy && reply.trustedBy && reply.distrustedBy),
            currentLikes: reply.likes,
            currentDislikes: reply.dislikes,
            currentTrusts: reply.trusts,
            currentDistrusts: reply.distrusts,
            likedByLength: reply.likedBy?.length || 0,
            dislikedByLength: reply.dislikedBy?.length || 0,
            trustedByLength: reply.trustedBy?.length || 0,
            distrustedByLength: reply.distrustedBy?.length || 0,
            likedBy: reply.likedBy || [],
            dislikedBy: reply.dislikedBy || [],
            trustedBy: reply.trustedBy || [],
            distrustedBy: reply.distrustedBy || []
        });

        // Ensure reaction arrays exist (safety check for old data)
        if (!reply.likedBy) reply.likedBy = [];
        if (!reply.dislikedBy) reply.dislikedBy = [];
        if (!reply.trustedBy) reply.trustedBy = [];
        if (!reply.distrustedBy) reply.distrustedBy = [];
        if (!reply.likes) reply.likes = 0;
        if (!reply.dislikes) reply.dislikes = 0;
        if (!reply.trusts) reply.trusts = 0;
        if (!reply.distrusts) reply.distrusts = 0;

        if (type === 'like') {
            if (reply.likedBy.includes(userEmail)) {
                reply.likes -= 1;
                reply.likedBy = reply.likedBy.filter(email => email !== userEmail);
            } else {
                reply.likes += 1;
                reply.likedBy.push(userEmail);
                if (reply.dislikedBy.includes(userEmail)) {
                    reply.dislikes -= 1;
                    reply.dislikedBy = reply.dislikedBy.filter(email => email !== userEmail);
                }
            }
        } else if (type === 'dislike') {
            if (reply.dislikedBy.includes(userEmail)) {
                reply.dislikes -= 1;
                reply.dislikedBy = reply.dislikedBy.filter(email => email !== userEmail);
            } else {
                reply.dislikes += 1;
                reply.dislikedBy.push(userEmail);
                if (reply.likedBy.includes(userEmail)) {
                    reply.likes -= 1;
                    reply.likedBy = reply.likedBy.filter(email => email !== userEmail);
                }
            }
        } else if (type === 'trust') {
            if (reply.trustedBy.includes(userEmail)) {
                reply.trusts -= 1;
                reply.trustedBy = reply.trustedBy.filter(email => email !== userEmail);
            } else {
                reply.trusts += 1;
                reply.trustedBy.push(userEmail);
                if (reply.distrustedBy.includes(userEmail)) {
                    reply.distrusts -= 1;
                    reply.distrustedBy = reply.distrustedBy.filter(email => email !== userEmail);
                }
            }
        } else if (type === 'distrust') {
            if (reply.distrustedBy.includes(userEmail)) {
                reply.distrusts -= 1;
                reply.distrustedBy = reply.distrustedBy.filter(email => email !== userEmail);
            } else {
                reply.distrusts += 1;
                reply.distrustedBy.push(userEmail);
                if (reply.trustedBy.includes(userEmail)) {
                    reply.trusts -= 1;
                    reply.trustedBy = reply.trustedBy.filter(email => email !== userEmail);
                }
            }
        }

        console.log('After reaction update:', {
            replyId: reply._id,
            text: reply.text?.substring(0, 30),
            finalLikes: reply.likes,
            finalDislikes: reply.dislikes,
            finalTrusts: reply.trusts,
            finalDistrusts: reply.distrusts,
            finalLikedByLength: reply.likedBy?.length || 0,
            finalDislikedByLength: reply.dislikedBy?.length || 0,
            finalTrustedByLength: reply.trustedBy?.length || 0,
            finalDistrustedByLength: reply.distrustedBy?.length || 0,
            finalLikedBy: reply.likedBy || [],
            finalDislikedBy: reply.dislikedBy || [],
            finalTrustedBy: reply.trustedBy || [],
            finalDistrustedBy: reply.distrustedBy || []
        });

        await comment.save();
        console.log('Reply reaction updated successfully');
        
        // Force Mongoose to detect the change by marking the replies array as modified
        comment.markModified('replies');
        await comment.save();
        
        // Emit WebSocket event for real-time updates
        io.to(comment.url).emit('reaction-updated', {
            type,
            targetId: replyId,
            targetType: 'reply',
            user: { email: userEmail },
            newCounts: {
                likes: reply.likes,
                dislikes: reply.dislikes,
                trusts: reply.trusts,
                distrusts: reply.distrusts
            },
            timestamp: new Date()
        });
        
        res.json(comment);
    } catch (error) {
        console.error('Error updating reply reaction:', error);
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
        const { commentId } = req.params;
        const { userEmail } = req.body;

        if (!userEmail) {
            return res.status(400).json({ error: 'User email is required to delete a comment.' });
        }

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comment.user.email !== userEmail) {
            return res.status(403).json({ error: 'User not authorized to delete this comment' });
        }

        await Comment.deleteOne({ _id: commentId });

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// Edit a reply
app.put('/api/comments/:commentId/replies/:replyId', async (req, res) => {
    try {
        const { text, userEmail } = req.body;
        const { commentId, replyId } = req.params;

        if (!text || !userEmail) {
            return res.status(400).json({ error: 'Text and userEmail are required' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Use findReplyById to handle nested replies
        const reply = findReplyById(comment.replies, replyId);
        if (!reply) {
            console.error(`Reply not found: ${replyId}`);
            return res.status(404).json({ error: 'Reply not found' });
        }

        if (reply.user.email !== userEmail) {
            return res.status(403).json({ error: 'Not authorized to edit this reply' });
        }

        reply.text = text;
        await comment.save();
        console.log('Reply edited successfully');
        res.json(comment);
    } catch (error) {
        console.error('Error editing reply:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get users who reacted to a comment
app.get('/api/comments/:commentId/reactions', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

        const commentId = req.params.commentId;
        console.log('Fetching reactions for comment:', commentId);

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const reactions = {
            likes: {
                count: comment.likes || 0,
                users: comment.likedBy || []
            },
            dislikes: {
                count: comment.dislikes || 0,
                users: comment.dislikedBy || []
            },
            trusts: {
                count: comment.trusts || 0,
                users: comment.trustedBy || []
            },
            distrusts: {
                count: comment.distrusts || 0,
                users: comment.distrustedBy || []
            }
        };

        console.log('Reactions data for comment:', commentId, reactions);
        res.json(reactions);
    } catch (error) {
        console.error('Error fetching comment reactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get users who reacted to a reply
app.get('/api/comments/:commentId/replies/:replyId/reactions', async (req, res) => {
    try {
        if (!isConnected) {
            console.error('Database not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }

        const { commentId, replyId } = req.params;
        console.log('Fetching reactions for reply:', { commentId, replyId });

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Use findReplyById to handle nested replies
        const reply = findReplyById(comment.replies, replyId);
        if (!reply) {
            console.error(`Reply not found: ${replyId}`);
            return res.status(404).json({ error: 'Reply not found' });
        }

        const reactions = {
            likes: {
                count: reply.likes || 0,
                users: reply.likedBy || []
            },
            dislikes: {
                count: reply.dislikes || 0,
                users: reply.dislikedBy || []
            },
            trusts: {
                count: reply.trusts || 0,
                users: reply.trustedBy || []
            },
            distrusts: {
                count: reply.distrusts || 0,
                users: reply.distrustedBy || []
            }
        };

        console.log('Reactions data for reply:', replyId, reactions);
        res.json(reactions);
    } catch (error) {
        console.error('Error fetching reply reactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a reply
app.delete('/api/replies/:replyId', async (req, res) => {
    try {
        const { replyId } = req.params;
        const { userEmail } = req.body;

        if (!userEmail) {
            return res.status(400).json({ error: 'User email is required to delete a reply.' });
        }

        const comment = await Comment.findOne({ "replies._id": replyId });

        if (!comment) {
            return res.status(404).json({ error: 'Reply not found' });
        }
        
        const result = deleteReplyRecursive(comment.replies, replyId, userEmail);

        if (!result.deleted) {
             if (result.error === 'auth') {
                return res.status(403).json({ error: 'User not authorized to delete this reply' });
             }
             return res.status(404).json({ error: 'Reply not found during deletion process' });
        }

        await comment.save();
        res.json({ message: 'Reply deleted successfully' });
    } catch (error) {
        console.error('Error deleting reply:', error);
        res.status(500).json({ error: 'Failed to delete reply' });
    }
});

function deleteReplyRecursive(replies, replyId, userEmail) {
    let deleted = false;
    let error = null;
    for (let i = replies.length - 1; i >= 0; i--) {
        const reply = replies[i];
        if (reply._id.toString() === replyId) {
            if (reply.user.email !== userEmail) {
                return { deleted: false, error: 'auth' };
            }
            replies.splice(i, 1);
            return { deleted: true, error: null };
        }
        if (reply.replies && reply.replies.length > 0) {
            const result = deleteReplyRecursive(reply.replies, replyId, userEmail);
            if (result.deleted || result.error) {
                return result;
            }
        }
    }
    return { deleted, error };
}

// One-time database fix for existing replies
async function fixExistingReplies() {
    try {
        console.log('Running one-time fix for existing replies...');
        const comments = await Comment.find({});
        let fixedCount = 0;
        
        for (let comment of comments) {
            let needsSave = false;
            
            const fixReplyFields = (reply) => {
                let replyFixed = false;
                
                // Check and fix all reaction fields
                if (typeof reply.likes !== 'number') {
                    reply.likes = 0;
                    replyFixed = true;
                }
                if (typeof reply.dislikes !== 'number') {
                    reply.dislikes = 0;
                    replyFixed = true;
                }
                if (typeof reply.trusts !== 'number') {
                    reply.trusts = 0;
                    replyFixed = true;
                }
                if (typeof reply.distrusts !== 'number') {
                    reply.distrusts = 0;
                    replyFixed = true;
                }
                if (!Array.isArray(reply.likedBy)) {
                    reply.likedBy = [];
                    replyFixed = true;
                }
                if (!Array.isArray(reply.dislikedBy)) {
                    reply.dislikedBy = [];
                    replyFixed = true;
                }
                if (!Array.isArray(reply.trustedBy)) {
                    reply.trustedBy = [];
                    replyFixed = true;
                }
                if (!Array.isArray(reply.distrustedBy)) {
                    reply.distrustedBy = [];
                    replyFixed = true;
                }
                
                if (replyFixed) {
                    console.log(`Fixed reply: ${reply.text?.substring(0, 30)} (ID: ${reply._id})`);
                    needsSave = true;
                }
                
                // Recursively fix nested replies
                if (reply.replies && Array.isArray(reply.replies)) {
                    reply.replies.forEach(fixReplyFields);
                }
            };
            
            if (comment.replies && Array.isArray(comment.replies)) {
                comment.replies.forEach(fixReplyFields);
            }
            
            if (needsSave) {
                await comment.save();
                fixedCount++;
                console.log(`Saved comment ${comment._id} with fixed replies`);
            }
        }
        
        console.log(`One-time fix completed. Fixed ${fixedCount} comments.`);
    } catch (error) {
        console.error('Error in one-time fix:', error);
    }
}

// WebSocket connection handling
const activeUsers = new Map(); // Track active users per URL
const typingUsers = new Map(); // Track typing users per URL

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Join room based on URL
    socket.on('join-page', (data) => {
        const { url, user } = data;
        console.log(`User ${user.email} joined page: ${url}`);
        
        // Leave previous rooms
        socket.leaveAll();
        
        // Join the URL-specific room
        socket.join(url);
        socket.currentUrl = url;
        socket.user = user;
        
        // Track active user
        if (!activeUsers.has(url)) {
            activeUsers.set(url, new Map());
        }
        activeUsers.get(url).set(socket.id, {
            user,
            lastSeen: Date.now(),
            socketId: socket.id
        });
        
        // Notify others about new user
        socket.to(url).emit('user-joined', {
            user,
            activeCount: activeUsers.get(url).size
        });
        
        // Send current active users to the new user
        const currentUsers = Array.from(activeUsers.get(url).values());
        socket.emit('active-users', currentUsers);
    });
    
    // Handle new comments
    socket.on('new-comment', (data) => {
        const { url, comment } = data;
        console.log(`Broadcasting new comment for URL: ${url}`);
        
        // Broadcast to all users on the same page except sender
        socket.to(url).emit('comment-added', {
            comment,
            timestamp: new Date()
        });
    });
    
    // Handle new replies
    socket.on('new-reply', (data) => {
        const { url, reply, commentId, parentReplyId } = data;
        console.log(`Broadcasting new reply for comment ${commentId}`);
        
        socket.to(url).emit('reply-added', {
            reply,
            commentId,
            parentReplyId,
            timestamp: new Date()
        });
    });
    
    // Handle reactions
    socket.on('reaction-update', (data) => {
        const { url, type, targetId, targetType, user, newCounts } = data;
        console.log(`Broadcasting reaction update: ${type} on ${targetType} ${targetId}`);
        
        socket.to(url).emit('reaction-updated', {
            type,
            targetId,
            targetType,
            user,
            newCounts,
            timestamp: new Date()
        });
    });
    
    // Handle typing indicators
    socket.on('typing-start', (data) => {
        const { url, user, commentId, parentReplyId } = data;
        const typingKey = `${url}:${commentId || 'main'}:${parentReplyId || 'root'}`;
        
        if (!typingUsers.has(typingKey)) {
            typingUsers.set(typingKey, new Map());
        }
        
        typingUsers.get(typingKey).set(socket.id, {
            user,
            timestamp: Date.now()
        });
        
        // Broadcast typing indicator
        socket.to(url).emit('user-typing', {
            user,
            commentId,
            parentReplyId,
            typingUsers: Array.from(typingUsers.get(typingKey).values())
        });
    });
    
    socket.on('typing-stop', (data) => {
        const { url, commentId, parentReplyId } = data;
        const typingKey = `${url}:${commentId || 'main'}:${parentReplyId || 'root'}`;
        
        if (typingUsers.has(typingKey)) {
            typingUsers.get(typingKey).delete(socket.id);
            
            if (typingUsers.get(typingKey).size === 0) {
                typingUsers.delete(typingKey);
            }
            
            // Broadcast updated typing indicator
            socket.to(url).emit('user-typing', {
                user: socket.user,
                commentId,
                parentReplyId,
                typingUsers: typingUsers.has(typingKey) ? Array.from(typingUsers.get(typingKey).values()) : []
            });
        }
    });
    
    // Handle scroll position for collaborative cursors
    socket.on('scroll-position', (data) => {
        const { url, scrollY, viewportHeight } = data;
        
        if (socket.currentUrl === url) {
            socket.to(url).emit('user-scroll', {
                user: socket.user,
                scrollY,
                viewportHeight,
                timestamp: Date.now()
            });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Clean up active users
        if (socket.currentUrl && activeUsers.has(socket.currentUrl)) {
            activeUsers.get(socket.currentUrl).delete(socket.id);
            
            if (activeUsers.get(socket.currentUrl).size === 0) {
                activeUsers.delete(socket.currentUrl);
            } else {
                // Notify others about user leaving
                socket.to(socket.currentUrl).emit('user-left', {
                    user: socket.user,
                    activeCount: activeUsers.get(socket.currentUrl).size
                });
            }
        }
        
        // Clean up typing indicators
        for (const [typingKey, users] of typingUsers.entries()) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                if (users.size === 0) {
                    typingUsers.delete(typingKey);
                }
            }
        }
    });
});

// Cleanup inactive users periodically
setInterval(() => {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    for (const [url, users] of activeUsers.entries()) {
        for (const [socketId, userData] of users.entries()) {
            if (now - userData.lastSeen > INACTIVE_THRESHOLD) {
                users.delete(socketId);
            }
        }
        
        if (users.size === 0) {
            activeUsers.delete(url);
        }
    }
}, 60000); // Check every minute

// Start server
const PORT = process.env.PORT || 3001;
console.log('Environment PORT:', process.env.PORT);
console.log('Using PORT:', PORT);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('WebSocket server initialized');
    // Run the one-time fix after server starts
    // fixExistingReplies(); // This line is removed as per the edit hint.
}); 