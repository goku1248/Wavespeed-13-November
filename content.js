// @ts-nocheck
// WebSocket connection management
let socket = null;
let currentUser = null;
let typingTimer = null;
let scrollTimer = null;

// Shared messaging UI state accessible from sockets and panel logic
const messagesUIState = {
    activeSection: 'comments',
    selectedConversationEmail: null,
    selectedGroupId: null,
    selectedGroupName: null,
    isThreadLoading: false,
    unreadCount: 0
};

const trendingState = {
    comments: [],
    isLoading: false,
    lastFetched: 0,
    error: null,
    metric: 'likes',
    timeRange: 'all',
    limit: 100,
    cache: {}
};

const postsState = {
    items: [],
    isLoading: false,
    lastFetched: 0,
    error: null,
    filter: 'all', // 'all' | 'comments' | 'replies' | 'messages'
    cache: null
};

const notificationsState = {
    items: [],
    isLoading: false,
    lastFetched: 0,
    error: null,
    unreadCount: 0
};

const TRENDING_CACHE_DURATION = 60 * 1000; // 1 minute cache

const TRENDING_METRIC_OPTIONS = [
    { value: 'likes', label: 'Likes' },
    { value: 'dislikes', label: 'Dislikes' },
    { value: 'trusts', label: 'Trusted' },
    { value: 'distrusts', label: 'Mistrusted' },
    { value: 'flags', label: 'Flagged' }
];

const TRENDING_TIME_RANGE_OPTIONS = [
    { value: 'all', label: 'All time' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '3d', label: 'Last 3 days' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '1y', label: 'Last 12 months' }
];

const TRENDING_METRIC_LABELS = TRENDING_METRIC_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
}, {});

const TRENDING_TIME_RANGE_LABELS = TRENDING_TIME_RANGE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
}, {});

