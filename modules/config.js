// Configuration constants module
(function(window) {
    'use strict';
    
    window.Wavespeed = window.Wavespeed || {};
    
    window.Wavespeed.Config = {
        CLOUD_SERVER_ENABLED: false,
        
        SERVERS: {
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
        },
        
        TRENDING_CACHE_DURATION: 60 * 1000, // 1 minute cache
        
        TRENDING_METRIC_OPTIONS: [
            { value: 'likes', label: 'Likes' },
            { value: 'dislikes', label: 'Dislikes' },
            { value: 'trusts', label: 'Trusted' },
            { value: 'distrusts', label: 'Mistrusted' },
            { value: 'flags', label: 'Flagged' }
        ],
        
        TRENDING_TIME_RANGE_OPTIONS: [
            { value: 'all', label: 'All time' },
            { value: '24h', label: 'Last 24 hours' },
            { value: '3d', label: 'Last 3 days' },
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: '1y', label: 'Last 12 months' }
        ],
        
        get TRENDING_METRIC_LABELS() {
            return this.TRENDING_METRIC_OPTIONS.reduce((acc, option) => {
                acc[option.value] = option.label;
                return acc;
            }, {});
        },
        
        get TRENDING_TIME_RANGE_LABELS() {
            return this.TRENDING_TIME_RANGE_OPTIONS.reduce((acc, option) => {
                acc[option.value] = option.label;
                return acc;
            }, {});
        }
    };
})(window);

