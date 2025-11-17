const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✅ Loaded .env file from:', envPath);
} else {
    console.warn('⚠️  .env file not found at:', envPath);
}

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

// Serve static files for Chrome extension
app.use(express.static('.'));

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

// Enhanced MongoDB connection with aggressive reconnection
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 75000, // 75 seconds
    connectTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
    bufferCommands: true,
    maxPoolSize: 50, // Increased pool size
    minPoolSize: 5, // Keep more connections alive
    maxIdleTimeMS: 60000,
    retryWrites: true,
    w: 'majority',
    autoIndex: true,
};

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, mongooseOptions);
        console.log('✅ Connected to MongoDB Atlas');
        isConnected = true;
        reconnectAttempts = 0; // Reset counter on successful connection
        // Run the one-time fix after successful connection
        fixExistingReplies();
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        isConnected = false;
        
        // Exponential backoff reconnection
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000); // Max 60s
            console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(connectToMongoDB, delay);
        } else {
            console.error('❌ Max reconnection attempts reached. Server will continue without database.');
        }
    }
}

connectToMongoDB();

// Add connection monitoring with improved reconnection logic
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected - initiating reconnection...');
    isConnected = false;
    
    // Use the same connection function with exponential backoff
    setTimeout(() => {
        if (!isConnected && mongoose.connection.readyState === 0) {
            reconnectAttempts = 0; // Reset for fresh reconnection
            connectToMongoDB();
        }
    }, 2000);
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
    isConnected = true;
    reconnectAttempts = 0; // Reset attempts on successful reconnection
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
  flags: { type: Number, default: 0 },
  likedBy: [String],
  dislikedBy: [String],
  trustedBy: [String],
  distrustedBy: [String],
  flaggedBy: [String],
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
    flags: { type: Number, default: 0 },
    likedBy: [String],
    dislikedBy: [String],
    trustedBy: [String],
    distrustedBy: [String],
    flaggedBy: [String],
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
  flags: { type: Number, default: 0 },
  likedBy: [String],
  dislikedBy: [String],
  trustedBy: [String],
  distrustedBy: [String],
  flaggedBy: [String]
});

const SeparateReply = mongoose.model('SeparateReply', separateReplySchema);

// Message Schema (Direct messages between users and group messages)
const messageSchema = new mongoose.Schema({
    from: {
        name: String,
        email: String,
        picture: String
    },
    to: {
        name: String,
        email: String,
        picture: String
    },
    participants: [String], // [from.email, to.email] for direct messages, or all group members for group messages
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
    // Group messaging fields
    isGroupMessage: { type: Boolean, default: false },
    groupId: { type: String, index: true }, // Reference to group for group messages
    groupName: String // Group name for display purposes
});

messageSchema.index({ participants: 1, timestamp: 1 });
messageSchema.index({ groupId: 1, timestamp: 1 });

const Message = mongoose.model('Message', messageSchema);

