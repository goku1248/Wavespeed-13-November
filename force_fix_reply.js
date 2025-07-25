const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://gokulvshetty:cHOgg9s7SEEXPyV7@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';

async function forceFixReply() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Use the raw MongoDB driver to directly update the document
        const db = mongoose.connection.db;
        const collection = db.collection('comments');
        
        // Find the specific comment
        const comment = await collection.findOne({ _id: new mongoose.Types.ObjectId('6863c8955a132d5da3880f93') });
        if (!comment) {
            console.log('Comment not found');
            return;
        }
        
        console.log('Found comment:', comment.url);
        console.log('Comment text:', comment.text);
        
        // Function to find and update the specific reply
        function updateReplyInArray(replies, targetReplyId) {
            for (let i = 0; i < replies.length; i++) {
                const reply = replies[i];
                if (reply._id && reply._id.toString() === targetReplyId) {
                    console.log('Found target reply:', reply.text);
                    
                    // Force add the missing fields
                    replies[i] = {
                        ...reply,
                        likes: 0,
                        dislikes: 0,
                        trusts: 0,
                        distrusts: 0,
                        likedBy: [],
                        dislikedBy: [],
                        trustedBy: [],
                        distrustedBy: []
                    };
                    
                    console.log('Updated reply with reaction arrays');
                    return true;
                }
                
                // Check nested replies
                if (reply.replies && Array.isArray(reply.replies)) {
                    if (updateReplyInArray(reply.replies, targetReplyId)) {
                        return true;
                    }
                }
            }
            return false;
        }
        
        // Update the reply
        const targetReplyId = '6863c8d25a132d5da3880fd4';
        const updated = updateReplyInArray(comment.replies, targetReplyId);
        
        if (updated) {
            // Save the updated comment
            await collection.updateOne(
                { _id: new mongoose.Types.ObjectId('6863c8955a132d5da3880f93') },
                { $set: { replies: comment.replies } }
            );
            console.log('✅ Successfully updated the reply in the database!');
        } else {
            console.log('❌ Reply not found');
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

forceFixReply(); 