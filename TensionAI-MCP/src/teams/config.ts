/**
 * Team Configuration Module - CRUD operations for team configurations
 * 
 * Supports 3-7 agents (Planner 1-2, Generator 1-2, Evaluator 1-2)
 * with model assignment per agent role.
 */

import type { TeamConfig, TeamAgent, AgentRole, PresetTemplate } from "../shared/types.js";

export { type TeamConfig, type TeamAgent };

// In-memory storage for team configurations
const teams: Map<string, TeamConfig> = new Map();

// Counter for generating team IDs
let teamIdCounter = 1;

/**
 * Type guard to validate if a string is a valid AgentRole
 */
function isValidAgentRole(role: string): role is AgentRole {
  return ["planner", "generator", "evaluator"].includes(role);
}

/**
 * Generate a unique team ID
 */
function generateTeamId(): string {
  return `team_${Date.now()}_${teamIdCounter++}`;
}

/**
 * Generate a unique agent ID
 */
function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate team configuration
 */
function validateTeamConfig(config: Partial<TeamConfig>): string[] {
  const errors: string[] = [];
  
  if (!config.name || config.name.trim().length === 0) {
    errors.push("Team name is required");
  }
  
  if (config.minAgents !== undefined) {
    if (config.minAgents < 1 || config.minAgents > 7) {
      errors.push("minAgents must be between 1 and 7");
    }
  }
  
  if (config.maxAgents !== undefined) {
    if (config.maxAgents < 1 || config.maxAgents > 7) {
      errors.push("maxAgents must be between 1 and 7");
    }
  }
  
  if (config.minAgents !== undefined && config.maxAgents !== undefined) {
    if (config.minAgents > config.maxAgents) {
      errors.push("minAgents cannot be greater than maxAgents");
    }
  }
  
  return errors;
}

/**
 * Validate agent configuration
 */
function validateAgent(agent: TeamAgent): string[] {
  const errors: string[] = [];
  
  if (!agent.role || !["planner", "generator", "evaluator"].includes(agent.role)) {
    errors.push("Agent role must be 'planner', 'generator', or 'evaluator'");
  }
  
  if (!agent.model || agent.model.trim().length === 0) {
    errors.push("Agent model is required");
  }
  
  if (!agent.provider || agent.provider.trim().length === 0) {
    errors.push("Agent provider is required");
  }
  
  if (agent.maxRetries !== undefined && (agent.maxRetries < 0 || agent.maxRetries > 10)) {
    errors.push("Agent maxRetries must be between 0 and 10");
  }
  
  return errors;
}

/**
 * Create default preset teams
 */