function escapeHtml(input) {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatRelativeTime(date) {
    if (!(date instanceof Date)) date = new Date(date);
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

// Modern SVG Icon System
function getSectionIcon(section, size = 20) {
    const icons = {
        'comments': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M17 8H9M17 12H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'messages': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 6L12 13L2 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'trending': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="currentColor"/>
        </svg>`,
        'posts': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 2V8H20M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'followers': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'following': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H4C2.93913 15 1.92172 15.4214 1.17157 16.1716C0.421427 16.9217 0 17.9391 0 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 11C10.2091 11 12 9.20914 12 7C12 4.79086 10.2091 3 8 3C5.79086 3 4 4.79086 4 7C4 9.20914 5.79086 11 8 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20 8V14M23 11H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'search': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'notifications': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'profile': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'settings': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'new-message': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 8V16M8 12H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`
    };
    return icons[section] || icons['comments'];
}

// Modern Action Icon System for Comment Buttons
function getActionIcon(action, size = 16) {
    const icons = {
        'reply': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'like': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 10V20L16 20C16.5304 20 17.0391 19.7893 17.4142 19.4142C17.7893 19.0391 18 18.5304 18 18V13.2C18 12.8836 17.9741 12.5685 17.923 12.2581L17.293 8.96C17.1631 8.41 16.7556 8 16.2 8H12M7 10L12 8V4C12 3.46957 11.7893 2.96086 11.4142 2.58579C11.0391 2.21071 10.5304 2 10 2H9C8.46957 2 7.96086 2.21071 7.58579 2.58579C7.21071 2.96086 7 3.46957 7 4V10ZM7 10H4C3.46957 10 2.96086 10.2107 2.58579 10.5858C2.21071 10.9609 2 11.4696 2 12V18C2 18.5304 2.21071 19.0391 2.58579 19.4142C2.96086 19.7893 3.46957 20 4 20H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'dislike': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 14V4L8 4C7.46957 4 6.96086 4.21071 6.58579 4.58579C6.21071 4.96086 6 5.46957 6 6V10.8C6 11.1164 6.02588 11.4315 6.077 11.7419L6.707 15.04C6.83688 15.59 7.24437 16 7.8 16H12M17 14L12 16V20C12 20.5304 12.2107 21.0391 12.5858 21.4142C12.9609 21.7893 13.4696 22 14 22H15C15.5304 22 16.0391 21.7893 16.4142 21.4142C16.7893 21.0391 17 20.5304 17 20V14ZM17 14H20C20.5304 14 21.0391 13.7893 21.4142 13.4142C21.7893 13.0391 22 12.5304 22 12V6C22 5.46957 21.7893 4.96086 21.4142 4.58579C21.0391 4.21071 20.5304 4 20 4H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'trust': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="currentColor"/>
        </svg>`,
        'distrust': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M15 9L9 15M9 9L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'flag': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 15S6 13 8 13S12 15 14 15S18 13 20 13V3S18 5 16 5S12 3 10 3S6 5 4 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 22V15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'edit': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.50023C18.8978 2.1024 19.4374 1.87891 20 1.87891C20.5626 1.87891 21.1022 2.1024 21.5 2.50023C21.8978 2.89805 22.1213 3.43762 22.1213 4.00023C22.1213 4.56284 21.8978 5.1024 21.5 5.50023L12 15.0002L8 16.0002L9 12.0002L18.5 2.50023Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'delete': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 11V17M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'refresh': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M23 4V10H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20.49 15C19.9828 16.8399 18.8927 18.4815 17.4015 19.6586C15.9103 20.8357 14.0992 21.4836 12.2301 21.4992C10.3609 21.5148 8.54085 20.8974 7.03251 19.7398C5.52417 18.5822 4.40967 16.9468 3.86473 15.1134C3.31979 13.2801 3.37537 11.3364 4.02556 9.53752C4.67575 7.73869 5.88985 6.17477 7.48846 5.08618C9.08707 3.99759 10.9926 3.44536 12.9016 3.50024C14.8106 3.55512 16.6844 4.21418 18.21 5.38L23 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'minimize': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'maximize': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V8M21 8V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 19 3H16M16 21H19C19.5304 21 20.0391 20.7893 20.4142 20.4142C20.7893 20.0391 21 19.5304 21 19V16M3 16V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'close': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`
    };
    return icons[action] || icons['reply'];
}

function updateTrendingDescription() {
    const descriptionEl = document.getElementById('trending-description');
    if (!descriptionEl) return;

    const metricLabel = TRENDING_METRIC_LABELS[trendingState.metric] || TRENDING_METRIC_LABELS.likes;
    const rangeLabel = TRENDING_TIME_RANGE_LABELS[trendingState.timeRange] || TRENDING_TIME_RANGE_LABELS.all;

    descriptionEl.textContent = `Top ${trendingState.limit} comments by ${metricLabel.toLowerCase()} • ${rangeLabel}`;
}

function getHostnameFromUrl(url) {
    if (!url) return '';
    try {
        const hostname = new URL(url).hostname || '';
        return hostname.replace(/^www\./i, '');
    } catch (error) {
        return '';
    }
}

function createMessageBubbleElement(message, { isFromMe, isGroup, isPending, messageId } = {}) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble-modern ${isFromMe ? 'sent' : 'received'}`;
    if (isPending) bubble.classList.add('pending');
    if (messageId) bubble.dataset.messageId = messageId;
    
    const text = escapeHtml(message?.text || '');
    const timestamp = message?.timestamp ? new Date(message.timestamp) : new Date();
    const timeLabel = formatRelativeTime(timestamp);
    let senderName = '';
    if (!isFromMe && isGroup && message?.from) {
        const name = message.from.name || message.from.email?.split('@')[0] || '';
        senderName = escapeHtml(name);
    }
    
    bubble.innerHTML = `
        ${senderName ? `<div class="message-sender">${senderName}</div>` : ''}
        <div class="message-text">${text || '<em>(no message)</em>'}</div>
        <div class="message-time">${timeLabel}${isPending ? ' • Sending…' : ''}</div>
    `;
    
    return bubble;
}

function renderMessagesList(listEl, messages, { isGroup, preserveScroll } = {}) {
    if (!listEl || !Array.isArray(messages)) return;
    
    let previousBottomOffset = 0;
    const shouldPreserve = preserveScroll && listEl.scrollHeight > 0;
    if (shouldPreserve) {
        previousBottomOffset = listEl.scrollHeight - listEl.scrollTop;
    }
    
    listEl.innerHTML = '';
    messages.forEach((msg) => {
        const isFromMe = msg?.from?.email === currentUser?.email;
        const bubble = createMessageBubbleElement(msg, { isFromMe, isGroup });
        listEl.appendChild(bubble);
    });
    
    if (shouldPreserve) {
        const newScrollTop = Math.max(0, listEl.scrollHeight - previousBottomOffset);
        listEl.scrollTop = newScrollTop;
    } else {
        listEl.scrollTop = listEl.scrollHeight;
    }
}

function showMessagesLoadingState(listEl) {
    if (!listEl) return;
    listEl.innerHTML = `
        <div class="messages-loading">
            <div class="spinner"></div>
            <span>Loading messages…</span>
        </div>
    `;
}

function appendMessageToThread(message, { isFromMe, isGroup, isPending, messageId } = {}) {
    const list = document.getElementById('messages-thread-list');
    if (!list) return null;
    const bubble = createMessageBubbleElement(message, { isFromMe, isGroup, isPending, messageId });
    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
    return bubble;
}

function markPendingMessageStatus(messageId, status) {
    const list = document.getElementById('messages-thread-list');
    if (!list || !messageId) return;
    const bubble = list.querySelector(`[data-message-id="${messageId}"], [data-message-temp-id="${messageId}"]`);
    if (!bubble) return;
    
    bubble.classList.remove('pending', 'failed');
    
    const timeEl = bubble.querySelector('.message-time');
    if (status === 'sent') {
        bubble.dataset.messageId = messageId;
        if (timeEl) {
            timeEl.textContent = formatRelativeTime(new Date());
        }
    } else if (status === 'failed') {
        bubble.classList.add('failed');
        if (timeEl) {
            timeEl.textContent = 'Failed to send';
        }
    }
}

function updateMessagesBadge(unreadCount) {
    messagesUIState.unreadCount = unreadCount;
    const tabsBar = document.getElementById('sections-tabs');
    const messagesTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="messages"]');
    if (!messagesTab) return;
    let badge = messagesTab.querySelector('.tab-badge');
    if (unreadCount > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-badge';
            messagesTab.appendChild(badge);
        }
        badge.textContent = String(unreadCount);
    } else if (badge) {
        badge.remove();
    }
}

// Initialize WebSocket connection with dual-server support
function initializeWebSocket() {
    if (socket) {
        socket.disconnect();
    }
    
    // Load Socket.IO client library from current server
    const script = document.createElement('script');
    script.src = `${SERVER_BASE_URL}/socket.io/socket.io.js`;
    script.onload = () => {
        console.log('Socket.IO loaded, connecting...');
        connectWebSocket();
    };
    script.onerror = () => {
        console.error('Failed to load Socket.IO from', SERVER_BASE_URL);
        // Don't fail completely, just skip WebSocket features
    };
    document.head.appendChild(script);
}

function connectWebSocket() {
    // Guard against mixed-content errors on HTTPS pages by skipping WS init if blocked
    try {
        console.log(`Connecting WebSocket to ${SERVER_BASE_URL}`);
        socket = io(SERVER_BASE_URL);
    } catch (e) {
        console.warn('Socket.IO connection skipped due to mixed content:', e?.message || e);
        return;
    }
    
    socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        if (currentUser) {
            socket.emit('join-page', {
                url: window.location.href,
                user: currentUser
            });
            // Also join user-specific room for direct messages
            socket.emit('join-user', { email: currentUser.email });
        }
    });
    
    // Listen for real-time events
    setupWebSocketListeners();
}

function setupWebSocketListeners() {
    // Live comment notifications
    socket.on('comment-added', (data) => {
        console.log('New comment received:', data);
        showNotification(`${data.comment.user.name} added a comment`, 'comment');
        // Refresh comments to show the new one
        refreshComments();
    });
    
    // Live reply notifications  
    socket.on('reply-added', (data) => {
        console.log('New reply received:', data);
        showNotification(`${data.reply.user.name} replied to a comment`, 'reply');
        refreshComments();
    });
    
    // Live reaction updates
    socket.on('reaction-updated', (data) => {
        console.log('Reaction updated:', data);
        updateReactionUI(data);
    });
    
    // Typing indicators
    socket.on('user-typing', (data) => {
        console.log('User typing:', data);
        showTypingIndicator(data);
    });
    
    // Active users
    socket.on('active-users', (users) => {
        console.log('Active users:', users);
        updateActiveUsersUI(users);
    });
    
    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        showNotification(`${data.user.name} joined the page`, 'user-join');
        updateActiveUsersCount(data.activeCount);
    });
    
    socket.on('user-left', (data) => {
        console.log('User left:', data);
        updateActiveUsersCount(data.activeCount);
    });
    
    // Real-time notifications
    socket.on('new-notification', async (data) => {
        console.log('New notification received:', data);
        // Load current notifications from storage
        try {
            const stored = await chrome.storage.local.get(['notifications', 'notificationUnreadCount']);
            let notifications = Array.isArray(stored.notifications) ? stored.notifications : [];
            let unreadCount = stored.notificationUnreadCount || 0;
            
            // Add new notification to the beginning
            notifications.unshift(data);
            // Keep only the most recent 100 notifications
            if (notifications.length > 100) {
                notifications = notifications.slice(0, 100);
            }
            
            // Increment unread count
            unreadCount = (unreadCount || 0) + 1;
            
            // Save to storage (this will trigger storage.onChanged in all tabs)
            await chrome.storage.local.set({
                notifications: notifications,
                notificationUnreadCount: unreadCount,
                notificationsLastUpdated: Date.now()
            });
            
            // Update local state
            notificationsState.items = notifications;
            notificationsState.unreadCount = unreadCount;
            
            // Update badge count
            updateNotificationsBadge(unreadCount);
            
            // If notifications section is active, refresh the list
            const activeSection = messagesUIState.activeSection;
            if (activeSection === 'notifications') {
                renderNotificationsList(notifications);
            }
        } catch (error) {
            console.error('Error handling new notification:', error);
        }
    });
    
    // Collaborative cursors
    socket.on('user-scroll', (data) => {
        console.log('User scroll:', data);
        showCollaborativeCursor(data);
    });

    // Real-time direct messages
    socket.on('message-received', async (msg) => {
        console.log('Message received via socket:', msg);
        try {
            if (!msg || !currentUser) return;
            const isGroupMessage = !!msg.isGroupMessage || !!msg.groupId;
            const isFromMe = msg.from?.email === currentUser.email;
            const matchesActiveDirect = !isGroupMessage &&
                messagesUIState.selectedConversationEmail &&
                (msg.from?.email === messagesUIState.selectedConversationEmail || msg.to?.email === messagesUIState.selectedConversationEmail);
            const matchesActiveGroup = isGroupMessage &&
                messagesUIState.selectedGroupId &&
                msg.groupId === messagesUIState.selectedGroupId;
            
            if ((matchesActiveDirect || matchesActiveGroup) && messagesUIState.activeSection === 'messages') {
                appendMessageToThread(msg, { isFromMe, isGroup: isGroupMessage });
                if (!isFromMe && messagesUIState.unreadCount > 0) {
                    updateMessagesBadge(Math.max(0, messagesUIState.unreadCount - 1));
                }
            } else if (!isFromMe) {
                updateMessagesBadge(messagesUIState.unreadCount + 1);
                try {
                    showNotification(`${msg.from?.name || msg.from?.email || 'Someone'} messaged you`, 'message');
                } catch (_) {}
            }
        } catch (e) {
            console.warn('Failed to render incoming message:', e);
        }
    });
    
    socket.on('message-sent', (msg) => {
        console.log('Message sent ack via socket:', msg);
        // Polling and optimistic updates already handle local UI.
    });
}

// Create and inject the comments panel
async function createCommentsPanel() {
    console.log('Creating comments panel...');
    // Read persisted state before creating the panel to avoid flicker
    let initialIsMinimized = false;
    try {
        const result = await chrome.storage.local.get(['panelState']);
        initialIsMinimized = !!(result.panelState && result.panelState.isMinimized);
    } catch (e) {
        initialIsMinimized = false;
    }
    const panel = document.createElement('div');
    panel.id = 'webpage-comments-panel';
    panel.innerHTML = `
        <div id="comments-resizer"></div>
        <div id="comments-right-resizer"></div>
        <div id="comments-top-left-resizer"></div>
        <div id="comments-top-right-resizer"></div>
        <div id="comments-bottom-left-resizer"></div>
        <div id="comments-bottom-right-resizer"></div>
        <div class="comments-header" id="comments-header">
            <div class="header-left">
                <h3><span class="header-icon">${getSectionIcon('comments', 20)}</span> Comments</h3>
                <div id="user-info-header" class="user-info-header" style="display: none;">
                    <img id="user-avatar-header" class="user-avatar-header" src="" alt="User" />
                    <div class="user-details-header">
                        <div id="user-name-header" class="user-name-header"></div>
                        <div id="user-email-header" class="user-email-header"></div>
                    </div>
                </div>
                <div id="server-status-indicator" class="server-status-indicator" title="Server Status">
                    <span class="status-dot"></span>
                    <span class="status-text">Local</span>
                </div>
            </div>
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
                        <div class="dropdown-option" data-value="most-disliked">Most Disliked</div>
                        <div class="dropdown-option" data-value="most-trusted">Most Trusted</div>
                        <div class="dropdown-option" data-value="most-distrusted">Most Distrusted</div>
                    </div>
                </div>
                <button id="refresh-comments" title="Refresh comments" class="header-control-btn">${getActionIcon('refresh', 18)}</button>
                <button id="minimize-comments" title="Minimize" class="header-control-btn">${getActionIcon('minimize', 18)}</button>
                <button id="maximize-comments" title="Maximize" class="header-control-btn">${getActionIcon('maximize', 18)}</button>
                <button id="close-comments" title="Close" class="header-control-btn close-btn">${getActionIcon('close', 18)}</button>
            </div>
        </div>
        <div class="sections-tabs" id="sections-tabs">
            <button class="section-tab active" data-section="comments" title="Comments"><span class="section-icon">${getSectionIcon('comments', 18)}</span></button>
            <button class="section-tab" data-section="messages" title="Messages"><span class="section-icon">${getSectionIcon('messages', 18)}</span></button>
            <button class="section-tab" data-section="trending" title="Trending"><span class="section-icon">${getSectionIcon('trending', 18)}</span></button>
            <button class="section-tab" data-section="posts" title="Posts"><span class="section-icon">${getSectionIcon('posts', 18)}</span></button>
            <button class="section-tab" data-section="followers" title="Followers"><span class="section-icon">${getSectionIcon('followers', 18)}</span></button>
            <button class="section-tab" data-section="following" title="Following"><span class="section-icon">${getSectionIcon('following', 18)}</span></button>
            <button class="section-tab" data-section="search" title="Search"><span class="section-icon">${getSectionIcon('search', 18)}</span></button>
            <button class="section-tab" data-section="notifications" title="Notifications"><span class="section-icon">${getSectionIcon('notifications', 18)}</span></button>
            <button class="section-tab" data-section="profile" title="Profile"><span class="section-icon">${getSectionIcon('profile', 18)}</span></button>
            <button class="section-tab" data-section="settings" title="Settings"><span class="section-icon">${getSectionIcon('settings', 18)}</span></button>
        </div>
        <div class="sections-container hidden" id="sections-container">
            <div class="section-placeholder" data-section="messages">
                <div class="messages-panel-modern">
                    <div class="messages-sidebar-modern">
                        <div class="messages-header-modern">
                            <h4>Messages</h4>
                            <button id="new-message-btn" class="new-message-btn" title="New Message">${getSectionIcon('new-message', 18)}</button>
                        </div>
                        <div class="messages-search-modern">
                            <div class="search-input-wrapper">
                                <span class="search-icon">${getSectionIcon('search', 16)}</span>
                                <input id="messages-search-input" type="text" placeholder="Search conversations..." />
                            </div>
                        </div>
                        <div class="messages-tabs-modern">
                            <button id="direct-messages-tab" class="messages-tab-modern active">
                                <span class="tab-icon">${getSectionIcon('messages', 16)}</span>
                                <span>Chats</span>
                            </button>
                            <button id="group-messages-tab" class="messages-tab-modern">
                                <span class="tab-icon">${getSectionIcon('followers', 16)}</span>
                                <span>Groups</span>
                            </button>
                        </div>
                        <div id="conversations-list" class="conversations-list-modern"></div>
                        <div id="groups-list" class="groups-list-modern" style="display: none;">
                            <div class="groups-header-modern">
                                <button id="create-group-btn" class="create-group-btn-modern">
                                    ${getActionIcon('reply', 16)} Create New Group
                                </button>
                            </div>
                            <div id="groups-items" class="groups-items-modern"></div>
                        </div>
                    </div>
                    <div class="messages-thread-modern">
                        <div id="messages-thread-header" class="messages-thread-header-modern">
                            <div class="conversation-info">
                                <div class="conversation-avatar">${getSectionIcon('profile', 24)}</div>
                                <div class="conversation-details">
                                    <div class="conversation-name">Select a conversation</div>
                                    <div class="conversation-status">Start messaging</div>
                                </div>
                            </div>
                            <div class="conversation-actions">
                                <button class="conversation-action-btn" title="Call">${getActionIcon('refresh', 18)}</button>
                                <button class="conversation-action-btn" title="Video Call">${getActionIcon('maximize', 18)}</button>
                                <button class="conversation-action-btn" title="Info">${getSectionIcon('settings', 18)}</button>
                            </div>
                        </div>
                        <div id="messages-thread-list" class="messages-thread-list-modern"></div>
                        <div class="messages-input-modern">
                            <div class="input-actions">
                                <button class="input-action-btn" title="Attach File">${getActionIcon('flag', 16)}</button>
                                <button class="input-action-btn" title="Add Emoji">${getActionIcon('trust', 16)}</button>
                                <button class="input-action-btn" title="Voice Message">${getActionIcon('refresh', 16)}</button>
                            </div>
                            <input id="messages-input-text" type="text" placeholder="Type a message..." />
                            <button id="messages-send-btn" class="send-btn-modern">
                                ${getActionIcon('reply', 18)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="trending">
                <div class="trending-section" id="trending-section">
                    <div class="trending-header">
                        <div class="trending-header-text">
                            <h4>Trending Comments</h4>
                            <p id="trending-description">Top 100 comments by likes • All time</p>
                        </div>
                        <div class="trending-actions">
                            <label class="trending-filter" for="trending-metric-select">
                                <span>Metric</span>
                                <select id="trending-metric-select" class="trending-filter-select">
                                    <option value="likes">Likes</option>
                                    <option value="dislikes">Dislikes</option>
                                    <option value="trusts">Trusted</option>
                                    <option value="distrusts">Mistrusted</option>
                                    <option value="flags">Flagged</option>
                                </select>
                            </label>
                            <label class="trending-filter" for="trending-range-select">
                                <span>Time range</span>
                                <select id="trending-range-select" class="trending-filter-select">
                                    <option value="all">All time</option>
                                    <option value="24h">Last 24 hours</option>
                                    <option value="3d">Last 3 days</option>
                                    <option value="7d">Last 7 days</option>
                                    <option value="30d">Last 30 days</option>
                                    <option value="90d">Last 90 days</option>
                                    <option value="1y">Last 12 months</option>
                                </select>
                            </label>
                            <label class="trending-filter" for="trending-limit-select">
                                <span>Top</span>
                                <select id="trending-limit-select" class="trending-filter-select">
                                    <option value="10">10</option>
                                    <option value="25">25</option>
                                    <option value="50">50</option>
                                    <option value="100" selected>100</option>
                                </select>
                            </label>
                            <button id="trending-refresh-btn" class="trending-refresh-btn" title="Refresh trending comments">↻ Refresh</button>
                        </div>
                    </div>
                    <div class="trending-body">
                        <div id="trending-loading" class="trending-loading hidden">
                            <div class="spinner"></div>
                            <span>Loading trending comments...</span>
                        </div>
                        <div id="trending-error" class="trending-error hidden"></div>
                        <div id="trending-empty" class="trending-empty hidden">
                            <div class="trending-empty-icon">🌱</div>
                            <p>No trending comments yet. Start reacting to comments and check back soon!</p>
                        </div>
                        <div id="trending-list" class="trending-list"></div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="posts">
                <div class="posts-section" id="posts-section">
                    <div class="posts-header">
                        <div class="posts-header-text">
                            <h4>Your Activity</h4>
                            <p id="posts-description">All your comments, replies, and messages</p>
                        </div>
                        <div class="posts-actions">
                            <label class="posts-filter" for="posts-type-select">
                                <span>Type</span>
                                <select id="posts-type-select" class="trending-filter-select">
                                    <option value="all" selected>All</option>
                                    <option value="comments">Comments</option>
                                    <option value="replies">Replies</option>
                                    <option value="messages">Messages</option>
                                </select>
                            </label>
                            <button id="posts-refresh-btn" class="trending-refresh-btn" title="Refresh your activity">↻ Refresh</button>
                        </div>
                    </div>
                    <div class="posts-body">
                        <div id="posts-loading" class="trending-loading hidden">
                            <div class="spinner"></div>
                            <span>Loading your activity...</span>
                        </div>
                        <div id="posts-error" class="trending-error hidden"></div>
                        <div id="posts-empty" class="trending-empty hidden">
                            <div class="trending-empty-icon">📝</div>
                            <p>No activity yet. Your comments, replies and messages will appear here.</p>
                        </div>
                        <div id="posts-list" class="trending-list"></div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="followers">
                <div class="followers-section" id="followers-section">
                    <div class="followers-header">
                        <h4>Your Followers</h4>
                        <button id="followers-refresh-btn" class="trending-refresh-btn" title="Refresh followers">↻ Refresh</button>
                    </div>
                    <div class="followers-body">
                        <div id="followers-loading" class="trending-loading hidden">
                            <div class="spinner"></div>
                            <span>Loading followers...</span>
                        </div>
                        <div id="followers-error" class="trending-error hidden"></div>
                        <div id="followers-empty" class="trending-empty hidden">
                            <div class="trending-empty-icon">👥</div>
                            <p>No followers yet. Share your comments to get followers!</p>
                        </div>
                        <div id="followers-list" class="followers-list"></div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="following">
                <div class="following-section" id="following-section">
                    <div class="following-header">
                        <h4>People You Follow</h4>
                        <button id="following-refresh-btn" class="trending-refresh-btn" title="Refresh following">↻ Refresh</button>
                    </div>
                    <div class="following-search-container">
                        <div class="following-search-wrapper">
                            <span class="search-icon">${getSectionIcon('search', 16)}</span>
                            <input 
                                id="following-search-input" 
                                type="text" 
                                placeholder="Search for users to follow..." 
                                class="following-search-input"
                            />
                        </div>
                    </div>
                    <div class="following-body">
                        <div id="following-loading" class="trending-loading hidden">
                            <div class="spinner"></div>
                            <span>Loading following...</span>
                        </div>
                        <div id="following-error" class="trending-error hidden"></div>
                        <div id="following-empty" class="trending-empty hidden">
                            <div class="trending-empty-icon">➕</div>
                            <p>You're not following anyone yet. Search for users above or click the Follow button next to usernames!</p>
                        </div>
                        <div id="following-search-results" class="following-search-results hidden"></div>
                        <div id="following-list" class="following-list"></div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="search">
                <div class="search-section" id="search-section">
                    <div class="search-header">
                        <h4>Search Content</h4>
                        <button id="search-refresh-btn" class="trending-refresh-btn" title="Clear search">↻ Clear</button>
                    </div>
                    <div class="search-input-container">
                        <div class="search-input-wrapper">
                            <span class="search-icon">${getSectionIcon('search', 16)}</span>
                            <input 
                                id="content-search-input" 
                                type="text" 
                                placeholder="Search comments, replies, and messages..." 
                                class="content-search-input"
                            />
                        </div>
                        <div class="search-filters">
                            <label class="search-filter-label">
                                <input type="radio" name="search-type" value="all" checked>
                                <span>All</span>
                            </label>
                            <label class="search-filter-label">
                                <input type="radio" name="search-type" value="comments">
                                <span>Comments</span>
                            </label>
                            <label class="search-filter-label">
                                <input type="radio" name="search-type" value="replies">
                                <span>Replies</span>
                            </label>
                            <label class="search-filter-label">
                                <input type="radio" name="search-type" value="messages">
                                <span>Messages</span>
                            </label>
                        </div>
                    </div>
                    <div class="search-body">
                        <div id="search-loading" class="trending-loading hidden">
                            <div class="spinner"></div>
                            <span>Searching...</span>
                        </div>
                        <div id="search-error" class="trending-error hidden"></div>
                        <div id="search-empty" class="trending-empty hidden">
                            <div class="trending-empty-icon">🔍</div>
                            <p>Enter a keyword to search across all comments, replies, and messages.</p>
                        </div>
                        <div id="search-results" class="search-results hidden"></div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="notifications" style="display: none;">
                <div class="notifications-container">
                    <div id="notifications-loading" class="notifications-loading hidden">
                        <div class="spinner"></div>
                        <span>Loading notifications...</span>
                    </div>
                    <div id="notifications-error" class="notifications-error hidden"></div>
                    <div id="notifications-empty" class="notifications-empty hidden">
                        <div class="notifications-empty-icon">🔔</div>
                        <p>No notifications yet</p>
                        <p class="notifications-empty-subtitle">You'll see notifications here when people interact with your comments and replies.</p>
                    </div>
                    <div id="notifications-list" class="notifications-list"></div>
                </div>
            </div>
            <div class="section-placeholder" data-section="profile" style="display: none;">
                <div class="profile-container">
                    <div id="profile-loading" class="profile-loading hidden">
                        <div class="spinner"></div>
                        <span>Loading profile...</span>
                    </div>
                    <div id="profile-error" class="profile-error hidden"></div>
                    <div id="profile-content" class="profile-content">
                        <div class="profile-header">
                            <div class="profile-avatar-container">
                                <img id="profile-avatar" class="profile-avatar" src="" alt="Profile" />
                                <button id="profile-edit-avatar-btn" class="profile-edit-avatar-btn hidden" title="Change profile picture">📷</button>
                            </div>
                            <div class="profile-info">
                                <div class="profile-name-row">
                                    <div id="profile-display-name" class="profile-display-name"></div>
                                    <button id="profile-edit-btn" class="profile-edit-btn hidden" title="Edit profile">✏️</button>
                                    <button id="profile-follow-btn" class="profile-follow-btn hidden" title="Follow">Follow</button>
                                    <button id="profile-unfollow-btn" class="profile-unfollow-btn hidden" title="Unfollow">Unfollow</button>
                                </div>
                                <div id="profile-username" class="profile-username"></div>
                                <div id="profile-bio" class="profile-bio"></div>
                                <div id="profile-joined-date" class="profile-joined-date"></div>
                            </div>
                        </div>
                        <div class="profile-stats-grid">
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-comments-count">-</div>
                                <div class="profile-stat-label">Comments</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-replies-count">-</div>
                                <div class="profile-stat-label">Replies</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-upvotes-count">-</div>
                                <div class="profile-stat-label">Upvotes</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-downvotes-count">-</div>
                                <div class="profile-stat-label">Downvotes</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-reputation-count">-</div>
                                <div class="profile-stat-label">Reputation</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-followers-count">-</div>
                                <div class="profile-stat-label">Followers</div>
                            </div>
                            <div class="profile-stat-item">
                                <div class="profile-stat-value" id="profile-following-count">-</div>
                                <div class="profile-stat-label">Following</div>
                            </div>
                        </div>
                        <div class="profile-tabs">
                            <button class="profile-tab active" data-tab="comments">Latest Comments</button>
                            <button class="profile-tab" data-tab="replies">Latest Replies</button>
                            <button class="profile-tab" data-tab="pages">Recent Pages</button>
                        </div>
                        <div class="profile-tab-content">
                            <div id="profile-comments-tab" class="profile-tab-panel active">
                                <div id="profile-comments-list" class="profile-list"></div>
                                <div id="profile-comments-empty" class="profile-empty hidden">No comments yet</div>
                            </div>
                            <div id="profile-replies-tab" class="profile-tab-panel">
                                <div id="profile-replies-list" class="profile-list"></div>
                                <div id="profile-replies-empty" class="profile-empty hidden">No replies yet</div>
                            </div>
                            <div id="profile-pages-tab" class="profile-tab-panel">
                                <div id="profile-pages-list" class="profile-list"></div>
                                <div id="profile-pages-empty" class="profile-empty hidden">No pages yet</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Edit Profile Modal -->
                <div id="profile-edit-modal" class="profile-edit-modal hidden">
                    <div class="profile-edit-modal-content">
                        <div class="profile-edit-modal-header">
                            <h3>Edit Profile</h3>
                            <button id="profile-edit-modal-close" class="profile-edit-modal-close">×</button>
                        </div>
                        <div class="profile-edit-modal-body">
                            <div class="profile-edit-field">
                                <label for="edit-display-name">Display Name</label>
                                <input type="text" id="edit-display-name" class="profile-edit-input" placeholder="Display Name" maxlength="100" />
                            </div>
                            <div class="profile-edit-field">
                                <label for="edit-username">Username/Handle</label>
                                <input type="text" id="edit-username" class="profile-edit-input" placeholder="username" maxlength="50" />
                                <small class="profile-edit-hint">This will be your unique handle</small>
                            </div>
                            <div class="profile-edit-field">
                                <label for="edit-bio">Bio</label>
                                <textarea id="edit-bio" class="profile-edit-textarea" placeholder="Tell us about yourself..." maxlength="500" rows="4"></textarea>
                                <small class="profile-edit-hint"><span id="bio-char-count">0</span>/500 characters</small>
                            </div>
                            <div class="profile-edit-field">
                                <label for="edit-picture-url">Profile Picture</label>
                                <div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px;">
                                    <button type="button" id="upload-picture-btn" class="profile-upload-btn" style="flex-shrink: 0;">📤 Upload Image</button>
                                    <input type="file" id="edit-picture-file" accept="image/*" style="display: none;" />
                                    <div style="flex: 1; font-size: 12px; color: #6c757d; padding-top: 6px;">or</div>
                                </div>
                                <input type="url" id="edit-picture-url" class="profile-edit-input" placeholder="https://example.com/picture.jpg" />
                                <div id="picture-preview-container" style="margin-top: 12px; display: none;">
                                    <img id="picture-preview" src="" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 1px solid #e0e0e0; object-fit: cover;" />
                                </div>
                            </div>
                            <div id="profile-edit-error" class="profile-edit-error hidden"></div>
                        </div>
                        <div class="profile-edit-modal-footer">
                            <button id="profile-edit-cancel" class="profile-edit-btn-secondary">Cancel</button>
                            <button id="profile-edit-save" class="profile-edit-btn-primary">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section-placeholder" data-section="settings">
                <div class="settings-section" id="settings-section">
                    <div class="settings-header">
                        <h4>Settings</h4>
                        <p class="settings-subtitle">Manage your extension preferences</p>
                    </div>
                    <div class="settings-content">
                        <div class="settings-categories">
                            <button class="settings-category-btn active" data-category="privacy">
                                <span class="category-icon">🔒</span>
                                <span class="category-name">Privacy & Security</span>
                            </button>
                            <button class="settings-category-btn" data-category="notifications">
                                <span class="category-icon">🔔</span>
                                <span class="category-name">Notifications</span>
                            </button>
                            <button class="settings-category-btn" data-category="appearance">
                                <span class="category-icon">🎨</span>
                                <span class="category-name">Appearance</span>
                            </button>
                            <button class="settings-category-btn" data-category="comments">
                                <span class="category-icon">💬</span>
                                <span class="category-name">Comments</span>
                            </button>
                            <button class="settings-category-btn" data-category="account">
                                <span class="category-icon">👤</span>
                                <span class="category-name">Account</span>
                            </button>
                            <button class="settings-category-btn" data-category="advanced">
                                <span class="category-icon">⚙️</span>
                                <span class="category-name">Advanced</span>
                            </button>
                        </div>
                        <div class="settings-panels">
                            <!-- Privacy & Security Panel -->
                            <div class="settings-panel active" data-panel="privacy">
                                <h5>Privacy & Security</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Profile Visibility</label>
                                            <p class="setting-description">Control who can see your profile information</p>
                                        </div>
                                        <select id="setting-profile-visibility" class="setting-select">
                                            <option value="public">Public</option>
                                            <option value="followers">Followers Only</option>
                                            <option value="private">Private</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Who Can Message You</label>
                                            <p class="setting-description">Control who can send you direct messages</p>
                                        </div>
                                        <select id="setting-message-privacy" class="setting-select">
                                            <option value="everyone">Everyone</option>
                                            <option value="followers">Followers Only</option>
                                            <option value="none">No One</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Show Email in Profile</label>
                                            <p class="setting-description">Display your email address on your profile</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-show-email">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Blocked Users</label>
                                            <p class="setting-description">Manage users you've blocked</p>
                                        </div>
                                        <button id="settings-manage-blocked" class="setting-action-btn">Manage</button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Notifications Panel -->
                            <div class="settings-panel" data-panel="notifications">
                                <h5>Notifications</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Enable Notifications</label>
                                            <p class="setting-description">Receive browser notifications for new activity</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notifications-enabled" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">New Comments</label>
                                            <p class="setting-description">Get notified when someone comments on the page</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notify-comments" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">New Replies</label>
                                            <p class="setting-description">Get notified when someone replies to your comments</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notify-replies" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">New Messages</label>
                                            <p class="setting-description">Get notified when you receive direct messages</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notify-messages" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Reactions</label>
                                            <p class="setting-description">Get notified when someone reacts to your comments</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notify-reactions" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">New Followers</label>
                                            <p class="setting-description">Get notified when someone follows you</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notify-followers" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Notification Sound</label>
                                            <p class="setting-description">Play a sound when receiving notifications</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-notification-sound" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Appearance Panel -->
                            <div class="settings-panel" data-panel="appearance">
                                <h5>Appearance</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Theme</label>
                                            <p class="setting-description">Choose your preferred color theme</p>
                                        </div>
                                        <select id="setting-theme" class="setting-select">
                                            <option value="light">Light</option>
                                            <option value="dark">Dark</option>
                                            <option value="auto">Auto (System)</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Font Size</label>
                                            <p class="setting-description">Adjust the text size in the panel</p>
                                        </div>
                                        <select id="setting-font-size" class="setting-select">
                                            <option value="small">Small</option>
                                            <option value="medium" selected>Medium</option>
                                            <option value="large">Large</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Panel Position</label>
                                            <p class="setting-description">Remember panel position on page reload</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-remember-position" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Compact Mode</label>
                                            <p class="setting-description">Use a more compact layout</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-compact-mode">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Comments Panel -->
                            <div class="settings-panel" data-panel="comments">
                                <h5>Comments & Interactions</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Default Sort Order</label>
                                            <p class="setting-description">How comments are sorted by default</p>
                                        </div>
                                        <select id="setting-default-sort" class="setting-select">
                                            <option value="newest" selected>Newest First</option>
                                            <option value="oldest">Oldest First</option>
                                            <option value="most-liked">Most Liked</option>
                                            <option value="most-disliked">Most Disliked</option>
                                            <option value="most-trusted">Most Trusted</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Auto-Refresh Interval</label>
                                            <p class="setting-description">Automatically refresh comments (in seconds, 0 to disable)</p>
                                        </div>
                                        <input type="number" id="setting-auto-refresh" class="setting-input" min="0" max="300" value="0" placeholder="0">
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Show Reaction Counts</label>
                                            <p class="setting-description">Display like, dislike, and trust counts on comments</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-show-reactions" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Show Timestamps</label>
                                            <p class="setting-description">Display when comments were posted</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-show-timestamps" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Auto-Expand Replies</label>
                                            <p class="setting-description">Automatically show replies to comments</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-auto-expand-replies">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Filter Profanity</label>
                                            <p class="setting-description">Hide comments containing profanity</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-filter-profanity">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Account Panel -->
                            <div class="settings-panel" data-panel="account">
                                <h5>Account</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Display Name</label>
                                            <p class="setting-description">Your name as it appears to others</p>
                                        </div>
                                        <input type="text" id="setting-display-name" class="setting-input" placeholder="Your name">
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Email Address</label>
                                            <p class="setting-description">Your account email (read-only)</p>
                                        </div>
                                        <input type="email" id="setting-email" class="setting-input" readonly>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Export Data</label>
                                            <p class="setting-description">Download all your comments, messages, and settings</p>
                                        </div>
                                        <button id="settings-export-data" class="setting-action-btn">Export</button>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Clear Cache</label>
                                            <p class="setting-description">Clear cached data to free up space</p>
                                        </div>
                                        <button id="settings-clear-cache" class="setting-action-btn">Clear</button>
                                    </div>
                                    <div class="setting-item danger">
                                        <div class="setting-info">
                                            <label class="setting-label">Delete Account</label>
                                            <p class="setting-description">Permanently delete your account and all data</p>
                                        </div>
                                        <button id="settings-delete-account" class="setting-action-btn danger">Delete</button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Advanced Panel -->
                            <div class="settings-panel" data-panel="advanced">
                                <h5>Advanced</h5>
                                <div class="settings-group">
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Server Selection</label>
                                            <p class="setting-description">Choose which server to connect to</p>
                                        </div>
                                        <select id="setting-server" class="setting-select">
                                            <option value="auto">Auto (Recommended)</option>
                                            <option value="local">Local Server</option>
                                            <option value="cloud">Cloud Server</option>
                                        </select>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Connection Timeout</label>
                                            <p class="setting-description">Server connection timeout in seconds</p>
                                        </div>
                                        <input type="number" id="setting-connection-timeout" class="setting-input" min="5" max="60" value="10">
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Enable Debug Mode</label>
                                            <p class="setting-description">Show detailed console logs for troubleshooting</p>
                                        </div>
                                        <label class="setting-toggle">
                                            <input type="checkbox" id="setting-debug-mode">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="setting-item">
                                        <div class="setting-info">
                                            <label class="setting-label">Reset All Settings</label>
                                            <p class="setting-description">Restore all settings to default values</p>
                                        </div>
                                        <button id="settings-reset-all" class="setting-action-btn">Reset</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="comments-content">
            <div id="auth-message" class="auth-message hidden">
                Please sign in to add comments
            </div>
            <div class="comment-input-container">
                <div class="input-wrapper">
                    <textarea id="comment-input" placeholder="Add a comment..." maxlength="5000"></textarea>
                    <div class="char-count" id="comment-char-count">0/5000</div>
                    <button class="emoji-btn" id="comment-emoji-btn">😊</button>
                    <button class="gif-btn" id="comment-gif-btn">🎬</button>
                </div>
                <button id="submit-comment"><span>➤</span></button>
            </div>
            <div id="comments-list"></div>
        </div>
        <div id="comments-bottom-resizer"></div>
    `;
    // Apply initial minimized state BEFORE attaching to DOM to prevent flash
    panel.style.display = initialIsMinimized ? 'none' : 'flex';
        document.body.appendChild(panel);
        
        // Add emoji picker outside the panel to avoid clipping
        const emojiPicker = document.createElement('div');
        emojiPicker.className = 'emoji-picker';
        emojiPicker.id = 'comment-emoji-picker';
        emojiPicker.style.display = 'none';
        emojiPicker.innerHTML = `
        <div class="emoji-categories">
            <button class="emoji-category active" data-category="smileys">😊</button>
            <button class="emoji-category" data-category="animals">🐶</button>
            <button class="emoji-category" data-category="food">🍕</button>
            <button class="emoji-category" data-category="activities">⚽</button>
            <button class="emoji-category" data-category="travel">🚗</button>
            <button class="emoji-category" data-category="objects">💡</button>
            <button class="emoji-category" data-category="symbols">❤️</button>
            <button class="emoji-category" data-category="flags">🏁</button>
        </div>
        <div class="emoji-grid" id="comment-emoji-grid"></div>
    `;
    document.body.appendChild(emojiPicker);
    
    // Add GIF picker outside the panel to avoid clipping
    const gifPicker = document.createElement('div');
    gifPicker.className = 'gif-picker';
    gifPicker.id = 'comment-gif-picker';
    gifPicker.style.display = 'none';
    gifPicker.innerHTML = `
        <div class="gif-search-container">
            <input type="text" class="gif-search-input" placeholder="Search GIFs..." id="comment-gif-search">
            <button class="gif-search-btn" id="comment-gif-search-btn">🔍</button>
        </div>
        <div class="gif-categories" id="comment-gif-categories" style="display: none;">
            <div class="gif-category-label">Popular:</div>
            <div class="gif-category-tags" id="comment-gif-category-tags"></div>
        </div>
        <div class="gif-grid" id="comment-gif-grid"></div>
        <div class="gif-load-more-container" id="comment-gif-load-more" style="display: none;">
            <button class="gif-load-more-btn" id="comment-gif-load-more-btn">Load More GIFs</button>
        </div>
        <div class="gif-loading" id="comment-gif-loading" style="display: none;">Loading...</div>
    `;
    document.body.appendChild(gifPicker);
    
    // Set initial position
    panel.style.position = 'fixed';
    
    // Restore saved position and size state early (but not minimized state)
    await restorePanelPositionAndSize(panel);
    
    // Set default position if no saved state exists
    if (!panel.style.left && !panel.style.right) {
        panel.style.right = '20px';
        panel.style.top = '20px';
    }

    // Add resizer and drag functionality
    addPanelResizer(panel);
    addPanelRightResizer(panel);
    addPanelBottomResizer(panel);
    addPanelCornerResizers(panel);
    addPanelDragger(panel);

    // Add event listeners
    // Minimize handler is set up later (after floating icon is created) to also persist state
    document.getElementById('refresh-comments').addEventListener('click', () => {
        refreshComments();
    });
    document.getElementById('close-comments').addEventListener('click', () => {
        // Remove the panel and floating icon completely
        panel.remove();
        const floatingIcon = document.getElementById('comments-floating-icon');
        if (floatingIcon) {
            floatingIcon.remove();
        }
        // Clear any stored panel state
        chrome.storage.local.remove(['panelState']);
    });
    document.getElementById('submit-comment').addEventListener('click', submitComment);
    
    // Add character count functionality
    const commentInput = document.getElementById('comment-input');
    const charCount = document.getElementById('comment-char-count');
    if (commentInput && charCount) {
        commentInput.addEventListener('input', function() {
            const length = this.value.length;
            const maxLength = this.getAttribute('maxlength') || 5000;
            charCount.textContent = `${length}/${maxLength}`;
            if (length > maxLength * 0.9) {
                charCount.style.color = '#dc3545';
            } else if (length > maxLength * 0.75) {
                charCount.style.color = '#ffc107';
            } else {
                charCount.style.color = '#6c757d';
            }
        });
    }
    
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

    // Sections tabs logic (top horizontal bar)
    const tabsBar = panel.querySelector('#sections-tabs');
    const tabs = tabsBar ? tabsBar.querySelectorAll('.section-tab') : [];
    const sectionsContainer = panel.querySelector('#sections-container');
    const commentsContentEl = panel.querySelector('.comments-content');
    const sortControlsEl = panel.querySelector('.custom-dropdown');
    const trendingRefreshBtn = document.getElementById('trending-refresh-btn');
    const trendingMetricSelect = document.getElementById('trending-metric-select');
    const trendingRangeSelect = document.getElementById('trending-range-select');
    const trendingLimitSelect = document.getElementById('trending-limit-select');
    const postsRefreshBtn = document.getElementById('posts-refresh-btn');
    const postsTypeSelect = document.getElementById('posts-type-select');

    const syncTrendingControlsWithState = () => {
        if (trendingMetricSelect && trendingMetricSelect.value !== trendingState.metric) {
            trendingMetricSelect.value = trendingState.metric;
        }
        if (trendingRangeSelect && trendingRangeSelect.value !== trendingState.timeRange) {
            trendingRangeSelect.value = trendingState.timeRange;
        }
        if (trendingLimitSelect && Number(trendingLimitSelect.value) !== Number(trendingState.limit)) {
            trendingLimitSelect.value = String(trendingState.limit);
        }
        updateTrendingDescription();
    };

    const persistTrendingFilters = () => {
        if (!chrome?.storage?.local) return;
        try {
            chrome.storage.local.set({
                trendingFilters: {
                    metric: trendingState.metric,
                    timeRange: trendingState.timeRange,
                    limit: trendingState.limit
                }
            }, () => {
                if (chrome.runtime?.lastError) {
                    console.warn('Failed to persist trending filters:', chrome.runtime.lastError.message);
                }
            });
        } catch (storageError) {
            console.warn('Failed to persist trending filters:', storageError);
        }
    };

    try {
        if (chrome?.storage?.local) {
            const storedFilters = await new Promise((resolve, reject) => {
                try {
                    chrome.storage.local.get(['trendingFilters'], (result) => {
                        if (chrome.runtime?.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(result);
                        }
                    });
                } catch (storageError) {
                    reject(storageError);
                }
            });

            if (storedFilters && storedFilters.trendingFilters) {
                const { metric, timeRange, limit } = storedFilters.trendingFilters;
                if (metric && TRENDING_METRIC_LABELS[metric]) {
                    trendingState.metric = metric;
                }
                if (timeRange && TRENDING_TIME_RANGE_LABELS[timeRange]) {
                    trendingState.timeRange = timeRange;
                }
                if (limit && [10, 25, 50, 100].includes(Number(limit))) {
                    trendingState.limit = Number(limit);
                }
            }
        }
    } catch (storageError) {
        console.warn('Failed to load trending filters:', storageError);
    }

    syncTrendingControlsWithState();

    if (trendingRefreshBtn) {
        trendingRefreshBtn.addEventListener('click', () => {
            fetchTrendingComments(true);
        });
    }

    if (trendingMetricSelect) {
        trendingMetricSelect.addEventListener('change', () => {
            const newMetric = trendingMetricSelect.value;
            if (newMetric !== trendingState.metric) {
                trendingState.metric = newMetric;
                trendingState.lastFetched = 0;
                persistTrendingFilters();
                syncTrendingControlsWithState();
                fetchTrendingComments(true);
            }
        });
    }

    if (trendingRangeSelect) {
        trendingRangeSelect.addEventListener('change', () => {
            const newRange = trendingRangeSelect.value;
            if (newRange !== trendingState.timeRange) {
                trendingState.timeRange = newRange;
                trendingState.lastFetched = 0;
                persistTrendingFilters();
                syncTrendingControlsWithState();
                fetchTrendingComments(true);
            }
        });
    }

    if (trendingLimitSelect) {
        trendingLimitSelect.addEventListener('change', () => {
            const newLimit = Number(trendingLimitSelect.value);
            if (!Number.isNaN(newLimit) && newLimit !== Number(trendingState.limit)) {
                trendingState.limit = newLimit;
                trendingState.lastFetched = 0;
                persistTrendingFilters();
                syncTrendingControlsWithState();
                fetchTrendingComments(true);
            }
        });
    }

    if (postsRefreshBtn) {
        postsRefreshBtn.addEventListener('click', () => {
            fetchUserActivity(true);
        });
    }

    // Followers and Following refresh buttons
    const followersRefreshBtn = document.getElementById('followers-refresh-btn');
    const followingRefreshBtn = document.getElementById('following-refresh-btn');
    
    if (followersRefreshBtn) {
        followersRefreshBtn.addEventListener('click', () => {
            fetchFollowers(true);
        });
    }
    
    if (followingRefreshBtn) {
        followingRefreshBtn.addEventListener('click', () => {
            fetchFollowing(true);
        });
    }

    // Following search input
    const followingSearchInput = document.getElementById('following-search-input');
    if (followingSearchInput) {
        followingSearchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            
            // Clear previous timeout
            if (followingSearchTimeout) {
                clearTimeout(followingSearchTimeout);
            }
            
            // Debounce search - wait 300ms after user stops typing
            followingSearchTimeout = setTimeout(() => {
                searchUsersToFollow(query);
            }, 300);
        });
        
        // Also handle Enter key for immediate search
        followingSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (followingSearchTimeout) {
                    clearTimeout(followingSearchTimeout);
                }
                searchUsersToFollow(e.target.value);
            }
        });
    }

    // Search handlers will be initialized when search section is activated
    // and also after a delay to catch elements that might be created later

    // Delegated event listener for follow/unfollow buttons
    document.addEventListener('click', async (e) => {
        const followBtn = e.target.closest('.follow-btn');
        const unfollowBtn = e.target.closest('.unfollow-btn');
        
        if (followBtn) {
            e.preventDefault();
            e.stopPropagation();
            const userEmail = followBtn.getAttribute('data-user-email');
            const userName = followBtn.getAttribute('data-user-name') || 'User';
            if (userEmail) {
                await followUser(userEmail, userName);
            }
        } else if (unfollowBtn) {
            e.preventDefault();
            e.stopPropagation();
            const userEmail = unfollowBtn.getAttribute('data-user-email');
            const userName = unfollowBtn.getAttribute('data-user-name') || 'User';
            if (userEmail) {
                await unfollowUser(userEmail, userName);
            }
        }
    });

    if (postsTypeSelect) {
        postsTypeSelect.addEventListener('change', () => {
            const newFilter = postsTypeSelect.value;
            if (newFilter !== postsState.filter) {
                postsState.filter = newFilter;
                fetchUserActivity(true);
            }
        });
    }

    // Messages state references (shared with global socket handlers)
    messagesUIState.selectedConversationEmail = null;
    messagesUIState.selectedGroupId = null;
    messagesUIState.selectedGroupName = null;
    let messagesPollTimer = null;
    let conversationsPollTimer = null;
    let groupsPollTimer = null;
    let messagesLastSeenByOther = {};
    messagesUIState.activeSection = 'comments';
    let currentMessagesTab = 'direct'; // 'direct' or 'groups'

    function showConversationsLoading() {
        const list = document.getElementById('conversations-list');
        if (!list) return;
        list.innerHTML = `
            <div class="list-loading">
                <div class="spinner"></div>
                <span>Loading conversations…</span>
            </div>
        `;
    }

    function renderConversations(conversations) {
        const list = document.getElementById('conversations-list');
        if (!list) return;
        list.innerHTML = '';
        
        if (conversations.length === 0) {
            list.innerHTML = `
                <div class="empty-state-modern">
                    <div class="icon">💬</div>
                    <h3>No messages yet</h3>
                    <p>Search for users to start a conversation</p>
                </div>
            `;
            return;
        }
        
        conversations.forEach((c) => {
            const lastMsg = c.lastMessage;
            const other = c.otherEmail || (lastMsg && (lastMsg.from.email === currentUser?.email ? lastMsg.to.email : lastMsg.from.email));
            const otherName = lastMsg ? (lastMsg.from.email === currentUser?.email ? lastMsg.to.name : lastMsg.from.name) : other;
            const otherPicture = lastMsg ? (lastMsg.from.email === currentUser?.email ? lastMsg.to.picture : lastMsg.from.picture) : null;
            const messagePreview = lastMsg ? lastMsg.text.substring(0, 50) : 'No messages yet';
            const timestamp = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            
            const btn = document.createElement('button');
            btn.className = 'conversation-item-modern';
            btn.innerHTML = `
                <div class="conversation-avatar-modern">
                    ${otherPicture ? `<img src="${otherPicture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}
                </div>
                <div class="conversation-info-modern">
                    <div class="conversation-name-modern">
                        <span>${otherName || other}</span>
                        <span class="conversation-time">${timestamp}</span>
                    </div>
                    <div class="conversation-preview">${messagePreview}</div>
                </div>
            `;
            btn.addEventListener('click', async () => {
                messagesUIState.selectedConversationEmail = other;
                messagesUIState.selectedGroupId = null;
                messagesUIState.selectedGroupName = null;
                await loadThread(other);
                // Mark as active
                document.querySelectorAll('.conversation-item-modern').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
            if (messagesUIState.selectedConversationEmail === other) {
                btn.classList.add('active');
            }
            list.appendChild(btn);
        });
    }

    async function fetchConversations() {
        if (!currentUser?.email) return [];
        const response = await apiFetch(`${API_BASE_URL}/messages/conversations?email=${encodeURIComponent(currentUser.email)}`);
        if (response?.ok) {
            try { return JSON.parse(response.body || '[]'); } catch (_) { return []; }
        }
        return [];
    }

    async function fetchGroups() {
        if (!currentUser?.email) return [];
        const response = await apiFetch(`${API_BASE_URL}/groups?email=${encodeURIComponent(currentUser.email)}`);
        if (response?.ok) {
            try { return JSON.parse(response.body || '[]'); } catch (_) { return []; }
        }
        return [];
    }

    function showGroupsLoading() {
        const list = document.getElementById('groups-items');
        if (!list) return;
        list.innerHTML = `
            <div class="list-loading">
                <div class="spinner"></div>
                <span>Loading groups…</span>
            </div>
        `;
    }

    function renderGroups(groups) {
        const list = document.getElementById('groups-items');
        if (!list) return;
        list.innerHTML = '';
        
        if (groups.length === 0) {
            list.innerHTML = `
                <div class="empty-state-modern">
                    <div class="icon">👥</div>
                    <h3>No groups yet</h3>
                    <p>Create a group to start chatting with multiple people</p>
                </div>
            `;
            return;
        }
        
        groups.forEach((group) => {
            const btn = document.createElement('button');
            btn.className = 'group-item-modern';
            btn.innerHTML = `
                <div class="conversation-avatar-modern">👥</div>
                <div class="conversation-info-modern">
                    <div class="conversation-name-modern">${group.name}</div>
                    <div class="conversation-preview">${group.members.length} members</div>
                </div>
            `;
            btn.addEventListener('click', async () => {
                messagesUIState.selectedGroupId = group._id;
                messagesUIState.selectedGroupName = group.name;
                messagesUIState.selectedConversationEmail = null; // Clear direct message selection
                await loadGroupThread(group._id, group.name);
                // Mark as active
                document.querySelectorAll('.group-item-modern').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
            if (messagesUIState.selectedGroupId === group._id) {
                btn.classList.add('active');
            }
            list.appendChild(btn);
        });
    }

    async function loadGroupThread(groupId, groupName, { preserveScroll = false, silent = false } = {}) {
        const header = document.getElementById('messages-thread-header');
        const list = document.getElementById('messages-thread-list');
        if (!groupId || !currentUser?.email || !list) return;
        
        messagesUIState.selectedGroupId = groupId;
        messagesUIState.selectedGroupName = groupName;
        messagesUIState.selectedConversationEmail = null;
        messagesUIState.isThreadLoading = !silent;
        
        if (!silent) {
            showMessagesLoadingState(list);
        }
        
        const response = await apiFetch(`${API_BASE_URL}/groups/${groupId}/messages?userEmail=${encodeURIComponent(currentUser.email)}&limit=100`);
        let messages = [];
        if (response?.ok) { 
            try { messages = JSON.parse(response.body || '[]'); } catch (_) {} 
        }
        
        const lastMessage = messages[messages.length - 1];
        const statusText = lastMessage
            ? `Last message ${formatRelativeTime(new Date(lastMessage.timestamp))}`
            : 'Create the first group message';
        const memberCount = lastMessage?.participants?.length || '';
        
        if (header) {
            header.innerHTML = `
                <div class="conversation-info">
                    <div class="conversation-avatar">👥</div>
                    <div class="conversation-details">
                        <div class="conversation-name">${escapeHtml(groupName)}</div>
                        <div class="conversation-status">${escapeHtml(statusText)}</div>
                    </div>
                </div>
            `;
        }
        
        renderMessagesList(list, messages, { isGroup: true, preserveScroll });
        messagesUIState.isThreadLoading = false;
    }

    function setupGroupModal() {
        const existing = document.getElementById('create-group-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'create-group-modal';
        modal.className = 'modal-backdrop hidden';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Create New Group</h3>
                <form id="create-group-form">
                    <label>
                        Group name
                        <input type="text" name="group-name" required maxlength="80" placeholder="Enter group name" />
                    </label>
                    <label>
                        Description <span class="optional">(optional)</span>
                        <textarea name="group-description" rows="3" maxlength="240" placeholder="Add a short description"></textarea>
                    </label>
                    <p class="modal-hint">Member selection is coming soon. For now, create the group and invite others via search.</p>
                    <div class="modal-error" aria-live="polite"></div>
                    <div class="modal-actions">
                        <button type="button" class="secondary" data-action="cancel">Cancel</button>
                        <button type="submit" class="primary">Create group</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        
        const form = modal.querySelector('#create-group-form');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const errorEl = modal.querySelector('.modal-error');
        const submitBtn = modal.querySelector('button.primary');
        const nameInput = modal.querySelector('input[name="group-name"]');
        const descriptionInput = modal.querySelector('textarea[name="group-description"]');
        
        function closeModal() {
            modal.classList.add('hidden');
            errorEl.textContent = '';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create group';
            form.reset();
        }
        
        cancelBtn.addEventListener('click', () => {
            closeModal();
        });
        
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!currentUser) {
                errorEl.textContent = 'Please sign in to create a group.';
                return;
            }
            
            const name = nameInput.value.trim();
            const description = descriptionInput.value.trim();
            if (!name) {
                errorEl.textContent = 'Group name is required.';
                nameInput.focus();
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating…';
            errorEl.textContent = '';
            
            try {
                const response = await apiFetch(`${API_BASE_URL}/groups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: {
                        name,
                        description,
                        createdBy: currentUser,
                        members: []
                    }
                });
                
                if (response?.ok) {
                    closeModal();
                    showNotification('Group created successfully!', 'success');
                    const groups = await fetchGroups();
                    renderGroups(groups);
                } else {
                    errorEl.textContent = 'Failed to create group. Please try again.';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create group';
                }
            } catch (error) {
                console.error('Error creating group:', error);
                errorEl.textContent = error.message || 'Unexpected error creating group.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create group';
            }
        });
        
        return {
            open: () => {
                modal.classList.remove('hidden');
                setTimeout(() => nameInput.focus(), 50);
            },
            close: closeModal
        };
    }

    async function loadThread(otherEmail, { preserveScroll = false, silent = false } = {}) {
        const header = document.getElementById('messages-thread-header');
        const list = document.getElementById('messages-thread-list');
        if (!otherEmail || !currentUser?.email || !list) return;
        
        messagesUIState.selectedConversationEmail = otherEmail;
        messagesUIState.selectedGroupId = null;
        messagesUIState.selectedGroupName = null;
        messagesUIState.isThreadLoading = !silent;
        
        if (!silent) {
            showMessagesLoadingState(list);
        }
        
        const response = await apiFetch(`${API_BASE_URL}/messages?userEmail=${encodeURIComponent(currentUser.email)}&otherEmail=${encodeURIComponent(otherEmail)}&limit=100`);
        let messages = [];
        if (response?.ok) {
            try { messages = JSON.parse(response.body || '[]'); } catch (_) {}
        }
        
        const lastMessage = messages[messages.length - 1];
        const otherProfile = lastMessage
            ? (lastMessage.from.email === otherEmail ? lastMessage.from : lastMessage.to)
            : { email: otherEmail };
        const statusText = lastMessage
            ? `Last message ${formatRelativeTime(new Date(lastMessage.timestamp))}`
            : 'Start a conversation';
        
        if (header) {
            header.innerHTML = `
                <div class="conversation-info">
                    <div class="conversation-avatar">
                        ${otherProfile?.picture ? `<img src="${otherProfile.picture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-name">${escapeHtml(otherProfile?.name || 'Unknown User')}</div>
                        <div class="conversation-status">${escapeHtml(statusText)}</div>
                    </div>
                </div>
            `;
        }
        
        renderMessagesList(list, messages, { isGroup: false, preserveScroll });
        messagesUIState.isThreadLoading = false;
        
        // Update last-seen for this conversation
        try {
            const latestTs = messages.length ? new Date(messages[messages.length - 1].timestamp).getTime() : Date.now();
            messagesLastSeenByOther[otherEmail] = latestTs;
            await chrome.storage.local.set({ messagesLastSeenByOther });
            // Clear badge since thread is open
            updateMessagesBadge(0);
        } catch (_) {}
    }

    async function sendMessage() {
        const input = document.getElementById('messages-input-text');
        if (!input || !input.value.trim() || !currentUser) {
            console.log('Send message blocked:', {
                hasInput: !!input,
                hasValue: input?.value?.trim(),
                hasUser: !!currentUser,
                selectedEmail: messagesUIState.selectedConversationEmail,
                selectedGroup: messagesUIState.selectedGroupId
            });
            return;
        }
        
        // Ensure currentUser has username before sending
        let userToSend = currentUser;
        if (currentUser && currentUser.email && !currentUser.username) {
            userToSend = await enrichUserWithUsername(currentUser);
            currentUser = userToSend; // Update currentUser for future use
        }
        
        const text = input.value.trim();
        let payload;
        
        if (messagesUIState.selectedGroupId) {
            // Send group message
            payload = { 
                from: userToSend, 
                text, 
                groupId: messagesUIState.selectedGroupId, 
                groupName: messagesUIState.selectedGroupName 
            };
        } else if (messagesUIState.selectedConversationEmail) {
            // Send direct message
            payload = { 
                from: userToSend, 
                to: { email: messagesUIState.selectedConversationEmail }, 
                text 
            };
        } else {
            console.warn('No conversation selected. Please select or search for a user first.');
            alert('Please select a conversation or search for a user to send a message.');
            return;
        }
        
        console.log('Sending message:', { to: messagesUIState.selectedConversationEmail || messagesUIState.selectedGroupId, text });
        
        const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const pendingBubble = appendMessageToThread(
            { text, timestamp: new Date().toISOString(), from: userToSend },
            { 
                isFromMe: true, 
                isGroup: Boolean(messagesUIState.selectedGroupId), 
                isPending: true, 
                messageId: pendingId 
            }
        );
        
        const res = await apiFetch(`${API_BASE_URL}/messages`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: payload 
        });
        
        if (pendingBubble) {
            pendingBubble.dataset.messageTempId = pendingId;
        }
        
        if (res?.ok) {
            console.log('Message sent successfully');
            input.value = '';
            markPendingMessageStatus(pendingId, 'sent');
            // Reload to get official message from server (for timestamps / ids)
            setTimeout(async () => {
                if (messagesUIState.selectedGroupId) {
                    await loadGroupThread(messagesUIState.selectedGroupId, messagesUIState.selectedGroupName, { preserveScroll: true, silent: true });
                } else if (messagesUIState.selectedConversationEmail) {
                    await loadThread(messagesUIState.selectedConversationEmail, { preserveScroll: true, silent: true });
                }
            }, 600);
        } else {
            console.error('Failed to send message:', res);
            markPendingMessageStatus(pendingId, 'failed');
            showNotification('Failed to send message. Please try again.', 'error');
        }
    }

    function clearMessagePolling() {
        if (messagesPollTimer) { clearInterval(messagesPollTimer); messagesPollTimer = null; }
        if (conversationsPollTimer) { clearInterval(conversationsPollTimer); conversationsPollTimer = null; }
        if (groupsPollTimer) { clearInterval(groupsPollTimer); groupsPollTimer = null; }
    }

    function switchMessagesTab(tab) {
        currentMessagesTab = tab;
        const directTab = document.getElementById('direct-messages-tab');
        const groupsTab = document.getElementById('group-messages-tab');
        const conversationsList = document.getElementById('conversations-list');
        const groupsList = document.getElementById('groups-list');
        
        if (tab === 'direct') {
            directTab?.classList.add('active');
            groupsTab?.classList.remove('active');
            conversationsList?.style.setProperty('display', 'block');
            groupsList?.style.setProperty('display', 'none');
        } else {
            directTab?.classList.remove('active');
            groupsTab?.classList.add('active');
            conversationsList?.style.setProperty('display', 'none');
            groupsList?.style.setProperty('display', 'block');
        }
    }

    async function initMessagesUI() {
        const sendBtn = document.getElementById('messages-send-btn');
        const input = document.getElementById('messages-input-text');
        const searchInput = document.getElementById('messages-search-input');
        const directTab = document.getElementById('direct-messages-tab');
        const groupsTab = document.getElementById('group-messages-tab');
        const createGroupBtn = document.getElementById('create-group-btn');
        const groupModalController = setupGroupModal();
        
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
        if (directTab) directTab.addEventListener('click', () => switchMessagesTab('direct'));
        if (groupsTab) groupsTab.addEventListener('click', () => switchMessagesTab('groups'));
        if (createGroupBtn) createGroupBtn.addEventListener('click', () => groupModalController.open());
        if (searchInput) {
            async function handleSearch() {
                const q = (searchInput.value || '').trim();
                if (!q) {
                    // If search is cleared, reload conversations
                    const convs = await fetchConversations();
                    renderConversations(convs);
                    return;
                }
                // Query users for search match and unique detection
                console.log('Searching for users with query:', q);
                const res = await apiFetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(q)}`);
                console.log('Search API response:', res);
                
                if (res?.ok) {
                    let payload = {};
                    try { 
                        payload = JSON.parse(res.body || '{}'); 
                        console.log('Parsed search payload:', payload);
                    } catch (parseError) {
                        console.error('Error parsing search response:', parseError, res.body);
                    }
                    const unique = payload.unique;
                    const results = payload.results || [];
                    const list = document.getElementById('conversations-list');
                    
                    console.log('Search results:', { unique, resultsCount: results.length, results });
                    
                    if (unique && unique.email) {
                        // Show the resolved username immediately and select conversation
                        messagesUIState.selectedConversationEmail = unique.email;
                        messagesUIState.selectedGroupId = null; // Clear group selection
                        messagesUIState.selectedGroupName = null;
                        console.log('Selected user:', unique.email);
                        
                        // Clear search input
                        searchInput.value = '';
                        
                        // Open thread immediately
                        await loadThread(unique.email);
                        
                        // Reload conversations to show this user
                        const convs = await fetchConversations();
                        renderConversations(convs);
                    } else if (results.length > 0) {
                        // Render top results for disambiguation
                        if (list) {
                            list.innerHTML = '<div style="padding: 8px 16px; font-size: 12px; color: #65676b; font-weight: 600;">Search Results (' + results.length + ')</div>';
                            results.forEach((u) => {
                                const btn = document.createElement('button');
                                btn.className = 'conversation-item-modern';
                                btn.innerHTML = `
                                    <div class="conversation-avatar-modern">${u.picture ? `<img src="${u.picture}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : '👤'}</div>
                                    <div class="conversation-info-modern">
                                        <div class="conversation-name-modern">${u.name || u.email}</div>
                                        <div class="conversation-preview">${u.email}</div>
                                    </div>
                                `;
                                btn.addEventListener('click', async () => {
                                    messagesUIState.selectedConversationEmail = u.email;
                                    messagesUIState.selectedGroupId = null; // Clear group selection
                                    messagesUIState.selectedGroupName = null;
                                    console.log('Selected user from search:', u.email);
                                    
                                    // Clear search and reload
                                    searchInput.value = '';
                                    await loadThread(u.email);
                                    
                                    // Reload conversations
                                    const convs = await fetchConversations();
                                    renderConversations(convs);
                                    
                                    // Mark as active
                                    document.querySelectorAll('.conversation-item-modern').forEach(item => item.classList.remove('active'));
                                    btn.classList.add('active');
                                });
                                list.appendChild(btn);
                            });
                        }
                    } else {
                        // No results found
                        if (list) {
                            list.innerHTML = `
                                <div class="empty-state-modern">
                                    <div class="icon">🔍</div>
                                    <h3>No users found</h3>
                                    <p>No users matching "${q}" were found. They may need to install the Wavespeed extension and sign in first.</p>
                                </div>
                            `;
                        }
                    }
                } else {
                    // API error
                    console.error('Search API error:', res);
                    const list = document.getElementById('conversations-list');
                    if (list) {
                        list.innerHTML = `
                            <div class="empty-state-modern">
                                <div class="icon">⚠️</div>
                                <h3>Search Error</h3>
                                <p>Failed to search for users. Please try again.</p>
                            </div>
                        `;
                    }
                }
            }
            // Trigger search on Enter key
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleSearch();
                }
            });
            
            // Real-time search as user types
            let searchTimeout;
            searchInput.addEventListener('input', async () => {
                const q = (searchInput.value || '').trim();
                
                // Clear previous timeout
                if (searchTimeout) clearTimeout(searchTimeout);
                
                // If empty, clear search immediately
                if (q.length === 0) {
                    const convs = await fetchConversations();
                    renderConversations(convs);
                    return;
                }
                
                // Debounce search for better performance
                if (q.length < 2) return;
                
                searchTimeout = setTimeout(async () => {
                    await handleSearch();
                }, 300); // Wait 300ms after user stops typing
            });
        }
        // Register/update the user to ensure they are searchable
        if (currentUser?.email) {
            apiFetch(`${API_BASE_URL}/users/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: { email: currentUser.email, name: currentUser.name, picture: currentUser.picture }
            }).catch(() => {});
        }

        // Load last-seen map
        try {
            const stored = await chrome.storage.local.get(['messagesLastSeenByOther']);
            messagesLastSeenByOther = stored?.messagesLastSeenByOther || {};
        } catch (_) { messagesLastSeenByOther = {}; }

        // initial data
        showConversationsLoading();
        fetchConversations().then(renderConversations);
        showGroupsLoading();
        fetchGroups().then(renderGroups);

        // Start polling conversations every 12s
        clearMessagePolling();
        conversationsPollTimer = setInterval(async () => {
            const convs = await fetchConversations();
            renderConversations(convs);
            // Compute unread if not on messages section
            if (messagesUIState.activeSection !== 'messages') {
                let unread = 0;
                convs.forEach((c) => {
                    const other = c.otherEmail || (c.lastMessage && (c.lastMessage.from.email === currentUser?.email ? c.lastMessage.to.email : c.lastMessage.from.email));
                    const lastSeen = messagesLastSeenByOther[other] || 0;
                    const msgTs = c.lastMessage ? new Date(c.lastMessage.timestamp).getTime() : 0;
                    if (other && msgTs > lastSeen) unread += 1;
                });
                updateMessagesBadge(unread);
            }
        }, 12000);

        // Start polling groups every 15s
        groupsPollTimer = setInterval(async () => {
            const groups = await fetchGroups();
            renderGroups(groups);
        }, 15000);

        // Start polling current thread every 6s when thread not receiving socket updates
        messagesPollTimer = setInterval(async () => {
            if (messagesUIState.activeSection !== 'messages') return;
            if (messagesUIState.selectedConversationEmail) {
                await loadThread(messagesUIState.selectedConversationEmail, { preserveScroll: true, silent: true });
            } else if (messagesUIState.selectedGroupId) {
                await loadGroupThread(messagesUIState.selectedGroupId, messagesUIState.selectedGroupName, { preserveScroll: true, silent: true });
            }
        }, 6000);
    }

    // Content search handlers initialization function (defined before setActiveSection)
    function initializeSearchHandlers() {
        const contentSearchInput = document.getElementById('content-search-input');
        const searchTypeRadios = document.querySelectorAll('input[name="search-type"]');
        const searchRefreshBtn = document.getElementById('search-refresh-btn');
        
        if (contentSearchInput && !contentSearchInput.dataset.initialized) {
            console.log('Initializing search input handlers');
            contentSearchInput.dataset.initialized = 'true';
            
            contentSearchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                console.log('Search input changed:', query);
                
                // Clear previous timeout
                if (contentSearchTimeout) {
                    clearTimeout(contentSearchTimeout);
                }
                
                // Get selected filter type
                const selectedType = document.querySelector('input[name="search-type"]:checked')?.value || 'all';
                
                // Debounce search - wait 300ms after user stops typing
                contentSearchTimeout = setTimeout(() => {
                    console.log('Executing search:', query, selectedType);
                    searchContent(query, selectedType);
                }, 300);
            });
            
            // Also handle Enter key for immediate search
            contentSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (contentSearchTimeout) {
                        clearTimeout(contentSearchTimeout);
                    }
                    const selectedType = document.querySelector('input[name="search-type"]:checked')?.value || 'all';
                    console.log('Enter pressed, executing search:', e.target.value, selectedType);
                    searchContent(e.target.value, selectedType);
                }
            });
        }
        
        // Search type filter change
        searchTypeRadios.forEach(radio => {
            if (!radio.dataset.initialized) {
                radio.dataset.initialized = 'true';
                radio.addEventListener('change', (e) => {
                    const query = contentSearchInput?.value || '';
                    console.log('Filter changed:', e.target.value, 'Query:', query);
                    if (query.trim()) {
                        searchContent(query, e.target.value);
                    }
                });
            }
        });
        
        // Clear search button
        if (searchRefreshBtn && !searchRefreshBtn.dataset.initialized) {
            searchRefreshBtn.dataset.initialized = 'true';
            searchRefreshBtn.addEventListener('click', () => {
                console.log('Clear search clicked');
                if (contentSearchInput) {
                    contentSearchInput.value = '';
                }
                clearSearchResults();
            });
        }
    }

    async function setActiveSection(sectionKey) {
        messagesUIState.activeSection = sectionKey;
        // Update tab active state
        tabs.forEach((btn) => {
            const isActive = btn.getAttribute('data-section') === sectionKey;
            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle containers: show comments for 'comments', else show sections container
        if (sectionKey === 'comments') {
            if (sectionsContainer) sectionsContainer.classList.add('hidden');
            if (commentsContentEl) commentsContentEl.style.display = 'block';
            if (sortControlsEl) sortControlsEl.style.display = '';
        } else {
            if (sectionKey === 'messages') {
                updateMessagesBadge(0);
            }
            if (sectionsContainer) sectionsContainer.classList.remove('hidden');
            if (commentsContentEl) commentsContentEl.style.display = 'none';
            if (sortControlsEl) sortControlsEl.style.display = 'none';

            // Show only the selected placeholder inside sections container
            if (sectionsContainer) {
                const allPlaceholders = sectionsContainer.querySelectorAll('.section-placeholder');
                allPlaceholders.forEach((el) => {
                    const match = el.getAttribute('data-section') === sectionKey;
                    el.style.display = match ? 'block' : 'none';
                });
            }

            // Apply settings to UI when entering settings section
            if (sectionKey === 'settings' && window.applySettingsToUI) {
                setTimeout(() => {
                    window.applySettingsToUI();
                }, 100);
            }
            
            // Initialize messages UI when entering messages tab
            if (sectionKey === 'messages') {
                // Clear badge when opening messages
                const tabsBar = document.getElementById('sections-tabs');
                const messagesTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="messages"]');
                if (messagesTab) {
                    const badge = messagesTab.querySelector('.tab-badge');
                    if (badge) badge.remove();
                }
                initMessagesUI();
            } else {
                // Leaving messages: stop polling
                clearMessagePolling();
                if (sectionKey === 'trending') {
                    syncTrendingControlsWithState();
                    fetchTrendingComments();
                } else if (sectionKey === 'posts') {
                    fetchUserActivity(true);
                } else if (sectionKey === 'followers') {
                    fetchFollowers(true);
                } else if (sectionKey === 'following') {
                    fetchFollowing(true);
                } else if (sectionKey === 'search') {
                    // Initialize search section - clear any previous search
                    const searchInput = document.getElementById('content-search-input');
                    if (searchInput) {
                        searchInput.value = '';
                    }
                    clearSearchResults();
                    // Ensure search handlers are initialized when search section is activated
                    setTimeout(() => {
                        initializeSearchHandlers();
                    }, 100);
                } else if (sectionKey === 'notifications') {
                    // Clear badge when opening notifications
                    const tabsBar = document.getElementById('sections-tabs');
                    const notificationsTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="notifications"]');
                    if (notificationsTab) {
                        const badge = notificationsTab.querySelector('.tab-badge');
                        if (badge) badge.remove();
                        notificationsState.unreadCount = 0;
                        // Save cleared badge count to storage
                        chrome.storage.local.set({ notificationUnreadCount: 0 });
                    }
                    fetchNotifications(true);
                } else if (sectionKey === 'profile') {
                    // Ensure currentUser is loaded before fetching profile
                    if (!currentUser) {
                        try {
                            const authResult = await chrome.storage.local.get(['user', 'isAuthenticated']);
                            if (authResult.isAuthenticated && authResult.user) {
                                currentUser = authResult.user;
                                // Enrich user with username from server
                                currentUser = await enrichUserWithUsername(currentUser);
                            }
                        } catch (e) {
                            console.error('Failed to load user from storage:', e);
                        }
                    }
                    fetchProfile(true);
                }
            }
        }

        try {
            const state = await chrome.storage.local.get(['activeSection']);
            await chrome.storage.local.set({ activeSection: sectionKey });
        } catch (e) {}
    }

    // Initialize active section from storage
    try {
        chrome.storage.local.get(['activeSection']).then((res) => {
            const initial = res && res.activeSection ? res.activeSection : 'comments';
            setActiveSection(initial);
        }).catch(() => setActiveSection('comments'));
    } catch (e) {
        setActiveSection('comments');
    }

    // Wire click handlers
    if (tabs && tabs.length) {
        tabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-section') || 'comments';
                setActiveSection(key);
            });
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

    // Try to find a working server before loading comments
    console.log('🔍 Finding working server...');
    const serverFound = await findWorkingServer();
    if (!serverFound) {
        console.warn('⚠️ No working server found initially');
        if (CLOUD_SERVER_ENABLED) {
            // If no server found, default to cloud (more likely to be available)
            console.log('🔄 Defaulting to cloud server...');
            currentServer = 'cloud';
            API_BASE_URL = SERVERS.cloud.api;
            SERVER_BASE_URL = SERVERS.cloud.base;
            await chrome.storage.local.set({ activeServer: 'cloud' });
            updateServerStatusIndicator();
        } else {
            console.warn('☁️ Cloud server fallback disabled; remaining on local configuration.');
        }
    }
    
    // Load existing comments
    await loadComments();
    await checkAuthStatus();
    
    // Initialize emoji picker functionality
    initializeEmojiPicker();
    
    // Initialize GIF picker functionality
    initializeGifPicker();
    
    // Initialize notifications from storage and set up cross-tab sync
    initializeNotificationsSync();
    
    // Initialize vertical auto-resize for comment input
    initializeCommentInputVerticalResize();
    
    // Initialize search handlers after panel is fully created
    setTimeout(() => {
        initializeSearchHandlers();
    }, 500);
    
    // Initialize profile handlers after panel is fully created
    setTimeout(() => {
        initializeProfileHandlers();
    }, 600);
    
    // Initialize settings handlers after panel is fully created
    setTimeout(() => {
        initializeSettingsHandlers();
    }, 700);
    
    // Start periodic health check monitoring (every 60 seconds)
    setInterval(async () => {
        const isHealthy = await checkServerHealth(currentServer);
        if (!isHealthy) {
            console.warn(`⚠️ ${SERVERS[currentServer].name} is unhealthy, finding alternative...`);
            await findWorkingServer();
        }
    }, 60000); // Check every 60 seconds

    // Add floating icon for minimized state
    const floatingIcon = document.createElement('div');
    floatingIcon.id = 'comments-floating-icon';
    floatingIcon.title = 'Show Comments';
    floatingIcon.innerHTML = getSectionIcon('comments', 24);
    floatingIcon.classList.add('svg-icon-container');
    floatingIcon.style.display = initialIsMinimized ? 'flex' : 'none';
    document.body.appendChild(floatingIcon);

    // Add minimize/restore logic after panel is added to DOM
    setTimeout(async () => {
        const panel = document.getElementById('webpage-comments-panel');
        const minimizeBtn = document.getElementById('minimize-comments');
        const maximizeBtn = document.getElementById('maximize-comments');
        const closeBtn = document.getElementById('close-comments');
        const floatingIcon = document.getElementById('comments-floating-icon');
        
        // Store state in panel data attributes for persistence
        if (!panel.dataset.isMaximized) {
            panel.dataset.isMaximized = 'false';
        }
        
        // Minimized state already restored above
        
        if (minimizeBtn && panel && floatingIcon) {
            minimizeBtn.addEventListener('click', async () => {
                panel.style.display = 'none';
                floatingIcon.style.display = 'flex';
                // Save minimized state
                await savePanelState(panel, true);
            });
            floatingIcon.addEventListener('click', async () => {
                panel.style.display = 'flex';
                floatingIcon.style.display = 'none';
                // Save restored state
                await savePanelState(panel, false);
            });
        }
        
        if (maximizeBtn && panel) {
            maximizeBtn.addEventListener('click', () => {
                const isMaximized = panel.dataset.isMaximized === 'true';
                
                if (!isMaximized) {
                    // Save current state before maximizing
                    const currentRect = panel.getBoundingClientRect();
                    panel.dataset.prevStyle = JSON.stringify({
                        top: panel.style.top,
                        left: panel.style.left,
                        right: panel.style.right,
                        bottom: panel.style.bottom,
                        width: panel.style.width,
                        height: panel.style.height,
                        borderRadius: panel.style.borderRadius,
                        boxShadow: panel.style.boxShadow,
                        position: panel.style.position,
                        zIndex: panel.style.zIndex,
                        // Store computed dimensions as fallback
                        computedWidth: currentRect.width + 'px',
                        computedHeight: currentRect.height + 'px',
                        computedLeft: currentRect.left + 'px',
                        computedTop: currentRect.top + 'px'
                    });
                    
                    // Maximize
                    panel.style.position = 'fixed';
                    panel.style.top = '0';
                    panel.style.left = '0';
                    panel.style.right = '0';
                    panel.style.bottom = '0';
                    panel.style.width = '100vw';
                    panel.style.height = '100vh';
                    panel.style.borderRadius = '0';
                    panel.style.boxShadow = 'none';
                    panel.style.zIndex = '2147483647';
                    maximizeBtn.textContent = '🗗';
                    panel.dataset.isMaximized = 'true';
                } else {
                    // Restore previous state
                    try {
                        const prevStyle = JSON.parse(panel.dataset.prevStyle || '{}');
                        
                        // Restore position and dimensions
                        panel.style.position = prevStyle.position || 'fixed';
                        panel.style.top = prevStyle.top || prevStyle.computedTop || '20px';
                        panel.style.left = prevStyle.left || prevStyle.computedLeft || '';
                        panel.style.right = prevStyle.right || '';
                        panel.style.bottom = prevStyle.bottom || '';
                        panel.style.width = prevStyle.width || prevStyle.computedWidth || '300px';
                        panel.style.height = prevStyle.height || prevStyle.computedHeight || '500px';
                        panel.style.borderRadius = prevStyle.borderRadius || '8px';
                        panel.style.boxShadow = prevStyle.boxShadow || '0 2px 10px rgba(0, 0, 0, 0.1)';
                        panel.style.zIndex = prevStyle.zIndex || '2147483647';
                        
                        maximizeBtn.innerHTML = getActionIcon('maximize', 18);
                        panel.dataset.isMaximized = 'false';
                        
                        // Ensure panel is within viewport after restore
                        ensurePanelInViewport(panel);
                        savePanelState(panel);
                    } catch (error) {
                        console.error('Error restoring panel state:', error);
                        // Fallback to default state
                        panel.style.position = 'fixed';
                        panel.style.top = '20px';
                        panel.style.right = '20px';
                        panel.style.width = '300px';
                        panel.style.height = '500px';
                        panel.style.borderRadius = '8px';
                        panel.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
                        panel.style.zIndex = '2147483647';
                        maximizeBtn.innerHTML = getActionIcon('maximize', 18);
                        panel.dataset.isMaximized = 'false';
                    }
                }
            });
        }
        
        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                // Remove the panel and floating icon completely
                panel.remove();
                const floatingIcon = document.getElementById('comments-floating-icon');
                if (floatingIcon) {
                    floatingIcon.remove();
                }
                // Clear any stored panel state
                chrome.storage.local.remove(['panelState']);
            });
        }
    }, 100);
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
        
        let rafId = null;
        let currentX = startX;
        
        panel.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        e.stopPropagation();

        function updateSize() {
            let deltaX = currentX - startX;
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
            rafId = null;
        }

        function onMouseMove(e) {
            currentX = e.clientX;
            if (rafId === null) {
                rafId = requestAnimationFrame(updateSize);
            }
        }

        function onMouseUp() {
            console.log('Resizer mouseup event triggered');
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            // Final update with latest position
            updateSize();
            panel.classList.remove('resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            savePanelState(panel);
        }

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
    });
    
    // Add click event for debugging
    resizer.addEventListener('click', function(e) {
        console.log('Resizer clicked');
    });
}

function addPanelRightResizer(panel) {
    const resizer = panel.querySelector('#comments-right-resizer');
    
    if (!resizer) {
        console.error('Right resizer element not found!');
        return;
    }
    
    resizer.addEventListener('mousedown', function(e) {
        const panelRect = panel.getBoundingClientRect();
        const startX = e.clientX;
        const startWidth = panelRect.width;
        const computedStyle = window.getComputedStyle(panel);
        const isAnchoredLeft = computedStyle.left && computedStyle.left !== 'auto';
        const startLeft = panelRect.left;
        const startRightMargin = window.innerWidth - panelRect.right;
        const minWidth = 220;
        const maxWidthFromLeft = window.innerWidth - startLeft - 20;
        const maxWidthFromRight = window.innerWidth - startRightMargin - 20;
        
        let rafId = null;
        let currentX = startX;
        
        panel.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        e.stopPropagation();
        
        function updateSize() {
            if (isAnchoredLeft) {
                const deltaX = currentX - startX;
                let newWidth = startWidth + deltaX;
                const maxWidth = Math.max(minWidth, Math.min(maxWidthFromLeft, window.innerWidth - 20));
                newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
                panel.style.width = newWidth + 'px';
                panel.style.left = Math.max(0, startLeft) + 'px';
                panel.style.right = '';
            } else {
                const deltaX = startX - currentX;
                let newWidth = startWidth + deltaX;
                const maxWidth = Math.max(minWidth, Math.min(maxWidthFromRight, window.innerWidth - 20));
                newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
                const rightEdge = window.innerWidth - startRightMargin;
                let newLeft = rightEdge - newWidth;
                if (newLeft < 0) {
                    newWidth = rightEdge;
                    newLeft = 0;
                }
                panel.style.width = newWidth + 'px';
                panel.style.left = newLeft + 'px';
                panel.style.right = '';
            }
            rafId = null;
        }
        
        function onMouseMove(e) {
            currentX = e.clientX;
            if (rafId === null) {
                rafId = requestAnimationFrame(updateSize);
            }
        }
        
        function onMouseUp() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            // Final update with latest position
            updateSize();
            panel.classList.remove('resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            ensurePanelInViewport(panel);
            savePanelState(panel);
        }
        
        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
    });
}

function addPanelBottomResizer(panel) {
    const resizer = panel.querySelector('#comments-bottom-resizer');
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    let startTop = 0;
    let rafId = null;
    let currentY = 0;

    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        const panelRect = panel.getBoundingClientRect();
        startY = e.clientY;
        currentY = startY;
        startHeight = panelRect.height;
        startTop = panelRect.top;
        
        panel.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
        e.stopPropagation();
    });

    function updateSize() {
        let newHeight = startHeight + (currentY - startY);
        const viewportHeight = window.innerHeight;
        const minHeight = 300;
        const maxHeight = Math.min(800, viewportHeight - startTop - 20);
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        panel.style.height = newHeight + 'px';
        rafId = null;
    }

    function onMouseMove(e) {
        if (!isResizing) return;
        currentY = e.clientY;
        if (rafId === null) {
            rafId = requestAnimationFrame(updateSize);
        }
    }

    function onMouseUp() {
        if (isResizing) {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            // Final update with latest position
            updateSize();
            isResizing = false;
            panel.classList.remove('resizing');
            document.body.style.cursor = '';
            savePanelState(panel);
        }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
}

function addPanelCornerResizers(panel) {
    // Top-left corner resizer
    const topLeftResizer = panel.querySelector('#comments-top-left-resizer');
    if (topLeftResizer) {
        topLeftResizer.addEventListener('mousedown', function(e) {
            const panelRect = panel.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = panelRect.left;
            const startTop = panelRect.top;
            const startWidth = panelRect.width;
            const startHeight = panelRect.height;
            const minWidth = 220;
            const minHeight = 300;
            
            let rafId = null;
            let currentX = startX;
            let currentY = startY;
            
            panel.classList.add('resizing');
            document.body.style.cursor = 'nw-resize';
            e.preventDefault();
            e.stopPropagation();
            
            function updateSize() {
                const deltaX = currentX - startX;
                const deltaY = currentY - startY;
                
                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;
                let newWidth = startWidth - deltaX;
                let newHeight = startHeight - deltaY;
                
                // Enforce minimum dimensions
                if (newWidth < minWidth) {
                    newLeft = startLeft + startWidth - minWidth;
                    newWidth = minWidth;
                }
                if (newHeight < minHeight) {
                    newTop = startTop + startHeight - minHeight;
                    newHeight = minHeight;
                }
                
                // Keep within viewport bounds
                newLeft = Math.max(0, newLeft);
                newTop = Math.max(0, newTop);
                
                panel.style.left = newLeft + 'px';
                panel.style.top = newTop + 'px';
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
                rafId = null;
            }
            
            function onMouseMove(e) {
                currentX = e.clientX;
                currentY = e.clientY;
                if (rafId === null) {
                    rafId = requestAnimationFrame(updateSize);
                }
            }
            
            function onMouseUp() {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                // Final update with latest position
                updateSize();
                panel.classList.remove('resizing');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                savePanelState(panel);
            }
            
            window.addEventListener('mousemove', onMouseMove, { passive: false });
            window.addEventListener('mouseup', onMouseUp);
        });
    }
    
    // Top-right corner resizer
    const topRightResizer = panel.querySelector('#comments-top-right-resizer');
    if (topRightResizer) {
        topRightResizer.addEventListener('mousedown', function(e) {
            const panelRect = panel.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = panelRect.left;
            const startTop = panelRect.top;
            const startWidth = panelRect.width;
            const startHeight = panelRect.height;
            const minWidth = 220;
            const minHeight = 300;
            
            let rafId = null;
            let currentX = startX;
            let currentY = startY;
            
            panel.classList.add('resizing');
            document.body.style.cursor = 'ne-resize';
            e.preventDefault();
            e.stopPropagation();
            
            function updateSize() {
                const deltaX = currentX - startX;
                const deltaY = currentY - startY;
                
                let newTop = startTop + deltaY;
                let newWidth = startWidth + deltaX;
                let newHeight = startHeight - deltaY;
                
                // Enforce minimum dimensions
                newWidth = Math.max(minWidth, newWidth);
                if (newHeight < minHeight) {
                    newTop = startTop + startHeight - minHeight;
                    newHeight = minHeight;
                }
                
                // Keep within viewport bounds
                newTop = Math.max(0, newTop);
                newWidth = Math.min(newWidth, window.innerWidth - startLeft - 20);
                
                panel.style.top = newTop + 'px';
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
                rafId = null;
            }
            
            function onMouseMove(e) {
                currentX = e.clientX;
                currentY = e.clientY;
                if (rafId === null) {
                    rafId = requestAnimationFrame(updateSize);
                }
            }
            
            function onMouseUp() {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                // Final update with latest position
                updateSize();
                panel.classList.remove('resizing');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                savePanelState(panel);
            }
            
            window.addEventListener('mousemove', onMouseMove, { passive: false });
            window.addEventListener('mouseup', onMouseUp);
        });
    }
    
    // Bottom-left corner resizer
    const bottomLeftResizer = panel.querySelector('#comments-bottom-left-resizer');
    if (bottomLeftResizer) {
        bottomLeftResizer.addEventListener('mousedown', function(e) {
            const panelRect = panel.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = panelRect.left;
            const startTop = panelRect.top;
            const startWidth = panelRect.width;
            const startHeight = panelRect.height;
            const minWidth = 220;
            const minHeight = 300;
            
            let rafId = null;
            let currentX = startX;
            let currentY = startY;
            
            panel.classList.add('resizing');
            document.body.style.cursor = 'sw-resize';
            e.preventDefault();
            e.stopPropagation();
            
            function updateSize() {
                const deltaX = currentX - startX;
                const deltaY = currentY - startY;
                
                let newLeft = startLeft + deltaX;
                let newWidth = startWidth - deltaX;
                let newHeight = startHeight + deltaY;
                
                // Enforce minimum dimensions
                if (newWidth < minWidth) {
                    newLeft = startLeft + startWidth - minWidth;
                    newWidth = minWidth;
                }
                newHeight = Math.max(minHeight, newHeight);
                
                // Keep within viewport bounds
                newLeft = Math.max(0, newLeft);
                newHeight = Math.min(newHeight, window.innerHeight - startTop - 20);
                
                panel.style.left = newLeft + 'px';
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
                rafId = null;
            }
            
            function onMouseMove(e) {
                currentX = e.clientX;
                currentY = e.clientY;
                if (rafId === null) {
                    rafId = requestAnimationFrame(updateSize);
                }
            }
            
            function onMouseUp() {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                // Final update with latest position
                updateSize();
                panel.classList.remove('resizing');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                savePanelState(panel);
            }
            
            window.addEventListener('mousemove', onMouseMove, { passive: false });
            window.addEventListener('mouseup', onMouseUp);
        });
    }
    
    // Bottom-right corner resizer
    const bottomRightResizer = panel.querySelector('#comments-bottom-right-resizer');
    if (bottomRightResizer) {
        bottomRightResizer.addEventListener('mousedown', function(e) {
            const panelRect = panel.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = panelRect.left;
            const startTop = panelRect.top;
            const startWidth = panelRect.width;
            const startHeight = panelRect.height;
            const minWidth = 220;
            const minHeight = 300;
            
            let rafId = null;
            let currentX = startX;
            let currentY = startY;
            
            panel.classList.add('resizing');
            document.body.style.cursor = 'se-resize';
            e.preventDefault();
            e.stopPropagation();
            
            function updateSize() {
                const deltaX = currentX - startX;
                const deltaY = currentY - startY;
                
                let newWidth = startWidth + deltaX;
                let newHeight = startHeight + deltaY;
                
                // Enforce minimum dimensions
                newWidth = Math.max(minWidth, newWidth);
                newHeight = Math.max(minHeight, newHeight);
                
                // Keep within viewport bounds
                newWidth = Math.min(newWidth, window.innerWidth - startLeft - 20);
                newHeight = Math.min(newHeight, window.innerHeight - startTop - 20);
                
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
                rafId = null;
            }
            
            function onMouseMove(e) {
                currentX = e.clientX;
                currentY = e.clientY;
                if (rafId === null) {
                    rafId = requestAnimationFrame(updateSize);
                }
            }
            
            function onMouseUp() {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                // Final update with latest position
                updateSize();
                panel.classList.remove('resizing');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                savePanelState(panel);
            }
            
            window.addEventListener('mousemove', onMouseMove, { passive: false });
            window.addEventListener('mouseup', onMouseUp);
        });
    }
}

function addPanelDragger(panel) {
    const header = panel.querySelector('#comments-header');
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let animationFrameId = null;

    header.style.cursor = 'move';
    
    // Make header children non-draggable except the header itself
    const headerChildren = header.querySelectorAll('*');
    headerChildren.forEach(child => {
        child.style.pointerEvents = 'auto';
    });

    header.addEventListener('mousedown', function(e) {
        // Don't start dragging if clicking on interactive elements
        const target = e.target;
        if (target.tagName === 'BUTTON' || 
            target.closest('button') || 
            target.closest('.custom-dropdown') ||
            target.closest('input') ||
            target.closest('select')) {
            return;
        }
        
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.right = 'unset';
        panel.style.transition = 'none'; // Disable transitions during drag for instant response
        panel.classList.add('dragging'); // Add dragging class for CSS
        document.body.style.cursor = 'move';
        e.preventDefault();
        e.stopPropagation();

        function updatePosition(e) {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            // Constrain to viewport
            const panelWidth = panel.offsetWidth;
            const panelHeight = panel.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - panelHeight));
            
            // Use requestAnimationFrame for smooth updates
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            
            animationFrameId = requestAnimationFrame(() => {
                panel.style.left = newLeft + 'px';
                panel.style.top = newTop + 'px';
            });
        }

        function onMouseMove(e) {
            updatePosition(e);
        }

        function onMouseUp() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            isDragging = false;
            panel.style.transition = ''; // Re-enable transitions
            panel.classList.remove('dragging'); // Remove dragging class
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            ensurePanelInViewport(panel);
            savePanelState(panel);
        }

        window.addEventListener('mousemove', onMouseMove, { passive: false });
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
            currentUser = result.user;
            // Enrich user with username from server
            currentUser = await enrichUserWithUsername(currentUser);
            authMessage.classList.add('hidden');
            commentInput.disabled = false;
            submitButton.disabled = false;
            
            // Update user info in header
            const userInfoHeader = document.getElementById('user-info-header');
            const userAvatarHeader = document.getElementById('user-avatar-header');
            const userNameHeader = document.getElementById('user-name-header');
            const userEmailHeader = document.getElementById('user-email-header');
            
            if (userInfoHeader && currentUser) {
                userInfoHeader.style.display = 'flex';
                if (userAvatarHeader && currentUser.picture) {
                    userAvatarHeader.src = currentUser.picture;
                }
                // Display Name instead of Google Username
                if (userNameHeader && currentUser.name) {
                    userNameHeader.textContent = currentUser.name;
                }
                // Display Name instead of Gmail address
                if (userEmailHeader && currentUser.name) {
                    userEmailHeader.textContent = currentUser.name;
                }
            }
            
            // Initialize WebSocket if user is authenticated
            if (!socket) {
                initializeWebSocket();
            } else if (socket.connected) {
                socket.emit('join-page', {
                    url: window.location.href,
                    user: currentUser
                });
            }
        } else {
            currentUser = null;
            authMessage.classList.remove('hidden');
            commentInput.disabled = true;
            submitButton.disabled = true;
            
            // Hide user info in header
            const userInfoHeader = document.getElementById('user-info-header');
            if (userInfoHeader) {
                userInfoHeader.style.display = 'none';
            }
            
            // Disconnect WebSocket if not authenticated
            if (socket) {
                socket.disconnect();
                socket = null;
            }
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

// Dual-server configuration with automatic fallback
const CLOUD_SERVER_ENABLED = false;

const SERVERS = {
    local: {
        api: 'http://localhost:3001/api',
        base: 'http://localhost:3001',
        name: 'Local Server'
    },
    cloud: {
        api: 'https://wavespeed-final-for-render-com.onrender.com/api',
        base: 'https://wavespeed-final-for-render-com.onrender.com',
        name: 'Cloud Server'
    }
};

// Current active server (prefer local for development)
let currentServer = 'local';
let API_BASE_URL = SERVERS.local.api;
let SERVER_BASE_URL = SERVERS.local.base;

// Server health check with actual fetch (bypassing apiFetch to avoid circular dependency)
async function checkServerHealth(serverKey) {
    if (serverKey === 'cloud' && !CLOUD_SERVER_ENABLED) {
        console.log('☁️ Cloud server disabled; skipping health check.');
        return false;
    }
    const server = SERVERS[serverKey];
    if (!server) return false;
    
    try {
        const response = await backgroundFetch(`${server.base}/health`, { method: 'GET' });
        if (!response || response.error) {
            throw new Error(response?.error || 'Health check failed');
        }
        if (!response.ok) {
            return false;
        }
        let data = {};
        try {
            data = JSON.parse(response.body || '{}');
        } catch (parseError) {
            console.warn(`⚠️ Failed to parse health check response from ${server.name}:`, parseError);
            return false;
        }
        console.log(`✅ ${server.name} is healthy:`, data);
        return data.database === 'connected';
    } catch (error) {
        console.log(`❌ ${server.name} health check failed:`, error.message);
        return false;
    }
}

// Update server status indicator UI
function updateServerStatusIndicator() {
    const indicator = document.getElementById('server-status-indicator');
    if (!indicator) return;
    
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    
    if (currentServer === 'local') {
        if (dot) dot.className = 'status-dot status-local';
        if (text) text.textContent = 'Local';
        indicator.title = 'Connected to Local Server';
    } else if (currentServer === 'cloud') {
        if (dot) dot.className = 'status-dot status-cloud';
        if (text) text.textContent = 'Cloud';
        indicator.title = 'Connected to Cloud Server';
    }
}

// Try to find a working server
async function findWorkingServer() {
    // Try local first
    console.log('🔍 Checking local server...');
    if (await checkServerHealth('local')) {
        currentServer = 'local';
        API_BASE_URL = SERVERS.local.api;
        SERVER_BASE_URL = SERVERS.local.base;
        console.log(`✅ Using ${SERVERS.local.name}`);
        await chrome.storage.local.set({ activeServer: 'local' });
        updateServerStatusIndicator();
        return true;
    }
    
    // Fallback to cloud
    if (!CLOUD_SERVER_ENABLED) {
        console.warn('☁️ Cloud server fallback disabled. No other servers available.');
        return false;
    }
    console.log('🔍 Checking cloud server...');
    if (await checkServerHealth('cloud')) {
        currentServer = 'cloud';
        API_BASE_URL = SERVERS.cloud.api;
        SERVER_BASE_URL = SERVERS.cloud.base;
        console.log(`✅ Using ${SERVERS.cloud.name}`);
        await chrome.storage.local.set({ activeServer: 'cloud' });
        updateServerStatusIndicator();
        return true;
    }
    
    console.log('❌ No servers available');
    return false;
}

// Initialize server on load - verify server is actually available
(async () => {
    try {
        // Check stored preference
        const stored = await chrome.storage.local.get(['activeServer']);
        if (stored.activeServer && SERVERS[stored.activeServer]) {
            currentServer = (!CLOUD_SERVER_ENABLED && stored.activeServer === 'cloud') ? 'local' : stored.activeServer;
            API_BASE_URL = SERVERS[currentServer].api;
            SERVER_BASE_URL = SERVERS[currentServer].base;
            
            // Verify the stored server is actually available, if not, find working one
            const isHealthy = await checkServerHealth(currentServer);
            if (!isHealthy) {
                console.warn(`⚠️ Stored server (${SERVERS[currentServer].name}) is not available, finding alternative...`);
                await findWorkingServer();
            }
        } else {
            // No stored preference, find working server
            await findWorkingServer();
        }
    } catch (e) {
        console.warn('Could not load server preference:', e);
        // On error, try to find working server
        await findWorkingServer();
    }
})();

// Background-proxied fetch to avoid mixed content/CORS on HTTPS pages with automatic fallback
async function apiFetch(url, options = {}, retryCount = 0) {
    return new Promise(async (resolve, reject) => {
        try {
            // Increase timeout to 30 seconds
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout - server may be unavailable'));
            }, 30000); // 30 second timeout
            
            chrome.runtime.sendMessage({ action: 'apiFetch', url, options }, async (response) => {
                clearTimeout(timeout);
                
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message;
                    console.error('Chrome runtime error:', errorMsg);
                    
                    // Provide more specific error messages
                    if (errorMsg.includes('Extension context invalidated') || 
                        errorMsg.includes('message port closed') ||
                        errorMsg.includes('Could not establish connection')) {
                        // Extension was reloaded - user needs to refresh the page
                        const userFriendlyError = 'Extension was reloaded. Please refresh this page to continue using the extension.';
                        console.warn(userFriendlyError);
                        // Show notification to user
                        try {
                            if (typeof showNotification === 'function') {
                                showNotification('Extension reloaded - Please refresh the page', 'error');
                            }
                        } catch (e) {
                            // Notification system may not be available yet
                            console.warn('Could not show notification:', e);
                        }
                        reject(new Error(userFriendlyError));
                    } else if (errorMsg.includes('Receiving end does not exist')) {
                        reject(new Error('Background service unavailable. Please refresh the page.'));
                    } else {
                        reject(new Error(`Extension error: ${errorMsg}`));
                    }
                    return;
                }
                
                if (!response) {
                    reject(new Error('No response received from background script'));
                    return;
                }
                
                // Check if request failed and we should try fallback server
                if (response.error && retryCount === 0 && CLOUD_SERVER_ENABLED) {
                    console.warn(`${SERVERS[currentServer].name} failed, trying fallback...`);
                    
                    // Try to find a working server
                    const foundServer = await findWorkingServer();
                    if (foundServer && currentServer !== (url.includes('localhost') ? 'local' : 'cloud')) {
                        // Server changed, retry with new server
                        console.log(`🔄 Retrying request with ${SERVERS[currentServer].name}`);
                        
                        // Update URL to use new server
                        const newUrl = url.replace(SERVERS.local.api, API_BASE_URL).replace(SERVERS.cloud.api, API_BASE_URL);
                        
                        try {
                            const retryResult = await apiFetch(newUrl, options, retryCount + 1);
                            resolve(retryResult);
                        } catch (retryError) {
                            reject(retryError);
                        }
                        return;
                    }
                }
                
                resolve(response);
            });
        } catch (err) {
            console.error('apiFetch error:', err);
            
            // Try fallback server on network errors
            if (retryCount === 0 && CLOUD_SERVER_ENABLED) {
                console.warn('Network error, trying fallback server...');
                const foundServer = await findWorkingServer();
                if (foundServer) {
                    const newUrl = url.replace(SERVERS.local.api, API_BASE_URL).replace(SERVERS.cloud.api, API_BASE_URL);
                    try {
                        const retryResult = await apiFetch(newUrl, options, retryCount + 1);
                        resolve(retryResult);
                        return;
                    } catch (retryError) {
                        // Both servers failed
                    }
                }
            }
            
            // Check if it's an extension context error
            if (err.message && (err.message.includes('Extension context invalidated') || 
                err.message.includes('Extension was reloaded') ||
                err.message.includes('message port closed'))) {
                reject(new Error('Extension was reloaded. Please refresh this page to continue.'));
            } else {
            reject(new Error(`Network error: ${err.message}`));
            }
        }
    });
}

async function backgroundFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ action: 'apiFetch', url, options }, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message;
                    // Handle extension context invalidation
                    if (errorMsg.includes('Extension context invalidated') || 
                        errorMsg.includes('message port closed') ||
                        errorMsg.includes('Could not establish connection')) {
                        return reject(new Error('Extension was reloaded. Please refresh this page to continue.'));
                    }
                    return reject(new Error(errorMsg));
                }
                if (!response) {
                    return reject(new Error('No response from background fetch'));
                }
                resolve(response);
            });
        } catch (error) {
            // Catch extension context invalidation errors
            if (error.message && (error.message.includes('Extension context invalidated') || 
                error.message.includes('message port closed'))) {
                reject(new Error('Extension was reloaded. Please refresh this page to continue.'));
            } else {
            reject(error);
            }
        }
    });
}

// Add this at the top of the file with other global variables
let currentSortBy = 'newest';

// Track expanded replies state
let expandedReplies = new Set();

// Load and display comments with retry logic
async function loadComments(sortBy = currentSortBy, retryCount = 0) {
    console.log('Loading comments with sort:', sortBy, retryCount > 0 ? `(retry ${retryCount})` : '');
    currentSortBy = sortBy;
    const commentsList = document.getElementById('comments-list');
    const sortDropdown = document.getElementById('sort-comments');
    const currentUrl = window.location.href;
    let userEmail = null;
    
    if (sortDropdown) {
        sortDropdown.value = sortBy;
    }
    
    // Show loading state
    if (commentsList && retryCount === 0) {
        commentsList.innerHTML = `
            <div class="loading-message" style="text-align: center; padding: 20px; color: #666;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <div style="margin-top: 10px;">Loading comments...</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>`;
    }
    
    try {
        const authResult = await chrome.storage.local.get(['user']);
        userEmail = authResult.user ? authResult.user.email : null;
        console.log('Current user:', userEmail);
    } catch (error) {
        console.error('Error getting user:', error);
    }

    try {
        // Ensure we have a working server before attempting to fetch
        // Skip health check if cloud failed before (stored in session)
        const cloudFailedBefore = sessionStorage.getItem('cloud_server_failed') === 'true';
        
        if (retryCount === 0) {
            if (CLOUD_SERVER_ENABLED && currentServer === 'local' && !cloudFailedBefore) {
                try {
                    const serverWorking = await checkServerHealth('local');
                    if (!serverWorking) {
                        console.warn(`⚠️ Local server is not healthy, switching to cloud...`);
                        // Immediately switch to cloud without checking health (faster)
                        currentServer = 'cloud';
                        API_BASE_URL = SERVERS.cloud.api;
                        SERVER_BASE_URL = SERVERS.cloud.base;
                        await chrome.storage.local.set({ activeServer: 'cloud' });
                        updateServerStatusIndicator();
                        console.log('✅ Switched to cloud server');
                    }
                } catch (healthCheckError) {
                    console.warn('Local server health check failed, switching to cloud:', healthCheckError);
                    // If local health check fails, immediately switch to cloud
                    currentServer = 'cloud';
                    API_BASE_URL = SERVERS.cloud.api;
                    SERVER_BASE_URL = SERVERS.cloud.base;
                    await chrome.storage.local.set({ activeServer: 'cloud' });
                    updateServerStatusIndicator();
                    console.log('✅ Switched to cloud server');
                }
            } else if (!CLOUD_SERVER_ENABLED) {
                // Force local server usage when cloud is disabled
                currentServer = 'local';
                API_BASE_URL = SERVERS.local.api;
                SERVER_BASE_URL = SERVERS.local.base;
                await chrome.storage.local.set({ activeServer: 'local' });
                updateServerStatusIndicator();
            } else if (currentServer === 'cloud' && cloudFailedBefore) {
                // If cloud failed before, try local directly
                console.log('🔄 Cloud server failed previously, trying local server...');
                currentServer = 'local';
                API_BASE_URL = SERVERS.local.api;
                SERVER_BASE_URL = SERVERS.local.base;
                await chrome.storage.local.set({ activeServer: 'local' });
                updateServerStatusIndicator();
                sessionStorage.removeItem('cloud_server_failed'); // Reset flag
            }
        }
        
        console.log('Fetching comments for URL:', currentUrl);
        console.log('Using server:', SERVERS[currentServer].name, API_BASE_URL);
        const response = await apiFetch(`${API_BASE_URL}/comments?url=${encodeURIComponent(currentUrl)}`);
        
        if (!response || response.error) {
            const message = response?.error || 'Unknown error';
            console.error('Background apiFetch failed:', message);
            
            // If we haven't tried finding a working server yet, try that first
            if (retryCount === 0) {
                console.log('🔄 Attempting to find working server...');
                const foundServer = await findWorkingServer();
                if (foundServer) {
                    // Server might have changed, retry immediately with new server
                    console.log(`✅ Found working server: ${SERVERS[currentServer].name}, retrying...`);
                    return await loadComments(sortBy, retryCount + 1);
                } else {
                    // No server found, but if error mentions localhost, try cloud explicitly (if enabled)
                    if (CLOUD_SERVER_ENABLED && (message.includes('localhost') || message.includes('local server'))) {
                        console.log('🔄 Local server failed, explicitly trying cloud server...');
                        currentServer = 'cloud';
                        API_BASE_URL = SERVERS.cloud.api;
                        SERVER_BASE_URL = SERVERS.cloud.base;
                        const cloudHealthy = await checkServerHealth('cloud');
                        if (cloudHealthy) {
                            console.log('✅ Cloud server is available, retrying...');
                            await chrome.storage.local.set({ activeServer: 'cloud' });
                            updateServerStatusIndicator();
                            return await loadComments(sortBy, retryCount + 1);
                        }
                    }
                }
            }
            
            // Check if this is a network error that might be retryable
            if (retryCount < 3 && (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connect'))) {
                console.log(`Retrying in ${(retryCount + 1) * 2} seconds...`);
                setTimeout(() => loadComments(sortBy, retryCount + 1), (retryCount + 1) * 2000);
                return;
            }
            
            throw new Error(`Failed to load comments: ${message}`);
        }
        
        if (!response.ok) {
            console.error('Server response not OK:', {
                status: response.status,
                statusText: response.statusText,
                body: response.body
            });
            
                // Handle 404 - endpoint might not exist on this server, try switching
                if (CLOUD_SERVER_ENABLED && response.status === 404 && retryCount === 0) {
                console.warn(`⚠️ Got 404 from ${SERVERS[currentServer].name} at ${API_BASE_URL}/comments`);
                console.warn(`Response body:`, response.body);
                
                // Mark cloud as failed if that's what we're using
                if (currentServer === 'cloud') {
                    sessionStorage.setItem('cloud_server_failed', 'true');
                }
                
                const alternativeServer = currentServer === 'local' ? 'cloud' : 'local';
                console.log(`🔄 Trying alternative server: ${SERVERS[alternativeServer].name}...`);
                
                // Try alternative server directly without health check (faster)
                const altApiUrl = SERVERS[alternativeServer].api;
                console.log(`Testing ${altApiUrl}/comments endpoint directly...`);
                
                try {
                    // Quick test fetch to see if endpoint exists
                    const testResponse = await apiFetch(`${altApiUrl}/comments?url=${encodeURIComponent(currentUrl)}`);
                    if (testResponse && !testResponse.error && testResponse.ok) {
                        console.log(`✅ Alternative server works! Switching to ${SERVERS[alternativeServer].name}...`);
                        currentServer = alternativeServer;
                        API_BASE_URL = SERVERS[alternativeServer].api;
                        SERVER_BASE_URL = SERVERS[alternativeServer].base;
                        await chrome.storage.local.set({ activeServer: alternativeServer });
                        updateServerStatusIndicator();
                        // Clear failure flag if alternative works
                        if (alternativeServer === 'local') {
                            sessionStorage.removeItem('cloud_server_failed');
                        }
                        return await loadComments(sortBy, retryCount + 1);
                    } else if (testResponse && testResponse.status === 404) {
                        console.warn(`⚠️ Alternative server also returns 404`);
                    }
                } catch (testError) {
                    console.warn(`Alternative server test failed:`, testError.message);
                }
                
                // If direct test failed, try health check and retry anyway
                console.log(`Checking health of ${SERVERS[alternativeServer].name}...`);
                const altHealthy = await checkServerHealth(alternativeServer);
                if (altHealthy) {
                    console.log(`✅ ${SERVERS[alternativeServer].name} is healthy, switching and retrying...`);
                    currentServer = alternativeServer;
                    API_BASE_URL = SERVERS[alternativeServer].api;
                    SERVER_BASE_URL = SERVERS[alternativeServer].base;
                    await chrome.storage.local.set({ activeServer: alternativeServer });
                    updateServerStatusIndicator();
                    if (alternativeServer === 'local') {
                        sessionStorage.removeItem('cloud_server_failed');
                    }
                    return await loadComments(sortBy, retryCount + 1);
                } else {
                    console.warn(`⚠️ Alternative server health check also failed`);
                }
            }
            
            // Retry on server errors (5xx) or temporary issues
            if (retryCount < 2 && (response.status >= 500 || response.status === 429)) {
                console.log(`Retrying due to server error ${response.status} in ${(retryCount + 1) * 3} seconds...`);
                setTimeout(() => loadComments(sortBy, retryCount + 1), (retryCount + 1) * 3000);
                return;
            }
            
            // For 404, provide a more helpful error message with troubleshooting info
            if (response.status === 404) {
                const errorDetails = response.body ? ` (${response.body.substring(0, 100)})` : '';
                const serverUrl = API_BASE_URL.replace('/api', '');
                throw new Error(
                    `API endpoint not found on ${SERVERS[currentServer].name}. ` +
                    `The /api/comments endpoint may not be deployed. ` +
                    `Please verify the server at ${serverUrl} is running the latest code. ` +
                    `If you're using Render.com, check the deployment logs.` +
                    errorDetails
                );
            }
            
            // Parse error response if available
            let errorMessage = 'Request failed';
            try {
                const errorBody = JSON.parse(response.body || '{}');
                if (errorBody.error) {
                    errorMessage = errorBody.error;
                    if (errorBody.details) {
                        errorMessage += `: ${errorBody.details}`;
                    }
                } else {
                    errorMessage = response.body || response.statusText || 'Request failed';
                }
            } catch (e) {
                errorMessage = response.body || response.statusText || 'Request failed';
            }
            
            throw new Error(`Failed to load comments: ${errorMessage}`);
        }
        
        let comments = [];
        try {
            comments = JSON.parse(response.body || '[]');
        } catch (e) {
            console.error('Failed to parse comments JSON:', response.body);
            throw new Error('Invalid response format from server');
        }
        console.log('Received comments:', comments);
        console.log('Raw comments data structure:', JSON.stringify(comments, null, 2));
        
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
        addRepliesToggleListeners();
        
        // Restore expanded replies state after rendering
        restoreExpandedRepliesState();

        // Debug: Check all reply buttons after rendering
        const allReplyButtons = document.querySelectorAll('.reply-btn');
        console.log('Found', allReplyButtons.length, 'reply buttons');
        allReplyButtons.forEach((btn, index) => {
            console.log(`Reply button ${index}:`, {
                html: btn.outerHTML,
                'data-comment-id': btn.getAttribute('data-comment-id'),
                'data-parent-reply-id': btn.getAttribute('data-parent-reply-id'),
                hasParentReplyId: btn.hasAttribute('data-parent-reply-id')
            });
        });

        // A single, unified event listener for all reply buttons
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('=== REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': this.getAttribute('data-parent-reply-id'),
                    'class': this.className
                });
                
                const commentId = this.getAttribute('data-comment-id');
                const parentReplyIdAttr = this.getAttribute('data-parent-reply-id');
                
                console.log('Raw attributes:', {
                    commentId,
                    parentReplyIdAttr,
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': this.getAttribute('data-parent-reply-id'),
                    'has-data-parent-reply-id': this.hasAttribute('data-parent-reply-id')
                });
                
                // Check if this is a reply to a comment (top-level) or to another reply (nested)
                const isNestedReply = parentReplyIdAttr !== null && 
                                    parentReplyIdAttr !== undefined && 
                                    parentReplyIdAttr !== 'undefined' && 
                                    parentReplyIdAttr !== '' &&
                                    this.hasAttribute('data-parent-reply-id');
                
                const parentReplyId = isNestedReply ? parentReplyIdAttr : 'root';
                const containerId = isNestedReply ? parentReplyIdAttr : commentId;
                
                console.log('Reply button clicked. Data:', { 
                    commentId, 
                    parentReplyId, 
                    containerId, 
                    isNestedReply,
                    parentReplyIdAttr,
                    buttonElement: this,
                    buttonHTML: this.outerHTML
                });
                console.log('Button attributes:', {
                    'data-comment-id': this.getAttribute('data-comment-id'),
                    'data-parent-reply-id': parentReplyIdAttr,
                    'has-data-parent-reply-id': isNestedReply,
                    'all-attributes': Array.from(this.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
                });

                showReplyInput(commentId, containerId, parentReplyId);
            });
        });

        // Add event listeners for comment actions
        document.querySelectorAll('.comment > .comment-actions .like-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'like');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .dislike-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'dislike');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .trust-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'trust');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .distrust-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'distrust');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .flag-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                await handleLikeDislike(commentId, 'flag');
            });
        });
        document.querySelectorAll('.comment > .comment-actions .edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const commentId = this.getAttribute('data-comment-id');
                showEditInput(commentId);
            });
        });
        document.querySelectorAll('.comment > .comment-actions .delete-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const commentId = this.getAttribute('data-comment-id');
                if (confirm('Are you sure you want to delete this comment and all its replies?')) {
                    await deleteComment(commentId);
                }
            });
        });

        // Add event listeners for reply actions (handles all reply levels)
        const replyLikeButtons = document.querySelectorAll('.reply .like-reply-btn');
        const replyDislikeButtons = document.querySelectorAll('.reply .dislike-reply-btn');
        const replyTrustButtons = document.querySelectorAll('.reply .trust-reply-btn');
        const replyDistrustButtons = document.querySelectorAll('.reply .distrust-reply-btn');
        const replyFlagButtons = document.querySelectorAll('.reply .flag-reply-btn');
        const replyEditButtons = document.querySelectorAll('.reply .edit-reply-btn');
        const replyDeleteButtons = document.querySelectorAll('.reply .delete-reply-btn');
        const replyButtons = document.querySelectorAll('.reply .reply-btn');
        
        console.log('=== REPLY BUTTONS FOUND ===');
        console.log('Reply like buttons:', replyLikeButtons.length);
        console.log('Reply dislike buttons:', replyDislikeButtons.length);
        console.log('Reply trust buttons:', replyTrustButtons.length);
        console.log('Reply distrust buttons:', replyDistrustButtons.length);
        console.log('Reply edit buttons:', replyEditButtons.length);
        console.log('Reply delete buttons:', replyDeleteButtons.length);
        console.log('Reply buttons (for nested replies):', replyButtons.length);
        
        // Log details of each button type
        replyEditButtons.forEach((btn, index) => {
            console.log(`Reply edit button ${index}:`, {
                html: btn.outerHTML,
                'data-reply-id': btn.getAttribute('data-reply-id')
            });
        });
        
        replyDeleteButtons.forEach((btn, index) => {
            console.log(`Reply delete button ${index}:`, {
                html: btn.outerHTML,
                'data-reply-id': btn.getAttribute('data-reply-id')
            });
        });
        
        replyButtons.forEach((btn, index) => {
            console.log(`Reply button (nested) ${index}:`, {
                html: btn.outerHTML,
                'data-comment-id': btn.getAttribute('data-comment-id'),
                'data-parent-reply-id': btn.getAttribute('data-parent-reply-id')
            });
        });
        
        // Add event listeners for reply reactions
        replyLikeButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'like');
            });
        });
        replyDislikeButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'dislike');
            });
        });
        replyTrustButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'trust');
            });
        });
        replyDistrustButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                
                if (!replyId || !commentId) {
                    return;
                }
                
                await handleReplyReaction(commentId, replyId, 'distrust');
            });
        });
        replyFlagButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                const replyId = this.getAttribute('data-reply-id');
                const commentElement = this.closest('.comment');
                const commentId = commentElement ? commentElement.getAttribute('data-comment-id') : null;
                if (!replyId || !commentId) return;
                await handleReplyReaction(commentId, replyId, 'flag');
            });
        });
        
        // Add event listeners for reply edit and delete
        replyEditButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('=== EDIT REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-reply-id': this.getAttribute('data-reply-id'),
                    'class': this.className
                });
                
                const replyId = this.getAttribute('data-reply-id');
                console.log('Reply ID for edit:', replyId);
                
                showEditReplyInput(replyId);
            });
        });
        
        replyDeleteButtons.forEach(btn => {
            btn.addEventListener('click', async function() {
                console.log('=== DELETE REPLY BUTTON CLICKED ===');
                console.log('Button element:', this);
                console.log('Button HTML:', this.outerHTML);
                console.log('Button attributes:', {
                    'data-reply-id': this.getAttribute('data-reply-id'),
                    'class': this.className
                });
                
                const replyId = this.getAttribute('data-reply-id');
                const commentId = this.closest('.comment').getAttribute('data-comment-id');
                console.log('Delete reply data:', { replyId, commentId });
                
                if (confirm('Are you sure you want to delete this reply?')) {
                    await deleteReply(commentId, replyId);
                }
            });
        });
        
        // Add replies toggle listeners after all other event listeners
        addRepliesToggleListeners();
        
        // Re-initialize emoji pickers for newly loaded content
        initializeEmojiPicker();
    } catch (error) {
        console.error('Failed to load comments:', error);
        
        // Create a more user-friendly error message with retry options
        const errorMessage = error.message || 'Unknown error occurred';
        const isNetworkError = errorMessage.toLowerCase().includes('fetch') || 
                              errorMessage.toLowerCase().includes('network') || 
                              errorMessage.toLowerCase().includes('timeout') ||
                              errorMessage.toLowerCase().includes('connection');
        
        // Create retry function that finds working server first
        const retryButtonId = 'retry-comments-btn-' + Date.now();
        window[retryButtonId] = async function() {
            const btn = document.getElementById(retryButtonId);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '🔄 Retrying...';
            }
            try {
                await findWorkingServer();
                await loadComments(currentSortBy);
            } catch (e) {
                console.error('Retry failed:', e);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🔄 Try Again';
                }
            }
        };
        
        commentsList.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 20px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; margin: 10px;">
                <div style="color: #dc3545; font-size: 18px; margin-bottom: 10px;">
                    <strong>Failed to load comments</strong>
                </div>
                <div style="color: #6c757d; margin-bottom: 15px;">
                    ${isNetworkError ? 
                        'Unable to connect to the server. This might be a temporary network issue.' : 
                        'An error occurred while loading comments.'}
                </div>
                <div style="margin-bottom: 15px;">
                    <button id="${retryButtonId}" onclick="window['${retryButtonId}']()" 
                            style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        🔄 Try Again
                    </button>
                    <button onclick="window.location.reload()" 
                            style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        🔄 Refresh Page
                    </button>
                </div>
                <details style="text-align: left; margin-top: 10px;">
                    <summary style="cursor: pointer; color: #6c757d; font-size: 12px;">Technical Details</summary>
                    <div style="background: #f8f9fa; padding: 10px; margin-top: 5px; border-radius: 4px; font-family: monospace; font-size: 11px; color: #495057;">
                        Error: ${errorMessage}
                        <br>URL: ${currentUrl}
                        <br>Time: ${new Date().toLocaleString()}
                    </div>
                </details>
            </div>`;
    }
}

function setTrendingLoading(isLoading) {
    const loadingEl = document.getElementById('trending-loading');
    const refreshBtn = document.getElementById('trending-refresh-btn');
    const metricSelect = document.getElementById('trending-metric-select');
    const rangeSelect = document.getElementById('trending-range-select');

    if (loadingEl) {
        if (isLoading) {
            loadingEl.classList.remove('hidden');
        } else {
            loadingEl.classList.add('hidden');
        }
    }

    if (refreshBtn) {
        refreshBtn.disabled = isLoading;
        refreshBtn.setAttribute('aria-busy', String(isLoading));
    }

    if (metricSelect) {
        metricSelect.disabled = isLoading;
    }
    if (rangeSelect) {
        rangeSelect.disabled = isLoading;
    }
}

function setTrendingError(message = '') {
    const errorEl = document.getElementById('trending-error');
    if (!errorEl) return;

    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function setPostsLoading(isLoading) {
    const loadingEl = document.getElementById('posts-loading');
    const refreshBtn = document.getElementById('posts-refresh-btn');
    const typeSelect = document.getElementById('posts-type-select');
    if (loadingEl) {
        if (isLoading) loadingEl.classList.remove('hidden');
        else loadingEl.classList.add('hidden');
    }
    if (refreshBtn) {
        refreshBtn.disabled = isLoading;
        refreshBtn.setAttribute('aria-busy', String(isLoading));
    }
    if (typeSelect) typeSelect.disabled = isLoading;
}

function setPostsError(message = '') {
    const errorEl = document.getElementById('posts-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function renderPostsList(items = []) {
    const listEl = document.getElementById('posts-list');
    const emptyEl = document.getElementById('posts-empty');
    if (!listEl || !emptyEl) return;
    listEl.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');
    items.forEach((it) => {
        // it: { type: 'comment'|'reply'|'message', text, url, timestamp, stats?, otherUser? }
        const card = document.createElement('div');
        card.className = 'trending-card';

        const header = document.createElement('div');
        header.className = 'trending-card-header';
        card.appendChild(header);

        const badge = document.createElement('div');
        badge.className = 'trending-rank';
        badge.textContent = it.type === 'comment' ? 'Comment' : it.type === 'reply' ? 'Reply' : 'Message';
        header.appendChild(badge);

        const info = document.createElement('div');
        info.className = 'trending-user-info';
        header.appendChild(info);

        const nameEl = document.createElement('span');
        nameEl.className = 'trending-user-name';
        nameEl.textContent = it.otherUser ? it.otherUser : 'You';
        info.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'trending-user-meta';
        const host = getHostnameFromUrl(it.url);
        const timeLabel = it.timestamp ? formatRelativeTime(new Date(it.timestamp)) : '';
        const metaParts = [host, timeLabel].filter(Boolean);
        metaEl.textContent = metaParts.join(' • ');
        info.appendChild(metaEl);

        const textEl = document.createElement('div');
        textEl.className = 'trending-card-text';
        const contentText = it?.text && String(it.text).trim();
        textEl.textContent = contentText || '(No text)';
        if (!contentText) textEl.classList.add('trending-card-text--empty');
        card.appendChild(textEl);

        const stats = document.createElement('div');
        stats.className = 'trending-card-stats';
        const like = it?.likes || 0;
        const dislike = it?.dislikes || 0;
        const trusts = it?.trusts || 0;
        const distrusts = it?.distrusts || 0;
        const flags = it?.flags || 0;
        [
            { icon: '👍', value: like, label: 'Likes' },
            { icon: '👎', value: dislike, label: 'Dislikes' },
            { icon: '✅', value: trusts, label: 'Trusts' },
            { icon: '❌', value: distrusts, label: 'Distrusts' },
            { icon: '🚩', value: flags, label: 'Flags' },
        ].forEach(({ icon, value, label }) => {
            const stat = document.createElement('span');
            stat.className = 'trending-stat';
            stat.title = label;
            stat.textContent = `${icon} ${value}`;
            stats.appendChild(stat);
        });
        card.appendChild(stats);

        if (it?.url) {
            const linkRow = document.createElement('div');
            linkRow.className = 'trending-card-link-row';
            const link = document.createElement('a');
            link.href = it.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'trending-card-link';
            link.textContent = it.url;
            link.title = it.url;
            linkRow.appendChild(link);
            card.appendChild(linkRow);
        }

        listEl.appendChild(card);
    });
}

async function fetchUserActivity(forceRefresh = false) {
    const listEl = document.getElementById('posts-list');
    if (!listEl) return;
    if (!currentUser?.email) {
        setPostsError('Please sign in to view your activity');
        renderPostsList([]);
        return;
    }
    if (postsState.isLoading && !forceRefresh) return;
    postsState.isLoading = true;
    setPostsError('');
    setPostsLoading(true);
    try {
        const query = new URLSearchParams({
            email: String(currentUser.email),
            filter: postsState.filter
        });
        // Expected server endpoint providing combined activity; client is defensive if absent.
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(currentUser.email)}/activity?${query.toString()}`);
        if (!response || response.error) throw new Error(response?.error || 'Unable to load activity');
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        let data = [];
        try { data = JSON.parse(response.body || '[]'); } catch (_) { data = []; }
        if (!Array.isArray(data)) data = [];
        // Normalize items to expected fields
        const normalized = data.map((d) => ({
            type: d?.type || (d?.replyTo ? 'reply' : d?.otherEmail ? 'message' : 'comment'),
            text: d?.text || d?.content || '',
            url: d?.url || d?.pageUrl || '',
            timestamp: d?.timestamp || d?.createdAt || Date.now(),
            likes: d?.likes || 0,
            dislikes: d?.dislikes || 0,
            trusts: d?.trusts || 0,
            distrusts: d?.distrusts || 0,
            flags: d?.flags || 0,
            otherUser: d?.otherEmail || d?.to?.email || d?.from?.email || ''
        }));
        postsState.items = normalized;
        postsState.lastFetched = Date.now();
        postsState.error = null;
        setPostsError('');
        renderPostsList(normalized);
    } catch (error) {
        console.error('Failed to fetch user activity:', error);
        const msg = error?.message || 'Failed to load your activity';
        postsState.error = msg;
        setPostsError(msg);
        if (Array.isArray(postsState.items) && postsState.items.length) {
            renderPostsList(postsState.items);
        } else {
            renderPostsList([]);
        }
    } finally {
        postsState.isLoading = false;
        setPostsLoading(false);
    }
}

