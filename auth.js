class AuthService {
    constructor() {
        this.user = null;
        this.isAuthenticated = false;
    }

    async login() {
        try {
            const authResult = await chrome.identity.getAuthToken({ interactive: true });
            if (authResult) {
                // Get user info using the access token
                const userInfo = await this.getUserInfo(authResult);
                this.user = userInfo;
                this.isAuthenticated = true;
                
                // Store user info in chrome.storage
                await chrome.storage.local.set({ 
                    user: userInfo,
                    isAuthenticated: true 
                });
                
                return userInfo;
            }
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    async logout() {
        try {
            const authToken = await chrome.identity.getAuthToken({ interactive: false });
            if (authToken) {
                // Revoke the token
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${authToken}`);
                await chrome.identity.removeCachedAuthToken({ token: authToken });
            }
            
            // Clear local storage
            await chrome.storage.local.remove(['user', 'isAuthenticated']);
            
            this.user = null;
            this.isAuthenticated = false;
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    async getUserInfo(token) {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get user info');
        }
        
        return await response.json();
    }

    async checkAuthStatus() {
        try {
            const result = await chrome.storage.local.get(['user', 'isAuthenticated']);
            this.user = result.user || null;
            this.isAuthenticated = result.isAuthenticated || false;
            return this.isAuthenticated;
        } catch (error) {
            console.error('Failed to check auth status:', error);
            return false;
        }
    }
}

// Export the auth service
const authService = new AuthService();
export default authService; 