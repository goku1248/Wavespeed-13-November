// Server management module
(function(window) {
    'use strict';
    
    if (!window.Wavespeed) {
        console.error('Wavespeed namespace not found. Load config.js and state.js first.');
        return;
    }
    
    const Config = window.Wavespeed.Config;
    const State = window.Wavespeed.State;
    
    window.Wavespeed.Server = {
        // Background-proxied fetch to avoid mixed content/CORS on HTTPS pages
        backgroundFetch: async function(url, options = {}) {
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
        },
        
        // Server health check
        checkServerHealth: async function(serverKey) {
            if (serverKey === 'cloud' && !Config.CLOUD_SERVER_ENABLED) {
                console.log('☁️ Cloud server disabled; skipping health check.');
                return false;
            }
            const server = Config.SERVERS[serverKey];
            if (!server) return false;
            
            try {
                const response = await this.backgroundFetch(`${server.base}/health`, { method: 'GET' });
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
        },
        
        // Update server status indicator UI
        updateServerStatusIndicator: function() {
            const indicator = document.getElementById('server-status-indicator');
            if (!indicator) return;
            
            const dot = indicator.querySelector('.status-dot');
            const text = indicator.querySelector('.status-text');
            
            if (State.currentServer === 'local') {
                if (dot) dot.className = 'status-dot status-local';
                if (text) text.textContent = 'Local';
                indicator.title = 'Connected to Local Server';
            } else if (State.currentServer === 'cloud') {
                if (dot) dot.className = 'status-dot status-cloud';
                if (text) text.textContent = 'Cloud';
                indicator.title = 'Connected to Cloud Server';
            }
        },
        
        // Try to find a working server
        findWorkingServer: async function() {
            // Try local first
            console.log('🔍 Checking local server...');
            if (await this.checkServerHealth('local')) {
                State.currentServer = 'local';
                State.API_BASE_URL = Config.SERVERS.local.api;
                State.SERVER_BASE_URL = Config.SERVERS.local.base;
                console.log(`✅ Using ${Config.SERVERS.local.name}`);
                await chrome.storage.local.set({ activeServer: 'local' });
                this.updateServerStatusIndicator();
                return true;
            }
            
            // Fallback to cloud
            if (!Config.CLOUD_SERVER_ENABLED) {
                console.warn('☁️ Cloud server fallback disabled. No other servers available.');
                return false;
            }
            console.log('🔍 Checking cloud server...');
            if (await this.checkServerHealth('cloud')) {
                State.currentServer = 'cloud';
                State.API_BASE_URL = Config.SERVERS.cloud.api;
                State.SERVER_BASE_URL = Config.SERVERS.cloud.base;
                console.log(`✅ Using ${Config.SERVERS.cloud.name}`);
                await chrome.storage.local.set({ activeServer: 'cloud' });
                this.updateServerStatusIndicator();
                return true;
            }
            
            console.log('❌ No servers available');
            return false;
        },
        
        // API fetch with automatic fallback
        apiFetch: async function(url, options = {}, retryCount = 0) {
            const self = this;
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
                                    if (typeof window.showNotification === 'function') {
                                        window.showNotification('Extension reloaded - Please refresh the page', 'error');
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
                        if (response.error && retryCount === 0 && Config.CLOUD_SERVER_ENABLED) {
                            console.warn(`${Config.SERVERS[State.currentServer].name} failed, trying fallback...`);
                            
                            // Try to find a working server
                            const foundServer = await self.findWorkingServer();
                            if (foundServer && State.currentServer !== (url.includes('localhost') ? 'local' : 'cloud')) {
                                // Server changed, retry with new server
                                console.log(`🔄 Retrying request with ${Config.SERVERS[State.currentServer].name}`);
                                
                                // Update URL to use new server
                                const newUrl = url.replace(Config.SERVERS.local.api, State.API_BASE_URL).replace(Config.SERVERS.cloud.api, State.API_BASE_URL);
                                
                                try {
                                    const retryResult = await self.apiFetch(newUrl, options, retryCount + 1);
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
                    if (retryCount === 0 && Config.CLOUD_SERVER_ENABLED) {
                        console.warn('Network error, trying fallback server...');
                        const foundServer = await self.findWorkingServer();
                        if (foundServer) {
                            const newUrl = url.replace(Config.SERVERS.local.api, State.API_BASE_URL).replace(Config.SERVERS.cloud.api, State.API_BASE_URL);
                            try {
                                const retryResult = await self.apiFetch(newUrl, options, retryCount + 1);
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
        },
        
        // Initialize server on load
        initialize: async function() {
            try {
                // Check stored preference
                const stored = await chrome.storage.local.get(['activeServer']);
                if (stored.activeServer && Config.SERVERS[stored.activeServer]) {
                    State.currentServer = (!Config.CLOUD_SERVER_ENABLED && stored.activeServer === 'cloud') ? 'local' : stored.activeServer;
                    State.API_BASE_URL = Config.SERVERS[State.currentServer].api;
                    State.SERVER_BASE_URL = Config.SERVERS[State.currentServer].base;
                    
                    // Verify the stored server is actually available, if not, find working one
                    const isHealthy = await this.checkServerHealth(State.currentServer);
                    if (!isHealthy) {
                        console.warn(`⚠️ Stored server (${Config.SERVERS[State.currentServer].name}) is not available, finding alternative...`);
                        await this.findWorkingServer();
                    }
                } else {
                    // No stored preference, find working server
                    await this.findWorkingServer();
                }
            } catch (e) {
                console.warn('Could not load server preference:', e);
                // On error, try to find working server
                await this.findWorkingServer();
            }
        }
    };
    
    // Initialize server on module load
    window.Wavespeed.Server.initialize();
})(window);

