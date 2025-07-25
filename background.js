// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    chrome.storage.local.set({ comments: {} });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);

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