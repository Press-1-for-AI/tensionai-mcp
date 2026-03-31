/**
 * User Override Module
 * 
 * Allows users to override auto-assigned team configurations.
 * Stores override preferences per user/project.
 */

import type { UserOverride, TaskType, TeamConfig } from "../shared/types.js";
import { getTeamConfig, type TeamConfigManager } from "./config.js";

export { type UserOverride };

// In-memory storage for user overrides
const userOverrides: Map<string, UserOverride> = new Map();

// Generate override ID
function generateOverrideId(): string {
  return `override_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Generate storage key from userId and projectId
function getOverrideKey(userId: string, projectId?: string): string {
  return projectId ? `${userId}:${projectId}` : userId;
}

/**
 * User Override Manager
 * Manages user preferences for team assignment overrides
 */
export class UserOverrideManager {
  private teamConfig: TeamConfigManager;
  
  constructor(teamConfig?: TeamConfigManager) {
    this.teamConfig = teamConfig || getTeamConfig();
  }
  
  /**
   * Set a team override for a user/project
   */
  setOverride(
    userId: string,
    teamId: string,
    options?: {
      projectId?: string;
      taskType?: TaskType;
      expiresAt?: Date;
    }
  ): UserOverride {
    // Validate team exists
    const team = this.teamConfig.getTeam(teamId);
    if (!team) {
      throw new Error(`Team '${teamId}' not found`);
    }
    
    // Validate task type if provided
    if (options?.taskType && !["coding", "writing", "research", "analysis", "general"].includes(options.taskType)) {
      throw new Error(`Invalid task type: ${options.taskType}`);
    }
    
    const now = new Date();
    const override: UserOverride = {
      id: generateOverrideId(),
      userId,
      projectId: options?.projectId,
      teamId,
      taskType: options?.taskType,
      createdAt: now,
      expiresAt: options?.expiresAt,
    };
    
    // Store with both user-level and project-level keys
    const userKey = getOverrideKey(userId);
    const projectKey = options?.projectId ? getOverrideKey(userId, options.projectId) : null;
    
    if (projectKey) {
      // Project-specific override takes precedence
      userOverrides.set(projectKey, override);
    }
    
    // Also store user-level override (for default when no project override)
    userOverrides.set(userKey, override);
    
    return override;
  }
  
  /**
   * Get override for a user (optionally project-specific)
   */
  getOverride(userId: string, projectId?: string): UserOverride | null {
    // First try project-specific override
    if (projectId) {
      const projectKey = getOverrideKey(userId, projectId);
      const projectOverride = userOverrides.get(projectKey);
      
      if (projectOverride && !this.isExpired(projectOverride)) {
        return projectOverride;
      }
    }
    
    // Fall back to user-level override
    const userKey = getOverrideKey(userId);
    const userOverride = userOverrides.get(userKey);
    
    if (userOverride && !this.isExpired(userOverride)) {
      return userOverride;
    }
    
    return null;
  }
  
  /**
   * Check if override is expired
   */
  private isExpired(override: UserOverride): boolean {
    if (!override.expiresAt) return false;
    return override.expiresAt < new Date();
  }
  
  /**
   * Remove override for a user/project
   */
  removeOverride(userId: string, projectId?: string): boolean {
    const key = getOverrideKey(userId, projectId);
    return userOverrides.delete(key);
  }
  
  /**
   * Clear all overrides for a user
   */
  clearUserOverrides(userId: string): number {
    let count = 0;
    const userPrefix = userId;
    
    for (const key of userOverrides.keys()) {
      if (key === userPrefix || key.startsWith(userPrefix + ":")) {
        userOverrides.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Get all overrides for a user
   */
  getAllOverrides(userId: string): UserOverride[] {
    const overrides: UserOverride[] = [];
    
    for (const override of userOverrides.values()) {
      if (override.userId === userId && !this.isExpired(override)) {
        overrides.push(override);
      }
    }
    
    return overrides;
  }
  
  /**
   * List all active overrides
   */
  listOverrides(): UserOverride[] {
    const overrides: UserOverride[] = [];
    
    for (const override of userOverrides.values()) {
      if (!this.isExpired(override)) {
        overrides.push(override);
      }
    }
    
    return overrides;
  }
  
  /**
   * Get override count
   */
  getOverrideCount(): number {
    let count = 0;
    for (const override of userOverrides.values()) {
      if (!this.isExpired(override)) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * Clear all expired overrides
   */
  clearExpired(): number {
    let count = 0;
    
    for (const [key, override] of userOverrides) {
      if (this.isExpired(override)) {
        userOverrides.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Get team for override
   */
  getTeamForOverride(override: UserOverride): TeamConfig | null {
    return this.teamConfig.getTeam(override.teamId);
  }
  
  /**
   * Check if user has any override
   */
  hasOverride(userId: string, projectId?: string): boolean {
    return this.getOverride(userId, projectId) !== null;
  }
  
  /**
   * Update override expiration
   */
  updateExpiration(overrideId: string, expiresAt: Date): UserOverride | null {
    for (const override of userOverrides.values()) {
      if (override.id === overrideId) {
        override.expiresAt = expiresAt;
        return override;
      }
    }
    return null;
  }
  
  /**
   * Get overrides expiring soon (within hours)
   */
  getExpiringOverrides(hours: number = 24): UserOverride[] {
    const soon = new Date(Date.now() + hours * 60 * 60 * 1000);
    const expiring: UserOverride[] = [];
    
    for (const override of userOverrides.values()) {
      if (override.expiresAt && override.expiresAt <= soon && override.expiresAt > new Date()) {
        expiring.push(override);
      }
    }
    
    return expiring;
  }
}

// Singleton instance
let overrideManagerInstance: UserOverrideManager | null = null;

export function getUserOverrideManager(): UserOverrideManager {
  if (!overrideManagerInstance) {
    overrideManagerInstance = new UserOverrideManager();
  }
  return overrideManagerInstance;
}

// Convenience functions
export function setUserOverride(
  userId: string,
  teamId: string,
  options?: {
    projectId?: string;
    taskType?: TaskType;
    expiresAt?: Date;
  }
): UserOverride {
  return getUserOverrideManager().setOverride(userId, teamId, options);
}

export function getUserOverride(userId: string, projectId?: string): UserOverride | null {
  return getUserOverrideManager().getOverride(userId, projectId);
}

export function removeUserOverride(userId: string, projectId?: string): boolean {
  return getUserOverrideManager().removeOverride(userId, projectId);
}