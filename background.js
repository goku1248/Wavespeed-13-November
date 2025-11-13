// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    chrome.storage.local.set({ comments: {} });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);

    // Proxy API fetches to avoid mixed content/CORS issues from HTTPS pages
    if (request.action === 'apiFetch') {
        (async () => {
            try {
                const url = request.url;
                const options = request.options || {};
                
                // Add timeout to prevent hanging requests (30 seconds)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                // Ensure headers exist and are plain object
                const headers = new Headers(options.headers || {});
                // Default JSON handling if body is object
                if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
                    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
                    options.body = JSON.stringify(options.body);
                }
                options.headers = headers;
                
                // Add abort signal to options
                options.signal = controller.signal;

                try {
                    const res = await fetch(url, options);
                    clearTimeout(timeoutId);
                    
                    const bodyText = await res.text();
                    const resHeaders = {};
                    try {
                        for (const [k, v] of res.headers.entries()) {
                            resHeaders[k] = v;
                        }
                    } catch (e) {}
                    sendResponse({
                        ok: res.ok,
                        status: res.status,
                        statusText: res.statusText,
                        headers: resHeaders,
                        body: bodyText
                    });
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    
                    // Provide better error messages for common network issues
                    let errorMessage = fetchError.message || String(fetchError);
                    
                    if (fetchError.name === 'AbortError') {
                        errorMessage = 'Request timeout - server may be unavailable or unreachable';
                    } else if (fetchError.message === 'Failed to fetch' || fetchError.message.includes('fetch')) {
                        // Check if it's a network issue
                        if (url.includes('localhost')) {
                            errorMessage = 'Failed to connect to local server. Make sure the server is running on localhost:3001';
                        } else {
                            errorMessage = 'Failed to connect to server. Please check your internet connection or try again later';
                        }
                    } else if (fetchError.message.includes('CORS')) {
                        errorMessage = 'CORS error - server may not be configured correctly';
                    } else if (fetchError.message.includes('network')) {
                        errorMessage = 'Network error - please check your internet connection';
                    }
                    
                    console.error('apiFetch error:', {
                        url,
                        error: fetchError,
                        message: errorMessage
                    });
                    sendResponse({ error: errorMessage });
                }
            } catch (error) {
                console.error('apiFetch unexpected error:', error);
                sendResponse({ error: error.message || String(error) || 'Unknown error occurred' });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === 'login') {
        console.log('Starting login process...');
        
        try {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                console.log('Auth token response:', token ? 'Token received' : 'No token');
                
                if (chrome.runtime.lastError) {
                    console.error('Auth error:', chrome.runtime.lastError);
                    sendResponse({ error: chrome.runtime.lastError.message });
                    return;
                }

                if (!token) {
                    console.error('No token received');
                    sendResponse({ error: 'No authentication token received' });
                    return;
                }

                console.log('Fetching user info...');
                fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => {
                    console.log('User info response status:', res.status);
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                    return res.json();
                })
                .then(user => {
                    console.log('User info received:', user.email);
                    chrome.storage.local.set({ user, isAuthenticated: true }, () => {
                        console.log('User info saved to storage');
                        sendResponse({ user });
                    });
                })
                .catch(error => {
                    console.error('Error fetching user info:', error);
                    sendResponse({ error: error.message });
                });
            });
        } catch (error) {
            console.error('Error in login process:', error);
            sendResponse({ error: error.message });
        }
        
        return true; // Keep the message channel open for async response
    }

    if (request.action === 'logout') {
        console.log('Starting logout process...');
        
        try {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (token) {
                    console.log('Revoking token...');
                    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
                        .then(() => {
                            console.log('Token revoked');
                            chrome.identity.removeCachedAuthToken({ token }, () => {
                                console.log('Token removed from cache');
                                chrome.storage.local.remove(['user', 'isAuthenticated'], () => {
                                    console.log('User data removed from storage');
                                    sendResponse({ success: true });
                                });
                            });
                        })
                        .catch(error => {
                            console.error('Error revoking token:', error);
                            // Still clear local storage even if token revocation fails
                            chrome.storage.local.remove(['user', 'isAuthenticated'], () => {
                                console.log('User data removed from storage');
                                sendResponse({ success: true });
                            });
                        });
                } else {
                    console.log('No token to revoke, clearing storage');
                    chrome.storage.local.remove(['user', 'isAuthenticated'], () => {
                        console.log('User data removed from storage');
                        sendResponse({ success: true });
                    });
                }
            });
        } catch (error) {
            console.error('Error in logout process:', error);
            sendResponse({ error: error.message });
        }
        
        return true;
    }
}); 