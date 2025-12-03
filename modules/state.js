// Shared state management module
(function(window) {
    'use strict';
    
    window.Wavespeed = window.Wavespeed || {};
    
    // State objects
    window.Wavespeed.State = {
        messagesUI: {
            activeSection: 'comments',
            selectedConversationEmail: null,
            selectedGroupId: null,
            selectedGroupName: null,
            isThreadLoading: false,
            unreadCount: 0
        },
        
        trending: {
            comments: [],
            isLoading: false,
            lastFetched: 0,
            error: null,
            metric: 'likes',
            timeRange: 'all',
            limit: 100,
            cache: {}
        },
        
        posts: {
            items: [],
            isLoading: false,
            lastFetched: 0,
            error: null,
            filter: 'all', // 'all' | 'comments' | 'replies' | 'messages'
            cache: null
        },
        
        notifications: {
            items: [],
            isLoading: false,
            lastFetched: 0,
            error: null,
            unreadCount: 0
        },
        
        followers: {
            items: [],
            isLoading: false,
            lastFetched: 0,
            error: null
        },
        
        following: {
            items: [],
            isLoading: false,
            lastFetched: 0,
            error: null,
            searchResults: []
        },
        
        profile: {
            user: null,
            profileData: {},
            isLoading: false,
            error: null,
            isOwnProfile: true
        },
        
        search: {
            query: '',
            type: 'all',
            results: [],
            isLoading: false,
            error: null
        },
        
        // Global state variables
        socket: null,
        currentUser: null,
        typingTimer: null,
        scrollTimer: null,
        currentServer: 'local',
        API_BASE_URL: null,
        SERVER_BASE_URL: null,
        currentSortBy: 'newest',
        expandedReplies: new Set(),
        followStatusCache: new Map(),
        contentSearchTimeout: null,
        followingSearchTimeout: null
    };
    
    // Initialize API_BASE_URL and SERVER_BASE_URL with defaults
    // These will be updated by the Server module when it initializes
    window.Wavespeed.State.API_BASE_URL = 'http://localhost:3001/api';
    window.Wavespeed.State.SERVER_BASE_URL = 'http://localhost:3001';
    
    // Update from Config if available
    if (window.Wavespeed && window.Wavespeed.Config && window.Wavespeed.Config.SERVERS) {
        window.Wavespeed.State.API_BASE_URL = window.Wavespeed.Config.SERVERS.local.api;
        window.Wavespeed.State.SERVER_BASE_URL = window.Wavespeed.Config.SERVERS.local.base;
    }
})(window);

