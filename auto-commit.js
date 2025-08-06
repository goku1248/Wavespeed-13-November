#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

function autoCommit(message, description = '') {
    try {
        console.log('🔄 Auto-committing changes...');
        
        // Check if there are any changes
        try {
            const status = execSync('git status --porcelain', { encoding: 'utf8' });
            if (!status.trim()) {
                console.log('✅ No changes to commit');
                return;
            }
        } catch (error) {
            console.log('⚠️  Git status check failed:', error.message);
            return;
        }
        
        // Add all changes
        execSync('git add .', { stdio: 'inherit' });
        console.log('📁 Added all changes');
        
        // Create commit message
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const fullMessage = description 
            ? `${message}\n\n${description}\n\nAuto-committed: ${timestamp}`
            : `${message}\n\nAuto-committed: ${timestamp}`;
        
        // Commit changes
        execSync(`git commit -m "${fullMessage}"`, { stdio: 'inherit' });
        console.log('💾 Committed changes');
        
        // Push to origin
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('🚀 Pushed to GitHub');
        
        console.log('✅ Auto-commit completed successfully!');
        
    } catch (error) {
        console.error('❌ Auto-commit failed:', error.message);
        process.exit(1);
    }
}

// Get command line arguments
const args = process.argv.slice(2);
const message = args[0] || '🔄 Auto-commit: Update files';
const description = args[1] || '';

autoCommit(message, description);