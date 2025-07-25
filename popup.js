const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const debugInfo = document.getElementById('debug-info');

function logDebug(message) {
    console.log(message);
    debugInfo.textContent += message + '\n';
}

async function updateUI() {
    logDebug('Checking authentication status...');
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['user', 'isAuthenticated'], resolve);
        });
        
        logDebug('Storage result: ' + JSON.stringify(result));
        
        if (result.isAuthenticated && result.user) {
            userInfo.classList.remove('hidden');
            loginButton.classList.add('hidden');
            logoutButton.classList.remove('hidden');

            userAvatar.src = result.user?.picture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDE0IDcgMTYuMzMgNyAxOVYyMEgxN1YxOUMxNyAxNi4zMyAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
            userName.textContent = result.user?.name || 'User';
            userEmail.textContent = result.user?.email || 'No email';
            logDebug('User is authenticated: ' + (result.user?.email || 'No email'));
        } else {
            userInfo.classList.add('hidden');
            loginButton.classList.remove('hidden');
            logoutButton.classList.add('hidden');
            logDebug('User is not authenticated');
        }
    } catch (error) {
        logDebug('Error checking auth status: ' + error.message);
    }
}

function notifyContentScripts() {
    chrome.tabs.query({}, function(tabs) {
        for (let tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { action: 'authChanged' });
            } catch (error) {
                // Tab might not have content script loaded
                console.log('Could not send message to tab:', tab.id);
            }
        }
    });
}

loginButton.addEventListener('click', async () => {
    logDebug('Login button clicked');
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'login' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        logDebug('Login response received: ' + JSON.stringify(response));
        
        if (response && response.user) {
            logDebug('Login successful for user: ' + response.user.email);
            await updateUI();
            notifyContentScripts();
        } else if (response && response.error) {
            logDebug('Login error: ' + response.error);
            alert('Login failed: ' + response.error);
        } else {
            logDebug('No response or error received');
            alert('Login failed: No response received');
        }
    } catch (error) {
        logDebug('Login error: ' + error.message);
        alert('Login failed: ' + error.message);
    }
});

logoutButton.addEventListener('click', async () => {
    logDebug('Logout button clicked');
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        logDebug('Logout response received: ' + JSON.stringify(response));
        await updateUI();
        notifyContentScripts();
    } catch (error) {
        logDebug('Logout error: ' + error.message);
        alert('Logout failed: ' + error.message);
    }
});

// Initial UI update
logDebug('Initializing popup...');
updateUI();

// Send message to content script to open comments panel
logDebug('Sending message to content script to open comments panel...');
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
        try {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'openCommentsPanel'}, function(response) {
                if (chrome.runtime.lastError) {
                    logDebug('Error sending message to content script: ' + chrome.runtime.lastError.message);
                } else {
                    logDebug('Successfully sent message to content script');
                }
            });
        } catch (error) {
            logDebug('Error sending message: ' + error.message);
        }
    } else {
        logDebug('No active tab found');
    }
}); 