// Notifications functions
function setNotificationsLoading(isLoading) {
    const loadingEl = document.getElementById('notifications-loading');
    if (loadingEl) {
        if (isLoading) {
            loadingEl.classList.remove('hidden');
        } else {
            loadingEl.classList.add('hidden');
        }
    }
}

function setNotificationsError(message = '') {
    const errorEl = document.getElementById('notifications-error');
    if (errorEl) {
        if (message) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
        }
    }
}

function setNotificationsEmpty(isEmpty) {
    const emptyEl = document.getElementById('notifications-empty');
    if (emptyEl) {
        if (isEmpty) {
            emptyEl.classList.remove('hidden');
        } else {
            emptyEl.classList.add('hidden');
        }
    }
}

function getNotificationIcon(type) {
    const icons = {
        'like': getActionIcon('like', 16),
        'dislike': getActionIcon('dislike', 16),
        'trust': getActionIcon('trust', 16),
        'distrust': getActionIcon('distrust', 16),
        'flag': getActionIcon('flag', 16),
        'reply': getActionIcon('reply', 16)
    };
    return icons[type] || getSectionIcon('notifications', 16);
}

function getNotificationText(notification) {
    // Try multiple ways to get the actor name
    let actorName = notification.actorName;
    if (!actorName && notification.actorEmail) {
        // Try to extract from email
        actorName = notification.actorEmail.split('@')[0];
        // Capitalize first letter
        actorName = actorName.charAt(0).toUpperCase() + actorName.slice(1);
    }
    if (!actorName) {
        actorName = 'Someone';
    }
    
    // Use display name only
    const actorDisplay = actorName;
    const targetType = notification.targetType === 'comment' ? 'comment' : 'reply';
    
    switch (notification.type) {
        case 'like':
            return `${actorDisplay} liked your ${targetType}`;
        case 'dislike':
            return `${actorDisplay} disliked your ${targetType}`;
        case 'trust':
            return `${actorDisplay} trusted your ${targetType}`;
        case 'distrust':
            return `${actorDisplay} mistrusted your ${targetType}`;
        case 'flag':
            return `${actorDisplay} reported your ${targetType}`;
        case 'reply':
            return `${actorDisplay} replied to your ${targetType}`;
        default:
            return `${actorDisplay} interacted with your ${targetType}`;
    }
}

