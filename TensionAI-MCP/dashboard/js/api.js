/**
 * API Client - Handles HTTP requests to the MCP Server API
 * 
 * Provides methods for:
 * - Task management (list, create, get details, abort)
 * - Provider information
 * - Metrics and queue status
 * - Dashboard summary
 * - Debate history
 */

const API_BASE = window.location.origin;

class APIClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request to the API
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[API] Request failed:`, error);
      throw error;
    }
  }

  // ============================================================================
  // Task Endpoints
  // ============================================================================

  /**
   * Get all tasks with optional filtering
   */
  async getTasks(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.append("status", options.status);
    if (options.limit) params.append("limit", options.limit.toString());
    
    const query = params.toString();
    return this.request(`/api/tasks${query ? `?${query}` : ""}`);
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId) {
    return this.request(`/api/tasks/${taskId}`);
  }

  /**
   * Create a new task
   */
  async createTask(taskData) {
    return this.request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Abort a running task
   */
  async abortTask(taskId) {
    return this.request(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get debate history for a task ("dig deeper" view)
   */
  async getDebateHistory(taskId) {
    return this.request(`/api/tasks/${taskId}/debate`);
  }

  /**
   * Submit human tie-breaker decision
   */
  async submitTiebreaker(taskId, decision, rationale) {
    return this.request(`/api/tasks/${taskId}/tiebreaker`, {
      method: "POST",
      body: JSON.stringify({ decision, rationale }),
    });
  }

  // ============================================================================
  // Provider Endpoints
  // ============================================================================

  /**
   * Get all providers
   */
  async getProviders() {
    return this.request("/api/providers");
  }

  /**
   * Get provider health status
   */
  async getProviderHealth() {
    return this.request("/api/providers/health");
  }

  // ============================================================================
  // Metrics Endpoints
  // ============================================================================

  /**
   * Get aggregate metrics
   */
  async getMetrics() {
    return this.request("/api/metrics");
  }

  /**
   * Get metrics by provider
   */
  async getMetricsByProvider() {
    return this.request("/api/metrics/by-provider");
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(limit = 50) {
    return this.request(`/api/metrics/history?limit=${limit}`);
  }

  // ============================================================================
  // Queue Endpoints
  // ============================================================================

  /**
   * Get queue status
   */
  async getQueueStatus() {
    return this.request("/api/queue/status");
  }

  /**
   * Get queue configuration
   */
  async getQueueConfig() {
    return this.request("/api/queue/config");
  }

  // ============================================================================
  // Dashboard Endpoints
  // ============================================================================

  /**
   * Get dashboard summary
   */
  async getDashboardSummary() {
    return this.request("/api/dashboard/summary");
  }

  // ============================================================================
  // Alert Endpoints
  // ============================================================================

  /**
   * Get active alerts
   */
  async getAlerts() {
    return this.request("/api/alerts");
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit = 50) {
    return this.request(`/api/alerts/recent?limit=${limit}`);
  }

  /**
   * Get alert statistics
   */
  async getAlertStats() {
    return this.request("/api/alerts/stats");
  }

  // ============================================================================
  // System Endpoints
  // ============================================================================

  /**
   * Get server info
   */
  async getInfo() {
    return this.request("/api/info");
  }

  /**
   * Health check
   */
  async healthCheck() {
    return this.request("/health");
  }

  // ============================================================================
  // Team Management Endpoints
  // ============================================================================

  /**
   * Get all team configurations
   */
  async getTeams() {
    return this.request("/api/teams");
  }

  /**
   * Get a specific team by ID
   */
  async getTeam(teamId) {
    return this.request(`/api/teams/${teamId}`);
  }

  /**
   * Create a new team configuration
   */
  async createTeam(teamData) {
    return this.request("/api/teams", {
      method: "POST",
      body: JSON.stringify(teamData),
    });
  }

  /**
   * Update a team configuration
   */
  async updateTeam(teamId, teamData) {
    return this.request(`/api/teams/${teamId}`, {
      method: "PUT",
      body: JSON.stringify(teamData),
    });
  }

  /**
   * Delete a team configuration
   */
  async deleteTeam(teamId) {
    return this.request(`/api/teams/${teamId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get agents in a team
   */
  async getTeamAgents(teamId) {
    return this.request(`/api/teams/${teamId}/agents`);
  }

  /**
   * Add an agent to a team
   */
  async addTeamAgent(teamId, agentData) {
    return this.request(`/api/teams/${teamId}/agents`, {
      method: "POST",
      body: JSON.stringify(agentData),
    });
  }

  /**
   * Remove an agent from a team
   */
  async removeTeamAgent(teamId, agentId) {
    return this.request(`/api/teams/${teamId}/agents/${agentId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get all preset templates
   */
  async getTeamPresets() {
    return this.request("/api/teams/presets");
  }

  /**
   * Get specific preset configuration
   */
  async getPreset(presetName) {
    return this.request(`/api/teams/presets/${presetName}`);
  }

  /**
   * Auto-assign team based on prompt
   */
  async autoAssignTeam(prompt, userId, projectId) {
    return this.request("/api/teams/autoassign", {
      method: "POST",
      body: JSON.stringify({ prompt, userId, projectId }),
    });
  }

  /**
   * Detect task type from prompt
   */
  async detectTaskType(prompt) {
    return this.request("/api/teams/detect", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  }

  /**
   * Override team assignment
   */
  async setTeamOverride(userId, teamId, options = {}) {
    return this.request("/api/teams/override", {
      method: "POST",
      body: JSON.stringify({ userId, teamId, ...options }),
    });
  }

  /**
   * Get user override
   */
  async getTeamOverride(userId, projectId) {
    const params = new URLSearchParams();
    params.append("userId", userId);
    if (projectId) params.append("projectId", projectId);
    return this.request(`/api/teams/override?${params.toString()}`);
  }

  /**
   * Remove user override
   */
  async removeTeamOverride(userId, projectId) {
    const params = new URLSearchParams();
    params.append("userId", userId);
    if (projectId) params.append("projectId", projectId);
    return this.request(`/api/teams/override?${params.toString()}`, {
      method: "DELETE",
    });
  }

  /**
   * Get team recommendations
   */
  async getTeamRecommendations(prompt, options = {}) {
    return this.request("/api/teams/recommend", {
      method: "POST",
      body: JSON.stringify({ prompt, ...options }),
    });
  }
}

// Export singleton instance
const api = new APIClient();

// Export for use in other modules
window.APIClient = APIClient;
window.api = api;