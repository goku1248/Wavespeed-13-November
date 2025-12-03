// Test script to verify comment section improvements
// Run this in the browser console after loading the extension

console.log('=== Testing Comment Section Improvements ===\n');

// Test 1: Check if formatRelativeTime function exists
console.log('Test 1: formatRelativeTime function');
if (typeof formatRelativeTime === 'function') {
    const testDate = new Date(Date.now() - 3600000); // 1 hour ago
    const result = formatRelativeTime(testDate);
    console.log('✓ formatRelativeTime exists');
    console.log(`  Example: ${result}`);
} else {
    console.log('✗ formatRelativeTime function not found');
}

// Test 2: Check if character count element exists
console.log('\nTest 2: Character count element');
const charCount = document.getElementById('comment-char-count');
if (charCount) {
    console.log('✓ Character count element exists');
    console.log(`  Current value: ${charCount.textContent}`);
} else {
    console.log('✗ Character count element not found');
}

// Test 3: Check if comment input has maxlength
console.log('\nTest 3: Comment input maxlength');
const commentInput = document.getElementById('comment-input');
if (commentInput) {
    const maxLength = commentInput.getAttribute('maxlength');
    console.log(`✓ Comment input found with maxlength: ${maxLength || 'not set'}`);
} else {
    console.log('✗ Comment input not found');
}

// Test 4: Check if replies toggle has new structure
console.log('\nTest 4: Replies toggle structure');
const repliesToggle = document.querySelector('.replies-toggle');
if (repliesToggle) {
    const toggleText = repliesToggle.querySelector('.replies-toggle-text');
    const toggleIcon = repliesToggle.querySelector('.replies-toggle-icon');
    if (toggleText && toggleIcon) {
        console.log('✓ Replies toggle has new structure');
        console.log(`  Text: ${toggleText.textContent}`);
        console.log(`  Icon: ${toggleIcon.textContent}`);
    } else {
        console.log('✗ Replies toggle missing text or icon elements');
    }
} else {
    console.log('⚠ No replies toggle found (may not have comments with replies)');
}

// Test 5: Check if action buttons have tooltips
console.log('\nTest 5: Action button tooltips');
const actionButtons = document.querySelectorAll('.action-btn[title]');
if (actionButtons.length > 0) {
    console.log(`✓ Found ${actionButtons.length} action buttons with tooltips`);
    actionButtons.forEach((btn, index) => {
        if (index < 3) { // Show first 3
            console.log(`  - ${btn.getAttribute('title')}`);
        }
    });
} else {
    console.log('⚠ No action buttons with tooltips found (may not have comments loaded)');
}

// Test 6: Check if relative time is used in comments
console.log('\nTest 6: Relative time in comments');
const commentTime = document.querySelector('.comment-time');
if (commentTime) {
    const timeText = commentTime.textContent.trim();
    const hasFullTime = commentTime.getAttribute('title');
    console.log(`✓ Comment time element found`);
    console.log(`  Display: ${timeText}`);
    console.log(`  Full time on hover: ${hasFullTime ? 'Yes' : 'No'}`);
    
    // Check if it's relative time (not a full date string)
    const isRelative = !timeText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    if (isRelative) {
        console.log('  ✓ Using relative time format');
    } else {
        console.log('  ⚠ Still using full date format');
    }
} else {
    console.log('⚠ No comment time found (may not have comments loaded)');
}

// Test 7: Check CSS for replies toggle
console.log('\nTest 7: CSS for replies toggle');
const style = window.getComputedStyle(repliesToggle || document.body);
if (repliesToggle) {
    const bgColor = style.backgroundColor;
    const borderRadius = style.borderRadius;
    console.log(`✓ Replies toggle styling applied`);
    console.log(`  Background: ${bgColor}`);
    console.log(`  Border radius: ${borderRadius}`);
}

// Test 8: Check delete confirmation
console.log('\nTest 8: Delete confirmation');
// This would need to be tested manually by clicking delete buttons
console.log('⚠ Manual test required: Click delete button to verify confirmation dialog');

console.log('\n=== Test Summary ===');
console.log('Run this script in the browser console after loading a page with comments');
console.log('All automated tests completed. Manual testing recommended for:');
console.log('  - Delete confirmation dialogs');
console.log('  - Character count updates while typing');
console.log('  - Tooltip display on hover');
console.log('  - Replies toggle expand/collapse animation');