function renderNotificationsList(notifications = []) {
    const listEl = document.getElementById('notifications-list');
    const emptyEl = document.getElementById('notifications-empty');
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
        setNotificationsEmpty(true);
        return;
    }
    
    setNotificationsEmpty(false);
    
    notifications.forEach((notification) => {
        const card = document.createElement('div');
        card.className = 'notification-card';
        card.dataset.notificationId = notification.targetId;
        card.dataset.notificationType = notification.type;
        card.dataset.url = notification.url || '';
        
        const icon = getNotificationIcon(notification.type);
        const text = getNotificationText(notification);
        const timeLabel = notification.timestamp ? formatRelativeTime(new Date(notification.timestamp)) : '';
        const host = getHostnameFromUrl(notification.url);
        
        const targetText = notification.targetText || notification.replyText || '';
        const previewText = targetText.length > 100 ? targetText.substring(0, 100) + '...' : targetText;
        
        card.innerHTML = `
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
                <div class="notification-text">${escapeHtml(text)}</div>
                ${previewText ? `<div class="notification-preview">${escapeHtml(previewText)}</div>` : ''}
                <div class="notification-meta">
                    ${host ? `<span>${escapeHtml(host)}</span>` : ''}
                    ${timeLabel ? `<span>${timeLabel}</span>` : ''}
                </div>
            </div>
        `;
        
        // Make notification clickable to navigate to the comment/reply
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            if (notification.url) {
                // Open the URL in a new tab or navigate to it
                window.open(notification.url, '_blank');
            }
        });
        
        listEl.appendChild(card);
    });
}

async function fetchNotifications(forceRefresh = false) {
    const listEl = document.getElementById('notifications-list');
    if (!listEl) return;
    
    if (!currentUser?.email) {
        setNotificationsError('Please sign in to view notifications');
        renderNotificationsList([]);
        return;
    }
    
    // Check if we should fetch from server or use cached storage
    const shouldFetchFromServer = forceRefresh || !notificationsState.lastFetched || 
        (Date.now() - notificationsState.lastFetched > 30000); // Refresh every 30 seconds
    
    // First, try to load from storage for instant display
    if (!shouldFetchFromServer) {
        try {
            const stored = await chrome.storage.local.get(['notifications', 'notificationUnreadCount', 'notificationsLastUpdated']);
            if (stored.notifications && Array.isArray(stored.notifications) && stored.notifications.length > 0) {
                notificationsState.items = stored.notifications;
                notificationsState.unreadCount = stored.notificationUnreadCount || 0;
                updateNotificationsBadge(notificationsState.unreadCount);
                renderNotificationsList(stored.notifications);
                
                // If storage data is recent (less than 5 minutes old), use it
                if (stored.notificationsLastUpdated && (Date.now() - stored.notificationsLastUpdated < 300000)) {
                    setNotificationsLoading(false);
                    return;
                }
            }
        } catch (error) {
            console.error('Error loading notifications from storage:', error);
        }
    }
    
    if (notificationsState.isLoading && !forceRefresh) return;
    
    notificationsState.isLoading = true;
    setNotificationsError('');
    setNotificationsLoading(true);
    
    try {
        const query = new URLSearchParams({
            userEmail: String(currentUser.email)
        });
        
        const response = await apiFetch(`${API_BASE_URL}/notifications?${query.toString()}`);
        
        if (!response || response.error) {
            throw new Error(response?.error || 'Unable to load notifications');
        }
        
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        let data = {};
        try { data = JSON.parse(response.body || '{}'); } catch (_) { data = {}; }
        
        const notifications = Array.isArray(data.notifications) ? data.notifications : [];
        
        // Save to storage for sharing across tabs
        await chrome.storage.local.set({
            notifications: notifications,
            notificationsLastUpdated: Date.now()
        });
        
        notificationsState.items = notifications;
        notificationsState.lastFetched = Date.now();
        notificationsState.error = null;
        setNotificationsError('');
        renderNotificationsList(notifications);
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        const msg = error?.message || 'Failed to load notifications';
        notificationsState.error = msg;
        setNotificationsError(msg);
        
        // Try to use stored notifications as fallback
        try {
            const stored = await chrome.storage.local.get(['notifications']);
            if (stored.notifications && Array.isArray(stored.notifications) && stored.notifications.length > 0) {
                notificationsState.items = stored.notifications;
                renderNotificationsList(stored.notifications);
            } else {
                renderNotificationsList([]);
            }
        } catch (e) {
            renderNotificationsList([]);
        }
    } finally {
        notificationsState.isLoading = false;
        setNotificationsLoading(false);
    }
}

function updateNotificationsBadge(count) {
    notificationsState.unreadCount = count;
    const tabsBar = document.getElementById('sections-tabs');
    const notificationsTab = tabsBar && tabsBar.querySelector('.section-tab[data-section="notifications"]');
    if (!notificationsTab) return;
    
    let badge = notificationsTab.querySelector('.tab-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-badge';
            notificationsTab.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count.toString();
    } else if (badge) {
        badge.remove();
    }
}

// Initialize notifications sync across all tabs
async function initializeNotificationsSync() {
    // Load notifications from storage on initialization
    try {
        const stored = await chrome.storage.local.get(['notifications', 'notificationUnreadCount']);
        if (stored.notifications && Array.isArray(stored.notifications)) {
            notificationsState.items = stored.notifications;
            notificationsState.unreadCount = stored.notificationUnreadCount || 0;
            updateNotificationsBadge(notificationsState.unreadCount);
            
            // If notifications section is active, render them
            if (messagesUIState.activeSection === 'notifications') {
                renderNotificationsList(stored.notifications);
            }
        }
    } catch (error) {
        console.error('Error loading notifications from storage:', error);
    }
    
    // Listen for storage changes to sync across all tabs
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        
        // Handle notifications updates
        if (changes.notifications) {
            const newNotifications = changes.notifications.newValue;
            if (Array.isArray(newNotifications)) {
                notificationsState.items = newNotifications;
                
                // Update UI if notifications section is active
                if (messagesUIState.activeSection === 'notifications') {
                    renderNotificationsList(newNotifications);
                }
            }
        }
        
        // Handle unread count updates
        if (changes.notificationUnreadCount) {
            const newCount = changes.notificationUnreadCount.newValue || 0;
            notificationsState.unreadCount = newCount;
            updateNotificationsBadge(newCount);
        }
    });
    
    // Fetch notifications from server if needed (but don't block)
    if (currentUser?.email) {
        // Fetch in background to ensure we have the latest
        setTimeout(() => {
            fetchNotifications(false);
        }, 1000);
    }
}

