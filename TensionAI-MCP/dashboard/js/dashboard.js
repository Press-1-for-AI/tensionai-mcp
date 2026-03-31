/**
 * Dashboard Controller - Main UI logic for the TensionAI MCP Dashboard
 * 
 * Handles:
 * - Dashboard data fetching and display
 * - Task list with filtering and search
 * - Resource usage charts
 * - Provider status display
 * - "Dig deeper" debate history view
 * - Human tie-breaker intervention UI
 */

class Dashboard {
  constructor() {
    this.tasks = [];
    this.filteredTasks = [];
    this.metrics = null;
    this.providers = {};
    this.alerts = [];
    this.currentTask = null;
    this.updateInterval = null;
    this.init();
  }

  /**
   * Initialize dashboard
   */
  init() {
    console.log("[Dashboard] Initializing...");
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup WebSocket handlers
    this.setupWebSocketHandlers();
    
    // Initial data fetch
    this.refreshDashboard();
    
    // Setup auto-refresh
    this.startAutoRefresh();
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Filter by status
    const filterStatus = document.getElementById("filter-status");
    if (filterStatus) {
      filterStatus.addEventListener("change", () => this.applyFilters());
    }

    // Search tasks
    const searchInput = document.getElementById("search-tasks");
    if (searchInput) {
      searchInput.addEventListener("input", () => this.applyFilters());
    }

    // Modal close buttons
    const closeModal = document.getElementById("close-modal");
    if (closeModal) {
      closeModal.addEventListener("click", () => this.closeTaskModal());
    }

    const closeInputModal = document.getElementById("close-input-modal");
    if (closeInputModal) {
      closeInputModal.addEventListener("click", () => this.closeInputModal());
    }

    const submitAutoAssign = document.getElementById("submit-autoassign");
    if (submitAutoAssign) {
      submitAutoAssign.addEventListener("click", () => this.submitAutoAssignPrompt());
    }

    const closeTiebreaker = document.getElementById("close-tiebreaker");
    if (closeTiebreaker) {
      closeTiebreaker.addEventListener("click", () => this.closeTiebreakerModal());
    }

    // Team management event listeners
    const loadTeamsBtn = document.getElementById("load-teams-btn");
    if (loadTeamsBtn) {
      loadTeamsBtn.addEventListener("click", () => this.loadTeams());
    }

    const loadPresetsBtn = document.getElementById("load-presets-btn");
    if (loadPresetsBtn) {
      loadPresetsBtn.addEventListener("click", () => this.loadPresets());
    }

    const autoAssignBtn = document.getElementById("autoassign-btn");
    if (autoAssignBtn) {
      autoAssignBtn.addEventListener("click", () => this.testAutoAssign());
    }

    const createTeamBtn = document.getElementById("create-team-btn");
    if (createTeamBtn) {
      createTeamBtn.addEventListener("click", () => this.createTeam());
    }

    const closeTeamDetailBtn = document.getElementById("close-team-detail");
    if (closeTeamDetailBtn) {
      closeTeamDetailBtn.addEventListener("click", () => this.closeTeamDetail());
    }

    // Close modals on background click
    window.addEventListener("click", (e) => {
      const taskModal = document.getElementById("task-modal");
      const tiebreakerModal = document.getElementById("tiebreaker-modal");
      const teamDetailPanel = document.getElementById("team-detail-panel");
      
      if (e.target === taskModal) {
        this.closeTaskModal();
      }
      if (e.target === tiebreakerModal) {
        this.closeTiebreakerModal();
      }
      if (e.target === teamDetailPanel) {
        this.closeTeamDetail();
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    // Connection events
    wsClient.on("connected", (data) => {
      console.log("[Dashboard] WebSocket connected");
    });

    wsClient.on("disconnected", (data) => {
      console.log("[Dashboard] WebSocket disconnected");
    });

    // Task events
    wsClient.on("task.started", (data) => {
      console.log("[Dashboard] Task started:", data.taskId);
      this.refreshTasks();
    });

    wsClient.on("task.progress", (data) => {
      console.log("[Dashboard] Task progress:", data.taskId, data.sprintNumber);
      this.updateTaskProgress(data);
    });

    wsClient.on("task.debate", (data) => {
      console.log("[Dashboard] Task debate:", data.taskId);
      // Optionally show debate notification
    });

    wsClient.on("task.completed", (data) => {
      console.log("[Dashboard] Task completed:", data.taskId);
      this.refreshTasks();
      this.refreshMetrics();
    });

    wsClient.on("task.failed", (data) => {
      console.log("[Dashboard] Task failed:", data.taskId);
      this.refreshTasks();
    });

    // Queue and metrics
    wsClient.on("queue.updated", (data) => {
      this.updateQueueStatus(data);
    });

    wsClient.on("metrics.updated", (data) => {
      this.updateMetrics(data);
    });

    // Tiebreaker request (human intervention)
    wsClient.on("tiebreaker.request", (data) => {
      console.log("[Dashboard] Tiebreaker request:", data);
      this.showTiebreakerModal(data);
    });
  }

  /**
   * Refresh all dashboard data
   */
  async refreshDashboard() {
    try {
      await Promise.all([
        this.refreshSummary(),
        this.refreshTasks(),
        this.refreshMetrics(),
        this.refreshProviderHealth(),
        this.refreshAlerts(),
      ]);
    } catch (error) {
      console.error("[Dashboard] Error refreshing dashboard:", error);
    }
  }

  /**
   * Start auto-refresh interval
   */
  startAutoRefresh() {
    // Refresh every 30 seconds
    this.updateInterval = setInterval(() => {
      this.refreshDashboard();
    }, 30000);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ============================================================================
  // Data Refresh Methods
  // ============================================================================

  /**
   * Refresh dashboard summary
   */
  async refreshSummary() {
    try {
      const summary = await api.getDashboardSummary();
      this.updateStats(summary);
    } catch (error) {
      console.error("[Dashboard] Error fetching summary:", error);
    }
  }

  /**
   * Refresh task list
   */
  async refreshTasks() {
    try {
      this.tasks = await api.getTasks({ limit: 100 });
      this.applyFilters();
    } catch (error) {
      console.error("[Dashboard] Error fetching tasks:", error);
    }
  }

  /**
   * Refresh metrics
   */
  async refreshMetrics() {
    try {
      this.metrics = await api.getMetrics();
      this.updateCharts(this.metrics);
    } catch (error) {
      console.error("[Dashboard] Error fetching metrics:", error);
    }
  }

  /**
   * Refresh provider health
   */
  async refreshProviderHealth() {
    try {
      const health = await api.getProviderHealth();
      this.providers = health.providers || {};
      this.updateProviderStatus();
    } catch (error) {
      console.error("[Dashboard] Error fetching provider health:", error);
    }
  }

  /**
   * Refresh alerts
   */
  async refreshAlerts() {
    try {
      this.alerts = await api.getRecentAlerts(10);
      this.updateAlerts();
    } catch (error) {
      console.error("[Dashboard] Error fetching alerts:", error);
    }
  }

  // ============================================================================
  // UI Update Methods
  // ============================================================================

  /**
   * Update stats display
   */
  updateStats(summary) {
    const activeTasks = document.getElementById("active-tasks");
    const queuedTasks = document.getElementById("queued-tasks");
    const completedToday = document.getElementById("completed-today");
    const avgLatency = document.getElementById("avg-latency");
    const totalCost = document.getElementById("total-cost");

    if (activeTasks) activeTasks.textContent = summary.activeTasks || 0;
    if (queuedTasks) queuedTasks.textContent = summary.queuedTasks || 0;
    if (completedToday) completedToday.textContent = summary.completedToday || 0;
    if (avgLatency) avgLatency.textContent = `${Math.round(summary.averageLatencyMs || 0)}ms`;
    if (totalCost) totalCost.textContent = `$${(summary.totalCostToday || 0).toFixed(2)}`;
  }

  /**
   * Update provider status display
   */
  updateProviderStatus() {
    const container = document.getElementById("providers-grid");
    if (!container) return;

    const providerNames = Object.keys(this.providers);
    
    if (providerNames.length === 0) {
      container.innerHTML = '<div class="empty-state">No providers configured</div>';
      return;
    }

    container.innerHTML = providerNames.map((name) => {
      const provider = this.providers[name];
      const statusClass = provider.available ? "healthy" : "unhealthy";
      const latency = provider.latencyMs ? `${provider.latencyMs}ms` : "N/A";

      return `
        <div class="provider-card">
          <div class="provider-status ${statusClass}"></div>
          <div class="provider-info">
            <h4>${this.formatProviderName(name)}</h4>
            <p>Latency: ${latency}</p>
          </div>
        </div>
      `;
    }).join("");
  }

  /**
   * Update charts
   */
  updateCharts(metrics) {
    if (!metrics) return;

    // Token usage chart
    const inputTokens = document.getElementById("input-tokens");
    const outputTokens = document.getElementById("output-tokens");
    const inputBar = document.getElementById("input-tokens-bar");
    const outputBar = document.getElementById("output-tokens-bar");

    if (inputTokens) inputTokens.textContent = metrics.tokens?.inputTokens?.toLocaleString() || "0";
    if (outputTokens) outputTokens.textContent = metrics.tokens?.outputTokens?.toLocaleString() || "0";
    
    if (inputBar && outputBar) {
      const maxTokens = Math.max(metrics.tokens?.inputTokens || 1, metrics.tokens?.outputTokens || 1);
      inputBar.style.width = `${((metrics.tokens?.inputTokens || 0) / maxTokens) * 100}%`;
      outputBar.style.width = `${((metrics.tokens?.outputTokens || 0) / maxTokens) * 100}%`;
    }
  }

  /**
   * Update alerts display
   */
  updateAlerts() {
    const container = document.getElementById("alerts-list");
    if (!container) return;

    if (this.alerts.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent alerts</div>';
      return;
    }

    container.innerHTML = this.alerts.map((alert) => `
      <div class="alert-item ${alert.severity || "info"}">
        <div class="alert-header">
          <span class="alert-type">${alert.type || "Alert"}</span>
          <span class="alert-time">${this.formatTime(alert.timestamp)}</span>
        </div>
        <p class="alert-message">${alert.message || alert.error || "No details"}</p>
      </div>
    `).join("");
  }

  /**
   * Update task progress from WebSocket
   */
  updateTaskProgress(data) {
    const taskItem = document.querySelector(`[data-task-id="${data.taskId}"]`);
    if (taskItem) {
      const statusElement = taskItem.querySelector(".task-status");
      if (statusElement) {
        statusElement.textContent = `Sprint ${data.sprintNumber}`;
        statusElement.className = "task-status running";
      }
    }
  }

  /**
   * Update queue status from WebSocket
   */
  updateQueueStatus(data) {
    const activeTasks = document.getElementById("active-tasks");
    const queuedTasks = document.getElementById("queued-tasks");
    
    if (activeTasks) activeTasks.textContent = data.processing || 0;
    if (queuedTasks) queuedTasks.textContent = data.queued || 0;
  }

  /**
   * Update metrics from WebSocket
   */
  updateMetrics(data) {
    this.metrics = {
      tokens: {
        inputTokens: data.totalTokens,
        outputTokens: Math.floor(data.totalTokens * 0.3),
      },
      averageDurationMs: data.averageLatencyMs,
    };
    this.updateCharts(this.metrics);
  }

  // ============================================================================
  // Task List Methods
  // ============================================================================

  /**
   * Apply filters to task list
   */
  applyFilters() {
    const statusFilter = document.getElementById("filter-status")?.value || "";
    const searchTerm = document.getElementById("search-tasks")?.value?.toLowerCase() || "";

    this.filteredTasks = this.tasks.filter((task) => {
      // Status filter
      if (statusFilter && task.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchFields = [task.id, task.prompt, task.output].filter(Boolean).join(" ");
        if (!searchFields.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    this.renderTaskList();
  }

  /**
   * Render task list
   */
  renderTaskList() {
    const container = document.getElementById("task-list");
    if (!container) return;

    if (this.filteredTasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p>No tasks found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.filteredTasks.map((task) => `
      <div class="task-item" data-task-id="${task.id}">
        <div class="task-item-header">
          <span class="task-id">${this.truncateId(task.id)}</span>
          <span class="task-status ${task.status}">${task.status}</span>
        </div>
        <p class="task-prompt">${this.escapeHtml(task.prompt || task.output || "No content")}</p>
        <div class="task-meta">
          ${task.metrics ? `<span>Duration: ${Math.round(task.metrics.totalDurationMs / 1000)}s</span>` : ""}
          ${task.metrics ? `<span>Tokens: ${task.metrics.totalTokensUsed?.toLocaleString() || 0}</span>` : ""}
          ${task.metrics ? `<span>Cost: $${(task.metrics.totalCostUsd || 0).toFixed(4)}</span>` : ""}
        </div>
        <div class="task-actions">
          <button class="btn" onclick="dashboard.showTaskDetails('${task.id}')">View Details</button>
        </div>
      </div>
    `).join("");
  }

  /**
   * Show task details modal with "dig deeper" view
   */
  async showTaskDetails(taskId) {
    try {
      const task = await api.getTask(taskId);
      const debate = await api.getDebateHistory(taskId);
      
      this.currentTask = { task, debate };
      
      const modal = document.getElementById("task-modal");
      const modalTitle = document.getElementById("modal-title");
      const modalBody = document.getElementById("modal-body");

      if (modal && modalTitle && modalBody) {
        modalTitle.textContent = `Task: ${this.truncateId(taskId)}`;
        
        // Build modal content with clean summary + "dig deeper" option
        modalBody.innerHTML = `
          <div class="task-detail-content">
            <!-- Clean Summary View -->
            <div class="debate-summary">
              <h4>Summary</h4>
              <p>${task.output ? this.escapeHtml(task.output.substring(0, 500)) : "No output yet"}</p>
              <div class="task-meta">
                <span>Status: <strong>${task.status}</strong></span>
                ${task.metrics ? `<span>Sprints: ${task.metrics.sprintsCompleted || 0}</span>` : ""}
                ${task.metrics ? `<span>Retries: ${task.metrics.retries || 0}</span>` : ""}
              </div>
            </div>

            <!-- "Dig Deeper" Section -->
            <div class="debate-rounds">
              <h4>Debate History</h4>
              ${debate.rounds && debate.rounds.length > 0 ? `
                <p>Click "Dig Deeper" to view full debate details</p>
                ${debate.rounds.map((round) => `
                  <div class="round-item">
                    <div class="round-header">
                      <span class="round-number">Round ${round.roundNumber}</span>
                      <span class="round-status ${round.passed ? 'passed' : 'failed'}">
                        ${round.passed ? 'Passed' : 'In Progress'}
                      </span>
                    </div>
                    <div class="round-details">
                      Attempts: ${round.attempts || 1} | Duration: ${Math.round((round.durationMs || 0) / 1000)}s
                    </div>
                  </div>
                `).join("")}
              ` : `
                <p>No debate rounds recorded yet.</p>
              `}
            </div>
          </div>
        `;

        modal.classList.remove("hidden");
      }
    } catch (error) {
      console.error("[Dashboard] Error loading task details:", error);
    }
  }

  /**
   * Close task modal
   */
  closeTaskModal() {
    const modal = document.getElementById("task-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
    this.currentTask = null;
  }

  // ============================================================================
  // Tie-breaker Methods
  // ============================================================================

  /**
   * Show tiebreaker modal
   */
  showTiebreakerModal(data) {
    const modal = document.getElementById("tiebreaker-modal");
    const modalBody = document.getElementById("tiebreaker-body");

    if (modal && modalBody) {
      modalBody.innerHTML = `
        <div class="tiebreaker-content">
          <p class="tiebreaker-reason"><strong>Reason:</strong> ${this.escapeHtml(data.reason)}</p>
          
          <div class="tiebreaker-options">
            <h4>Select your decision:</h4>
            ${(data.options || ["Option A", "Option B"]).map((option, idx) => `
              <div class="tiebreaker-option" data-option="${option}">
                <p>${this.escapeHtml(option)}</p>
              </div>
            `).join("")}
          </div>

          <h4>Provide rationale:</h4>
          <textarea class="rationale-input" id="tiebreaker-rationale" placeholder="Explain your decision..."></textarea>
          
          <button class="btn btn-primary submit-btn" onclick="dashboard.submitTiebreaker('${data.taskId}')">
            Submit Decision
          </button>
        </div>
      `;

      // Setup option selection
      const options = modalBody.querySelectorAll(".tiebreaker-option");
      options.forEach((option) => {
        option.addEventListener("click", () => {
          options.forEach((o) => o.classList.remove("selected"));
          option.classList.add("selected");
        });
      });

      modal.classList.remove("hidden");
    }
  }

  /**
   * Submit tiebreaker decision
   */
  async submitTiebreaker(taskId) {
    const modalBody = document.getElementById("tiebreaker-body");
    const selectedOption = modalBody?.querySelector(".tiebreaker-option.selected");
    const rationaleInput = document.getElementById("tiebreaker-rationale");

    if (!selectedOption) {
      alert("Please select an option");
      return;
    }

    if (!rationaleInput?.value.trim()) {
      alert("Please provide a rationale");
      return;
    }

    try {
      await api.submitTiebreaker(
        taskId,
        selectedOption.dataset.option,
        rationaleInput.value
      );
      
      this.closeTiebreakerModal();
      alert("Decision submitted successfully!");
    } catch (error) {
      console.error("[Dashboard] Error submitting tiebreaker:", error);
      alert("Failed to submit decision: " + error.message);
    }
  }

  /**
   * Close tiebreaker modal
   */
  closeTiebreakerModal() {
    const modal = document.getElementById("tiebreaker-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  // ============================================================================
  // Team Management Methods
  // ============================================================================

  /**
   * Load and display team configurations
   */
  async loadTeams() {
    try {
      const teams = await api.getTeams();
      this.renderTeams(teams);
    } catch (error) {
      console.error("[Dashboard] Failed to load teams:", error);
      this.showError("Failed to load teams: " + error.message);
    }
  }

  /**
   * Render teams grid
   */
  renderTeams(teams) {
    const grid = document.getElementById("teams-grid");
    if (!grid) return;

    if (!teams || teams.length === 0) {
      grid.innerHTML = '<div class="empty-state">No teams configured</div>';
      return;
    }

    grid.innerHTML = teams.map(team => `
      <div class="team-card">
        <div class="team-card-header">
          <span class="team-card-name">${this.escapeHtml(team.name)}</span>
          <span class="team-card-badge ${team.isPreset ? 'preset' : 'custom'}">
            ${team.isPreset ? 'Preset' : 'Custom'}
          </span>
        </div>
        <div class="team-card-desc">${this.escapeHtml(team.description || 'No description')}</div>
        <div class="team-agents-list">
          ${team.agents.map(agent => `
            <div class="team-agent">
              <span class="team-agent-role">${agent.role}</span>
              <span class="team-agent-model">${this.escapeHtml(agent.model)}</span>
            </div>
          `).join('')}
        </div>
        <div class="team-card-actions">
          <button class="btn btn-secondary" onclick="dashboard.viewTeamDetail('${team.id}')">View</button>
          ${!team.isPreset ? `<button class="btn btn-danger" onclick="dashboard.deleteTeam('${team.id}')">Delete</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  /**
   * Load and display preset templates
   */
  async loadPresets() {
    try {
      const presets = await api.getTeamPresets();
      this.renderPresets(presets);
    } catch (error) {
      console.error("[Dashboard] Failed to load presets:", error);
      this.showError("Failed to load presets: " + error.message);
    }
  }

  /**
   * Render presets grid
   */
  renderPresets(presets) {
    const grid = document.getElementById("presets-grid");
    if (!grid) return;

    if (!presets || presets.length === 0) {
      grid.innerHTML = '<div class="empty-state">No presets available</div>';
      return;
    }

    grid.innerHTML = presets.map(preset => `
      <div class="preset-card" onclick="dashboard.selectPreset('${preset.name}')">
        <div class="preset-header">
          <span class="preset-name">${preset.name.charAt(0).toUpperCase() + preset.name.slice(1)}</span>
          <span class="preset-badge recommended">${preset.agentCount} agents</span>
        </div>
        <div class="preset-description">${this.escapeHtml(preset.description)}</div>
        <div class="preset-meta">
          <span>Max Sprints: ${preset.maxSprints}</span>
          <span>Retries: ${preset.maxRetriesPerSprint}</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * Test auto-assignment with a sample prompt
   */
  async testAutoAssign() {
    // Show modal input instead of prompt()
    const modal = document.getElementById("input-modal");
    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  /**
   * Close input modal
   */
  closeInputModal() {
    const modal = document.getElementById("input-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  /**
   * Submit auto-assign prompt from modal
   */
  async submitAutoAssignPrompt() {
    const promptInput = document.getElementById("autoassign-prompt");
    const prompt = promptInput?.value;
    
    this.closeInputModal();
    
    if (!prompt) return;

    try {
      const result = await api.autoAssignTeam(prompt);
      this.showAutoAssignResult(result);
    } catch (error) {
      console.error("[Dashboard] Auto-assign failed:", error);
      this.showError("Auto-assign failed: " + error.message);
    }
  }

  /**
   * Display auto-assignment result
   */
  showAutoAssignResult(result) {
    const confidenceClass = result.confidence >= 0.8 ? 'high' : result.confidence >= 0.5 ? 'medium' : 'low';
    
    const resultHtml = `
      <div class="autoassign-result">
        <div class="autoassign-header">
          <span class="autoassign-team">${this.escapeHtml(result.teamName)}</span>
          <span class="autoassign-confidence ${confidenceClass}">
            ${Math.round(result.confidence * 100)}% confidence
          </span>
        </div>
        <div class="autoassign-type">Task Type: ${result.taskType}</div>
        <div class="autoassign-reasoning">${this.escapeHtml(result.reasoning)}</div>
      </div>
    `;
    
    // Add to teams section or show in modal
    const teamsSection = document.querySelector(".teams-section");
    if (teamsSection) {
      const existingResult = teamsSection.querySelector(".autoassign-result");
      if (existingResult) existingResult.remove();
      teamsSection.insertAdjacentHTML("beforeend", resultHtml);
    }
  }

  /**
   * View team details
   */
  async viewTeamDetail(teamId) {
    try {
      const team = await api.getTeam(teamId);
      this.renderTeamDetail(team);
    } catch (error) {
      console.error("[Dashboard] Failed to get team details:", error);
      this.showError("Failed to get team details: " + error.message);
    }
  }

  /**
   * Render team detail panel
   */
  renderTeamDetail(team) {
    const panel = document.getElementById("team-detail-panel");
    const title = document.getElementById("team-detail-title");
    const body = document.getElementById("team-detail-body");
    
    if (!panel || !title || !body) return;

    title.textContent = team.name;
    body.innerHTML = `
      <div class="team-detail-info">
        <p><strong>Description:</strong> ${this.escapeHtml(team.description || 'N/A')}</p>
        <p><strong>Agents:</strong> ${team.agents.length}</p>
        <p><strong>Min Agents:</strong> ${team.minAgents}</p>
        <p><strong>Max Agents:</strong> ${team.maxAgents}</p>
        <p><strong>Created:</strong> ${new Date(team.createdAt).toLocaleString()}</p>
      </div>
      <h4>Agents</h4>
      <div class="team-agents-list">
        ${team.agents.map(agent => `
          <div class="team-agent">
            <span class="team-agent-role">${agent.role}</span>
            <span class="team-agent-model">${this.escapeHtml(agent.model)} (${agent.provider})</span>
          </div>
        `).join('')}
      </div>
    `;
    
    panel.classList.remove("hidden");
  }

  /**
   * Close team detail panel
   */
  closeTeamDetail() {
    const panel = document.getElementById("team-detail-panel");
    if (panel) {
      panel.classList.add("hidden");
    }
  }

  /**
   * Create a new team
   */
  async createTeam() {
    const nameInput = document.getElementById("new-team-name");
    const descInput = document.getElementById("new-team-desc");
    
    const name = nameInput?.value?.trim();
    if (!name) {
      this.showError("Team name is required");
      return;
    }

    try {
      const team = await api.createTeam({
        name,
        description: descInput?.value,
        agents: [],
        minAgents: 1,
        maxAgents: 7,
      });
      
      // Clear inputs
      if (nameInput) nameInput.value = "";
      if (descInput) descInput.value = "";
      
      // Reload teams
      await this.loadTeams();
      
      this.showSuccess(`Team "${team.name}" created successfully`);
    } catch (error) {
      console.error("[Dashboard] Failed to create team:", error);
      this.showError("Failed to create team: " + error.message);
    }
  }

  /**
   * Delete a team
   */
  async deleteTeam(teamId) {
    if (!confirm("Are you sure you want to delete this team?")) {
      return;
    }

    try {
      await api.deleteTeam(teamId);
      await this.loadTeams();
      this.showSuccess("Team deleted successfully");
    } catch (error) {
      console.error("[Dashboard] Failed to delete team:", error);
      this.showError("Failed to delete team: " + error.message);
    }
  }

  /**
   * Show success message (simple alert for now)
   */
  showSuccess(message) {
    console.log("[Dashboard] Success:", message);
    // Could implement a toast notification here
    alert("Success: " + message);
  }

  /**
   * Show error message
   */
  showError(message) {
    console.error("[Dashboard] Error:", message);
    alert("Error: " + message);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format provider name for display
   */
  formatProviderName(name) {
    return name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Format timestamp
   */
  formatTime(timestamp) {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  /**
   * Truncate task ID for display
   */
  truncateId(id) {
    if (!id) return "N/A";
    return id.length > 12 ? id.substring(0, 8) + "..." + id.substring(id.length - 4) : id;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize dashboard when DOM is ready
let dashboard;

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      dashboard = new Dashboard();
      window.dashboard = dashboard;
    });
  } else {
    dashboard = new Dashboard();
    window.dashboard = dashboard;
  }
}

export default Dashboard;