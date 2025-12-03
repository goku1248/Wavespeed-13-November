// Utility functions module
(function(window) {
    'use strict';
    
    window.Wavespeed = window.Wavespeed || {};
    
    window.Wavespeed.Utils = {
        escapeHtml: function(input) {
            return String(input ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
        
        formatRelativeTime: function(date) {
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
        },
        
        getHostnameFromUrl: function(url) {
            if (!url) return '';
            try {
                const hostname = new URL(url).hostname || '';
                return hostname.replace(/^www\./i, '');
            } catch (error) {
                return '';
            }
        }
    };
})(window);