// Followers and Following state
const followersState = {
    items: [],
    isLoading: false,
    lastFetched: 0,
    error: null
};

const followingState = {
    items: [],
    isLoading: false,
    lastFetched: 0,
    error: null
};

// Cache for follow status to avoid repeated API calls
const followStatusCache = new Map();

// Search state
const searchState = {
    query: '',
    type: 'all',
    results: [],
    isLoading: false,
    error: null
};

let contentSearchTimeout = null;

// Fetch followers list
async function fetchFollowers(forceRefresh = false) {
    if (!currentUser?.email) {
        setFollowersError('Please sign in to view your followers');
        renderFollowersList([]);
        return;
    }
    
    if (followersState.isLoading && !forceRefresh) return;
    followersState.isLoading = true;
    setFollowersError('');
    setFollowersLoading(true);
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(currentUser.email)}/followers`);
        if (!response || response.error) throw new Error(response?.error || 'Unable to load followers');
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        let data = [];
        try { data = JSON.parse(response.body || '[]'); } catch (_) { data = []; }
        if (!Array.isArray(data)) data = [];
        
        followersState.items = data;
        followersState.lastFetched = Date.now();
        followersState.error = null;
        setFollowersError('');
        renderFollowersList(data);
    } catch (error) {
        console.error('Failed to fetch followers:', error);
        const msg = error?.message || 'Failed to load your followers';
        followersState.error = msg;
        setFollowersError(msg);
        renderFollowersList([]);
    } finally {
        followersState.isLoading = false;
        setFollowersLoading(false);
    }
}

// Fetch following list
async function fetchFollowing(forceRefresh = false) {
    if (!currentUser?.email) {
        setFollowingError('Please sign in to view who you follow');
        renderFollowingList([]);
        return;
    }
    
    if (followingState.isLoading && !forceRefresh) return;
    followingState.isLoading = true;
    setFollowingError('');
    setFollowingLoading(true);
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(currentUser.email)}/following`);
        if (!response || response.error) throw new Error(response?.error || 'Unable to load following');
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        let data = [];
        try { data = JSON.parse(response.body || '[]'); } catch (_) { data = []; }
        if (!Array.isArray(data)) data = [];
        
        followingState.items = data;
        followingState.lastFetched = Date.now();
        followingState.error = null;
        setFollowingError('');
        renderFollowingList(data);
    } catch (error) {
        console.error('Failed to fetch following:', error);
        const msg = error?.message || 'Failed to load who you follow';
        followingState.error = msg;
        setFollowingError(msg);
        renderFollowingList([]);
    } finally {
        followingState.isLoading = false;
        setFollowingLoading(false);
    }
}

// Render followers list
function renderFollowersList(followers = []) {
    const listEl = document.getElementById('followers-list');
    const emptyEl = document.getElementById('followers-empty');
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    if (!Array.isArray(followers) || followers.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');
    
    followers.forEach((follower) => {
        const card = document.createElement('div');
        card.className = 'follower-card';
        card.innerHTML = `
            <img src="${follower.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="${follower.name || 'User'}" class="follower-avatar">
            <div class="follower-info">
                <div class="follower-name">${follower.name || 'Anonymous'}</div>
                <div class="follower-email">${follower.email || ''}</div>
                ${follower.followedAt ? `<div class="follower-date">Followed ${formatRelativeTime(new Date(follower.followedAt))}</div>` : ''}
            </div>
        `;
        listEl.appendChild(card);
    });
}

// Render following list
function renderFollowingList(following = []) {
    const listEl = document.getElementById('following-list');
    const emptyEl = document.getElementById('following-empty');
    const searchResultsEl = document.getElementById('following-search-results');
    if (!listEl || !emptyEl) return;
    
    // Hide search results when showing following list
    if (searchResultsEl) {
        searchResultsEl.classList.add('hidden');
    }
    
    listEl.innerHTML = '';
    if (!Array.isArray(following) || following.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');
    
    following.forEach((user) => {
        const card = document.createElement('div');
        card.className = 'following-card';
        card.innerHTML = `
            <img src="${user.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="${user.name || 'User'}" class="following-avatar">
            <div class="following-info">
                <div class="following-name">${user.name || 'Anonymous'}</div>
                ${user.followedAt ? `<div class="following-date">Following since ${formatRelativeTime(new Date(user.followedAt))}</div>` : ''}
            </div>
            <button class="unfollow-btn" data-user-email="${user.email}" data-user-name="${user.name || 'User'}" title="Unfollow ${user.name || 'user'}">
                <span class="unfollow-btn-text">Unfollow</span>
            </button>
        `;
        listEl.appendChild(card);
    });
}

// Profile state
let profileState = {
    isLoading: false,
    error: null,
    lastFetched: null
};

// Helper functions for profile UI
function setProfileLoading(show) {
    const loadingEl = document.getElementById('profile-loading');
    const contentEl = document.getElementById('profile-content');
    if (loadingEl) loadingEl.classList.toggle('hidden', !show);
    if (contentEl) contentEl.style.display = show ? 'none' : 'block';
}

function setProfileError(msg) {
    const errorEl = document.getElementById('profile-error');
    if (errorEl) {
        if (msg) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
        }
    }
}

// Fetch and render profile
async function fetchProfile(forceRefresh = false, targetEmail = null) {
    // If currentUser is not set, try to load it from storage
    if (!currentUser) {
        try {
            const authResult = await chrome.storage.local.get(['user', 'isAuthenticated']);
            if (authResult.isAuthenticated && authResult.user) {
                currentUser = authResult.user;
                // Enrich user with username from server
                currentUser = await enrichUserWithUsername(currentUser);
            }
        } catch (e) {
            console.error('Failed to load user from storage:', e);
        }
    }
    
    const profileEmail = targetEmail || currentUser?.email;
    if (!profileEmail) {
        setProfileError('Please sign in to view profile');
        renderProfile(null, null, { comments: 0, replies: 0, upvotes: 0, downvotes: 0, reputation: 0, followers: 0, following: 0 });
        return;
    }
    
    if (profileState.isLoading && !forceRefresh) return;
    profileState.isLoading = true;
    setProfileError('');
    setProfileLoading(true);
    
    try {
        // Fetch profile data using the new profile API endpoint
        const profileRes = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(profileEmail)}/profile`);
        
        if (!profileRes || profileRes.error) {
            throw new Error(profileRes?.error || 'Unable to load profile');
        }
        if (!profileRes.ok) {
            let body = {};
            try { body = JSON.parse(profileRes.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${profileRes.status}`);
        }
        
        let profileData = {};
        try {
            profileData = JSON.parse(profileRes.body || '{}');
        } catch (_) {
            throw new Error('Failed to parse profile data');
        }
        
        profileState.lastFetched = Date.now();
        profileState.error = null;
        setProfileError('');
        
        // Check if viewing own profile or another user's profile
        const isOwnProfile = profileEmail === currentUser?.email;
        
        renderProfile(profileData.user, profileData, isOwnProfile);
    } catch (error) {
        console.error('Failed to fetch profile:', error);
        const msg = error?.message || 'Failed to load profile';
        profileState.error = msg;
        setProfileError(msg);
        renderProfile(null, null, { comments: 0, replies: 0, upvotes: 0, downvotes: 0, reputation: 0, followers: 0, following: 0 });
    } finally {
        profileState.isLoading = false;
        setProfileLoading(false);
    }
}

// Render profile
function renderProfile(user, profileData = {}, isOwnProfile = true) {
    const avatarEl = document.getElementById('profile-avatar');
    const displayNameEl = document.getElementById('profile-display-name');
    const usernameEl = document.getElementById('profile-username');
    const bioEl = document.getElementById('profile-bio');
    const joinedDateEl = document.getElementById('profile-joined-date');
    const editBtn = document.getElementById('profile-edit-btn');
    const editAvatarBtn = document.getElementById('profile-edit-avatar-btn');
    const followBtn = document.getElementById('profile-follow-btn');
    const unfollowBtn = document.getElementById('profile-unfollow-btn');
    
    const stats = profileData.stats || {};
    const latestComments = profileData.latestComments || [];
    const latestReplies = profileData.latestReplies || [];
    const recentPages = profileData.recentPages || [];
    
    if (!user) {
        if (displayNameEl) displayNameEl.textContent = 'Not signed in';
        if (usernameEl) usernameEl.textContent = '';
        if (bioEl) bioEl.textContent = '';
        if (avatarEl) avatarEl.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
        return;
    }
    
    // Display Name
    if (displayNameEl) {
        displayNameEl.textContent = user.name || 'User';
    }
    
    // Display name only (no username or email)
    if (usernameEl) {
        usernameEl.textContent = user.name || '';
    }
    
    // Bio
    if (bioEl) {
        bioEl.textContent = user.bio || '';
        bioEl.style.display = user.bio ? 'block' : 'none';
    }
    
    // Joining date
    if (joinedDateEl && user.createdAt) {
        const joinDate = new Date(user.createdAt);
        joinedDateEl.textContent = `Joined ${joinDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    } else if (joinedDateEl) {
        joinedDateEl.textContent = '';
    }
    
    // Avatar
    if (avatarEl) {
        avatarEl.src = user.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
    }
    
    // Show/hide edit and follow buttons
    if (isOwnProfile) {
        if (editBtn) editBtn.classList.remove('hidden');
        if (editAvatarBtn) editAvatarBtn.classList.remove('hidden');
        if (followBtn) followBtn.classList.add('hidden');
        if (unfollowBtn) unfollowBtn.classList.add('hidden');
    } else {
        if (editBtn) editBtn.classList.add('hidden');
        if (editAvatarBtn) editAvatarBtn.classList.add('hidden');
        // Show follow/unfollow buttons based on follow status
        checkFollowStatus(user.email).then(isFollowing => {
            if (followBtn) followBtn.classList.toggle('hidden', isFollowing);
            if (unfollowBtn) unfollowBtn.classList.toggle('hidden', !isFollowing);
            if (followBtn) followBtn.setAttribute('data-user-email', user.email);
            if (unfollowBtn) unfollowBtn.setAttribute('data-user-email', user.email);
        });
    }
    
    // Stats
    const commentsCountEl = document.getElementById('profile-comments-count');
    const repliesCountEl = document.getElementById('profile-replies-count');
    const upvotesCountEl = document.getElementById('profile-upvotes-count');
    const downvotesCountEl = document.getElementById('profile-downvotes-count');
    const reputationCountEl = document.getElementById('profile-reputation-count');
    const followersCountEl = document.getElementById('profile-followers-count');
    const followingCountEl = document.getElementById('profile-following-count');
    
    if (commentsCountEl) commentsCountEl.textContent = stats.totalComments !== undefined ? stats.totalComments : '-';
    if (repliesCountEl) repliesCountEl.textContent = stats.totalReplies !== undefined ? stats.totalReplies : '-';
    if (upvotesCountEl) upvotesCountEl.textContent = stats.totalUpvotes !== undefined ? stats.totalUpvotes : '-';
    if (downvotesCountEl) downvotesCountEl.textContent = stats.totalDownvotes !== undefined ? stats.totalDownvotes : '-';
    if (reputationCountEl) reputationCountEl.textContent = stats.reputation !== undefined ? stats.reputation : '-';
    if (followersCountEl) followersCountEl.textContent = stats.followers !== undefined ? stats.followers : '-';
    if (followingCountEl) followingCountEl.textContent = stats.following !== undefined ? stats.following : '-';
    
    // Render latest comments, replies, and pages
    renderProfileComments(latestComments);
    renderProfileReplies(latestReplies);
    renderProfilePages(recentPages);
}

// Render profile comments
function renderProfileComments(comments) {
    const listEl = document.getElementById('profile-comments-list');
    const emptyEl = document.getElementById('profile-comments-empty');
    
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    
    if (!Array.isArray(comments) || comments.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    
    comments.forEach(comment => {
        const item = document.createElement('div');
        item.className = 'profile-list-item';
        const text = (comment.text || '').substring(0, 100);
        const url = comment.url || '';
        const date = comment.timestamp ? new Date(comment.timestamp).toLocaleDateString() : '';
        item.innerHTML = `
            <div class="profile-list-item-text">${escapeHtml(text)}${text.length >= 100 ? '...' : ''}</div>
            ${url ? `<a href="${escapeHtml(url)}" target="_blank" class="profile-list-item-url">${escapeHtml(url)}</a>` : ''}
            ${date ? `<div class="profile-list-item-date">${date}</div>` : ''}
        `;
        listEl.appendChild(item);
    });
}

// Render profile replies
function renderProfileReplies(replies) {
    const listEl = document.getElementById('profile-replies-list');
    const emptyEl = document.getElementById('profile-replies-empty');
    
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    
    if (!Array.isArray(replies) || replies.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    
    replies.forEach(reply => {
        const item = document.createElement('div');
        item.className = 'profile-list-item';
        const text = (reply.text || '').substring(0, 100);
        const url = reply.url || '';
        const date = reply.timestamp ? new Date(reply.timestamp).toLocaleDateString() : '';
        item.innerHTML = `
            <div class="profile-list-item-text">${escapeHtml(text)}${text.length >= 100 ? '...' : ''}</div>
            ${url ? `<a href="${escapeHtml(url)}" target="_blank" class="profile-list-item-url">${escapeHtml(url)}</a>` : ''}
            ${date ? `<div class="profile-list-item-date">${date}</div>` : ''}
        `;
        listEl.appendChild(item);
    });
}

// Render profile pages
function renderProfilePages(pages) {
    const listEl = document.getElementById('profile-pages-list');
    const emptyEl = document.getElementById('profile-pages-empty');
    
    if (!listEl || !emptyEl) return;
    
    listEl.innerHTML = '';
    
    if (!Array.isArray(pages) || pages.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    
    pages.forEach(url => {
        const item = document.createElement('div');
        item.className = 'profile-list-item';
        item.innerHTML = `
            <a href="${escapeHtml(url)}" target="_blank" class="profile-list-item-url">${escapeHtml(url)}</a>
        `;
        listEl.appendChild(item);
    });
}

// Initialize profile event handlers
function initializeProfileHandlers() {
    // Profile tabs switching
    const profileTabs = document.querySelectorAll('.profile-tab');
    profileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            
            // Update active tab
            profileTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show/hide tab panels
            const panels = document.querySelectorAll('.profile-tab-panel');
            panels.forEach(panel => {
                panel.classList.remove('active');
            });
            
            const targetPanel = document.getElementById(`profile-${tabName}-tab`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
    
    // Edit profile button
    const editBtn = document.getElementById('profile-edit-btn');
    const editModal = document.getElementById('profile-edit-modal');
    const editModalClose = document.getElementById('profile-edit-modal-close');
    const editCancel = document.getElementById('profile-edit-cancel');
    const editSave = document.getElementById('profile-edit-save');
    const editDisplayName = document.getElementById('edit-display-name');
    const editUsername = document.getElementById('edit-username');
    const editBio = document.getElementById('edit-bio');
    const editPictureUrl = document.getElementById('edit-picture-url');
    const editPictureFile = document.getElementById('edit-picture-file');
    const uploadPictureBtn = document.getElementById('upload-picture-btn');
    const picturePreview = document.getElementById('picture-preview');
    const picturePreviewContainer = document.getElementById('picture-preview-container');
    const bioCharCount = document.getElementById('bio-char-count');
    const editError = document.getElementById('profile-edit-error');
    
    // Open edit modal
    if (editBtn && editModal) {
        editBtn.addEventListener('click', () => {
            if (!currentUser?.email) return;
            
            // Populate form with current data
            if (editDisplayName) editDisplayName.value = currentUser.name || '';
            if (editUsername) editUsername.value = currentUser.username || '';
            if (editBio) {
                editBio.value = currentUser.bio || '';
                if (bioCharCount) bioCharCount.textContent = (currentUser.bio || '').length;
            }
            if (editPictureUrl) editPictureUrl.value = currentUser.picture || '';
            if (picturePreviewContainer) picturePreviewContainer.style.display = 'none';
            if (editPictureFile) editPictureFile.value = ''; // Reset file input
            if (editError) editError.classList.add('hidden');
            
            editModal.classList.remove('hidden');
        });
    }
    
    // Close edit modal
    const closeModal = () => {
        if (editModal) editModal.classList.add('hidden');
        if (editError) editError.classList.add('hidden');
    };
    
    if (editModalClose) editModalClose.addEventListener('click', closeModal);
    if (editCancel) editCancel.addEventListener('click', closeModal);
    
    // Close modal when clicking outside
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                closeModal();
            }
        });
    }
    
    // Upload picture button - trigger file input
    if (uploadPictureBtn && editPictureFile) {
        uploadPictureBtn.addEventListener('click', () => {
            editPictureFile.click();
        });
    }
    
    // Handle file selection
    if (editPictureFile) {
        editPictureFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                if (editError) {
                    editError.textContent = 'Please select an image file';
                    editError.classList.remove('hidden');
                }
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                if (editError) {
                    editError.textContent = 'Image size should be less than 5MB';
                    editError.classList.remove('hidden');
                }
                return;
            }
            
            // Clear any previous errors
            if (editError) editError.classList.add('hidden');
            
            // Read file as data URL
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                
                // Update picture URL field with data URL
                if (editPictureUrl) editPictureUrl.value = dataUrl;
                
                // Show preview
                if (picturePreview) picturePreview.src = dataUrl;
                if (picturePreviewContainer) picturePreviewContainer.style.display = 'block';
            };
            reader.onerror = () => {
                if (editError) {
                    editError.textContent = 'Error reading file';
                    editError.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        });
    }
    
    // Update preview when URL changes
    if (editPictureUrl) {
        editPictureUrl.addEventListener('input', () => {
            const url = editPictureUrl.value.trim();
            if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
                if (picturePreview) picturePreview.src = url;
                if (picturePreviewContainer) picturePreviewContainer.style.display = 'block';
            } else if (!url) {
                if (picturePreviewContainer) picturePreviewContainer.style.display = 'none';
            }
        });
    }
    
    // Bio character counter
    if (editBio && bioCharCount) {
        editBio.addEventListener('input', () => {
            const length = editBio.value.length;
            bioCharCount.textContent = length;
            if (length > 500) {
                editBio.value = editBio.value.substring(0, 500);
                bioCharCount.textContent = 500;
            }
        });
    }
    
    // Save profile changes
    if (editSave) {
        editSave.addEventListener('click', async () => {
            if (!currentUser?.email) return;
            
            const displayName = editDisplayName?.value.trim() || '';
            const username = editUsername?.value.trim() || '';
            const bio = editBio?.value.trim() || '';
            const pictureUrl = editPictureUrl?.value.trim() || '';
            
            if (!displayName) {
                if (editError) {
                    editError.textContent = 'Display name is required';
                    editError.classList.remove('hidden');
                }
                return;
            }
            
            try {
                // Show loading state
                if (editSave) {
                    editSave.disabled = true;
                    editSave.textContent = 'Saving...';
                }
                
                const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(currentUser.email)}/profile`, {
                    method: 'PUT',
                    body: {
                        name: displayName,
                        username: username || undefined,
                        bio: bio || undefined,
                        picture: pictureUrl || undefined
                    }
                });
                
                if (!response || response.error) {
                    throw new Error(response?.error || 'Failed to update profile');
                }
                
                if (!response.ok) {
                    let body = {};
                    try { body = JSON.parse(response.body || '{}'); } catch (_) {}
                    throw new Error(body?.error || `Server returned ${response.status}`);
                }
                
                // Update current user in storage
                const updatedUser = JSON.parse(response.body || '{}');
                currentUser = { ...currentUser, ...updatedUser };
                await chrome.storage.local.set({ user: currentUser });
                
                // Refresh profile
                await fetchProfile(true);
                
                // Close modal
                closeModal();
                
                // Show success message
                const successMsg = document.createElement('div');
                successMsg.className = 'profile-success-message';
                successMsg.textContent = 'Profile updated successfully!';
                successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 12px 24px; border-radius: 8px; z-index: 999999; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
                document.body.appendChild(successMsg);
                setTimeout(() => successMsg.remove(), 3000);
                
            } catch (error) {
                console.error('Failed to update profile:', error);
                if (editError) {
                    editError.textContent = error?.message || 'Failed to update profile';
                    editError.classList.remove('hidden');
                }
            } finally {
                if (editSave) {
                    editSave.disabled = false;
                    editSave.textContent = 'Save Changes';
                }
            }
        });
    }
    
    // Follow/Unfollow buttons
    const followBtn = document.getElementById('profile-follow-btn');
    const unfollowBtn = document.getElementById('profile-unfollow-btn');
    
    if (followBtn) {
        followBtn.addEventListener('click', async () => {
            const targetEmail = followBtn.getAttribute('data-user-email');
            if (!targetEmail) return;
            
            try {
                const targetUser = await getUserInfoFromEmail(targetEmail);
                await followUser(targetEmail, targetUser?.name || 'User');
                
                // Update button state
                followBtn.classList.add('hidden');
                if (unfollowBtn) unfollowBtn.classList.remove('hidden');
                
                // Refresh profile to update follower count
                await fetchProfile(true);
            } catch (error) {
                console.error('Failed to follow user:', error);
                alert(error?.message || 'Failed to follow user');
            }
        });
    }
    
    if (unfollowBtn) {
        unfollowBtn.addEventListener('click', async () => {
            const targetEmail = unfollowBtn.getAttribute('data-user-email');
            if (!targetEmail) return;
            
            try {
                const targetUser = await getUserInfoFromEmail(targetEmail);
                await unfollowUser(targetEmail, targetUser?.name || 'User');
                
                // Update button state
                unfollowBtn.classList.add('hidden');
                if (followBtn) followBtn.classList.remove('hidden');
                
                // Refresh profile to update follower count
                await fetchProfile(true);
            } catch (error) {
                console.error('Failed to unfollow user:', error);
                alert(error?.message || 'Failed to unfollow user');
            }
        });
    }
    
    // Edit avatar button (opens edit modal)
    const editAvatarBtn = document.getElementById('profile-edit-avatar-btn');
    if (editAvatarBtn && editBtn) {
        editAvatarBtn.addEventListener('click', () => {
            editBtn.click();
            // Focus on picture URL field
            setTimeout(() => {
                if (editPictureUrl) editPictureUrl.focus();
            }, 100);
        });
    }
}

// Helper function to get user info from email
async function getUserInfoFromEmail(email) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(email)}/profile`);
        if (!response || !response.ok) return null;
        
        const data = JSON.parse(response.body || '{}');
        return data.user || null;
    } catch (error) {
        console.error('Failed to get user info:', error);
        return null;
    }
}

// Helper function to safely access chrome.storage with error handling
async function safeChromeStorageGet(keys) {
    try {
        return await chrome.storage.local.get(keys);
    } catch (error) {
        // Handle extension context invalidation
        if (error.message && (error.message.includes('Extension context invalidated') || 
            error.message.includes('message port closed'))) {
            console.warn('Extension context invalidated - extension may have been reloaded');
            throw new Error('Extension was reloaded. Please refresh this page to continue.');
        }
        throw error;
    }
}

// Helper function to safely send messages to background script
function safeChromeRuntimeSendMessage(message, callback) {
    try {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                if (errorMsg.includes('Extension context invalidated') || 
                    errorMsg.includes('message port closed') ||
                    errorMsg.includes('Could not establish connection')) {
                    if (callback) {
                        callback(null, new Error('Extension was reloaded. Please refresh this page to continue.'));
                    }
                    return;
                }
            }
            if (callback) callback(response);
        });
    } catch (error) {
        if (error.message && (error.message.includes('Extension context invalidated') || 
            error.message.includes('message port closed'))) {
            if (callback) {
                callback(null, new Error('Extension was reloaded. Please refresh this page to continue.'));
            }
        } else if (callback) {
            callback(null, error);
        }
    }
}

// Helper function to enrich user data with username from server
async function enrichUserWithUsername(user) {
    if (!user || !user.email) return user;
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(user.email)}/profile`);
        if (response && response.ok) {
            const data = JSON.parse(response.body || '{}');
            if (data.user && data.user.username) {
                return { ...user, username: data.user.username };
            }
        }
    } catch (error) {
        // Don't fail if we can't fetch username - just log a warning
        if (error.message && error.message.includes('Extension was reloaded')) {
            // Re-throw extension context errors so they can be handled upstream
            throw error;
        }
        console.warn('Failed to fetch username for user:', error);
    }
    
    return user;
}

// Search for users to follow
let followingSearchTimeout = null;
async function searchUsersToFollow(query) {
    if (!query || !query.trim()) {
        // Clear search results and show following list
        const searchResultsEl = document.getElementById('following-search-results');
        const listEl = document.getElementById('following-list');
        if (searchResultsEl) {
            searchResultsEl.classList.add('hidden');
        }
        if (listEl) {
            listEl.style.display = '';
        }
        // Reload following list
        fetchFollowing(true);
        return;
    }
    
    const searchTerm = query.trim();
    if (searchTerm.length < 1) return;
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(searchTerm)}&limit=20`);
        if (!response || response.error) {
            throw new Error(response?.error || 'Unable to search users');
        }
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        let payload = {};
        try { 
            payload = JSON.parse(response.body || '{}'); 
        } catch (parseError) {
            console.error('Error parsing search response:', parseError);
            payload = {};
        }
        
        const results = payload.results || [];
        renderFollowingSearchResults(results);
        
        // Hide following list when showing search results
        const listEl = document.getElementById('following-list');
        if (listEl) {
            listEl.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to search users:', error);
        const searchResultsEl = document.getElementById('following-search-results');
        if (searchResultsEl) {
            searchResultsEl.innerHTML = `
                <div class="trending-error">
                    ${error?.message || 'Failed to search users'}
                </div>
            `;
            searchResultsEl.classList.remove('hidden');
        }
    }
}

// Render search results for following section
async function renderFollowingSearchResults(results = []) {
    const searchResultsEl = document.getElementById('following-search-results');
    const listEl = document.getElementById('following-list');
    if (!searchResultsEl) return;
    
    searchResultsEl.innerHTML = '';
    
    if (!Array.isArray(results) || results.length === 0) {
        searchResultsEl.innerHTML = `
            <div class="trending-empty">
                <div class="trending-empty-icon">🔍</div>
                <p>No users found. Try a different search term.</p>
                <p style="font-size: 11px; color: #8a8d91; margin-top: 8px;">Note: Users must have installed the extension to appear in search results.</p>
            </div>
        `;
        searchResultsEl.classList.remove('hidden');
        return;
    }
    
    // Check follow status for each user
    const currentUserEmail = currentUser?.email;
    const resultsWithStatus = await Promise.all(results.map(async (user) => {
        if (!currentUserEmail || currentUserEmail === user.email) {
            return { ...user, isFollowing: false, canFollow: false };
        }
        const isFollowing = await checkFollowStatus(user.email);
        return { ...user, isFollowing, canFollow: true };
    }));
    
    searchResultsEl.innerHTML = '<div style="padding: 8px 12px; font-size: 12px; color: #65676b; font-weight: 600; border-bottom: 1px solid #e4e6eb;">Search Results (' + results.length + ')</div>';
    
    resultsWithStatus.forEach((user) => {
        const card = document.createElement('div');
        card.className = 'following-card';
        
        // Don't show follow button for current user
        const followButtonHtml = user.canFollow 
            ? (user.isFollowing 
                ? `<button class="unfollow-btn" data-user-email="${user.email}" data-user-name="${user.name || 'User'}" title="Unfollow ${user.name || 'user'}">
                    <span class="unfollow-btn-text">Unfollow</span>
                   </button>`
                : `<button class="follow-btn" data-user-email="${user.email}" data-user-name="${user.name || 'User'}" title="Follow ${user.name || 'user'}">
                    <span class="follow-btn-text">Follow</span>
                   </button>`)
            : '';
        
        card.innerHTML = `
            <img src="${user.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="${user.name || 'User'}" class="following-avatar">
            <div class="following-info">
                <div class="following-name">${user.name || 'Anonymous'}</div>
            </div>
            ${followButtonHtml}
        `;
        searchResultsEl.appendChild(card);
    });
    
    searchResultsEl.classList.remove('hidden');
}

// Helper functions for followers/following UI
function setFollowersLoading(isLoading) {
    const loadingEl = document.getElementById('followers-loading');
    const refreshBtn = document.getElementById('followers-refresh-btn');
    if (loadingEl) {
        if (isLoading) loadingEl.classList.remove('hidden');
        else loadingEl.classList.add('hidden');
    }
    if (refreshBtn) {
        refreshBtn.disabled = isLoading;
        refreshBtn.setAttribute('aria-busy', String(isLoading));
    }
}

function setFollowersError(message = '') {
    const errorEl = document.getElementById('followers-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function setFollowingLoading(isLoading) {
    const loadingEl = document.getElementById('following-loading');
    const refreshBtn = document.getElementById('following-refresh-btn');
    if (loadingEl) {
        if (isLoading) loadingEl.classList.remove('hidden');
        else loadingEl.classList.add('hidden');
    }
    if (refreshBtn) {
        refreshBtn.disabled = isLoading;
        refreshBtn.setAttribute('aria-busy', String(isLoading));
    }
}

function setFollowingError(message = '') {
    const errorEl = document.getElementById('following-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

// Follow/Unfollow functions
async function followUser(targetEmail, targetName) {
    if (!currentUser?.email) {
        alert('Please sign in to follow users');
        return;
    }
    
    if (currentUser.email === targetEmail) {
        alert('Cannot follow yourself');
        return;
    }
    
    try {
        // Pass body as object - background.js will stringify it and add Content-Type header
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(targetEmail)}/follow`, {
            method: 'POST',
            body: { follower: currentUser }
        });
        
        if (!response || response.error) throw new Error(response?.error || 'Failed to follow user');
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        // Update button state
        updateFollowButtonState(targetEmail, true);
        followStatusCache.set(targetEmail, true);
        
        // Refresh following list or search results if we're on that tab
        const activeSection = document.querySelector('.section-tab.active')?.getAttribute('data-section');
        if (activeSection === 'following') {
            const searchInput = document.getElementById('following-search-input');
            if (searchInput && searchInput.value.trim()) {
                // If searching, refresh search results
                searchUsersToFollow(searchInput.value);
            } else {
                // Otherwise refresh following list
                fetchFollowing(true);
            }
        }
    } catch (error) {
        console.error('Failed to follow user:', error);
        alert(error?.message || 'Failed to follow user');
    }
}

async function unfollowUser(targetEmail, targetName) {
    if (!currentUser?.email) {
        alert('Please sign in to unfollow users');
        return;
    }
    
    try {
        // Pass body as object - background.js will stringify it and add Content-Type header
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(targetEmail)}/follow`, {
            method: 'DELETE',
            body: { followerEmail: currentUser.email }
        });
        
        if (!response || response.error) throw new Error(response?.error || 'Failed to unfollow user');
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            throw new Error(body?.error || `Server returned ${response.status}`);
        }
        
        // Update button state
        updateFollowButtonState(targetEmail, false);
        followStatusCache.set(targetEmail, false);
        
        // Refresh following list or search results if we're on that tab
        const activeSection = document.querySelector('.section-tab.active')?.getAttribute('data-section');
        if (activeSection === 'following') {
            const searchInput = document.getElementById('following-search-input');
            if (searchInput && searchInput.value.trim()) {
                // If searching, refresh search results
                searchUsersToFollow(searchInput.value);
            } else {
                // Otherwise refresh following list
                fetchFollowing(true);
            }
        }
    } catch (error) {
        console.error('Failed to unfollow user:', error);
        alert(error?.message || 'Failed to unfollow user');
    }
}

// Update follow button state
function updateFollowButtonState(userEmail, isFollowing) {
    const buttons = document.querySelectorAll(`.follow-btn[data-user-email="${userEmail}"], .unfollow-btn[data-user-email="${userEmail}"]`);
    buttons.forEach(btn => {
        if (isFollowing) {
            btn.classList.remove('follow-btn');
            btn.classList.add('unfollow-btn');
            const textSpan = btn.querySelector('.follow-btn-text') || btn.querySelector('.unfollow-btn-text');
            if (textSpan) {
                textSpan.textContent = 'Unfollow';
                textSpan.className = 'unfollow-btn-text';
            }
        } else {
            btn.classList.remove('unfollow-btn');
            btn.classList.add('follow-btn');
            const textSpan = btn.querySelector('.follow-btn-text') || btn.querySelector('.unfollow-btn-text');
            if (textSpan) {
                textSpan.textContent = 'Follow';
                textSpan.className = 'follow-btn-text';
            }
        }
    });
}

// Check follow status for a user
async function checkFollowStatus(targetEmail) {
    if (!currentUser?.email) return false;
    if (currentUser.email === targetEmail) return false;
    
    // Check cache first
    if (followStatusCache.has(targetEmail)) {
        return followStatusCache.get(targetEmail);
    }
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(currentUser.email)}/is-following/${encodeURIComponent(targetEmail)}`);
        if (!response || response.error) return false;
        if (!response.ok) return false;
        
        let data = {};
        try { data = JSON.parse(response.body || '{}'); } catch (_) {}
        const isFollowing = data.isFollowing || false;
        followStatusCache.set(targetEmail, isFollowing);
        return isFollowing;
    } catch (error) {
        console.error('Failed to check follow status:', error);
        return false;
    }
}

// Content search functions
async function searchContent(query, type = 'all') {
    console.log('searchContent called with:', { query, type, API_BASE_URL });
    
    if (!query || !query.trim()) {
        clearSearchResults();
        return;
    }
    
    const searchTerm = query.trim();
    if (searchTerm.length < 2) {
        setSearchError('Please enter at least 2 characters');
        return;
    }
    
    searchState.query = searchTerm;
    searchState.type = type;
    searchState.isLoading = true;
    searchState.error = null;
    
    setSearchError('');
    setSearchLoading(true);
    hideSearchEmpty();
    
    try {
        const params = new URLSearchParams({
            q: searchTerm,
            limit: '50'
        });
        
        if (type && type !== 'all') {
            params.append('type', type);
        }
        
        // Include user email for message search
        if (currentUser?.email) {
            params.append('userEmail', currentUser.email);
        }
        
        const searchUrl = `${API_BASE_URL}/search?${params.toString()}`;
        console.log('Searching with URL:', searchUrl);
        
        const response = await apiFetch(searchUrl);
        console.log('Search response:', response);
        
        if (!response || response.error) {
            throw new Error(response?.error || 'Unable to search content');
        }
        
        if (!response.ok) {
            let body = {};
            try { body = JSON.parse(response.body || '{}'); } catch (_) {}
            const errorMsg = body?.error || `Server returned ${response.status}`;
            console.error('Search failed:', errorMsg);
            throw new Error(errorMsg);
        }
        
        let data = {};
        try {
            data = JSON.parse(response.body || '{}');
            console.log('Parsed search data:', data);
        } catch (parseError) {
            console.error('Error parsing search response:', parseError, response.body);
            throw new Error('Invalid response from server');
        }
        
        const results = data.results || [];
        console.log('Search results:', results.length, 'items');
        searchState.results = results;
        searchState.error = null;
        
        renderSearchResults(results, searchTerm);
    } catch (error) {
        console.error('Failed to search content:', error);
        const msg = error?.message || 'Failed to search content';
        searchState.error = msg;
        setSearchError(msg);
        renderSearchResults([]);
    } finally {
        searchState.isLoading = false;
        setSearchLoading(false);
    }
}