// Group Schema for group conversations
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    createdBy: {
        name: String,
        email: String,
        picture: String
    },
    members: [{
        name: String,
        email: String,
        picture: String,
        joinedAt: { type: Date, default: Date.now },
        role: { type: String, enum: ['admin', 'member'], default: 'member' }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

groupSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Group = mongoose.model('Group', groupSchema);

// User Schema (registered extension users)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    picture: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const User = mongoose.model('User', userSchema);

// Follow Schema (user following relationships)
const followSchema = new mongoose.Schema({
    follower: {
        email: { type: String, required: true, index: true },
        name: String,
        picture: String
    },
    following: {
        email: { type: String, required: true, index: true },
        name: String,
        picture: String
    },
    createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure unique follower-following pairs
followSchema.index({ 'follower.email': 1, 'following.email': 1 }, { unique: true });

const Follow = mongoose.model('Follow', followSchema);

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

// Helper function to ensure database connection
async function ensureDatabaseConnection() {
    // Check actual mongoose connection state (0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting)
    const connectionState = mongoose.connection.readyState;
    
    if (connectionState === 1) {
        // Connection is active, update flag if needed
        if (!isConnected) {
            isConnected = true;
        }
        return true;
    }
    
    // Not connected
    console.error(`Database not connected (state: ${connectionState}) - attempting to reconnect...`);
    
    // If already connecting, wait a bit and check again
    if (connectionState === 2) {
        console.log('Connection already in progress, waiting for completion via mongoose asPromise()...');
        try {
            await mongoose.connection.asPromise();
            if (mongoose.connection.readyState === 1) {
                isConnected = true;
                console.log('Connection completed while awaiting mongoose connection promise');
                return true;
            }
        } catch (promiseError) {
            console.error('Waiting for existing connection failed:', promiseError.message);
            console.error('Attempting fresh connection...');
        }
    }
    
    // If still not connected, attempt reconnection
    if (mongoose.connection.readyState !== 1) {
        try {
            // Close existing connection if in bad state
            if (connectionState === 3 || connectionState === 2) {
                try {
                    await mongoose.connection.close();
                } catch (closeError) {
                    console.warn('Error closing existing connection:', closeError.message);
                }
            }
            
            // Attempt new connection
            if (!MONGODB_URI) {
                console.error('MONGODB_URI is not set');
                throw new Error('Database configuration error: MONGODB_URI is missing');
            }
            
            await mongoose.connect(MONGODB_URI, mongooseOptions);
            isConnected = true;
            reconnectAttempts = 0; // Reset counter on successful connection
            console.log('✅ Reconnected to MongoDB Atlas');
            return true;
        } catch (reconnectError) {
            console.error('❌ Failed to reconnect to MongoDB:', reconnectError.message);
            console.error('Connection error details:', {
                name: reconnectError.name,
                code: reconnectError.code,
                message: reconnectError.message
            });
            throw reconnectError;
        }
    }
    
    throw new Error('Unable to establish a database connection');
}

// Express middleware to ensure database connection for all API routes
async function ensureDatabaseMiddleware(req, res, next) {
    try {
        console.log(`[DB Middleware] Incoming request: ${req.method} ${req.originalUrl}`);
        await ensureDatabaseConnection();
        console.log('[DB Middleware] Database connection verified');
        next();
    } catch (error) {
        console.error('[DB Middleware] Database connection error:', {
            message: error.message,
            stack: error.stack,
            readyState: mongoose.connection.readyState
        });
        res.status(500).json({
            error: 'Database connection error',
            details: error.message
        });
    }
}

// Apply the middleware to all /api routes that require database access
app.use('/api', ensureDatabaseMiddleware);

// API Routes

const TRENDING_METRIC_FIELDS = {
    likes: 'likes',
    dislikes: 'dislikes',
    trusts: 'trusts',
    distrusts: 'distrusts',
    flags: 'flags'
};

const TRENDING_TIME_RANGE_WINDOWS = {
    'all': null,
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000
};

// Get comments for a URL
app.get('/api/comments', async (req, res) => {
    try {
        // Ensure database connection before proceeding
        try {
            await ensureDatabaseConnection();
        } catch (connectionError) {
            return res.status(500).json({ 
                error: 'Database connection error',
                details: connectionError.message 
            });
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

// Get top liked comments across all URLs (trending)
app.get('/api/comments/trending', async (req, res) => {
    try {
        // Ensure database connection before proceeding
        try {
            await ensureDatabaseConnection();
        } catch (connectionError) {
            return res.status(500).json({
                error: 'Database connection error',
                details: connectionError.message
            });
        }

        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 100;

        const metricParam = String(req.query.metric || 'likes').toLowerCase();
        const metricField = TRENDING_METRIC_FIELDS[metricParam] || TRENDING_METRIC_FIELDS.likes;
        const normalizedMetric = Object.entries(TRENDING_METRIC_FIELDS).find(([, field]) => field === metricField)?.[0] || 'likes';

        const timeRangeParam = String(req.query.timeRange || 'all').toLowerCase();
        const rangeMs = Object.prototype.hasOwnProperty.call(TRENDING_TIME_RANGE_WINDOWS, timeRangeParam)
            ? TRENDING_TIME_RANGE_WINDOWS[timeRangeParam]
            : TRENDING_TIME_RANGE_WINDOWS.all;
        const normalizedTimeRange = Object.prototype.hasOwnProperty.call(TRENDING_TIME_RANGE_WINDOWS, timeRangeParam)
            ? timeRangeParam
            : 'all';

        const query = {};
        if (rangeMs) {
            const since = new Date(Date.now() - rangeMs);
            query.timestamp = { $gte: since };
        }

        console.log(`Fetching top ${limit} comments for trending view (metric=${normalizedMetric}, range=${normalizedTimeRange})`);

        const projection = {
            text: 1,
            url: 1,
            user: 1,
            timestamp: 1,
            likes: 1,
            dislikes: 1,
            trusts: 1,
            distrusts: 1,
            flags: 1,
            replies: 1
        };

        const comments = await Comment.find(query, projection)
            .sort({ [metricField]: -1, timestamp: -1 })
            .limit(limit)
            .lean();

        const trending = comments.map((comment) => {
            const repliesArray = Array.isArray(comment.replies) ? comment.replies : [];
            const repliesCount = countTotalReplies(repliesArray);
            return {
                id: comment._id,
                text: comment.text || '',
                url: comment.url || '',
                user: comment.user || {},
                timestamp: comment.timestamp || null,
                likes: comment.likes || 0,
                dislikes: comment.dislikes || 0,
                trusts: comment.trusts || 0,
                distrusts: comment.distrusts || 0,
                flags: comment.flags || 0,
                repliesCount,
                totalReactions: (comment.likes || 0) + (comment.dislikes || 0) + (comment.trusts || 0) + (comment.distrusts || 0)
            };
        });

        res.json(trending);
    } catch (error) {
        console.error('Error fetching trending comments:', error);
        res.status(500).json({
            error: 'Failed to fetch trending comments',
            details: error.message
        });
    }
});

// Messages APIs
// List conversations for a user (distinct users they've messaged with)
app.get('/api/messages/conversations', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'email is required' });

        const conversations = await Message.aggregate([
            { $match: { participants: email } },
            { $sort: { timestamp: -1 } },
            { $group: {
                _id: {
                    other: {
                        $cond: [ { $eq: [ '$from.email', email ] }, '$to.email', '$from.email' ]
                    }
                },
                lastMessage: { $first: '$$ROOT' }
            } },
            { $project: {
                _id: 0,
                otherEmail: '$_id.other',
                lastMessage: 1
            } }
        ]);

        res.json(conversations);
    } catch (error) {
        console.error('Error listing conversations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get messages between two users
app.get('/api/messages', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { userEmail, otherEmail, limit = 50 } = req.query;
        if (!userEmail || !otherEmail) return res.status(400).json({ error: 'userEmail and otherEmail are required' });

        const messages = await Message.find({
            participants: { $all: [userEmail, otherEmail] }
        }).sort({ timestamp: -1 }).limit(Number(limit));

        res.json(messages.reverse());
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send a new message
app.post('/api/messages', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { from, to, text, groupId, groupName } = req.body;
        
        // Handle group messages
        if (groupId) {
            if (!from || !from.email || !text) {
                return res.status(400).json({ error: 'from, text, and groupId are required for group messages' });
            }
            
            // Verify user is member of the group
            const group = await Group.findById(groupId);
            if (!group) {
                return res.status(404).json({ error: 'Group not found' });
            }
            
            const isMember = group.members.some(member => member.email === from.email);
            if (!isMember) {
                return res.status(403).json({ error: 'You are not a member of this group' });
            }
            
            const msg = new Message({
                from,
                participants: group.members.map(m => m.email),
                text,
                isGroupMessage: true,
                groupId,
                groupName: groupName || group.name
            });
            const saved = await msg.save();
            
            // Emit to all group members
            group.members.forEach(member => {
                io.to(`user:${member.email}`).emit('message-received', saved);
            });
            
            res.json(saved);
        } else {
            // Handle direct messages (existing logic)
            if (!from || !to || !from.email || !to.email || !text) {
                return res.status(400).json({ error: 'from, to, and text are required' });
            }

            const msg = new Message({
                from,
                to,
                participants: [from.email, to.email],
                text
            });
            const saved = await msg.save();

            // Emit to recipient room (by email) and to sender
            io.to(`user:${to.email}`).emit('message-received', saved);
            io.to(`user:${from.email}`).emit('message-sent', saved);

            res.json(saved);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Group Management APIs

// Create a new group
app.post('/api/groups', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { name, description, createdBy, members = [] } = req.body;
        
        if (!name || !createdBy || !createdBy.email) {
            return res.status(400).json({ error: 'name and createdBy are required' });
        }
        
        // Add creator as admin member
        const allMembers = [
            { ...createdBy, role: 'admin' },
            ...members.filter(member => member.email !== createdBy.email)
        ];
        
        const group = new Group({
            name,
            description,
            createdBy,
            members: allMembers
        });
        
        const saved = await group.save();
        res.json(saved);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's groups
app.get('/api/groups', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }
        
        const groups = await Group.find({
            'members.email': email
        }).sort({ updatedAt: -1 });
        
        res.json(groups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get group messages
app.get('/api/groups/:groupId/messages', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { groupId } = req.params;
        const { userEmail, limit = 50 } = req.query;
        
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        
        // Verify user is member of the group
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        
        const isMember = group.members.some(member => member.email === userEmail);
        if (!isMember) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }
        
        const messages = await Message.find({
            groupId,
            isGroupMessage: true
        }).sort({ timestamp: -1 }).limit(Number(limit));
        
        res.json(messages.reverse());
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add member to group
app.post('/api/groups/:groupId/members', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { groupId } = req.params;
        const { member, addedBy } = req.body;
        
        if (!member || !member.email || !addedBy || !addedBy.email) {
            return res.status(400).json({ error: 'member and addedBy are required' });
        }
        
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        
        // Check if the person adding is an admin
        const adminMember = group.members.find(m => m.email === addedBy.email);
        if (!adminMember || adminMember.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can add members' });
        }
        
        // Check if member already exists
        const existingMember = group.members.find(m => m.email === member.email);
        if (existingMember) {
            return res.status(400).json({ error: 'Member already exists in group' });
        }
        
        group.members.push({ ...member, role: 'member' });
        await group.save();
        
        res.json(group);
    } catch (error) {
        console.error('Error adding member to group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove member from group
app.delete('/api/groups/:groupId/members/:memberEmail', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { groupId, memberEmail } = req.params;
        const { removedBy } = req.body;
        
        if (!removedBy || !removedBy.email) {
            return res.status(400).json({ error: 'removedBy is required' });
        }
        
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        
        // Check if the person removing is an admin or removing themselves
        const adminMember = group.members.find(m => m.email === removedBy.email);
        if (!adminMember || (adminMember.role !== 'admin' && removedBy.email !== memberEmail)) {
            return res.status(403).json({ error: 'Only admins can remove other members' });
        }
        
        group.members = group.members.filter(m => m.email !== memberEmail);
        await group.save();
        
        res.json(group);
    } catch (error) {
        console.error('Error removing member from group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Users APIs
// Register/update the current user
app.post('/api/users/register', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email, name, picture } = req.body || {};
        if (!email || !name) return res.status(400).json({ error: 'email and name are required' });

        const updated = await User.findOneAndUpdate(
            { email },
            { email, name, picture, updatedAt: new Date() },
            { new: true, upsert: true }
        );
        res.json(updated);
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search users by prefix; if unique match, return that user immediately
app.get('/api/users/search', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { q, limit = 10 } = req.query;
        if (!q || String(q).trim().length === 0) return res.json({ results: [], unique: null });

        const searchTerm = String(q).trim();
        // Use case-insensitive partial match (not just prefix) for better search results
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const results = await User.find({ 
            $or: [
                { name: regex }, 
                { email: regex }
            ]
        })
        .sort({ 
            // Prioritize exact matches, then prefix matches, then partial matches
            name: 1 
        })
        .limit(Number(limit));

        // Sort results: exact matches first, then prefix matches, then others
        const sortedResults = results.sort((a, b) => {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            const aEmail = (a.email || '').toLowerCase();
            const bEmail = (b.email || '').toLowerCase();
            const searchLower = searchTerm.toLowerCase();

            // Exact match gets highest priority
            if (aName === searchLower || aEmail === searchLower) return -1;
            if (bName === searchLower || bEmail === searchLower) return 1;

            // Prefix match gets second priority
            if (aName.startsWith(searchLower) || aEmail.startsWith(searchLower)) return -1;
            if (bName.startsWith(searchLower) || bEmail.startsWith(searchLower)) return 1;

            // Otherwise maintain alphabetical order
            return aName.localeCompare(bName);
        });

        res.json({ results: sortedResults, unique: sortedResults.length === 1 ? sortedResults[0] : null });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Aggregate a user's activity (comments, replies, messages)
app.get('/api/users/:email/activity', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const email = String(req.params.email || '').trim();
        if (!email) return res.status(400).json({ error: 'email is required' });
        const filter = String(req.query.filter || 'all').toLowerCase(); // all | comments | replies | messages

        const includeComments = filter === 'all' || filter === 'comments';
        const includeReplies = filter === 'all' || filter === 'replies';
        const includeMessages = filter === 'all' || filter === 'messages';

        const activity = [];

        // Comments by the user
        if (includeComments) {
            const comments = await Comment.find({ 'user.email': email }).sort({ timestamp: -1 }).lean();
            for (const c of comments) {
                activity.push({
                    type: 'comment',
                    text: c.text || '',
                    url: c.url || '',
                    timestamp: c.timestamp || c.createdAt || new Date(0),
                    likes: c.likes || 0,
                    dislikes: c.dislikes || 0,
                    trusts: c.trusts || 0,
                    distrusts: c.distrusts || 0,
                    flags: c.flags || 0
                });
            }
        }

        // Replies by the user (nested)
        if (includeReplies) {
            // Helper to collect replies authored by user
            const collectRepliesByUser = (repliesArray, pageUrl, collector) => {
                if (!Array.isArray(repliesArray)) return;
                for (const r of repliesArray) {
                    if (r?.user?.email === email) {
                        collector.push({
                            type: 'reply',
                            text: r.text || '',
                            url: pageUrl || '',
                            timestamp: r.timestamp || new Date(0),
                            likes: r.likes || 0,
                            dislikes: r.dislikes || 0,
                            trusts: r.trusts || 0,
                            distrusts: r.distrusts || 0,
                            flags: r.flags || 0
                        });
                    }
                    if (Array.isArray(r?.replies) && r.replies.length > 0) {
                        collectRepliesByUser(r.replies, pageUrl, collector);
                    }
                }
            };

            // Only scan documents that have any replies
            const commentsWithReplies = await Comment.find(
                { 'replies.0': { $exists: true } },
                { url: 1, replies: 1 }
            ).lean();

            for (const c of commentsWithReplies) {
                collectRepliesByUser(c.replies || [], c.url || '', activity);
            }
        }

        // Messages (direct or group) that involve the user
        if (includeMessages) {
            const messages = await Message.find({ participants: email }).sort({ timestamp: -1 }).lean();
            for (const m of messages) {
                // Determine counterpart label for direct messages; for groups show groupName
                let otherEmail = '';
                if (m.isGroupMessage) {
                    otherEmail = m.groupName || `Group ${m.groupId || ''}`;
                } else {
                    const fromEmail = m?.from?.email;
                    const toEmail = m?.to?.email;
                    if (fromEmail && fromEmail !== email) otherEmail = fromEmail;
                    else if (toEmail && toEmail !== email) otherEmail = toEmail;
                }
                activity.push({
                    type: 'message',
                    text: m.text || '',
                    url: '', // messages are not tied to a page URL
                    timestamp: m.timestamp || m.createdAt || new Date(0),
                    otherEmail
                });
            }
        }

        // Sort combined activity by timestamp desc
        activity.sort((a, b) => {
            const ta = new Date(a.timestamp || 0).getTime();
            const tb = new Date(b.timestamp || 0).getTime();
            return tb - ta;
        });

        res.json(activity);
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ error: error.message });
    }
});

// Follow/Unfollow APIs

// Follow a user
app.post('/api/users/:email/follow', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email: targetEmail } = req.params;
        const { follower } = req.body;
        
        if (!follower || !follower.email) {
            return res.status(400).json({ error: 'follower information is required' });
        }
        
        if (follower.email === targetEmail) {
            return res.status(400).json({ error: 'Cannot follow yourself' });
        }
        
        // Check if already following
        const existingFollow = await Follow.findOne({
            'follower.email': follower.email,
            'following.email': targetEmail
        });
        
        if (existingFollow) {
            return res.status(400).json({ error: 'Already following this user' });
        }
        
        // Get target user info
        const targetUser = await User.findOne({ email: targetEmail });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const follow = new Follow({
            follower,
            following: {
                email: targetUser.email,
                name: targetUser.name,
                picture: targetUser.picture
            }
        });
        
        await follow.save();
        res.json({ message: 'Successfully followed user', follow });
    } catch (error) {
        console.error('Error following user:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Already following this user' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Unfollow a user
app.delete('/api/users/:email/follow', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email: targetEmail } = req.params;
        const { followerEmail } = req.body;
        
        if (!followerEmail) {
            return res.status(400).json({ error: 'followerEmail is required' });
        }
        
        const follow = await Follow.findOneAndDelete({
            'follower.email': followerEmail,
            'following.email': targetEmail
        });
        
        if (!follow) {
            return res.status(404).json({ error: 'Follow relationship not found' });
        }
        
        res.json({ message: 'Successfully unfollowed user' });
    } catch (error) {
        console.error('Error unfollowing user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get followers of a user
app.get('/api/users/:email/followers', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email } = req.params;
        
        const followers = await Follow.find({ 'following.email': email })
            .sort({ createdAt: -1 })
            .lean();
        
        const followersList = followers.map(f => ({
            email: f.follower.email,
            name: f.follower.name,
            picture: f.follower.picture,
            followedAt: f.createdAt
        }));
        
        res.json(followersList);
    } catch (error) {
        console.error('Error fetching followers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get users that a user is following
app.get('/api/users/:email/following', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { email } = req.params;
        
        const following = await Follow.find({ 'follower.email': email })
            .sort({ createdAt: -1 })
            .lean();
        
        const followingList = following.map(f => ({
            email: f.following.email,
            name: f.following.name,
            picture: f.following.picture,
            followedAt: f.createdAt
        }));
        
        res.json(followingList);
    } catch (error) {
        console.error('Error fetching following:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check if user is following another user
app.get('/api/users/:followerEmail/is-following/:targetEmail', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        const { followerEmail, targetEmail } = req.params;
        
        const follow = await Follow.findOne({
            'follower.email': followerEmail,
            'following.email': targetEmail
        });
        
        res.json({ isFollowing: !!follow });
    } catch (error) {
        console.error('Error checking follow status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search API - Search across comments, replies, and messages
app.get('/api/search', async (req, res) => {
    try {
        if (!isConnected) return res.status(500).json({ error: 'Database connection error' });
        
        const { q, type, limit = 50 } = req.query;
        
        if (!q || !q.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        const searchTerm = q.trim();
        const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const results = [];
        const maxResults = Math.min(parseInt(limit) || 50, 100);
        
        // Search in comments
        if (!type || type === 'comments' || type === 'all') {
            const comments = await Comment.find({ text: searchRegex })
                .sort({ timestamp: -1 })
                .limit(maxResults)
                .lean();
            
            comments.forEach(comment => {
                results.push({
                    type: 'comment',
                    id: comment._id,
                    text: comment.text,
                    url: comment.url,
                    user: comment.user,
                    timestamp: comment.timestamp,
                    likes: comment.likes || 0,
                    dislikes: comment.dislikes || 0,
                    trusts: comment.trusts || 0,
                    repliesCount: comment.replies ? comment.replies.length : 0
                });
            });
        }
        
        // Search in nested replies (recursively search through comment replies)
        if (!type || type === 'replies' || type === 'all') {
            const commentsWithReplies = await Comment.find({ 'replies.text': searchRegex })
                .sort({ timestamp: -1 })
                .limit(maxResults)
                .lean();
            
            // Helper function to recursively find matching replies
            function findMatchingReplies(replies, commentId, commentUrl, parentPath = '') {
                if (!Array.isArray(replies)) return;
                
                replies.forEach((reply, index) => {
                    if (reply.text && searchRegex.test(reply.text)) {
                        results.push({
                            type: 'reply',
                            id: reply._id,
                            text: reply.text,
                            url: commentUrl,
                            commentId: commentId,
                            user: reply.user,
                            timestamp: reply.timestamp,
                            likes: reply.likes || 0,
                            dislikes: reply.dislikes || 0,
                            trusts: reply.trusts || 0,
                            parentPath: parentPath || 'Comment'
                        });
                    }
                    
                    // Recursively search nested replies
                    if (reply.replies && Array.isArray(reply.replies) && reply.replies.length > 0) {
                        const newPath = parentPath ? `${parentPath} > Reply` : 'Comment > Reply';
                        findMatchingReplies(reply.replies, commentId, commentUrl, newPath);
                    }
                });
            }
            
            commentsWithReplies.forEach(comment => {
                if (comment.replies && Array.isArray(comment.replies)) {
                    findMatchingReplies(comment.replies, comment._id, comment.url);
                }
            });
        }
        
        // Search in messages (only if user is a participant)
        if (!type || type === 'messages' || type === 'all') {
            const { userEmail } = req.query;
            
            if (userEmail) {
                // Only search messages where the user is a participant
                const messages = await Message.find({
                    text: searchRegex,
                    participants: userEmail
                })
                    .sort({ timestamp: -1 })
                    .limit(maxResults)
                    .lean();
                
                messages.forEach(message => {
                    results.push({
                        type: message.isGroupMessage ? 'group-message' : 'message',
                        id: message._id,
                        text: message.text,
                        from: message.from,
                        to: message.to,
                        groupId: message.groupId,
                        groupName: message.groupName,
                        timestamp: message.timestamp,
                        isGroupMessage: message.isGroupMessage
                    });
                });
            }
        }
        
        // Sort all results by timestamp (newest first)
        results.sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
        });
        
        // Limit total results
        const limitedResults = results.slice(0, maxResults);
        
        res.json({
            query: searchTerm,
            total: limitedResults.length,
            results: limitedResults
        });
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a new comment
app.post('/api/comments', async (req, res) => {
    try {
        // Ensure database connection before proceeding
        try {
            await ensureDatabaseConnection();
        } catch (connectionError) {
            return res.status(500).json({ 
                error: 'Database connection error',
                details: connectionError.message 
            });
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


        // Ensure reaction fields exist for legacy documents
        if (!Array.isArray(comment.likedBy)) comment.likedBy = [];
        if (!Array.isArray(comment.dislikedBy)) comment.dislikedBy = [];
        if (!Array.isArray(comment.trustedBy)) comment.trustedBy = [];
        if (!Array.isArray(comment.distrustedBy)) comment.distrustedBy = [];
        if (!Array.isArray(comment.flaggedBy)) comment.flaggedBy = [];
        if (typeof comment.likes !== 'number') comment.likes = 0;
        if (typeof comment.dislikes !== 'number') comment.dislikes = 0;
        if (typeof comment.trusts !== 'number') comment.trusts = 0;
        if (typeof comment.distrusts !== 'number') comment.distrusts = 0;
        if (typeof comment.flags !== 'number') comment.flags = 0;

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
        } else if (type === 'flag') {
            if (!comment.flaggedBy) comment.flaggedBy = [];
            if (comment.flaggedBy.includes(userEmail)) {
                comment.flags -= 1;
                comment.flaggedBy = comment.flaggedBy.filter(email => email !== userEmail);
                console.log('User unflagged the comment');
            } else {
                comment.flags += 1;
                comment.flaggedBy.push(userEmail);
                console.log('User flagged the comment');
            }
        }

        // Ensure Mongoose persists nested changes
        comment.markModified('replies');
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
                distrusts: comment.distrusts,
                flags: comment.flags
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
        if (!Array.isArray(reply.likedBy)) reply.likedBy = [];
        if (!Array.isArray(reply.dislikedBy)) reply.dislikedBy = [];
        if (!Array.isArray(reply.trustedBy)) reply.trustedBy = [];
        if (!Array.isArray(reply.distrustedBy)) reply.distrustedBy = [];
        if (!Array.isArray(reply.flaggedBy)) reply.flaggedBy = [];
        if (typeof reply.likes !== 'number') reply.likes = 0;
        if (typeof reply.dislikes !== 'number') reply.dislikes = 0;
        if (typeof reply.trusts !== 'number') reply.trusts = 0;
        if (typeof reply.distrusts !== 'number') reply.distrusts = 0;
        if (typeof reply.flags !== 'number') reply.flags = 0;

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
        } else if (type === 'flag') {
            if (reply.flaggedBy.includes(userEmail)) {
                reply.flags -= 1;
                reply.flaggedBy = reply.flaggedBy.filter(email => email !== userEmail);
            } else {
                reply.flags += 1;
                reply.flaggedBy.push(userEmail);
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
                distrusts: reply.distrusts,
                flags: reply.flags
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

    // Join user-specific room for direct messages
    socket.on('join-user', (data) => {
        try {
            const { email } = data || {};
            if (!email) return;
            socket.join(`user:${email}`);
            socket.userEmail = email;
            console.log(`Socket ${socket.id} joined user room: user:${email}`);
        } catch (e) {
            console.error('join-user error:', e);
        }
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