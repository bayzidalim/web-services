/**
 * PollingClient Utility
 * 
 * Client-side utility for managing consistent polling intervals and handling
 * polling responses with automatic interval adjustment and error handling.
 */
class PollingClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || '/api';
    this.defaultInterval = options.defaultInterval || 30000; // 30 seconds
    this.minInterval = options.minInterval || 5000; // 5 seconds
    this.maxInterval = options.maxInterval || 300000; // 5 minutes
    this.adaptivePolling = options.adaptivePolling !== false; // Default true
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000;
    
    // Active polling sessions
    this.activeSessions = new Map();
    
    // Event handlers
    this.onUpdate = options.onUpdate || (() => {});
    this.onError = options.onError || ((error) => console.error('Polling error:', error));
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    
    // Authentication token
    this.authToken = options.authToken || null;
  }

  /**
   * Set authentication token
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Start polling for a specific endpoint
   * @param {string} sessionId - Unique session identifier
   * @param {string} endpoint - API endpoint to poll
   * @param {Object} options - Polling options
   * @returns {Object} Session control object
   */
  startPolling(sessionId, endpoint, options = {}) {
    // Stop existing session if it exists
    this.stopPolling(sessionId);

    const session = {
      id: sessionId,
      endpoint,
      interval: options.interval || this.defaultInterval,
      lastUpdate: options.lastUpdate || null,
      params: options.params || {},
      retryCount: 0,
      isActive: true,
      timeoutId: null,
      onUpdate: options.onUpdate || this.onUpdate,
      onError: options.onError || this.onError
    };

    this.activeSessions.set(sessionId, session);
    
    // Start polling immediately
    this._poll(session);
    
    this.onConnect(sessionId, endpoint);

    return {
      stop: () => this.stopPolling(sessionId),
      updateParams: (newParams) => this.updatePollingParams(sessionId, newParams),
      getStatus: () => this.getSessionStatus(sessionId)
    };
  }

  /**
   * Stop polling for a specific session
   * @param {string} sessionId - Session identifier
   */
  stopPolling(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
      this.activeSessions.delete(sessionId);
      this.onDisconnect(sessionId, session.endpoint);
    }
  }

  /**
   * Stop all active polling sessions
   */
  stopAllPolling() {
    for (const sessionId of this.activeSessions.keys()) {
      this.stopPolling(sessionId);
    }
  }

  /**
   * Update polling parameters for a session
   * @param {string} sessionId - Session identifier
   * @param {Object} newParams - New parameters
   */
  updatePollingParams(sessionId, newParams) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.params = { ...session.params, ...newParams };
    }
  }

  /**
   * Get status of a polling session
   * @param {string} sessionId - Session identifier
   * @returns {Object} Session status
   */
  getSessionStatus(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { exists: false };
    }

    return {
      exists: true,
      isActive: session.isActive,
      endpoint: session.endpoint,
      interval: session.interval,
      lastUpdate: session.lastUpdate,
      retryCount: session.retryCount
    };
  }

  /**
   * Get all active sessions
   * @returns {Array} Array of session information
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      id: session.id,
      endpoint: session.endpoint,
      interval: session.interval,
      lastUpdate: session.lastUpdate,
      retryCount: session.retryCount,
      isActive: session.isActive
    }));
  }

  /**
   * Internal polling method
   * @param {Object} session - Session object
   * @private
   */
  async _poll(session) {
    if (!session.isActive) {
      return;
    }

    try {
      const response = await this._makeRequest(session);
      
      if (response.success) {
        // Reset retry count on successful request
        session.retryCount = 0;
        
        // Update last update timestamp
        if (response.data && response.data.currentTimestamp) {
          session.lastUpdate = response.data.currentTimestamp;
        }
        
        // Adaptive interval adjustment
        if (this.adaptivePolling && response.pollingInfo) {
          const recommendedInterval = response.pollingInfo.recommendedInterval;
          if (recommendedInterval && 
              recommendedInterval >= this.minInterval && 
              recommendedInterval <= this.maxInterval) {
            session.interval = recommendedInterval;
          }
        }
        
        // Call update handler
        session.onUpdate(response.data, session.id);
        
      } else {
        throw new Error(response.error || 'Polling request failed');
      }
      
    } catch (error) {
      session.retryCount++;
      
      // Call error handler
      session.onError(error, session.id, session.retryCount);
      
      // Stop polling if max retries exceeded
      if (session.retryCount >= this.maxRetries) {
        console.error(`Max retries exceeded for session ${session.id}. Stopping polling.`);
        this.stopPolling(session.id);
        return;
      }
      
      // Increase interval on error (exponential backoff)
      session.interval = Math.min(
        session.interval * Math.pow(2, session.retryCount - 1),
        this.maxInterval
      );
    }
    
    // Schedule next poll if session is still active
    if (session.isActive) {
      session.timeoutId = setTimeout(() => this._poll(session), session.interval);
    }
  }

  /**
   * Make HTTP request to polling endpoint
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(session) {
    const url = new URL(session.endpoint, this.baseURL);
    
    // Add query parameters
    const params = { ...session.params };
    if (session.lastUpdate) {
      params.lastUpdate = session.lastUpdate;
    }
    
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const headers = {
      'Content-Type': 'application/json'
    };

    // Add authentication header if token is available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      cache: 'no-cache'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Create a resource polling session
   * @param {string} sessionId - Session identifier
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Polling options
   * @returns {Object} Session control object
   */
  pollResources(sessionId, hospitalId, options = {}) {
    const endpoint = hospitalId 
      ? `/hospitals/${hospitalId}/polling/resources`
      : '/polling/resources';
    
    return this.startPolling(sessionId, endpoint, {
      ...options,
      params: {
        ...options.params,
        hospitalId: hospitalId || undefined
      }
    });
  }

  /**
   * Create a booking polling session
   * @param {string} sessionId - Session identifier
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Polling options
   * @returns {Object} Session control object
   */
  pollBookings(sessionId, hospitalId, options = {}) {
    const endpoint = hospitalId 
      ? `/hospitals/${hospitalId}/polling/bookings`
      : '/polling/bookings';
    
    return this.startPolling(sessionId, endpoint, {
      ...options,
      params: {
        ...options.params,
        hospitalId: hospitalId || undefined
      }
    });
  }

  /**
   * Create a dashboard polling session
   * @param {string} sessionId - Session identifier
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Polling options
   * @returns {Object} Session control object
   */
  pollDashboard(sessionId, hospitalId, options = {}) {
    const endpoint = `/hospitals/${hospitalId}/polling/dashboard`;
    
    return this.startPolling(sessionId, endpoint, options);
  }

  /**
   * Create a change detection polling session
   * @param {string} sessionId - Session identifier
   * @param {number} hospitalId - Hospital ID (optional)
   * @param {Object} options - Polling options
   * @returns {Object} Session control object
   */
  pollChanges(sessionId, hospitalId = null, options = {}) {
    const endpoint = hospitalId 
      ? `/hospitals/${hospitalId}/polling/changes`
      : '/polling/changes';
    
    return this.startPolling(sessionId, endpoint, {
      ...options,
      interval: options.interval || 10000, // Faster polling for change detection
      params: {
        ...options.params,
        hospitalId: hospitalId || undefined
      }
    });
  }

  /**
   * Get polling configuration from server
   * @param {number} hospitalId - Hospital ID (optional)
   * @returns {Promise<Object>} Polling configuration
   */
  async getPollingConfig(hospitalId = null) {
    try {
      const endpoint = hospitalId 
        ? `/hospitals/${hospitalId}/polling/config`
        : '/polling/config';
      
      const session = {
        endpoint,
        params: { hospitalId: hospitalId || undefined }
      };
      
      const response = await this._makeRequest(session);
      return response;
      
    } catch (error) {
      this.onError(error, 'config-fetch', 0);
      throw error;
    }
  }

  /**
   * Check polling service health
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    try {
      const session = {
        endpoint: '/polling/health',
        params: {}
      };
      
      const response = await this._makeRequest(session);
      return response;
      
    } catch (error) {
      this.onError(error, 'health-check', 0);
      throw error;
    }
  }
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PollingClient;
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.PollingClient = PollingClient;
}