function renderSearchResults(results = [], query = '') {
    const resultsEl = document.getElementById('search-results');
    const emptyEl = document.getElementById('search-empty');
    if (!resultsEl || !emptyEl) return;
    
    resultsEl.innerHTML = '';
    
    if (!Array.isArray(results) || results.length === 0) {
        resultsEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        emptyEl.innerHTML = `
            <div class="trending-empty-icon">🔍</div>
            <p>No results found for "${escapeHtml(query)}"</p>
            <p style="font-size: 11px; color: #8a8d91; margin-top: 8px;">Try a different keyword or check your search filters.</p>
        `;
        return;
    }
    
    emptyEl.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    
    // Add results header
    const header = document.createElement('div');
    header.className = 'search-results-header';
    header.innerHTML = `<div style="padding: 8px 12px; font-size: 12px; color: #65676b; font-weight: 600; border-bottom: 1px solid #e4e6eb;">Found ${results.length} result${results.length !== 1 ? 's' : ''}</div>`;
    resultsEl.appendChild(header);
    
    results.forEach((result) => {
        const card = document.createElement('div');
        card.className = 'search-result-card';
        
        // Determine type badge and icon
        let typeBadge = '';
        let typeIcon = '';
        if (result.type === 'comment') {
            typeBadge = 'Comment';
            typeIcon = '💬';
        } else if (result.type === 'reply') {
            typeBadge = 'Reply';
            typeIcon = '↩️';
        } else if (result.type === 'message') {
            typeBadge = 'Message';
            typeIcon = '📨';
        } else if (result.type === 'group-message') {
            typeBadge = 'Group Message';
            typeIcon = '👥';
        }
        
        // Highlight search term in text
        const highlightedText = highlightSearchTerm(result.text, query);
        
        // Build card content based on type
        let cardContent = '';
        
        if (result.type === 'comment' || result.type === 'reply') {
            const user = result.user || {};
            const url = result.url || '';
            const hostname = url ? getHostnameFromUrl(url) : '';
            
            cardContent = `
                <div class="search-result-header">
                    <div class="search-result-badge">${typeIcon} ${typeBadge}</div>
                    <div class="search-result-user">
                        <img src="${user.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="${user.name || 'User'}" class="search-result-avatar">
                        <div class="search-result-user-info">
                            <div class="search-result-user-name">${user.name || 'Anonymous'}</div>
                            <div class="search-result-meta">
                                ${hostname ? `<span>${hostname}</span>` : ''}
                                ${result.timestamp ? `<span>• ${formatRelativeTime(new Date(result.timestamp))}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="search-result-text">${highlightedText}</div>
                ${result.type === 'comment' ? `
                    <div class="search-result-stats">
                        <span>👍 ${result.likes || 0}</span>
                        <span>👎 ${result.dislikes || 0}</span>
                        <span>✅ ${result.trusts || 0}</span>
                        ${result.repliesCount > 0 ? `<span>💬 ${result.repliesCount} replies</span>` : ''}
                    </div>
                ` : result.type === 'reply' ? `
                    <div class="search-result-stats">
                        <span>👍 ${result.likes || 0}</span>
                        <span>👎 ${result.dislikes || 0}</span>
                        <span>✅ ${result.trusts || 0}</span>
                    </div>
                ` : ''}
                ${url ? `
                    <div class="search-result-link">
                        <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
                    </div>
                ` : ''}
            `;
        } else if (result.type === 'message' || result.type === 'group-message') {
            const from = result.from || {};
            const to = result.to || {};
            
            cardContent = `
                <div class="search-result-header">
                    <div class="search-result-badge">${typeIcon} ${typeBadge}</div>
                    <div class="search-result-user">
                        <img src="${from.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="${from.name || 'User'}" class="search-result-avatar">
                        <div class="search-result-user-info">
                            <div class="search-result-user-name">
                                ${from.name || 'Anonymous'}
                                ${result.type === 'message' ? ` → ${to.name || 'User'}` : ''}
                                ${result.type === 'group-message' ? ` (${result.groupName || 'Group'})` : ''}
                            </div>
                            <div class="search-result-meta">
                                ${result.timestamp ? `<span>${formatRelativeTime(new Date(result.timestamp))}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="search-result-text">${highlightedText}</div>
            `;
        }
        
        card.innerHTML = cardContent;
        resultsEl.appendChild(card);
    });
}

function highlightSearchTerm(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}

function clearSearchResults() {
    const resultsEl = document.getElementById('search-results');
    const emptyEl = document.getElementById('search-empty');
    if (resultsEl) {
        resultsEl.classList.add('hidden');
        resultsEl.innerHTML = '';
    }
    if (emptyEl) {
        emptyEl.classList.remove('hidden');
        emptyEl.innerHTML = `
            <div class="trending-empty-icon">🔍</div>
            <p>Enter a keyword to search across all comments, replies, and messages.</p>
        `;
    }
    searchState.query = '';
    searchState.results = [];
    searchState.error = null;
}

function setSearchLoading(isLoading) {
    const loadingEl = document.getElementById('search-loading');
    if (loadingEl) {
        if (isLoading) loadingEl.classList.remove('hidden');
        else loadingEl.classList.add('hidden');
    }
}

function setSearchError(message = '') {
    const errorEl = document.getElementById('search-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function hideSearchEmpty() {
    const emptyEl = document.getElementById('search-empty');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
    }
}

function renderTrendingComments(comments = []) {
    const listEl = document.getElementById('trending-list');
    const emptyEl = document.getElementById('trending-empty');
    const loadingEl = document.getElementById('trending-loading');
    const errorEl = document.getElementById('trending-error');

    if (!listEl || !emptyEl) {
        console.warn('Trending list or empty element not found');
        return;
    }

    setTrendingLoading(false);
    trendingState.isLoading = false;

    // Hide loading and error states
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    // Clear the list
    listEl.innerHTML = '';

    // Validate comments array
    if (!Array.isArray(comments)) {
        console.warn('renderTrendingComments: comments is not an array', comments);
        comments = [];
    }

    // Show empty state if no comments
    if (comments.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.style.display = 'none';
        console.log('No trending comments to display');
        return;
    }

    // Hide empty state and show list when we have comments
    emptyEl.classList.add('hidden');
    // Ensure list is visible (it might have been hidden)
    listEl.style.display = '';
    listEl.style.display = 'flex'; // Force flex display
    console.log(`Rendering ${comments.length} trending comments`);

    comments.forEach((comment, index) => {
        const card = document.createElement('div');
        card.className = 'trending-card';
        // Add rank attribute for top 3 special styling
        if (index < 3) {
            card.setAttribute('data-rank', index + 1);
        }

        const header = document.createElement('div');
        header.className = 'trending-card-header';
        card.appendChild(header);

        const rankEl = document.createElement('div');
        rankEl.className = 'trending-rank';
        // Add medal icons for top 3
        let rankText = `#${index + 1}`;
        if (index === 0) rankText = '🥇 #1';
        else if (index === 1) rankText = '🥈 #2';
        else if (index === 2) rankText = '🥉 #3';
        rankEl.textContent = rankText;
        header.appendChild(rankEl);

        const avatar = document.createElement('div');
        avatar.className = 'trending-avatar';
        if (comment?.user?.picture) {
            const img = document.createElement('img');
            img.src = comment.user.picture;
            img.alt = comment.user?.name || comment.user?.email || 'User';
            avatar.appendChild(img);
        } else {
            const initials = document.createElement('span');
            initials.textContent = (comment?.user?.name || comment?.user?.email || '?')
                .trim()
                .charAt(0)
                .toUpperCase();
            avatar.appendChild(initials);
        }
        header.appendChild(avatar);

        const info = document.createElement('div');
        info.className = 'trending-user-info';
        header.appendChild(info);

        const nameEl = document.createElement('span');
        nameEl.className = 'trending-user-name';
        nameEl.textContent = comment?.user?.name || comment?.user?.email || 'Anonymous';
        info.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'trending-user-meta';
        const host = getHostnameFromUrl(comment?.url);
        const timeLabel = comment?.timestamp ? formatRelativeTime(new Date(comment.timestamp)) : '';
        const metaParts = [host, timeLabel].filter(Boolean);
        metaEl.textContent = metaParts.join(' • ');
        info.appendChild(metaEl);

        const textEl = document.createElement('div');
        textEl.className = 'trending-card-text';
        const commentText = comment?.text && String(comment.text).trim();
        textEl.textContent = commentText || '(No comment text)';
        if (!commentText) {
            textEl.classList.add('trending-card-text--empty');
        }
        card.appendChild(textEl);

        const stats = document.createElement('div');
        stats.className = 'trending-card-stats';
        const statItems = [
            { key: 'likes', icon: '👍', value: comment?.likes || 0, label: 'Likes' },
            { key: 'dislikes', icon: '👎', value: comment?.dislikes || 0, label: 'Dislikes' },
            { key: 'trusts', icon: '✅', value: comment?.trusts || 0, label: 'Trusts' },
            { key: 'distrusts', icon: '❌', value: comment?.distrusts || 0, label: 'Distrusts' },
            { key: 'flags', icon: '🚩', value: comment?.flags || 0, label: 'Flags' },
            { key: 'replies', icon: '💬', value: comment?.repliesCount || 0, label: 'Replies' }
        ];

        statItems.forEach(({ key, icon, value, label }) => {
            const stat = document.createElement('span');
            stat.className = 'trending-stat';
            if (key && key === trendingState.metric) {
                stat.classList.add('trending-stat--highlight');
            }
            stat.title = label;
            stat.textContent = `${icon} ${value}`;
            stats.appendChild(stat);
        });

        card.appendChild(stats);

        if (comment?.url) {
            const linkRow = document.createElement('div');
            linkRow.className = 'trending-card-link-row';

            const link = document.createElement('a');
            link.href = comment.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'trending-card-link';
            link.textContent = comment.url;
            link.title = comment.url;

            linkRow.appendChild(link);
            card.appendChild(linkRow);
        }

        listEl.appendChild(card);
    });
}

async function fetchTrendingComments(forceRefresh = false) {
    const listEl = document.getElementById('trending-list');
    if (!listEl) return;

    updateTrendingDescription();

    const cacheKey = `${trendingState.metric}|${trendingState.timeRange}|${trendingState.limit}`;
    const now = Date.now();

    const cachedEntry = trendingState.cache[cacheKey];
    if (
        !forceRefresh &&
        cachedEntry &&
        Array.isArray(cachedEntry.comments) &&
        now - cachedEntry.fetchedAt < TRENDING_CACHE_DURATION
    ) {
        console.log('Using cached trending comments:', cachedEntry.comments.length);
        trendingState.comments = cachedEntry.comments;
        trendingState.lastFetched = cachedEntry.fetchedAt;
        trendingState.error = null;
        setTrendingError('');
        setTrendingLoading(false);
        renderTrendingComments(cachedEntry.comments);
        return;
    }

    if (trendingState.isLoading && !forceRefresh) {
        return;
    }

    trendingState.isLoading = true;
    setTrendingError('');
    setTrendingLoading(true);

    try {
        const query = new URLSearchParams({
            limit: String(trendingState.limit || 100),
            metric: trendingState.metric,
            timeRange: trendingState.timeRange
        });

        const response = await apiFetch(`${API_BASE_URL}/comments/trending?${query.toString()}`);
        if (!response || response.error) {
            throw new Error(response?.error || 'Unable to load trending comments');
        }

        if (!response.ok) {
            let errorBody = {};
            try {
                errorBody = JSON.parse(response.body || '{}');
            } catch (_) {}
            throw new Error(errorBody?.error || `Server returned ${response.status}`);
        }

        let data = [];
        try {
            const bodyText = response.body || '[]';
            console.log('Trending API response body length:', bodyText.length);
            data = JSON.parse(bodyText);
            console.log('Parsed trending data:', { 
                isArray: Array.isArray(data), 
                length: Array.isArray(data) ? data.length : 'N/A',
                sample: Array.isArray(data) && data.length > 0 ? data[0] : null
            });
        } catch (parseError) {
            console.error('Failed to parse trending response:', parseError, response.body?.substring(0, 200));
            throw new Error('Failed to parse server response: ' + parseError.message);
        }

        if (!Array.isArray(data)) {
            console.warn('Trending data is not an array:', typeof data, data);
            data = [];
        }

        const fetchedAt = Date.now();
        trendingState.cache[cacheKey] = {
            comments: data,
            fetchedAt
        };

        trendingState.comments = data;
        trendingState.lastFetched = fetchedAt;
        trendingState.error = null;

        setTrendingError('');
        console.log('Calling renderTrendingComments with', data.length, 'comments');
        renderTrendingComments(data);
    } catch (error) {
        console.error('Failed to fetch trending comments:', error);
        const errorMessage = error?.message || 'Failed to load trending comments';
        trendingState.error = errorMessage;
        setTrendingError(errorMessage);

        const fallbackEntry = trendingState.cache[cacheKey] || cachedEntry;
        if (fallbackEntry && Array.isArray(fallbackEntry.comments) && fallbackEntry.comments.length) {
            renderTrendingComments(fallbackEntry.comments);
        } else if (trendingState.comments.length) {
            renderTrendingComments(trendingState.comments);
        } else {
            renderTrendingComments([]);
        }
    } finally {
        trendingState.isLoading = false;
        setTrendingLoading(false);
    }
}

// Submit a new comment
async function submitComment() {
    const commentInput = document.getElementById('comment-input');
    const text = commentInput.value.trim();
    
    if (!text) return;
    
    try {
        let userData;
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
            userData = result;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in submitComment:', chromeError);
            alert('Please refresh the page and try again');
            return;
        }
        
        if (!userData.isAuthenticated) {
            alert('Please sign in to comment');
            return;
        }

        // Enrich user with username from server if not already present
        let userToSend = userData.user;
        if (!userToSend.username) {
            userToSend = await enrichUserWithUsername(userToSend);
        }

        const currentUrl = window.location.href;
        const response = await apiFetch(`${API_BASE_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { url: currentUrl, text, user: userToSend }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to submit comment:', errMsg);
            throw new Error(`Failed to submit comment: ${errMsg}`);
        }

        const newComment = JSON.parse(response.body || '{}');
        console.log('Comment submitted successfully:', newComment);
        
        commentInput.value = '';
        // Reset textarea height to default size
        commentInput.style.height = '44px';
        commentInput.style.overflowY = 'hidden';
        await loadComments(currentSortBy);
        // Re-initialize emoji pickers after submitting comment
        initializeEmojiPicker();
    } catch (error) {
        console.error('Failed to submit comment:', error);
        alert('Failed to submit comment. Please try again. Error: ' + error.message);
    }
}

// Handle like/dislike actions
async function handleLikeDislike(commentId, action) {
    try {
        let userEmail;
        try {
            const result = await chrome.storage.local.get(['user']);
            userEmail = result.user ? result.user.email : null;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in handleLikeDislike:', chromeError);
            return; // Silently fail if we can't get user data
        }
        
        if (!userEmail) {
            // Silently fail if user is not logged in.
            return;
        }

        console.log(`Handling ${action} for comment:`, commentId);

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/reaction`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: { type: action, userEmail }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to update reaction:', errMsg);
            throw new Error(`Failed to update reaction: ${errMsg}`);
        }
        const updatedComment = JSON.parse(response.body || '{}');
        console.log('Reaction updated successfully:', updatedComment);
        
        // Update the UI without reloading all comments to prevent flashing
        const commentElement = document.querySelector(`.comment[data-comment-id="${commentId}"]`);
        if (commentElement && updatedComment) {
            // Update counts based on action type
            const likeBtn = commentElement.querySelector('.like-btn');
            const dislikeBtn = commentElement.querySelector('.dislike-btn');
            const trustBtn = commentElement.querySelector('.trust-btn');
            const distrustBtn = commentElement.querySelector('.distrust-btn');
            const flagBtn = commentElement.querySelector('.flag-btn');
            
            if (likeBtn) likeBtn.textContent = `👍 ${updatedComment.likes || 0}`;
            if (dislikeBtn) dislikeBtn.textContent = `👎 ${updatedComment.dislikes || 0}`;
            if (trustBtn) trustBtn.textContent = `✅ ${updatedComment.trusts || 0}`;
            if (distrustBtn) distrustBtn.textContent = `❌ ${updatedComment.distrusts || 0}`;
            if (flagBtn) flagBtn.textContent = `🚩 ${updatedComment.flags || 0}`;
        }
    } catch (error) {
        console.error('Failed to update like/dislike:', error);
        // The alert has been removed from here.
    }
}

// Handle reply reactions (like/dislike/trust/distrust)
async function handleReplyReaction(commentId, replyId, action) {
    try {
        let userEmail;
        try {
            const result = await chrome.storage.local.get(['user']);
            userEmail = result.user ? result.user.email : null;
        } catch (chromeError) {
            console.warn('Chrome storage access failed in handleReplyReaction:', chromeError);
            return; // Silently fail if we can't get user data
        }
        
        if (!userEmail) {
            // Silently fail if user is not logged in.
            return;
        }

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/replies/${replyId}/reaction`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: { type: action, userEmail }
        });
        if (!response || response.error || !response.ok) {
            const errMsg = response?.body || response?.statusText || response?.error || 'Request failed';
            console.error('Failed to update reply reaction:', errMsg);
            throw new Error(`Failed to update reply reaction: ${errMsg}`);
        }
        const updatedComment = JSON.parse(response.body || '{}');
        
        // Update the UI without reloading all comments to prevent flashing
        const replyElement = document.querySelector(`.reply[data-reply-id="${replyId}"]`);
        if (replyElement && updatedComment) {
            // Find the updated reply in the response
            const findReplyRecursive = (replies, id) => {
                if (!Array.isArray(replies)) return null;
                for (const reply of replies) {
                    if (reply._id === id) return reply;
                    if (reply.replies) {
                        const found = findReplyRecursive(reply.replies, id);
                        if (found) return found;
                    }
                }
                return null;
            };
            
            const updatedReply = findReplyRecursive(updatedComment.replies || [], replyId);
            if (updatedReply) {
                const likeBtn = replyElement.querySelector('.like-reply-btn');
                const dislikeBtn = replyElement.querySelector('.dislike-reply-btn');
                const trustBtn = replyElement.querySelector('.trust-reply-btn');
                const distrustBtn = replyElement.querySelector('.distrust-reply-btn');
                const flagBtn = replyElement.querySelector('.flag-reply-btn');
                
                if (likeBtn) likeBtn.textContent = `👍 ${updatedReply.likes || 0}`;
                if (dislikeBtn) dislikeBtn.textContent = `👎 ${updatedReply.dislikes || 0}`;
                if (trustBtn) trustBtn.textContent = `✅ ${updatedReply.trusts || 0}`;
                if (distrustBtn) distrustBtn.textContent = `❌ ${updatedReply.distrusts || 0}`;
                if (flagBtn) flagBtn.textContent = `🚩 ${updatedReply.flags || 0}`;
            }
        }
    } catch (error) {
        console.error('Failed to update reply reaction:', error);
        // The alert has been removed from here.
    }
}

// Submit a reply
async function submitReply(commentId, parentReplyId, replyText) {
    const text = replyText.trim();
    if (!text) return;
    try {
        // Add error handling for extension context
        let userData;
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'user']);
            userData = result;
        } catch (chromeError) {
            console.warn('Chrome storage access failed, trying to continue:', chromeError);
            // Try to get user data from a fallback source or use cached data
            userData = { isAuthenticated: true, user: { name: 'User' } };
        }
        
        if (!userData.isAuthenticated) {
            alert('Please sign in to reply to comments');
            return;
        }

        // Enrich user with username from server if not already present
        let userToSend = userData.user;
        if (userToSend && userToSend.email && !userToSend.username) {
            userToSend = await enrichUserWithUsername(userToSend);
        }

        console.log('Submitting reply with data:', { commentId, parentReplyId, text, user: userToSend.name });

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}/replies/${parentReplyId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                text,
                user: userToSend
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers || 'No headers');

        if (!response || !response.ok) {
            const errorText = response?.body || '';
            console.error('Failed to submit reply. Server response:', {
                status: response?.status,
                statusText: response?.statusText,
                error: errorText,
                url: `${API_BASE_URL}/comments/${commentId}/replies/${parentReplyId}`
            });
            throw new Error(`Server error (${response?.status || 'n/a'}): ${errorText}`);
        }

        const responseData = (() => { try { return JSON.parse(response.body || '{}'); } catch (_) { return {}; } })();
        console.log('Reply submitted successfully:', responseData);
        
        // Clear the specific input that was submitted
        const container = document.getElementById(`reply-input-${parentReplyId}`);
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        
        // Reload comments to show the new reply
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error in submitReply:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            commentId,
            parentReplyId,
            replyText: text.substring(0, 50)
        });
        
        // Don't show alert for extension context errors, just log them
        if (error.message.includes('Extension context invalidated')) {
            console.warn('Extension context was invalidated, this is usually temporary');
            // Try to reload comments anyway since the backend might have succeeded
            try {
                await loadComments(currentSortBy);
            } catch (reloadError) {
                console.error('Failed to reload comments after extension context error:', reloadError);
            }
        } else {
            alert('Failed to submit reply. Please try again. Error: ' + error.message);
        }
    }
}

// Show reply input for a comment
function showReplyInput(commentId, containerId, apiParentId) {
    console.log('showReplyInput called with:', { commentId, containerId, apiParentId });
    console.log('Looking for container with ID:', `reply-input-${containerId}`);
    
    const container = document.getElementById(`reply-input-${containerId}`);
    console.log('Container found:', container);
    
    if (container) {
        // Check if this container is already visible and has content
        const existingTextarea = container.querySelector('.reply-textarea');
        const existingText = existingTextarea ? existingTextarea.value : '';
        
        // Hide any other open input boxes but preserve their content
        document.querySelectorAll('.reply-input-container, .edit-input-container').forEach(c => {
            if (c !== container) {
                // Store the current text before hiding
                const textarea = c.querySelector('.reply-textarea, .edit-textarea');
                if (textarea && textarea.value.trim()) {
                    c.setAttribute('data-preserved-text', textarea.value);
                }
                c.style.display = 'none';
            }
        });

        // Only recreate the HTML if the container is empty or not visible
        if (!existingTextarea || container.style.display === 'none') {
            container.innerHTML = `
                <div class="input-wrapper">
                    <textarea class="reply-textarea" placeholder="Write a reply..." rows="3">${existingText}</textarea>
                    <button class="emoji-btn reply-emoji-btn">😊</button>
                    <button class="gif-btn reply-gif-btn">🎬</button>
                </div>
                <div class="emoji-picker reply-emoji-picker" style="display: none;">
                    <div class="emoji-categories">
                        <button class="emoji-category active" data-category="smileys">😊</button>
                        <button class="emoji-category" data-category="animals">🐶</button>
                        <button class="emoji-category" data-category="food">🍕</button>
                        <button class="emoji-category" data-category="activities">⚽</button>
                        <button class="emoji-category" data-category="travel">🚗</button>
                        <button class="emoji-category" data-category="objects">💡</button>
                        <button class="emoji-category" data-category="symbols">❤️</button>
                        <button class="emoji-category" data-category="flags">🏁</button>
                    </div>
                    <div class="emoji-grid reply-emoji-grid"></div>
                </div>
                <div class="gif-picker reply-gif-picker" style="display: none;">
                    <div class="gif-search-container">
                        <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                        <button class="gif-search-btn">🔍</button>
                    </div>
                    <div class="gif-grid reply-gif-grid"></div>
                    <div class="gif-loading reply-gif-loading" style="display: none;">Loading...</div>
                </div>
                <button class="submit-reply-btn" style="margin-top:4px;">Reply</button>
                <button class="cancel-reply-btn" style="margin-top:4px;">Cancel</button>
            `;
            
            // Re-attach event listeners
            const submitBtn = container.querySelector('.submit-reply-btn');
            const cancelBtn = container.querySelector('.cancel-reply-btn');
            
            // Remove existing listeners to prevent duplicates
            submitBtn.replaceWith(submitBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            
            const newSubmitBtn = container.querySelector('.submit-reply-btn');
            const newCancelBtn = container.querySelector('.cancel-reply-btn');
            
            newSubmitBtn.addEventListener('click', async () => {
                const replyText = container.querySelector('.reply-textarea').value;
                console.log('Submitting reply with data:', { commentId, apiParentId, replyText });
                await submitReply(commentId, apiParentId, replyText);
            });
            
            newCancelBtn.addEventListener('click', () => {
                container.style.display = 'none';
                container.innerHTML = '';
            });
        }
        
        container.style.display = 'block';
        const textarea = container.querySelector('.reply-textarea');
        textarea.focus();
        
        // Restore the text if it was preserved
        if (existingText && !textarea.value) {
            textarea.value = existingText;
        }
        
        // Check for preserved text from other containers
        const preservedText = container.getAttribute('data-preserved-text');
        if (preservedText && !textarea.value) {
            textarea.value = preservedText;
            container.removeAttribute('data-preserved-text');
        }
        
        // Initialize emoji picker for this reply input
        initializeEmojiPicker();
        
        // Set up emoji button for this specific reply input
        const replyEmojiBtn = container.querySelector('.reply-emoji-btn');
        const replyEmojiPicker = container.querySelector('.reply-emoji-picker');
        const replyEmojiGrid = container.querySelector('.reply-emoji-grid');
        const replyTextarea = container.querySelector('.reply-textarea');
        
        console.log('Reply emoji elements found:', {
            replyEmojiBtn: replyEmojiBtn ? 'Found' : 'NOT FOUND',
            replyEmojiPicker: replyEmojiPicker ? 'Found' : 'NOT FOUND',
            replyEmojiGrid: replyEmojiGrid ? 'Found' : 'NOT FOUND',
            replyTextarea: replyTextarea ? 'Found' : 'NOT FOUND'
        });
        
        if (replyEmojiBtn && replyEmojiPicker && replyEmojiGrid && replyTextarea) {
            console.log('Setting up emoji picker for reply input');
            let currentCategory = 'smileys';
            
            replyEmojiBtn.addEventListener('click', (e) => {
                console.log('=== REPLY EMOJI BUTTON CLICKED ===');
                console.log('Event:', e);
                console.log('Button element:', replyEmojiBtn);
                console.log('Button HTML:', replyEmojiBtn.outerHTML);
                e.stopPropagation();
                const isVisible = replyEmojiPicker.style.display === 'block';
                console.log('Emoji picker visibility check:', {
                    isVisible,
                    currentDisplay: replyEmojiPicker.style.display,
                    computedDisplay: window.getComputedStyle(replyEmojiPicker).display
                });
                
                if (isVisible) {
                    console.log('Hiding emoji picker');
                    replyEmojiPicker.style.display = 'none';
                } else {
                    console.log('Showing emoji picker');
                    // Position the emoji picker relative to the button
                    const buttonRect = replyEmojiBtn.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    replyEmojiPicker.style.left = `${leftPos}px`;
                    replyEmojiPicker.style.top = `${topPos}px`;
                    replyEmojiPicker.style.display = 'block';
                    
                    console.log('Reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                    
                    console.log('Emoji picker element after positioning:', {
                        display: replyEmojiPicker.style.display,
                        left: replyEmojiPicker.style.left,
                        top: replyEmojiPicker.style.top,
                        zIndex: replyEmojiPicker.style.zIndex,
                        computedStyle: window.getComputedStyle(replyEmojiPicker).display,
                        boundingRect: replyEmojiPicker.getBoundingClientRect(),
                        isVisible: replyEmojiPicker.getBoundingClientRect().width > 0 && replyEmojiPicker.getBoundingClientRect().height > 0
                    });
                    
                    // Force the picker to be visible
                    replyEmojiPicker.style.zIndex = '2147483647';
                    replyEmojiPicker.style.position = 'fixed';
                    replyEmojiPicker.style.display = 'block';
                    
                    console.log('Final emoji picker state:', {
                        display: replyEmojiPicker.style.display,
                        zIndex: replyEmojiPicker.style.zIndex,
                        position: replyEmojiPicker.style.position,
                        boundingRect: replyEmojiPicker.getBoundingClientRect()
                    });
                }
                
                if (!isVisible) {
                    console.log('Rendering emoji grid for reply picker');
                    console.log('Category:', currentCategory);
                    console.log('Grid element:', replyEmojiGrid);
                    console.log('Grid element HTML before rendering:', replyEmojiGrid.innerHTML);
                    renderEmojiGrid(currentCategory, replyEmojiGrid, (emoji) => {
                        console.log('Emoji selected in reply picker:', emoji);
                        insertAtCursor(replyTextarea, emoji);
                        replyEmojiPicker.style.display = 'none';
                        replyTextarea.focus();
                    });
                    console.log('Grid element HTML after rendering:', replyEmojiGrid.innerHTML);
                    console.log('Grid element children count:', replyEmojiGrid.children.length);
                }
                
                // Set up category switching for this picker
                replyEmojiPicker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        replyEmojiPicker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, replyEmojiGrid, (emoji) => {
                            insertAtCursor(replyTextarea, emoji);
                            replyEmojiPicker.style.display = 'none';
                            replyTextarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!replyEmojiPicker.contains(event.target) && !replyEmojiBtn.contains(event.target)) {
                        replyEmojiPicker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            });
        }
        
        // Set up GIF button for this specific reply input
        const replyGifBtn = container.querySelector('.reply-gif-btn');
        const replyGifPicker = container.querySelector('.reply-gif-picker');
        const replyGifGrid = container.querySelector('.reply-gif-grid');
        const replyGifSearch = container.querySelector('.gif-search-input');
        const replyGifSearchBtn = container.querySelector('.gif-search-btn');
        const replyGifLoading = container.querySelector('.reply-gif-loading');
        
        if (replyGifBtn && replyGifPicker && replyGifGrid && replyTextarea) {
            console.log('Setting up GIF picker for reply input');
            
            replyGifBtn.addEventListener('click', (e) => {
                console.log('Reply GIF button clicked!');
                e.stopPropagation();
                const isVisible = replyGifPicker.style.display === 'block';
                
                if (isVisible) {
                    replyGifPicker.style.display = 'none';
                } else {
                    // Position the GIF picker relative to the button
                    const buttonRect = replyGifBtn.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 300;
                    const pickerHeight = 400;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    replyGifPicker.style.left = `${leftPos}px`;
                    replyGifPicker.style.top = `${topPos}px`;
                    replyGifPicker.style.display = 'block';
                    
                    console.log('Reply GIF picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    // Load trending GIFs
                    getTrendingGifs().then(gifs => {
                        renderGifGrid(gifs, replyGifGrid, (gifUrl) => {
                            insertAtCursor(replyTextarea, gifUrl);
                            replyGifPicker.style.display = 'none';
                            replyTextarea.focus();
                        });
                    });
                }
                
                // Set up GIF search functionality
                if (replyGifSearch && replyGifSearchBtn) {
                    replyGifSearchBtn.onclick = async (e) => {
                        e.stopPropagation();
                        const query = replyGifSearch.value.trim();
                        if (query) {
                            replyGifLoading.style.display = 'block';
                            try {
                                const gifs = await searchGifs(query);
                                renderGifGrid(gifs, replyGifGrid, (gifUrl) => {
                                    insertAtCursor(replyTextarea, gifUrl);
                                    replyGifPicker.style.display = 'none';
                                    replyTextarea.focus();
                                });
                            } catch (error) {
                                console.error('Error searching GIFs:', error);
                            } finally {
                                replyGifLoading.style.display = 'none';
                            }
                        }
                    };
                    
                    // Allow Enter key to search
                    replyGifSearch.onkeypress = (e) => {
                        if (e.key === 'Enter') {
                            replyGifSearchBtn.click();
                        }
                    };
                }
                
                // Close picker when clicking outside
                const closeGifPicker = (event) => {
                    if (!replyGifPicker.contains(event.target) && !replyGifBtn.contains(event.target)) {
                        replyGifPicker.style.display = 'none';
                        document.removeEventListener('click', closeGifPicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closeGifPicker);
                }, 10);
            });
        }
    } else {
        console.error('Container not found for ID:', `reply-input-${containerId}`);
        console.log('Available containers:', Array.from(document.querySelectorAll('.reply-input-container')).map(c => c.id));
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
            <div class="input-wrapper">
                <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
                <button class="emoji-btn edit-emoji-btn">😊</button>
                <button class="gif-btn edit-gif-btn">🎬</button>
            </div>
            <div class="emoji-picker edit-emoji-picker" style="display: none;">
                <div class="emoji-categories">
                    <button class="emoji-category active" data-category="smileys">😊</button>
                    <button class="emoji-category" data-category="animals">🐶</button>
                    <button class="emoji-category" data-category="food">🍕</button>
                    <button class="emoji-category" data-category="activities">⚽</button>
                    <button class="emoji-category" data-category="travel">🚗</button>
                    <button class="emoji-category" data-category="objects">💡</button>
                    <button class="emoji-category" data-category="symbols">❤️</button>
                    <button class="emoji-category" data-category="flags">🏁</button>
                </div>
                <div class="emoji-grid edit-emoji-grid"></div>
            </div>
            <div class="gif-picker edit-gif-picker" style="display: none;">
                <div class="gif-search-container">
                    <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                    <button class="gif-search-btn">🔍</button>
                </div>
                <div class="gif-grid edit-gif-grid"></div>
                <div class="gif-loading edit-gif-loading" style="display: none;">Loading...</div>
            </div>
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
        
        // Initialize emoji picker for this edit input
        initializeEmojiPicker();
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

        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                text,
                userEmail
            }
        });

        if (!response || !response.ok) {
            throw new Error(response?.body || 'Failed to save edit');
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
        const userEmail = result.user?.email;
        if (!userEmail) {
            alert('You must be logged in to delete comments.');
            return;
        }
        
        // Show confirmation dialog
        if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
            return;
        }
        
        console.log(`Attempting to delete comment ${commentId} by user ${userEmail}`);
        const response = await apiFetch(`${API_BASE_URL}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: { userEmail }
        });
        if (!response || !response.ok) {
            let errorMsg = 'Failed to delete comment';
            try { errorMsg = JSON.parse(response?.body || '{}')?.error || errorMsg; } catch (_) {}
            throw new Error(errorMsg);
        }
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert(`Error: ${error.message}`);
    }
}