function createDefaultPresets(): void {
  const presetDefinitions = [
    {
      name: "Fast",
      description: "Quick response preset for simple tasks",
      agents: [
        { id: "p1", role: "planner" as AgentRole, model: "gpt-4o-mini", provider: "openai", maxRetries: 1 },
        { id: "g1", role: "generator" as AgentRole, model: "gpt-4o-mini", provider: "openai", maxRetries: 1 },
        { id: "e1", role: "evaluator" as AgentRole, model: "gpt-4o-mini", provider: "openai", maxRetries: 1 },
      ],
    },
    {
      name: "Balanced",
      description: "Standard quality preset for most tasks",
      agents: [
        { id: "p1", role: "planner" as AgentRole, model: "gpt-4o", provider: "openai", maxRetries: 2 },
        { id: "g1", role: "generator" as AgentRole, model: "gpt-4o", provider: "openai", maxRetries: 2 },
        { id: "g2", role: "generator" as AgentRole, model: "gpt-4o", provider: "openai", maxRetries: 2 },
        { id: "e1", role: "evaluator" as AgentRole, model: "gpt-4o", provider: "openai", maxRetries: 2 },
        { id: "e2", role: "evaluator" as AgentRole, model: "gpt-4o", provider: "openai", maxRetries: 2 },
      ],
    },
    {
      name: "Thorough",
      description: "Deep analysis preset for complex tasks",
      agents: [
        { id: "p1", role: "planner" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
        { id: "p2", role: "planner" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
        { id: "g1", role: "generator" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
        { id: "g2", role: "generator" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
        { id: "e1", role: "evaluator" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
        { id: "e2", role: "evaluator" as AgentRole, model: "gpt-4-turbo", provider: "openai", maxRetries: 3 },
      ],
    },
  ];
  
  for (const preset of presetDefinitions) {
    const team: TeamConfig = {
      id: `preset_${preset.name.toLowerCase()}`,
      name: preset.name,
      description: preset.description,
      agents: preset.agents,
      minAgents: preset.agents.length,
      maxAgents: preset.agents.length,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPreset: true,
    };
    teams.set(team.id, team);
  }
}

/**
 * Team Configuration Manager
 * Provides CRUD operations for team configurations
 */
export class TeamConfigManager {
  /**
   * Create a new team configuration
   */
  createTeam(config: Partial<TeamConfig>): TeamConfig {
    const errors = validateTeamConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid team configuration: ${errors.join(", ")}`);
    }
    
    const now = new Date();
    const team: TeamConfig = {
      id: generateTeamId(),
      name: config.name!,
      description: config.description,
      agents: config.agents || [],
      minAgents: config.minAgents || 1,
      maxAgents: config.maxAgents || 7,
      createdAt: now,
      updatedAt: now,
      isPreset: false,
    };
    
    // Validate all agents
    for (const agent of team.agents) {
      const agentErrors = validateAgent(agent);
      if (agentErrors.length > 0) {
        throw new Error(`Invalid agent configuration: ${agentErrors.join(", ")}`);
      }
    }
    
    // Check agent count limits
    if (team.agents.length > team.maxAgents) {
      throw new Error(`Cannot have more than ${team.maxAgents} agents`);
    }
    
    teams.set(team.id, team);
    return team;
  }
  
  /**
   * Get a team configuration by ID
   */
  getTeam(teamId: string): TeamConfig | null {
    return teams.get(teamId) || null;
  }
  
  /**
   * List all team configurations
   */
  listTeams(): TeamConfig[] {
    return Array.from(teams.values());
  }
  
  /**
   * Update a team configuration
   */
  updateTeam(teamId: string, updates: Partial<TeamConfig>): TeamConfig | null {
    const existing = teams.get(teamId);
    if (!existing) {
      return null;
    }
    
    const errors = validateTeamConfig({ ...existing, ...updates });
    if (errors.length > 0) {
      throw new Error(`Invalid team configuration: ${errors.join(", ")}`);
    }
    
    const updated: TeamConfig = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      createdAt: existing.createdAt, // Preserve creation date
      updatedAt: new Date(),
    };
    
    // Validate all agents if provided
    if (updates.agents) {
      for (const agent of updated.agents) {
        const agentErrors = validateAgent(agent);
        if (agentErrors.length > 0) {
          throw new Error(`Invalid agent configuration: ${agentErrors.join(", ")}`);
        }
      }
      
      if (updated.agents.length > updated.maxAgents) {
        throw new Error(`Cannot have more than ${updated.maxAgents} agents`);
      }
    }
    
    teams.set(teamId, updated);
    return updated;
  }
  
  /**
   * Delete a team configuration
   */
  deleteTeam(teamId: string): boolean {
    const team = teams.get(teamId);
    if (!team) {
      return false;
    }
    
    // Cannot delete preset teams
    if (team.isPreset) {
      throw new Error("Cannot delete preset team configurations");
    }
    
    return teams.delete(teamId);
  }
  
  /**
   * Add an agent to a team
   */
  addAgent(teamId: string, agent: Partial<TeamAgent>): TeamAgent | null {
    const team = teams.get(teamId);
    if (!team) {
      return null;
    }
    
    if (team.agents.length >= team.maxAgents) {
      throw new Error(`Team already has maximum ${team.maxAgents} agents`);
    }
    
    // Validate role before casting
    if (!agent.role || !isValidAgentRole(agent.role)) {
      throw new Error(`Invalid agent role: ${agent.role}. Must be "planner", "generator", or "evaluator"`);
    }

    const newAgent: TeamAgent = {
      id: generateAgentId(),
      role: agent.role,
      model: agent.model!,
      provider: agent.provider!,
      maxRetries: agent.maxRetries ?? 3,
    };
    
    const agentErrors = validateAgent(newAgent);
    if (agentErrors.length > 0) {
      throw new Error(`Invalid agent configuration: ${agentErrors.join(", ")}`);
    }
    
    team.agents.push(newAgent);
    team.updatedAt = new Date();
    teams.set(teamId, team);
    
    return newAgent;
  }
  
  /**
   * Remove an agent from a team
   */
  removeAgent(teamId: string, agentId: string): boolean {
    const team = teams.get(teamId);
    if (!team) {
      return false;
    }
    
    const index = team.agents.findIndex(a => a.id === agentId);
    if (index === -1) {
      return false;
    }
    
    if (team.agents.length <= team.minAgents) {
      throw new Error(`Team must have at least ${team.minAgents} agents`);
    }
    
    team.agents.splice(index, 1);
    team.updatedAt = new Date();
    teams.set(teamId, team);
    
    return true;
  }
  
  /**
   * Get agents in a team
   */
  getAgents(teamId: string): TeamAgent[] {
    const team = teams.get(teamId);
    return team ? team.agents : [];
  }
  
  /**
   * Get teams by agent role
   */
  getTeamsByRole(role: AgentRole): TeamConfig[] {
    return Array.from(teams.values()).filter(team => 
      team.agents.some(agent => agent.role === role)
    );
  }
  
  /**
   * Check if team has required roles
   */
  hasRequiredRoles(teamId: string, requiredRoles: AgentRole[]): boolean {
    const team = teams.get(teamId);
    if (!team) {
      return false;
    }
    
    const teamRoles = new Set(team.agents.map(a => a.role));
    return requiredRoles.every(role => teamRoles.has(role));
  }
  
  /**
   * Get team count
   */
  getTeamCount(): number {
    return teams.size;
  }
  
  /**
   * Clear all non-preset teams (for testing/reset)
   */
  clearCustomTeams(): number {
    let count = 0;
    for (const [id, team] of teams) {
      if (!team.isPreset) {
        teams.delete(id);
        count++;
      }
    }
    return count;
  }
}

// Singleton instance
let teamConfigInstance: TeamConfigManager | null = null;
let teamsInitialized: boolean = false;

export function getTeamConfig(): TeamConfigManager {
  if (!teamConfigInstance) {
    teamConfigInstance = new TeamConfigManager();
  }
  return teamConfigInstance;
}

/**
 * Initialize teams with preset configurations (only if not already initialized)
 */
export function initializeTeams(): void {
  if (teamsInitialized) {
    console.log("[Teams] Already initialized, skipping");
    return;
  }
  createDefaultPresets();
  teamsInitialized = true;
  console.log("[Teams] Initialized with preset configurations");
}

/**
 * Check if teams have been initialized
 */
export function areTeamsInitialized(): boolean {
  return teamsInitialized;
}