const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://gokulvshetty:cHOgg9s7SEEXPyV7@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';

// Comment schema
const commentSchema = new mongoose.Schema({
    url: String,
    text: String,
    user: {
        name: String,
        email: String,
        picture: String
    },
    timestamp: Date,
    replies: [{
        _id: mongoose.Schema.Types.ObjectId,
        text: String,
        user: {
            name: String,
            email: String,
            picture: String
        },
        timestamp: Date,
        replies: [mongoose.Schema.Types.Mixed],
        likes: { type: Number, default: 0 },
        dislikes: { type: Number, default: 0 },
        trusts: { type: Number, default: 0 },
        distrusts: { type: Number, default: 0 },
        likedBy: { type: [String], default: [] },
        dislikedBy: { type: [String], default: [] },
        trustedBy: { type: [String], default: [] },
        distrustedBy: { type: [String], default: [] }
    }],
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    trusts: { type: Number, default: 0 },
    distrusts: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
    dislikedBy: { type: [String], default: [] },
    trustedBy: { type: [String], default: [] },
    distrustedBy: { type: [String], default: [] }
});

const Comment = mongoose.model('Comment', commentSchema);

async function checkReply() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Find the specific comment
        const comment = await Comment.findById('6863c8955a132d5da3880f93');
        if (!comment) {
            console.log('Comment not found');
            return;
        }
        
        console.log('Found comment:', comment.url);
        console.log('Comment text:', comment.text);
        console.log('Number of replies:', comment.replies.length);
        
        // Find the specific Level 2 reply
        const targetReplyId = '6863c8d25a132d5da3880fd4';
        
        function findReplyById(replies, replyId) {
            for (let reply of replies) {
                if (reply._id && reply._id.toString() === replyId) {
                    return reply;
                }
                if (reply.replies && reply.replies.length > 0) {
                    const found = findReplyById(reply.replies, replyId);
                    if (found) return found;
                }
            }
            return null;
        }
        
        const reply = findReplyById(comment.replies, targetReplyId);
        if (!reply) {
            console.log('Reply not found');
            return;
        }
        
        console.log('\n=== REPLY DETAILS ===');
        console.log('Reply ID:', reply._id);
        console.log('Reply text:', reply.text);
        console.log('Reply user:', reply.user.name);
        
        console.log('\n=== REACTION ARRAYS ===');
        console.log('likedBy:', reply.likedBy);
        console.log('dislikedBy:', reply.dislikedBy);
        console.log('trustedBy:', reply.trustedBy);
        console.log('distrustedBy:', reply.distrustedBy);
        
        console.log('\n=== REACTION COUNTS ===');
        console.log('likes:', reply.likes);
        console.log('dislikes:', reply.dislikes);
        console.log('trusts:', reply.trusts);
        console.log('distrusts:', reply.distrusts);
        
        console.log('\n=== ARRAY TYPES ===');
        console.log('likedBy type:', typeof reply.likedBy);
        console.log('dislikedBy type:', typeof reply.dislikedBy);
        console.log('trustedBy type:', typeof reply.trustedBy);
        console.log('distrustedBy type:', typeof reply.distrustedBy);
        
        console.log('\n=== IS ARRAY? ===');
        console.log('likedBy isArray:', Array.isArray(reply.likedBy));
        console.log('dislikedBy isArray:', Array.isArray(reply.dislikedBy));
        console.log('trustedBy isArray:', Array.isArray(reply.trustedBy));
        console.log('distrustedBy isArray:', Array.isArray(reply.distrustedBy));
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

checkReply(); 