function showEditReplyInput(replyId) {
    document.querySelectorAll('.edit-reply-input-container').forEach(el => el.style.display = 'none');
    const container = document.getElementById('edit-reply-input-' + replyId);
    const textDiv = document.querySelector(`.reply[data-reply-id="${replyId}"] .reply-text`);

    if (container && textDiv) {
        container.innerHTML = `
            <div class="input-wrapper">
                <textarea class="edit-textarea" style="width:100%;min-height:40px;">${textDiv.textContent}</textarea>
                <button class="emoji-btn edit-reply-emoji-btn">😊</button>
                <button class="gif-btn edit-reply-gif-btn">🎬</button>
            </div>
            <div class="emoji-picker edit-reply-emoji-picker" style="display: none;">
                <div class="emoji-categories">
                    <button class="emoji-category active" data-category="smileys">😊</button>
                    <button class="emoji-category" data-category="animals">🐶</button>
                    <button class="emoji-category" data-category="food">🍕</button>
                    <button class="emoji-category" data-category="activities">⚽</button>
                    <button class="emoji-category" data-category="travel">🚗</button>
                    <button class="emoji-category" data-category="objects">💡</button>
                    <button class="emoji-category" data-category="symbols">❤️</button>
                    <button class="emoji-category" data-category="flags">🏁</button>
                </div>
                <div class="emoji-grid edit-reply-emoji-grid"></div>
            </div>
            <div class="gif-picker edit-reply-gif-picker" style="display: none;">
                <div class="gif-search-container">
                    <input type="text" class="gif-search-input" placeholder="Search GIFs...">
                    <button class="gif-search-btn">🔍</button>
                </div>
                <div class="gif-grid edit-reply-gif-grid"></div>
                <div class="gif-loading edit-reply-gif-loading" style="display: none;">Loading...</div>
            </div>
            <button class="save-edit-reply-btn" style="margin-top:4px;">Save</button>
            <button class="cancel-edit-reply-btn" style="margin-top:4px;">Cancel</button>
        `;
        container.style.display = 'block';

        const saveBtn = container.querySelector('.save-edit-reply-btn');
        const cancelBtn = container.querySelector('.cancel-edit-reply-btn');
        const commentId = container.closest('.comment').getAttribute('data-comment-id');

        saveBtn.addEventListener('click', async () => {
            const newText = container.querySelector('.edit-textarea').value;
            await saveEditReply(commentId, replyId, newText);
            container.style.display = 'none';
        });

        cancelBtn.addEventListener('click', () => {
            container.style.display = 'none';
        });
        
        // Initialize emoji picker for this edit reply input
        initializeEmojiPicker();
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
        const userEmail = result.user?.email;
        if (!userEmail) {
            alert('You must be logged in to delete replies.');
            return;
        }
        
        // Show confirmation dialog
        if (!confirm('Are you sure you want to delete this reply? This action cannot be undone.')) {
            return;
        }
        
        console.log(`Attempting to delete reply ${replyId} by user ${userEmail}`);
        const response = await fetch(`${API_BASE_URL}/replies/${replyId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: userEmail })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete reply');
        }
        await loadComments(currentSortBy);
    } catch (error) {
        console.error('Error deleting reply:', error);
        alert(`Error: ${error.message}`);
    }
}

// Modify renderComments to use comment IDs
function renderComments(comments, userEmail, currentUrl) {
    return comments.map(comment => {
        const isLiked = comment.likedBy && comment.likedBy.includes(userEmail);
        const isDisliked = comment.dislikedBy && comment.dislikedBy.includes(userEmail);
        const isTrusted = comment.trustedBy && comment.trustedBy.includes(userEmail);
        const isDistrusted = comment.distrustedBy && comment.distrustedBy.includes(userEmail);
        // Convert markdown images to HTML <img> tags
        const commentTextWithImages = comment.text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; max-height: 200px; display: block; margin: 8px 0;">');
        const repliesCount = comment.replies && comment.replies.length ? comment.replies.length : 0;
        return `
            <div class="comment" data-comment-id="${comment._id}">
                <div class="comment-header">
                    <img src="${comment.user?.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="Profile" class="comment-avatar">
                    <div class="comment-info">
                        <div class="comment-author-row">
                            <div class="comment-author">${comment.user?.name || 'Anonymous'}</div>
                            ${comment.user?.email && comment.user.email !== userEmail ? `
                                <button class="follow-btn" data-user-email="${comment.user.email}" data-user-name="${comment.user.name || 'User'}" title="Follow ${comment.user.name || 'user'}">
                                    <span class="follow-btn-text">Follow</span>
                                </button>
                            ` : ''}
                        </div>
                        <div class="comment-time" title="${new Date(comment.timestamp).toLocaleString()}">${formatRelativeTime(new Date(comment.timestamp))}</div>
                    </div>
                </div>
                <div class="comment-text" id="comment-text-${comment._id}">${commentTextWithImages}</div>
                <div class="comment-actions">
                    <button class="action-btn reply-btn" data-comment-id="${comment._id}" title="Reply">${getActionIcon('reply', 16)} Reply</button>
                    <button class="action-btn like-btn" data-comment-id="${comment._id}" title="Like">${getActionIcon('like', 16)} ${comment.likes || 0}</button>
                    <button class="action-btn dislike-btn" data-comment-id="${comment._id}" title="Dislike">${getActionIcon('dislike', 16)} ${comment.dislikes || 0}</button>
                    <button class="action-btn trust-btn" data-comment-id="${comment._id}" title="Trust">${getActionIcon('trust', 16)} ${comment.trusts || 0}</button>
                    <button class="action-btn distrust-btn" data-comment-id="${comment._id}" title="Distrust">${getActionIcon('distrust', 16)} ${comment.distrusts || 0}</button>
                    <button class="action-btn flag-btn" data-comment-id="${comment._id}" title="Report">${getActionIcon('flag', 16)} ${comment.flags || 0}</button>
                    ${comment.user?.email === userEmail ? `
                        <button class="action-btn edit-btn" data-comment-id="${comment._id}" title="Edit comment">${getActionIcon('edit', 16)}</button>
                        <button class="action-btn delete-btn" data-comment-id="${comment._id}" title="Delete comment">${getActionIcon('delete', 16)}</button>
                    ` : ''}
                </div>
                <div class="edit-input-container" id="edit-input-${comment._id}" style="display:none;"></div>
                <div class="reply-input-container" id="reply-input-${comment._id}" style="display:none;"></div>
                ${repliesCount > 0 ? `
                    <div class="replies-collapsible" id="replies-collapsible-${comment._id}">
                        <div class="replies-toggle" data-comment-id="${comment._id}">
                            <span class="replies-toggle-text">Replies (${repliesCount})</span>
                            <span class="replies-toggle-icon">▼</span>
                        </div>
                        <div class="replies replies-collapsible-content" id="replies-content-${comment._id}" style="display:none;">
                            ${renderReplies(comment.replies, 1, comment._id, userEmail)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Recursive function to render replies with infinite nesting
function renderReplies(replies, level = 1, commentId, userEmail) {
    console.log(`Rendering replies at level ${level}:`, replies.length, 'replies');
    console.log('Full replies array:', JSON.stringify(replies, null, 2));
    
    return replies.map(reply => {
        // Ensure every reply has a replies array
        if (!Array.isArray(reply.replies)) reply.replies = [];
        
        console.log(`Processing reply:`, {
            id: reply._id,
            idType: typeof reply._id,
            text: reply.text?.substring(0, 50) + '...', 
            user: reply.user?.name,
            hasReplies: reply.replies && reply.replies.length > 0,
            fullReply: reply
        });
        
        // Debug: Check if reply._id is actually undefined
        if (!reply._id) {
            console.error('WARNING: reply._id is falsy!', {
                replyId: reply._id,
                replyIdType: typeof reply._id,
                fullReply: reply
            });
        }
        
        const isReplyLiked = reply.likedBy && reply.likedBy.includes(userEmail);
        const isReplyDisliked = reply.dislikedBy && reply.dislikedBy.includes(userEmail);
        const isReplyTrusted = reply.trustedBy && reply.trustedBy.includes(userEmail);
        const isReplyDistrusted = reply.distrustedBy && reply.distrustedBy.includes(userEmail);
        
        const marginLeft = level * 48;
        console.log(`Reply ${reply._id} at level ${level}, margin-left: ${marginLeft}px`);
        console.log(`Reply data:`, { 
            id: reply._id, 
            text: reply.text?.substring(0, 50) + '...', 
            user: reply.user?.name,
            hasReplies: reply.replies && reply.replies.length > 0
        });
        
        // Debug the reply button attributes
        const replyButtonHtml = `<button class="reply-btn" data-comment-id="${commentId}" data-parent-reply-id="${reply._id || ''}">Reply</button>`;
        console.log(`Reply button HTML for reply ${reply._id}:`, replyButtonHtml);
        
        // Convert markdown images to HTML <img> tags
        const replyTextWithImages = reply.text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; max-height: 200px; display: block; margin: 8px 0;">');
        
        return `
            <div class="reply" data-reply-id="${reply._id}" data-reply-level="${level}" style="margin-left: ${marginLeft}px !important;">
                <div class="reply-header">
                    <img src="${reply.user?.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+'}" alt="Profile" class="reply-avatar">
                    <div class="reply-info">
                        <div class="reply-author-row">
                            <div class="reply-author">${reply.user?.name || 'Anonymous'}</div>
                            ${reply.user?.email && reply.user.email !== userEmail ? `
                                <button class="follow-btn" data-user-email="${reply.user.email}" data-user-name="${reply.user.name || 'User'}" title="Follow ${reply.user.name || 'user'}">
                                    <span class="follow-btn-text">Follow</span>
                                </button>
                            ` : ''}
                        </div>
                        <div class="reply-time" title="${new Date(reply.timestamp).toLocaleString()}">${formatRelativeTime(new Date(reply.timestamp))}</div>
                    </div>
                </div>
                <div class="reply-text">${replyTextWithImages}</div>
                <div class="reply-actions">
                    <button class="action-btn like-reply-btn ${reply.likedBy && reply.likedBy.includes(userEmail) ? 'liked' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Like">${getActionIcon('like', 16)} ${reply.likes || 0}</button>
                    <button class="action-btn dislike-reply-btn ${reply.dislikedBy && reply.dislikedBy.includes(userEmail) ? 'disliked' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Dislike">${getActionIcon('dislike', 16)} ${reply.dislikes || 0}</button>
                    <button class="action-btn trust-reply-btn ${reply.trustedBy && reply.trustedBy.includes(userEmail) ? 'trusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Trust">${getActionIcon('trust', 16)} ${reply.trusts || 0}</button>
                    <button class="action-btn distrust-reply-btn ${reply.distrustedBy && reply.distrustedBy.includes(userEmail) ? 'distrusted' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Distrust">${getActionIcon('distrust', 16)} ${reply.distrusts || 0}</button>
                    <button class="action-btn reply-btn" data-comment-id="${commentId}" data-parent-reply-id="${reply._id || ''}" title="Reply">${getActionIcon('reply', 16)} Reply</button>
                    <button class="action-btn flag-reply-btn ${reply.flaggedBy && reply.flaggedBy.includes(userEmail) ? 'flagged' : ''}" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Report">${getActionIcon('flag', 16)} ${reply.flags || 0}</button>
                    ${reply.user?.email === userEmail ? `
                        <button class="action-btn edit-reply-btn" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Edit reply">${getActionIcon('edit', 16)}</button>
                        <button class="action-btn delete-reply-btn" data-reply-id="${reply._id}" data-comment-id="${commentId}" title="Delete reply">${getActionIcon('delete', 16)}</button>
                    ` : ''}
                </div>
                <div class="reply-input-container" id="reply-input-${reply._id}" style="display:none;"></div>
                <div class="edit-reply-input-container" id="edit-reply-input-${reply._id}" style="display:none;"></div>
                ${reply.replies && reply.replies.length > 0 ? `
                    <div class="nested-replies-container">
                        ${renderReplies(reply.replies, level + 1, commentId, userEmail)}
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
async function savePanelState(panel, isMinimized = null) {
    const rect = panel.getBoundingClientRect();
    const state = {
        width: panel.style.width,
        height: panel.style.height,
        left: rect.left,
        top: rect.top,
        right: window.innerWidth - rect.right,
        isCollapsed: panel.querySelector('.comments-content').style.display === 'none',
        isMinimized: isMinimized !== null ? isMinimized : (panel.style.display === 'none')
    };
    await chrome.storage.local.set({ panelState: state });
}

// Restore panel position and size from storage (but not minimized state)
async function restorePanelPositionAndSize(panel) {
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
                document.getElementById('minimize-comments').textContent = '🗕';
            }
        }
    } catch (error) {
        console.error('Failed to restore panel position and size:', error);
    }
}

// Restore only the minimized state (requires floating icon to be ready)
async function restorePanelMinimizedState(panel) {
    try {
        const result = await chrome.storage.local.get(['panelState']);
        const state = result.panelState;
        
        if (state && state.isMinimized) {
            console.log('Restoring minimized state');
            panel.style.display = 'none';
            const floatingIcon = document.getElementById('comments-floating-icon');
            if (floatingIcon) {
                console.log('Setting floating icon to visible');
                floatingIcon.style.display = 'flex';
            } else {
                console.error('Floating icon not found during restore');
            }
        }
    } catch (error) {
        console.error('Failed to restore panel minimized state:', error);
    }
}

// Restore panel state from storage (legacy function - kept for compatibility)
async function restorePanelState(panel) {
    await restorePanelPositionAndSize(panel);
    await restorePanelMinimizedState(panel);
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
            case 'most-disliked':
                return (b.dislikes || 0) - (a.dislikes || 0);
            case 'most-trusted':
                return (b.trusts || 0) - (a.trusts || 0);
            case 'most-distrusted':
                return (b.distrusts || 0) - (a.distrusts || 0);
            case 'newest':
            default:
                return new Date(b.timestamp) - new Date(a.timestamp);
        }
    });
}

// === Emoji Picker Support ===

const EMOJI_CATEGORIES = {
    smileys: ['😀','😁','😂','🤣','😊','😍','😎','😭','😡','😱','😴','😇','🥳','🤔','😅','😉','😘','😜','🤗','😏'],
    animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄','🐔','🐧','🐦','🐤'],
    food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🍍','🥭','🥝','🍅','🍆','🥑','🥦','🥕'],
    activities: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🏒','🏑','🏏','⛳','🏹','🎣','🥊','🥋','🎽'],
    travel: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🚨','✈️','🚀'],
    objects: ['💡','🔑','🔒','🔓','🛡️','🔨','⏰','📱','💻','🖨️','🕹️','📷','🎥','📺','📻','🎧','📡','🔋','🔌','💸'],
    symbols: ['❤️','💔','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💤','💢','💥','💦','💨','💫','💬','🗨️','🕳️'],
    flags: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇳','🇦🇺','🇧🇷','🇨🇦','🇨🇳','🇫🇷','🇩🇪','🇮🇳','🇯🇵','🇷🇺','🇬🇧','🇺🇸']
};

function renderEmojiGrid(category, gridElem, onEmojiClick) {
    console.log('renderEmojiGrid called with category:', category, 'gridElem:', gridElem);
    if (!gridElem) {
        console.error('Grid element not found');
        return;
    }
    
    gridElem.innerHTML = '';
    const emojis = EMOJI_CATEGORIES[category] || EMOJI_CATEGORIES.smileys;
    console.log('Emojis to render:', emojis.length);
    
    emojis.forEach((emoji, index) => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.type = 'button';
        btn.textContent = emoji;
        btn.style.fontSize = '20px';
        btn.style.padding = '4px';
        btn.style.border = 'none';
        btn.style.background = 'none';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
            console.log('Emoji clicked:', emoji);
            onEmojiClick(emoji);
        });
        gridElem.appendChild(btn);
        console.log(`Added emoji ${index + 1}/${emojis.length}: ${emoji}`);
    });
    console.log('Emoji grid rendered with', gridElem.children.length, 'items');
    console.log('Grid element HTML:', gridElem.innerHTML.substring(0, 200) + '...');
}

function initializeEmojiPicker() {
    console.log('Initializing emoji picker...');
    
    // Main comment input emoji picker
    const emojiBtn = document.getElementById('comment-emoji-btn');
    const emojiPicker = document.getElementById('comment-emoji-picker');
    const emojiGrid = document.getElementById('comment-emoji-grid');
    const textarea = document.getElementById('comment-input');
    
    console.log('Main emoji picker elements:', { 
        emojiBtn: emojiBtn ? 'Found' : 'NOT FOUND', 
        emojiPicker: emojiPicker ? 'Found' : 'NOT FOUND', 
        emojiGrid: emojiGrid ? 'Found' : 'NOT FOUND', 
        textarea: textarea ? 'Found' : 'NOT FOUND' 
    });
    
    if (emojiBtn && emojiPicker && emojiGrid && textarea) {
        console.log('All elements found, setting up event listener');
        let currentCategory = 'smileys';
        
        // Remove any existing event listeners by cloning the button
        const newEmojiBtn = emojiBtn.cloneNode(true);
        emojiBtn.parentNode.replaceChild(newEmojiBtn, emojiBtn);
        const freshEmojiBtn = document.getElementById('comment-emoji-btn');
        
        if (!freshEmojiBtn) {
            console.error('Failed to get fresh emoji button after cloning');
            return;
        }
        
        console.log('Fresh emoji button found:', freshEmojiBtn);
        console.log('Button position:', freshEmojiBtn.getBoundingClientRect());
        
        // Initialize the main emoji picker
        freshEmojiBtn.addEventListener('click', (e) => {
            console.log('Main emoji button clicked!');
            console.log('Event target:', e.target);
            console.log('Button element:', freshEmojiBtn);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const isVisible = emojiPicker.style.display === 'block';
            console.log('Current emoji picker display:', emojiPicker.style.display);
            console.log('Is visible:', isVisible);
            console.log('Emoji picker element:', emojiPicker);
            console.log('Emoji picker HTML:', emojiPicker.outerHTML);
            
            if (isVisible) {
                emojiPicker.style.display = 'none';
            } else {
                // Position the emoji picker relative to the button
                const buttonRect = freshEmojiBtn.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const pickerWidth = 280;
                
                // Calculate left position to keep picker within viewport
                let leftPos = buttonRect.left;
                if (leftPos + pickerWidth > viewportWidth - 10) {
                    leftPos = viewportWidth - pickerWidth - 10;
                }
                if (leftPos < 10) {
                    leftPos = 10;
                }
                
                // Calculate top position
                let topPos = buttonRect.bottom + 5;
                const viewportHeight = window.innerHeight;
                const pickerHeight = 300;
                
                // If picker would go below viewport, position it above the button
                if (topPos + pickerHeight > viewportHeight - 10) {
                    topPos = buttonRect.top - pickerHeight - 5;
                }
                
                // Ensure minimum top position
                if (topPos < 10) {
                    topPos = 10;
                }
                
                emojiPicker.style.left = `${leftPos}px`;
                emojiPicker.style.top = `${topPos}px`;
                
                console.log('Emoji picker position:', {
                    left: `${leftPos}px`,
                    top: `${topPos}px`,
                    viewportWidth,
                    pickerWidth,
                    buttonLeft: buttonRect.left,
                    buttonBottom: buttonRect.bottom
                });
                
                emojiPicker.style.display = 'block';
            }
            
            console.log('New emoji picker display:', emojiPicker.style.display);
            console.log('Emoji picker computed style:', window.getComputedStyle(emojiPicker).display);
            console.log('Emoji picker position:', emojiPicker.getBoundingClientRect());
            
            if (!isVisible) {
                renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
                    insertAtCursor(textarea, emoji);
                    emojiPicker.style.display = 'none';
                    textarea.focus();
                });
            }
        });
        
        // Handle emoji picker clicks
        emojiPicker.addEventListener('click', e => e.stopPropagation());
        
        // Close main emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && !freshEmojiBtn.contains(e.target)) {
                emojiPicker.style.display = 'none';
            }
        });
        
        // Category switching for main emoji picker
        emojiPicker.querySelectorAll('.emoji-category').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                emojiPicker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentCategory = this.getAttribute('data-category');
                renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
                    insertAtCursor(textarea, emoji);
                    emojiPicker.style.display = 'none';
                    textarea.focus();
                });
            });
        });
        
        // Initialize main emoji grid
        renderEmojiGrid(currentCategory, emojiGrid, (emoji) => {
            insertAtCursor(textarea, emoji);
            emojiPicker.style.display = 'none';
            textarea.focus();
        });
        
        // Add click outside handler to close emoji picker
        document.addEventListener('click', function closeEmojiPicker(e) {
            const target = e.target;
            // Use the emoji button element we created earlier instead of undefined 'btn'
            if (!emojiPicker.contains(target) && !freshEmojiBtn.contains(target)) {
                emojiPicker.style.display = 'none';
                document.removeEventListener('click', closeEmojiPicker);
            }
        });
    }

    // Global event delegation for all other emoji pickers
    document.body.addEventListener('click', function(e) {
        // Reply emoji button
        if (e.target.classList.contains('reply-emoji-btn')) {
            console.log('Reply emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.reply-input-container');
            const picker = container.querySelector('.reply-emoji-picker');
            const grid = container.querySelector('.reply-emoji-grid');
            const textarea = container.querySelector('.reply-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
        
        // Edit comment emoji button
        if (e.target.classList.contains('edit-emoji-btn')) {
            console.log('Edit comment emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.edit-input-container');
            const picker = container.querySelector('.edit-emoji-picker');
            const grid = container.querySelector('.edit-emoji-grid');
            const textarea = container.querySelector('.edit-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Edit comment emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
        
        // Edit reply emoji button
        if (e.target.classList.contains('edit-reply-emoji-btn')) {
            console.log('Edit reply emoji button clicked!');
            e.stopPropagation();
            const container = e.target.closest('.edit-reply-input-container');
            const picker = container.querySelector('.edit-reply-emoji-picker');
            const grid = container.querySelector('.edit-reply-emoji-grid');
            const textarea = container.querySelector('.edit-textarea');
            
            if (picker && grid && textarea) {
                let currentCategory = 'smileys';
                const isVisible = picker.style.display === 'block';
                
                if (isVisible) {
                    picker.style.display = 'none';
                } else {
                    // Position the emoji picker relative to the button
                    const buttonRect = e.target.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const pickerWidth = 280;
                    const pickerHeight = 300;
                    
                    // Calculate left position to keep picker within viewport
                    let leftPos = buttonRect.left;
                    if (leftPos + pickerWidth > viewportWidth - 10) {
                        leftPos = viewportWidth - pickerWidth - 10;
                    }
                    if (leftPos < 10) {
                        leftPos = 10;
                    }
                    
                    // Calculate top position
                    let topPos = buttonRect.bottom + 5;
                    
                    // If picker would go below viewport, position it above the button
                    if (topPos + pickerHeight > viewportHeight - 10) {
                        topPos = buttonRect.top - pickerHeight - 5;
                    }
                    
                    // Ensure minimum top position
                    if (topPos < 10) {
                        topPos = 10;
                    }
                    
                    picker.style.left = `${leftPos}px`;
                    picker.style.top = `${topPos}px`;
                    picker.style.display = 'block';
                    
                    console.log('Edit reply emoji picker position:', {
                        left: `${leftPos}px`,
                        top: `${topPos}px`,
                        viewportWidth,
                        viewportHeight,
                        pickerWidth,
                        pickerHeight,
                        buttonLeft: buttonRect.left,
                        buttonBottom: buttonRect.bottom
                    });
                }
                
                if (!isVisible) {
                    renderEmojiGrid(currentCategory, grid, (emoji) => {
                        insertAtCursor(textarea, emoji);
                        picker.style.display = 'none';
                        textarea.focus();
                    });
                }
                
                // Set up category switching for this picker
                picker.querySelectorAll('.emoji-category').forEach(btn => {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        picker.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        currentCategory = this.getAttribute('data-category');
                        renderEmojiGrid(currentCategory, grid, (emoji) => {
                            insertAtCursor(textarea, emoji);
                            picker.style.display = 'none';
                            textarea.focus();
                        });
                    };
                });
                
                // Close picker when clicking outside
                const closePicker = (event) => {
                    if (!picker.contains(event.target) && !e.target.contains(event.target)) {
                        picker.style.display = 'none';
                        document.removeEventListener('click', closePicker);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closePicker);
                }, 10);
            }
        }
    });
    
    console.log('Emoji picker initialization complete');
}

function insertAtCursor(textarea, text) {
    if (!textarea) {
        console.error('Textarea not found for emoji insertion');
        return;
    }
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    
    // Trigger input event to ensure any listeners are notified
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('Emoji inserted at cursor:', text);
}
// === END Emoji Picker Support ===

// === GIF Picker Support ===
const GIPHY_API_KEY = 'GlVGY86kr3Wt31Vq8NLj5zQYJzbcFQG'; // Public beta key - you can replace with your own
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Mock GIF data for testing when API is unavailable
const MOCK_GIFS = {
    'dog': [
        {
            title: 'Happy Dog',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Cute Puppy',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ],
    'cat': [
        {
            title: 'Sleepy Cat',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Playful Cat',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ],
    'default': [
        {
            title: 'Funny GIF',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' }
            }
        },
        {
            title: 'Cool GIF',
            images: {
                fixed_height_small: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' },
                original: { url: 'https://media.giphy.com/media/4Zo41lrcK4zU8/giphy.gif' }
            }
        }
    ]
};

async function searchGifs(query, limit = 50, offset = 0) {
    try {
        // Try the real API first
        const response = await fetch(`${GIPHY_BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g`);
        
        if (!response.ok) {
            console.log('Giphy API unavailable, using mock data. Status:', response.status);
            // Fallback to mock data
            const mockData = MOCK_GIFS[query.toLowerCase()] || MOCK_GIFS['default'];
            return mockData.slice(offset, offset + limit);
        }
        
        const data = await response.json();
        console.log('Giphy search API response:', {
            query: query,
            total: data.pagination?.total_count || 'unknown',
            count: data.data?.length || 0,
            limit: limit,
            offset: offset
        });
        
        if (!data.data || data.data.length === 0) {
            console.warn('Giphy search API returned empty data, using mock data');
            const mockData = MOCK_GIFS[query.toLowerCase()] || MOCK_GIFS['default'];
            return mockData.slice(offset, offset + limit);
        }
        
        return data.data || [];
    } catch (error) {
        console.error('Giphy API error, using mock data:', error);
        // Fallback to mock data
        const mockData = MOCK_GIFS[query.toLowerCase()] || MOCK_GIFS['default'];
        return mockData.slice(offset, offset + limit);
    }
}

async function getTrendingGifs(limit = 50, offset = 0) {
    try {
        // Try the real API first
        const response = await fetch(`${GIPHY_BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`);
        
        if (!response.ok) {
            console.log('Giphy API unavailable, using mock data. Status:', response.status);
            // Fallback to mock data
            return MOCK_GIFS['default'].slice(offset, offset + limit);
        }
        
        const data = await response.json();
        console.log('Giphy API response:', {
            total: data.pagination?.total_count || 'unknown',
            count: data.data?.length || 0,
            limit: limit,
            offset: offset
        });
        
        if (!data.data || data.data.length === 0) {
            console.warn('Giphy API returned empty data, using mock data');
            return MOCK_GIFS['default'].slice(offset, offset + limit);
        }
        
        return data.data || [];
    } catch (error) {
        console.error('Giphy API error, using mock data:', error);
        // Fallback to mock data
        return MOCK_GIFS['default'].slice(offset, offset + limit);
    }
}

// Get popular categories/trending searches
async function getPopularCategories() {
    const categories = ['funny', 'reaction', 'meme', 'animals', 'celebrities', 'sports', 'tv', 'movies', 'music', 'food', 'happy', 'love', 'excited', 'yes', 'no', 'congratulations', 'thank you', 'hello', 'goodbye', 'dance'];
    return categories;
}

function renderGifGrid(gifs, gridElem, onGifClick) {
    console.log('renderGifGrid called with', gifs?.length || 0, 'GIFs');
    gridElem.innerHTML = '';
    
    if (!gifs || gifs.length === 0) {
        gridElem.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No GIFs found. Try a different search term.</div>';
        return;
    }
    
    console.log('Rendering GIFs:', gifs.map(g => ({ title: g.title, hasImages: !!g.images })));
    
    gifs.forEach((gif, index) => {
        try {
            // Handle different possible image object structures
            const imageUrl = gif.images?.fixed_height_small?.url || 
                           gif.images?.fixed_height?.url || 
                           gif.images?.downsized?.url ||
                           gif.images?.original?.url ||
                           gif.url;
            
            const originalUrl = gif.images?.original?.url || 
                               gif.images?.fixed_height?.url ||
                               imageUrl;
            
            const title = gif.title || gif.slug || `GIF ${index + 1}`;
            
            if (!imageUrl) {
                console.warn('GIF missing image URL:', gif);
                return;
            }
            
            const gifItem = document.createElement('div');
            gifItem.className = 'gif-item';
            gifItem.innerHTML = `
                <img src="${imageUrl}" 
                     alt="${title}" 
                     data-gif-url="${originalUrl}"
                     data-gif-title="${title}"
                     loading="lazy"
                     onerror="this.parentElement.innerHTML='<div style=\\'padding:20px;text-align:center;color:#999;\\'>Failed to load</div>'">
            `;
            gifItem.addEventListener('click', () => onGifClick(originalUrl, title));
            gridElem.appendChild(gifItem);
        } catch (error) {
            console.error('Error rendering GIF:', error, gif);
        }
    });
    
    console.log('Rendered', gridElem.children.length, 'GIF items');
}

function appendGifGrid(gifs, gridElem, onGifClick) {
    if (!gifs || gifs.length === 0) {
        return;
    }
    
    gifs.forEach(gif => {
        const gifItem = document.createElement('div');
        gifItem.className = 'gif-item';
        gifItem.innerHTML = `
            <img src="${gif.images.fixed_height_small.url}" 
                 alt="${gif.title}" 
                 data-gif-url="${gif.images.original.url}"
                 data-gif-title="${gif.title}">
        `;
        gifItem.addEventListener('click', () => onGifClick(gif.images.original.url, gif.title));
        gridElem.appendChild(gifItem);
    });
}

async function initializeGifPicker() {
    // Main comment input
    const gifBtn = document.getElementById('comment-gif-btn');
    const gifPicker = document.getElementById('comment-gif-picker');
    const gifGrid = document.getElementById('comment-gif-grid');
    const gifSearch = document.getElementById('comment-gif-search');
    const gifSearchBtn = document.getElementById('comment-gif-search-btn');
    const gifLoading = document.getElementById('comment-gif-loading');
    const textarea = document.getElementById('comment-input');
    
    console.log('GIF picker elements:', { gifBtn, gifPicker, gifGrid, gifSearch, gifSearchBtn, gifLoading, textarea });
    
    if (gifBtn && gifPicker && gifGrid && textarea) {
        console.log('All GIF picker elements found, setting up event listener');
        
        // Remove any existing event listeners by cloning the button
        const newGifBtn = gifBtn.cloneNode(true);
        gifBtn.parentNode.replaceChild(newGifBtn, gifBtn);
        const freshGifBtn = document.getElementById('comment-gif-btn');
        
        if (!freshGifBtn) {
            console.error('Failed to get fresh GIF button after cloning');
            return;
        }
        
        console.log('Fresh GIF button found:', freshGifBtn);
        console.log('Button position:', freshGifBtn.getBoundingClientRect());
        
        // State for pagination
        let currentOffset = 0;
        let currentQuery = null;
        let isLoadingMore = false;
        
        // Load popular categories
        const gifCategories = document.getElementById('comment-gif-categories');
        const gifCategoryTags = document.getElementById('comment-gif-category-tags');
        const popularCategories = await getPopularCategories();
        
        popularCategories.forEach(category => {
            const tag = document.createElement('button');
            tag.className = 'gif-category-tag';
            tag.textContent = category;
            tag.addEventListener('click', async () => {
                gifSearch.value = category;
                currentQuery = category;
                currentOffset = 0;
                gifLoading.style.display = 'block';
                gifGrid.innerHTML = '';
                const gifs = await searchGifs(category, 50, 0);
                renderGifGrid(gifs, gifGrid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    gifPicker.style.display = 'none';
                    textarea.focus();
                });
                gifLoading.style.display = 'none';
                currentOffset = gifs.length;
                const loadMoreBtn = document.getElementById('comment-gif-load-more');
                if (gifs.length >= 50) {
                    loadMoreBtn.style.display = 'block';
                } else {
                    loadMoreBtn.style.display = 'none';
                }
            });
            gifCategoryTags.appendChild(tag);
        });
        
        freshGifBtn.addEventListener('click', async (e) => {
            console.log('GIF button clicked!');
            console.log('Event target:', e.target);
            console.log('Button element:', freshGifBtn);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const isVisible = gifPicker.style.display === 'block';
            console.log('Current GIF picker display:', gifPicker.style.display);
            console.log('Is visible:', isVisible);
            
            if (isVisible) {
                gifPicker.style.display = 'none';
            } else {
                // Position the GIF picker relative to the button
                const buttonRect = freshGifBtn.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const pickerWidth = 300;
                const pickerHeight = 450;
                
                // Calculate left position to keep picker within viewport
                let leftPos = buttonRect.left;
                if (leftPos + pickerWidth > viewportWidth - 10) {
                    leftPos = viewportWidth - pickerWidth - 10;
                }
                if (leftPos < 10) {
                    leftPos = 10;
                }
                
                // Calculate top position
                let topPos = buttonRect.bottom + 5;
                
                // If picker would go below viewport, position it above the button
                if (topPos + pickerHeight > viewportHeight - 10) {
                    topPos = buttonRect.top - pickerHeight - 5;
                }
                
                // Ensure minimum top position
                if (topPos < 10) {
                    topPos = 10;
                }
                
                gifPicker.style.left = `${leftPos}px`;
                gifPicker.style.top = `${topPos}px`;
                gifPicker.style.position = 'fixed';
                gifPicker.style.display = 'block';
                
                console.log('GIF picker position:', {
                    left: `${leftPos}px`,
                    top: `${topPos}px`,
                    viewportWidth,
                    pickerWidth,
                    buttonLeft: buttonRect.left,
                    buttonBottom: buttonRect.bottom
                });
                
                // Show categories
                gifCategories.style.display = 'block';
                
                // Load trending GIFs if grid is empty
                if (gifGrid.children.length === 0) {
                    gifLoading.style.display = 'block';
                    currentQuery = null;
                    currentOffset = 0;
                    console.log('Loading trending GIFs...');
                    const trendingGifs = await getTrendingGifs(50, 0);
                    console.log('Received', trendingGifs.length, 'trending GIFs');
                    renderGifGrid(trendingGifs, gifGrid, (gifUrl, gifTitle) => {
                        insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                        gifPicker.style.display = 'none';
                        textarea.focus();
                    });
                    gifLoading.style.display = 'none';
                    currentOffset = trendingGifs.length;
                    const loadMoreBtn = document.getElementById('comment-gif-load-more');
                    if (trendingGifs.length >= 50) {
                        loadMoreBtn.style.display = 'block';
                    } else {
                        loadMoreBtn.style.display = 'none';
                    }
                }
            }
        });
        
        // Load more button
        const loadMoreBtn = document.getElementById('comment-gif-load-more-btn');
        loadMoreBtn.addEventListener('click', async () => {
            if (isLoadingMore) return;
            isLoadingMore = true;
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
            
            try {
                let moreGifs;
                if (currentQuery) {
                    moreGifs = await searchGifs(currentQuery, 50, currentOffset);
                } else {
                    moreGifs = await getTrendingGifs(50, currentOffset);
                }
                
                if (moreGifs.length > 0) {
                    appendGifGrid(moreGifs, gifGrid, (gifUrl, gifTitle) => {
                        insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                        gifPicker.style.display = 'none';
                        textarea.focus();
                    });
                    currentOffset += moreGifs.length;
                    
                    if (moreGifs.length < 50) {
                        loadMoreBtn.style.display = 'none';
                    }
                } else {
                    loadMoreBtn.style.display = 'none';
                }
            } catch (error) {
                console.error('Error loading more GIFs:', error);
            } finally {
                isLoadingMore = false;
                loadMoreBtn.textContent = 'Load More GIFs';
                loadMoreBtn.disabled = false;
            }
        });
        
        // Search functionality
        if (gifSearchBtn) {
            gifSearchBtn.addEventListener('click', async () => {
                const query = gifSearch.value.trim();
                if (query) {
                    gifLoading.style.display = 'block';
                    gifGrid.innerHTML = '';
                    currentQuery = query;
                    currentOffset = 0;
                    const gifs = await searchGifs(query, 50, 0);
                    renderGifGrid(gifs, gifGrid, (gifUrl, gifTitle) => {
                        insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                        gifPicker.style.display = 'none';
                        textarea.focus();
                    });
                    gifLoading.style.display = 'none';
                    currentOffset = gifs.length;
                    const loadMoreBtn = document.getElementById('comment-gif-load-more');
                    if (gifs.length >= 50) {
                        loadMoreBtn.style.display = 'block';
                    } else {
                        loadMoreBtn.style.display = 'none';
                    }
                }
            });
        }
        
        // Search on Enter key
        if (gifSearch) {
            gifSearch.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const query = gifSearch.value.trim();
                    if (query) {
                        gifLoading.style.display = 'block';
                        gifGrid.innerHTML = '';
                        currentQuery = query;
                        currentOffset = 0;
                        const gifs = await searchGifs(query, 50, 0);
                        renderGifGrid(gifs, gifGrid, (gifUrl, gifTitle) => {
                            insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                            gifPicker.style.display = 'none';
                            textarea.focus();
                        });
                        gifLoading.style.display = 'none';
                        currentOffset = gifs.length;
                        const loadMoreBtn = document.getElementById('comment-gif-load-more');
                        if (gifs.length >= 50) {
                            loadMoreBtn.style.display = 'block';
                        } else {
                            loadMoreBtn.style.display = 'none';
                        }
                    }
                }
            });
        }
        
        gifPicker.addEventListener('click', e => e.stopPropagation());
        
        // Close main GIF picker when clicking outside (but not when clicking inside comments panel)
        const commentsPanel = document.getElementById('webpage-comments-panel');
        document.addEventListener('click', (e) => {
            // Don't close if clicking inside the GIF picker or GIF button
            if (gifPicker.contains(e.target) || freshGifBtn.contains(e.target)) {
                return;
            }
            // Don't close if clicking inside the comments panel
            if (commentsPanel && commentsPanel.contains(e.target)) {
                return;
            }
            // Close only if clicking outside both the picker and the comments panel
            if (gifPicker.style.display === 'block') {
                gifPicker.style.display = 'none';
            }
        });
    }

    // Delegate for reply and edit GIF pickers
    document.body.addEventListener('click', async function(e) {
        // Reply input
        if (e.target.classList.contains('reply-gif-btn')) {
            console.log('Reply GIF button clicked!');
            const container = e.target.closest('.reply-input-container');
            const picker = container.querySelector('.reply-gif-picker');
            const grid = container.querySelector('.reply-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.reply-gif-loading');
            const textarea = container.querySelector('.reply-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
        
        // Edit comment input
        if (e.target.classList.contains('edit-gif-btn')) {
            const container = e.target.closest('.edit-input-container');
            const picker = container.querySelector('.edit-gif-picker');
            const grid = container.querySelector('.edit-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.edit-gif-loading');
            const textarea = container.querySelector('.edit-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
        
        // Edit reply input
        if (e.target.classList.contains('edit-reply-gif-btn')) {
            const container = e.target.closest('.edit-reply-input-container');
            const picker = container.querySelector('.edit-reply-gif-picker');
            const grid = container.querySelector('.edit-reply-gif-grid');
            const search = container.querySelector('.gif-search-input');
            const searchBtn = container.querySelector('.gif-search-btn');
            const loading = container.querySelector('.edit-reply-gif-loading');
            const textarea = container.querySelector('.edit-textarea');
            
            picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
            
            // Load trending GIFs on first open
            if (picker.style.display === 'block' && grid.children.length === 0) {
                loading.style.display = 'block';
                const trendingGifs = await getTrendingGifs();
                renderGifGrid(trendingGifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    picker.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
            
            picker.addEventListener('click', e => e.stopPropagation());
            const closePicker = (event) => {
                if (picker.contains(event.target)) {
                    return;
                }
                if (picker.style.display === 'block') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closePicker);
            }, 10);
        }
    });
    
    // GIF Search functionality - separate event delegation
    document.body.addEventListener('click', async function(e) {
        // Handle GIF search button clicks
        if (e.target.classList.contains('gif-search-btn')) {
            const container = e.target.closest('.gif-picker, .reply-gif-picker, .edit-gif-picker, .edit-reply-gif-picker');
            const search = container.querySelector('.gif-search-input');
            const grid = container.querySelector('.gif-grid, .reply-gif-grid, .edit-gif-grid, .edit-reply-gif-grid');
            const loading = container.querySelector('.gif-loading, .reply-gif-loading, .edit-gif-loading, .edit-reply-gif-loading');
            const textarea = container.closest('.comment-input-container, .reply-input-container, .edit-input-container, .edit-reply-input-container').querySelector('textarea');
            
            const query = search.value.trim();
            if (query) {
                loading.style.display = 'block';
                const gifs = await searchGifs(query);
                renderGifGrid(gifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    container.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
        }
    });
    
    // GIF Search Enter key functionality
    document.body.addEventListener('keypress', async function(e) {
        if (e.target.classList.contains('gif-search-input') && e.key === 'Enter') {
            const container = e.target.closest('.gif-picker, .reply-gif-picker, .edit-gif-picker, .edit-reply-gif-picker');
            const search = e.target;
            const grid = container.querySelector('.gif-grid, .reply-gif-grid, .edit-gif-grid, .edit-reply-gif-grid');
            const loading = container.querySelector('.gif-loading, .reply-gif-loading, .edit-gif-loading, .edit-reply-gif-loading');
            const textarea = container.closest('.comment-input-container, .reply-input-container, .edit-input-container, .edit-reply-input-container').querySelector('textarea');
            
            const query = search.value.trim();
            if (query) {
                loading.style.display = 'block';
                const gifs = await searchGifs(query);
                renderGifGrid(gifs, grid, (gifUrl, gifTitle) => {
                    insertAtCursor(textarea, `![${gifTitle}](${gifUrl})`);
                    container.style.display = 'none';
                    textarea.focus();
                });
                loading.style.display = 'none';
            }
        }
    });
}
// === END GIF Picker Support ===

// === Comment Input Vertical Auto-Resize ===
function initializeCommentInputVerticalResize() {
    const textarea = document.getElementById('comment-input');
    if (!textarea) {
        console.log('Comment input not found for vertical resize initialization');
        return;
    }
    
    function autoResize() {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        
        // Calculate the new height based on scrollHeight
        const scrollHeight = textarea.scrollHeight;
        const minHeight = 44; // min-height from CSS
        const maxHeight = 200; // max-height from CSS
        
        // Set the height, clamped between min and max
        const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
        textarea.style.height = newHeight + 'px';
        
        // If content exceeds max height, show scrollbar
        if (scrollHeight > maxHeight) {
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.overflowY = 'hidden';
        }
    }
    
    // Resize on input
    textarea.addEventListener('input', autoResize);
    
    // Resize on paste
    textarea.addEventListener('paste', () => {
        setTimeout(autoResize, 10);
    });
    
    // Initial resize
    setTimeout(autoResize, 100);
}
// === END Comment Input Vertical Auto-Resize ===

// Initialize the panel
console.log('=== EXTENSION LOADED ===');
console.log('Content script version:', Date.now());
console.log('Reply button fix applied - version 1.1');
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('webpage-comments-panel')) {
            createCommentsPanel();
        }
    }, { once: true });
} else {
    createCommentsPanel();
}

// Listen for messages from popup to reopen panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openCommentsPanel') {
        console.log('Received request to open comments panel');
        
        // Check if panel already exists
        const existingPanel = document.getElementById('webpage-comments-panel');
        if (existingPanel) {
            console.log('Panel already exists, showing it');
            existingPanel.style.display = 'flex';
            const floatingIcon = document.getElementById('comments-floating-icon');
            if (floatingIcon) {
                floatingIcon.style.display = 'none';
            }
        } else {
            console.log('Panel does not exist, creating new one');
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (!document.getElementById('webpage-comments-panel')) {
                        createCommentsPanel();
                    }
                }, { once: true });
            } else {
                createCommentsPanel();
            }
        }
        
        sendResponse({ success: true });
    }
}); 

// Add event listener after rendering comments to handle replies toggle
function addRepliesToggleListeners() {
    console.log('=== ADDING REPLIES TOGGLE LISTENERS ===');
    const toggles = document.querySelectorAll('.replies-toggle');
    console.log('Found toggle elements:', toggles.length);
    
    if (toggles.length === 0) {
        console.error('❌ NO TOGGLE ELEMENTS FOUND!');
        console.log('All elements with "replies" in class:', 
            Array.from(document.querySelectorAll('[class*="replies"]')).map(el => ({
                element: el,
                className: el.className,
                innerHTML: el.innerHTML.substring(0, 100)
            }))
        );
        return;
    }
    
    toggles.forEach((toggle, index) => {
        console.log(`Toggle ${index}:`, {
            element: toggle,
            commentId: toggle.getAttribute('data-comment-id'),
            innerHTML: toggle.innerHTML,
            contentId: `replies-content-${toggle.getAttribute('data-comment-id')}`
        });
        
        // Remove any existing event listeners
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('=== REPLIES TOGGLE CLICKED ===');
            const commentId = this.getAttribute('data-comment-id');
            const content = document.getElementById(`replies-content-${commentId}`);
            
            console.log('Toggle clicked:', {
                commentId,
                contentElement: content,
                contentDisplay: content ? content.style.display : 'element not found',
                currentInnerHTML: this.innerHTML,
                contentComputedStyle: content ? window.getComputedStyle(content).display : 'element not found'
            });
            
            if (content) {
                const currentDisplay = content.style.display;
                const computedDisplay = window.getComputedStyle(content).display;
                
                console.log('Display states:', {
                    styleDisplay: currentDisplay,
                    computedDisplay: computedDisplay,
                    isHidden: currentDisplay === 'none' || currentDisplay === '' || computedDisplay === 'none'
                });
                
                if (currentDisplay === 'none' || currentDisplay === '' || computedDisplay === 'none') {
                    console.log('=== EXPANDING REPLIES ===');
                    
                    // Track expanded state
                    expandedReplies.add(commentId);
                    
                    // Log the content before expanding
                    console.log('Content before expanding:', {
                        innerHTML: content.innerHTML,
                        childNodes: content.childNodes.length,
                        firstChild: content.firstChild,
                        lastChild: content.lastChild
                    });
                    
                    // Clear any existing indicators first
                    const existingIndicators = content.querySelectorAll('div[data-replies-indicator="true"]');
                    existingIndicators.forEach(indicator => indicator.remove());
                    
                    // Make the content visible with proper styling
                    content.style.cssText = `
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        position: relative !important;
                        z-index: 1000 !important;
                        height: auto !important;
                        max-height: 500px !important;
                        min-height: 50px !important;
                        overflow-y: auto !important;
                        clip: auto !important;
                        clip-path: none !important;
                        background-color: #f8f9fa !important;
                        border: 1px solid #e9ecef !important;
                        border-radius: 4px !important;
                        padding: 10px !important;
                        margin-top: 5px !important;
                        margin-bottom: 5px !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        color: #333 !important;
                        font-weight: normal !important;
                        font-size: 14px !important;
                    `;
                    
                    // Update toggle icon
                    const iconEl = this.querySelector('.replies-toggle-icon');
                    if (iconEl) {
                        iconEl.textContent = '▲';
                    } else {
                        this.innerHTML = this.innerHTML.replace('▼', '▲');
                    }
                    this.classList.add('expanded');
                    
                    // Force a reflow to ensure the display change takes effect
                    content.offsetHeight;
                    
                    console.log('After expanding:', {
                        newDisplay: content.style.display,
                        newComputedDisplay: window.getComputedStyle(content).display,
                        newInnerHTML: this.innerHTML,
                        contentVisible: content.offsetHeight > 0,
                        contentHeight: content.offsetHeight,
                        contentWidth: content.offsetWidth,
                        contentTop: content.offsetTop,
                        contentLeft: content.offsetLeft,
                        contentRect: content.getBoundingClientRect(),
                        parentDisplay: content.parentElement ? window.getComputedStyle(content.parentElement).display : 'no parent',
                        parentVisibility: content.parentElement ? window.getComputedStyle(content.parentElement).visibility : 'no parent',
                        contentHTML: content.innerHTML.substring(0, 500) + '...'
                    });
                } else {
                    console.log('=== COLLAPSING REPLIES ===');
                    
                    // Track collapsed state
                    expandedReplies.delete(commentId);
                    
                    // Remove all indicators using the data attribute
                    const indicators = content.querySelectorAll('div[data-replies-indicator="true"]');
                    indicators.forEach(indicator => indicator.remove());
                    
                    content.style.display = 'none';
                    // Update toggle icon
                    const iconEl = this.querySelector('.replies-toggle-icon');
                    if (iconEl) {
                        iconEl.textContent = '▼';
                    } else {
                        this.innerHTML = this.innerHTML.replace('▲', '▼');
                    }
                    this.classList.remove('expanded');
                    console.log('After collapsing:', {
                        newDisplay: content.style.display,
                        newComputedDisplay: window.getComputedStyle(content).display,
                        newInnerHTML: this.innerHTML
                    });
                }
            } else {
                console.error('Content element not found for commentId:', commentId);
                console.log('Available elements with similar IDs:', 
                    Array.from(document.querySelectorAll('[id*="replies-content"]')).map(el => el.id)
                );
            }
        });
    });
}

// Function to restore expanded replies state
function restoreExpandedRepliesState() {
    console.log('=== RESTORING EXPANDED REPLIES STATE ===');
    console.log('Expanded replies:', Array.from(expandedReplies));
    
    expandedReplies.forEach(commentId => {
        const toggle = document.querySelector(`.replies-toggle[data-comment-id="${commentId}"]`);
        const content = document.getElementById(`replies-content-${commentId}`);
        
        if (toggle && content) {
            console.log(`Restoring expanded state for comment: ${commentId}`);
            
            // Expand the replies
            content.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: relative !important;
                z-index: 1000 !important;
                height: auto !important;
                max-height: 500px !important;
                min-height: 50px !important;
                overflow-y: auto !important;
                clip: auto !important;
                clip-path: none !important;
                background-color: #f8f9fa !important;
                border: 1px solid #e9ecef !important;
                border-radius: 4px !important;
                padding: 10px !important;
                margin-top: 5px !important;
                margin-bottom: 5px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                color: #333 !important;
                font-weight: normal !important;
                font-size: 14px !important;
            `;
            
            // Update toggle icon
            const iconEl = toggle.querySelector('.replies-toggle-icon');
            if (iconEl) {
                iconEl.textContent = '▲';
            } else {
                toggle.innerHTML = toggle.innerHTML.replace('▼', '▲');
            }
            toggle.classList.add('expanded');
        }
    });
}

// After rendering comments, call addRepliesToggleListeners
// In loadComments, after commentsList.innerHTML = renderComments(...), add:
// addRepliesToggleListeners();

// WebSocket helper functions
function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `websocket-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'comment': return '💬';
        case 'reply': return '↩️';
        case 'user-join': return '👋';
        default: return '🔔';
    }
}

function refreshComments() {
    // Reload comments without scrolling to top
    console.log('Refreshing comments with updated reply button order...');
    loadComments();
}

function updateReactionUI(data) {
    const { targetId, targetType, newCounts } = data;
    
    const targetElement = targetType === 'comment' 
        ? document.querySelector(`[data-comment-id="${targetId}"]`)
        : document.querySelector(`[data-reply-id="${targetId}"]`);
    
    if (!targetElement) return;
    
    if (targetType === 'comment') {
        const likeBtn = targetElement.querySelector('.like-btn');
        const dislikeBtn = targetElement.querySelector('.dislike-btn');
        const trustBtn = targetElement.querySelector('.trust-btn');
        const distrustBtn = targetElement.querySelector('.distrust-btn');
        const flagBtn = targetElement.querySelector('.flag-btn');
        if (likeBtn) likeBtn.innerHTML = `${getActionIcon('like', 16)} ${newCounts.likes}`;
        if (dislikeBtn) dislikeBtn.innerHTML = `${getActionIcon('dislike', 16)} ${newCounts.dislikes}`;
        if (trustBtn) trustBtn.innerHTML = `${getActionIcon('trust', 16)} ${newCounts.trusts}`;
        if (distrustBtn) distrustBtn.innerHTML = `${getActionIcon('distrust', 16)} ${newCounts.distrusts}`;
        if (flagBtn) flagBtn.innerHTML = `${getActionIcon('flag', 16)} ${newCounts.flags || 0}`;
    } else {
        const likeBtn = targetElement.querySelector('.like-reply-btn');
        const dislikeBtn = targetElement.querySelector('.dislike-reply-btn');
        const trustBtn = targetElement.querySelector('.trust-reply-btn');
        const distrustBtn = targetElement.querySelector('.distrust-reply-btn');
        const flagBtn = targetElement.querySelector('.flag-reply-btn');
        if (likeBtn) likeBtn.innerHTML = `${getActionIcon('like', 16)} ${newCounts.likes}`;
        if (dislikeBtn) dislikeBtn.innerHTML = `${getActionIcon('dislike', 16)} ${newCounts.dislikes}`;
        if (trustBtn) trustBtn.innerHTML = `${getActionIcon('trust', 16)} ${newCounts.trusts}`;
        if (distrustBtn) distrustBtn.innerHTML = `${getActionIcon('distrust', 16)} ${newCounts.distrusts}`;
        if (flagBtn) flagBtn.innerHTML = `${getActionIcon('flag', 16)} ${newCounts.flags || 0}`;
    }
}

function showTypingIndicator(data) {
    const { commentId, parentReplyId, typingUsers } = data;
    
    // Create typing indicator key
    const key = `${commentId || 'main'}-${parentReplyId || 'root'}`;
    
    // Find target container
    let container;
    if (commentId && parentReplyId !== 'root') {
        container = document.querySelector(`[data-reply-id="${parentReplyId}"]`);
    } else if (commentId) {
        container = document.querySelector(`[data-comment-id="${commentId}"]`);
    } else {
        container = document.getElementById('comments-list');
    }
    
    if (!container) return;
    
    // Remove existing typing indicator
    const existingIndicator = container.querySelector('.typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Show typing indicator if users are typing
    if (typingUsers.length > 0) {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        
        const names = typingUsers.map(u => u.user.name).join(', ');
        const verb = typingUsers.length === 1 ? 'is' : 'are';
        
        indicator.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span class="typing-text">${names} ${verb} typing...</span>
        `;
        
        container.appendChild(indicator);
    }
}

function updateActiveUsersUI(users) {
    // Update active users count in header
    const header = document.querySelector('.comments-header h3');
    if (header) {
        const count = users.length;
        const baseText = 'Comments';
        const userText = count > 0 ? ` (${count} online)` : '';
        header.textContent = baseText + userText;
    }
}

function updateActiveUsersCount(count) {
    const header = document.querySelector('.comments-header h3');
    if (header) {
        const baseText = 'Comments';
        const userText = count > 0 ? ` (${count} online)` : '';
        header.textContent = baseText + userText;
    }
}

function showCollaborativeCursor(data) {
    const { user, scrollY, viewportHeight } = data;
    
    // Remove existing cursor for this user
    const existingCursor = document.querySelector(`[data-user-id="${user.email}"]`);
    if (existingCursor) {
        existingCursor.remove();
    }
    
    // Create collaborative cursor
    const cursor = document.createElement('div');
    cursor.className = 'collaborative-cursor';
    cursor.setAttribute('data-user-id', user.email);
    cursor.innerHTML = `
        <div class="cursor-indicator"></div>
        <div class="cursor-label">${user.name}</div>
    `;
    
    // Position cursor based on scroll
    cursor.style.position = 'fixed';
    cursor.style.right = '10px';
    cursor.style.top = `${Math.min(scrollY / document.body.scrollHeight * window.innerHeight, window.innerHeight - 50)}px`;
    cursor.style.zIndex = '2147483647';
    
    document.body.appendChild(cursor);
    
    // Remove cursor after 5 seconds of inactivity
    setTimeout(() => {
        if (cursor.parentNode) {
            cursor.remove();
        }
    }, 5000);
}

// Add typing detection to input fields
function addTypingDetection() {
    document.addEventListener('input', (e) => {
        if (e.target.matches('#comment-input') || e.target.matches('.reply-input')) {
            if (!socket || !currentUser) return;
            
            // Clear existing timer
            if (typingTimer) clearTimeout(typingTimer);
            
            // Get context info
            const commentId = e.target.getAttribute('data-comment-id');
            const parentReplyId = e.target.getAttribute('data-parent-reply-id');
            
            // Emit typing start
            socket.emit('typing-start', {
                url: window.location.href,
                user: currentUser,
                commentId,
                parentReplyId
            });
            
            // Set timer to emit typing stop
            typingTimer = setTimeout(() => {
                socket.emit('typing-stop', {
                    url: window.location.href,
                    commentId,
                    parentReplyId
                });
            }, 2000);
        }
    });
}

// Add scroll tracking for collaborative cursors
function addScrollTracking() {
    let lastScrollY = 0;
    
    window.addEventListener('scroll', () => {
        if (!socket || !currentUser) return;
        
        // Clear existing timer
        if (scrollTimer) clearTimeout(scrollTimer);
        
        // Throttle scroll events
        scrollTimer = setTimeout(() => {
            const scrollY = window.scrollY;
            const viewportHeight = window.innerHeight;
            
            // Only emit if scroll position changed significantly
            if (Math.abs(scrollY - lastScrollY) > 50) {
                socket.emit('scroll-position', {
                    url: window.location.href,
                    scrollY,
                    viewportHeight
                });
                lastScrollY = scrollY;
            }
        }, 100);
    });
}

// Initialize Settings handlers
async function initializeSettingsHandlers() {
    console.log('Initializing settings handlers...');
    
    // Default settings
    const defaultSettings = {
        privacy: {
            profileVisibility: 'public',
            messagePrivacy: 'everyone',
            showEmail: false
        },
        notifications: {
            enabled: true,
            comments: true,
            replies: true,
            messages: true,
            reactions: true,
            followers: true,
            sound: true
        },
        appearance: {
            theme: 'light',
            fontSize: 'medium',
            rememberPosition: true,
            compactMode: false
        },
        comments: {
            defaultSort: 'newest',
            autoRefresh: 0,
            showReactions: true,
            showTimestamps: true,
            autoExpandReplies: false,
            filterProfanity: false
        },
        account: {
            displayName: ''
        },
        advanced: {
            server: 'auto',
            connectionTimeout: 10,
            debugMode: false
        }
    };
    
    // Load settings from storage
    let settings = defaultSettings;
    try {
        const stored = await chrome.storage.local.get(['extensionSettings']);
        if (stored.extensionSettings) {
            // Deep merge to preserve nested objects
            settings = {
                privacy: { ...defaultSettings.privacy, ...(stored.extensionSettings.privacy || {}) },
                notifications: { ...defaultSettings.notifications, ...(stored.extensionSettings.notifications || {}) },
                appearance: { ...defaultSettings.appearance, ...(stored.extensionSettings.appearance || {}) },
                comments: { ...defaultSettings.comments, ...(stored.extensionSettings.comments || {}) },
                account: { ...defaultSettings.account, ...(stored.extensionSettings.account || {}) },
                advanced: { ...defaultSettings.advanced, ...(stored.extensionSettings.advanced || {}) }
            };
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
    }
    
    // Category switching
    const categoryBtns = document.querySelectorAll('.settings-category-btn');
    const panels = document.querySelectorAll('.settings-panel');
    
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.getAttribute('data-category');
            
            // Re-apply settings to UI when switching categories to ensure values are set
            applySettingsToUI();
            
            // Update active states
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            panels.forEach(p => p.classList.remove('active'));
            const targetPanel = document.querySelector(`.settings-panel[data-panel="${category}"]`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
    
    // Load current user info for account settings
    try {
        const authResult = await chrome.storage.local.get(['user', 'isAuthenticated']);
        if (authResult.isAuthenticated && authResult.user) {
            const emailInput = document.getElementById('setting-email');
            const displayNameInput = document.getElementById('setting-display-name');
            if (emailInput) emailInput.value = authResult.user.email || '';
            if (displayNameInput) {
                displayNameInput.value = settings.account.displayName || authResult.user.name || '';
            }
        }
    } catch (e) {
        console.warn('Failed to load user info:', e);
    }
    
    // Apply loaded settings to UI
    function applySettingsToUI() {
        // Privacy
        const profileVisibility = document.getElementById('setting-profile-visibility');
        const messagePrivacy = document.getElementById('setting-message-privacy');
        const showEmail = document.getElementById('setting-show-email');
        if (profileVisibility) profileVisibility.value = settings.privacy.profileVisibility;
        if (messagePrivacy) messagePrivacy.value = settings.privacy.messagePrivacy;
        if (showEmail) showEmail.checked = settings.privacy.showEmail;
        
        // Notifications
        const notificationsEnabled = document.getElementById('setting-notifications-enabled');
        const notifyComments = document.getElementById('setting-notify-comments');
        const notifyReplies = document.getElementById('setting-notify-replies');
        const notifyMessages = document.getElementById('setting-notify-messages');
        const notifyReactions = document.getElementById('setting-notify-reactions');
        const notifyFollowers = document.getElementById('setting-notify-followers');
        const notificationSound = document.getElementById('setting-notification-sound');
        if (notificationsEnabled) notificationsEnabled.checked = settings.notifications.enabled;
        if (notifyComments) notifyComments.checked = settings.notifications.comments;
        if (notifyReplies) notifyReplies.checked = settings.notifications.replies;
        if (notifyMessages) notifyMessages.checked = settings.notifications.messages;
        if (notifyReactions) notifyReactions.checked = settings.notifications.reactions;
        if (notifyFollowers) notifyFollowers.checked = settings.notifications.followers;
        if (notificationSound) notificationSound.checked = settings.notifications.sound;
        
        // Appearance
        const theme = document.getElementById('setting-theme');
        const fontSize = document.getElementById('setting-font-size');
        const rememberPosition = document.getElementById('setting-remember-position');
        const compactMode = document.getElementById('setting-compact-mode');
        if (theme) theme.value = settings.appearance.theme;
        if (fontSize) fontSize.value = settings.appearance.fontSize;
        if (rememberPosition) rememberPosition.checked = settings.appearance.rememberPosition;
        if (compactMode) compactMode.checked = settings.appearance.compactMode;
        
        // Comments
        const defaultSort = document.getElementById('setting-default-sort');
        const autoRefresh = document.getElementById('setting-auto-refresh');
        const showReactions = document.getElementById('setting-show-reactions');
        const showTimestamps = document.getElementById('setting-show-timestamps');
        const autoExpandReplies = document.getElementById('setting-auto-expand-replies');
        const filterProfanity = document.getElementById('setting-filter-profanity');
        if (defaultSort) defaultSort.value = settings.comments.defaultSort;
        if (autoRefresh) autoRefresh.value = settings.comments.autoRefresh;
        if (showReactions) showReactions.checked = settings.comments.showReactions;
        if (showTimestamps) showTimestamps.checked = settings.comments.showTimestamps;
        if (autoExpandReplies) autoExpandReplies.checked = settings.comments.autoExpandReplies;
        if (filterProfanity) filterProfanity.checked = settings.comments.filterProfanity;
        
        // Advanced
        const server = document.getElementById('setting-server');
        const connectionTimeout = document.getElementById('setting-connection-timeout');
        const debugMode = document.getElementById('setting-debug-mode');
        if (server) server.value = settings.advanced.server;
        if (connectionTimeout) connectionTimeout.value = settings.advanced.connectionTimeout;
        if (debugMode) debugMode.checked = settings.advanced.debugMode;
    }
    
    // Save settings to storage
    async function saveSettings() {
        try {
            await chrome.storage.local.set({ extensionSettings: settings });
            console.log('Settings saved successfully');
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }
    
    // Make applySettingsToUI accessible globally for when settings section is opened
    window.applySettingsToUI = applySettingsToUI;
    
    // Apply settings on load
    applySettingsToUI();
    
    // Privacy settings handlers
    const profileVisibilityEl = document.getElementById('setting-profile-visibility');
    const messagePrivacyEl = document.getElementById('setting-message-privacy');
    const showEmailEl = document.getElementById('setting-show-email');
    
    if (profileVisibilityEl) {
        profileVisibilityEl.addEventListener('change', (e) => {
            settings.privacy.profileVisibility = e.target.value;
            saveSettings();
        });
    }
    
    if (messagePrivacyEl) {
        messagePrivacyEl.addEventListener('change', (e) => {
            settings.privacy.messagePrivacy = e.target.value;
            saveSettings();
        });
    }
    
    if (showEmailEl) {
        showEmailEl.addEventListener('change', (e) => {
            settings.privacy.showEmail = e.target.checked;
            saveSettings();
        });
    }
    
    // Notification settings handlers
    const notificationsEnabledEl = document.getElementById('setting-notifications-enabled');
    const notifyCommentsEl = document.getElementById('setting-notify-comments');
    const notifyRepliesEl = document.getElementById('setting-notify-replies');
    const notifyMessagesEl = document.getElementById('setting-notify-messages');
    const notifyReactionsEl = document.getElementById('setting-notify-reactions');
    const notifyFollowersEl = document.getElementById('setting-notify-followers');
    const notificationSoundEl = document.getElementById('setting-notification-sound');
    
    [notificationsEnabledEl, notifyCommentsEl, notifyRepliesEl, notifyMessagesEl, 
     notifyReactionsEl, notifyFollowersEl, notificationSoundEl].forEach(el => {
        if (el) {
            el.addEventListener('change', (e) => {
                const settingKey = el.id.replace('setting-', '').replace(/-/g, '');
                if (settingKey === 'notificationsenabled') {
                    settings.notifications.enabled = e.target.checked;
                } else if (settingKey === 'notifycomments') {
                    settings.notifications.comments = e.target.checked;
                } else if (settingKey === 'notifyreplies') {
                    settings.notifications.replies = e.target.checked;
                } else if (settingKey === 'notifymessages') {
                    settings.notifications.messages = e.target.checked;
                } else if (settingKey === 'notifyreactions') {
                    settings.notifications.reactions = e.target.checked;
                } else if (settingKey === 'notifyfollowers') {
                    settings.notifications.followers = e.target.checked;
                } else if (settingKey === 'notificationsound') {
                    settings.notifications.sound = e.target.checked;
                }
                saveSettings();
            });
        }
    });
    
    // Appearance settings handlers
    const themeEl = document.getElementById('setting-theme');
    const fontSizeEl = document.getElementById('setting-font-size');
    const rememberPositionEl = document.getElementById('setting-remember-position');
    const compactModeEl = document.getElementById('setting-compact-mode');
    
    if (themeEl) {
        themeEl.addEventListener('change', (e) => {
            settings.appearance.theme = e.target.value;
            saveSettings();
            // Apply theme (you can add theme switching logic here)
            applyTheme(e.target.value);
        });
    }
    
    if (fontSizeEl) {
        fontSizeEl.addEventListener('change', (e) => {
            settings.appearance.fontSize = e.target.value;
            saveSettings();
            applyFontSize(e.target.value);
        });
    }
    
    if (rememberPositionEl) {
        rememberPositionEl.addEventListener('change', (e) => {
            settings.appearance.rememberPosition = e.target.checked;
            saveSettings();
        });
    }
    
    if (compactModeEl) {
        compactModeEl.addEventListener('change', (e) => {
            settings.appearance.compactMode = e.target.checked;
            saveSettings();
            applyCompactMode(e.target.checked);
        });
    }
    
    // Comments settings handlers
    const defaultSortEl = document.getElementById('setting-default-sort');
    const autoRefreshEl = document.getElementById('setting-auto-refresh');
    const showReactionsEl = document.getElementById('setting-show-reactions');
    const showTimestampsEl = document.getElementById('setting-show-timestamps');
    const autoExpandRepliesEl = document.getElementById('setting-auto-expand-replies');
    const filterProfanityEl = document.getElementById('setting-filter-profanity');
    
    if (defaultSortEl) {
        defaultSortEl.addEventListener('change', (e) => {
            settings.comments.defaultSort = e.target.value;
            saveSettings();
            // Apply sort if on comments section
            if (currentSortBy !== e.target.value) {
                loadComments(e.target.value);
            }
        });
    }
    
    if (autoRefreshEl) {
        autoRefreshEl.addEventListener('change', (e) => {
            const interval = parseInt(e.target.value) || 0;
            settings.comments.autoRefresh = interval;
            saveSettings();
            // Clear existing interval
            if (window.commentsAutoRefreshInterval) {
                clearInterval(window.commentsAutoRefreshInterval);
            }
            // Set new interval if > 0
            if (interval > 0) {
                window.commentsAutoRefreshInterval = setInterval(() => {
                    refreshComments();
                }, interval * 1000);
            }
        });
    }
    
    [showReactionsEl, showTimestampsEl, autoExpandRepliesEl, filterProfanityEl].forEach(el => {
        if (el) {
            el.addEventListener('change', (e) => {
                const settingKey = el.id.replace('setting-', '').replace(/-/g, '');
                if (settingKey === 'showreactions') {
                    settings.comments.showReactions = e.target.checked;
                } else if (settingKey === 'showtimestamps') {
                    settings.comments.showTimestamps = e.target.checked;
                } else if (settingKey === 'autoexpandreplies') {
                    settings.comments.autoExpandReplies = e.target.checked;
                } else if (settingKey === 'filterprofanity') {
                    settings.comments.filterProfanity = e.target.checked;
                }
                saveSettings();
                // Refresh comments to apply changes
                refreshComments();
            });
        }
    });
    
    // Account settings handlers
    const displayNameEl = document.getElementById('setting-display-name');
    if (displayNameEl) {
        displayNameEl.addEventListener('blur', (e) => {
            settings.account.displayName = e.target.value;
            saveSettings();
        });
    }
    
    // Advanced settings handlers
    const serverEl = document.getElementById('setting-server');
    const connectionTimeoutEl = document.getElementById('setting-connection-timeout');
    const debugModeEl = document.getElementById('setting-debug-mode');
    
    if (serverEl) {
        serverEl.addEventListener('change', async (e) => {
            settings.advanced.server = e.target.value;
            saveSettings();
            // Apply server change
            if (e.target.value === 'local') {
                await switchToLocalServer();
            } else if (e.target.value === 'cloud') {
                await switchToCloudServer();
            } else {
                await findWorkingServer();
            }
        });
    }
    
    if (connectionTimeoutEl) {
        connectionTimeoutEl.addEventListener('change', (e) => {
            settings.advanced.connectionTimeout = parseInt(e.target.value) || 10;
            saveSettings();
        });
    }
    
    if (debugModeEl) {
        debugModeEl.addEventListener('change', (e) => {
            settings.advanced.debugMode = e.target.checked;
            saveSettings();
        });
    }
    
    // Action buttons
    const manageBlockedBtn = document.getElementById('settings-manage-blocked');
    const exportDataBtn = document.getElementById('settings-export-data');
    const clearCacheBtn = document.getElementById('settings-clear-cache');
    const deleteAccountBtn = document.getElementById('settings-delete-account');
    const resetAllBtn = document.getElementById('settings-reset-all');
    
    if (manageBlockedBtn) {
        manageBlockedBtn.addEventListener('click', () => {
            alert('Blocked users management coming soon!');
        });
    }
    
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', async () => {
            try {
                const allData = await chrome.storage.local.get(null);
                const dataStr = JSON.stringify(allData, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wavespeed-export-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                alert('Data exported successfully!');
            } catch (e) {
                console.error('Export failed:', e);
                alert('Failed to export data. Please try again.');
            }
        });
    }
    
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all cached data? This will not delete your comments or messages.')) {
                try {
                    await chrome.storage.local.remove(['trendingFilters', 'panelState', 'messagesLastSeenByOther']);
                    alert('Cache cleared successfully!');
                    location.reload();
                } catch (e) {
                    console.error('Clear cache failed:', e);
                    alert('Failed to clear cache. Please try again.');
                }
            }
        });
    }
    
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            if (confirm('⚠️ WARNING: This will permanently delete your account and all your data. This action cannot be undone!\n\nAre you absolutely sure?')) {
                if (confirm('This is your last chance. Delete account permanently?')) {
                    try {
                        // TODO: Implement account deletion API call
                        await chrome.storage.local.clear();
                        alert('Account deleted. The page will reload.');
                        location.reload();
                    } catch (e) {
                        console.error('Delete account failed:', e);
                        alert('Failed to delete account. Please try again.');
                    }
                }
            }
        });
    }
    
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset all settings to default values?')) {
                try {
                    settings = defaultSettings;
                    await chrome.storage.local.set({ extensionSettings: defaultSettings });
                    applySettingsToUI();
                    alert('All settings have been reset to default values.');
                } catch (e) {
                    console.error('Reset settings failed:', e);
                    alert('Failed to reset settings. Please try again.');
                }
            }
        });
    }
    
    // Helper functions
    function applyTheme(theme) {
        const panel = document.getElementById('webpage-comments-panel');
        if (!panel) return;
        
        if (theme === 'dark') {
            panel.classList.add('dark-theme');
        } else {
            panel.classList.remove('dark-theme');
        }
    }
    
    function applyFontSize(size) {
        const panel = document.getElementById('webpage-comments-panel');
        if (!panel) return;
        
        panel.classList.remove('font-small', 'font-medium', 'font-large');
        panel.classList.add(`font-${size}`);
    }
    
    function applyCompactMode(enabled) {
        const panel = document.getElementById('webpage-comments-panel');
        if (!panel) return;
        
        if (enabled) {
            panel.classList.add('compact-mode');
        } else {
            panel.classList.remove('compact-mode');
        }
    }
    
    // Apply initial settings
    if (settings.appearance.theme) applyTheme(settings.appearance.theme);
    if (settings.appearance.fontSize) applyFontSize(settings.appearance.fontSize);
    if (settings.appearance.compactMode) applyCompactMode(settings.appearance.compactMode);
    
    // Set up auto-refresh if enabled
    if (settings.comments.autoRefresh > 0) {
        window.commentsAutoRefreshInterval = setInterval(() => {
            refreshComments();
        }, settings.comments.autoRefresh * 1000);
    }
}

// Initialize WebSocket features
setTimeout(() => {
    addTypingDetection();
    addScrollTracking();
}, 1000);