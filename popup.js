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
    chrome.storage.local.get(['user', 'isAuthenticated'], (result) => {
        logDebug('Storage result: ' + JSON.stringify(result));
        if (result.isAuthenticated && result.user) {
            userInfo.classList.remove('hidden');
            loginButton.classList.add('hidden');
            logoutButton.classList.remove('hidden');

            userAvatar.src = result.user.picture;
            userName.textContent = result.user.name;
            userEmail.textContent = result.user.email;
            logDebug('User is authenticated');
        } else {
            userInfo.classList.add('hidden');
            loginButton.classList.remove('hidden');
            logoutButton.classList.add('hidden');
            logDebug('User is not authenticated');
        }
    });
}

function notifyContentScripts() {
    chrome.tabs.query({}, function(tabs) {
        for (let tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { action: 'authChanged' });
        }
    });
}

loginButton.addEventListener('click', () => {
    logDebug('Login button clicked');
    chrome.runtime.sendMessage({ action: 'login' }, (response) => {
        logDebug('Login response received: ' + JSON.stringify(response));
        if (response && response.user) {
            updateUI();
            notifyContentScripts();
        } else if (response && response.error) {
            logDebug('Login error: ' + response.error);
            alert('Login failed: ' + response.error);
        } else {
            logDebug('No response or error received');
        }
    });
});

logoutButton.addEventListener('click', () => {
    logDebug('Logout button clicked');
    chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
        logDebug('Logout response received: ' + JSON.stringify(response));
        updateUI();
        notifyContentScripts();
    });
});

// Initial UI update
logDebug('Initializing popup...');
updateUI(); 