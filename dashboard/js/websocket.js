/**
 * WebSocket Client - Handles real-time updates from the MCP Server
 * 
 * Manages:
 * - WebSocket connection lifecycle
 * - Heartbeat ping/pong (every 30 seconds)
 * - Task event subscriptions
 * - Event handlers for real-time updates
 */

class WebSocketClient {
  constructor(url = null) {
    this.url = url || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.subscribedTasks = new Set();
    this.eventHandlers = new Map();
    this.isConnecting = false;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log("[WS] Already connected or connecting");
      return;
    }

    this.isConnecting = true;
    this.updateConnectionStatus("connecting");

    try {
      this.socket = new WebSocket(this.url);
      
      this.socket.onopen = (event) => {
        console.log("[WS] Connected");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus("connected");
        this.startHeartbeat();
        this.emit("connected", event);
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.socket.onerror = (error) => {
        console.error("[WS] Error:", error);
        this.emit("error", error);
      };

      this.socket.onclose = (event) => {
        console.log("[WS] Disconnected:", event.code, event.reason);
        this.isConnecting = false;
        this.updateConnectionStatus("disconnected");
        this.stopHeartbeat();
        this.emit("disconnected", event);
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (error) {
      console.error("[WS] Failed to connect:", error);
      this.isConnecting = false;
      this.updateConnectionStatus("disconnected");
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close(1000, "Client disconnected");
      this.socket = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  /**
   * Send a message through WebSocket
   */
  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn("[WS] Cannot send - not connected");
    }
  }

  /**
   * Handle incoming message
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log("[WS] Received:", data.type);
      
      // Handle heartbeat
      if (data.type === "ws.ping") {
        this.send({ type: "ws.pong", timestamp: new Date().toISOString() });
        return;
      }

      // Emit event to handlers
      this.emit(data.type, data);
      this.emit("message", data); // General message handler
    } catch (error) {
      console.error("[WS] Failed to parse message:", error);
    }
  }

  /**
   * Subscribe to task updates
   */
  subscribeToTask(taskId) {
    this.subscribedTasks.add(taskId);
    this.send({
      type: "subscribe",
      taskId,
    });
  }

  /**
   * Unsubscribe from task updates
   */
  unsubscribeFromTask(taskId) {
    this.subscribedTasks.delete(taskId);
    this.send({
      type: "unsubscribe",
      taskId,
    });
  }

  /**
   * Start heartbeat ping every 30 seconds
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: "ws.pong", timestamp: new Date().toISOString() });
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Register event handler
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Remove event handler
   */
  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all handlers
   */
  emit(eventType, data) {
    if (this.eventHandlers.has(eventType)) {
      this.eventHandlers.get(eventType).forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[WS] Handler error for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Update connection status in UI
   */
  updateConnectionStatus(status) {
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
      statusElement.className = `status-indicator ${status}`;
      const statusText = statusElement.querySelector(".status-text");
      if (statusText) {
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      } else {
        const textNode = document.createElement("span");
        textNode.className = "status-text";
        textNode.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.appendChild(textNode);
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
const wsClient = new WebSocketClient();

// Auto-connect on page load
if (typeof window !== "undefined") {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => wsClient.connect());
  } else {
    wsClient.connect();
  }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;
window.wsClient = wsClient;