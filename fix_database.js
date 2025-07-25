const mongoose = require('mongoose');

// MongoDB connection string - same as server.js
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
        replies: [mongoose.Schema.Types.Mixed], // Allow nested replies
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

async function fixDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        console.log('Starting database fix...');
        
        // Get all comments
        const comments = await Comment.find({});
        console.log(`Found ${comments.length} comments to check`);

        let totalFixed = 0;
        let commentsFixed = 0;

        for (const comment of comments) {
            let commentNeedsSave = false;
            let repliesFixed = 0;

            // Function to fix a single reply
            const fixReply = (reply) => {
                let replyFixed = false;
                
                // Check if reply is missing reaction fields
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
                    repliesFixed++;
                    console.log(`  Fixed reply: ${reply.text?.substring(0, 30)} (ID: ${reply._id})`);
                }

                // Recursively fix nested replies
                if (reply.replies && Array.isArray(reply.replies)) {
                    reply.replies.forEach(fixReply);
                }
            };

            // Fix all replies in this comment
            if (comment.replies && Array.isArray(comment.replies)) {
                comment.replies.forEach(fixReply);
            }

            if (repliesFixed > 0) {
                commentNeedsSave = true;
                commentsFixed++;
                totalFixed += repliesFixed;
                console.log(`Comment ${comment._id}: Fixed ${repliesFixed} replies`);
            }
        }

        // Save all comments that were modified
        if (commentsFixed > 0) {
            console.log(`\nSaving ${commentsFixed} comments with fixes...`);
            for (const comment of comments) {
                if (comment.isModified()) {
                    await comment.save();
                    console.log(`Saved comment ${comment._id}`);
                }
            }
        }

        console.log(`\n✅ Database fix completed!`);
        console.log(`📊 Summary:`);
        console.log(`   - Comments checked: ${comments.length}`);
        console.log(`   - Comments fixed: ${commentsFixed}`);
        console.log(`   - Total replies fixed: ${totalFixed}`);

    } catch (error) {
        console.error('Error fixing database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the fix
fixDatabase(); 