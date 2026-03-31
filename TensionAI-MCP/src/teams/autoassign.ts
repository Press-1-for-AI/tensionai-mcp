/**
 * Auto-Assignment Module
 * 
 * Handles task type detection and best team assignment based on task characteristics.
 * Supports: coding, writing, research, analysis, general
 */

import type { TaskType, AutoAssignResult, AgentRole } from "../shared/types.js";
import { getTeamConfig, type TeamConfigManager } from "./config.js";
import { getTeamPresets, type TeamPresetManager } from "./presets.js";
import { getUserOverrideManager, type UserOverrideManager } from "./override.js";

export { type TaskType, type AutoAssignResult };

// Task type keywords for detection
const TASK_KEYWORDS: Record<TaskType, string[]> = {
  coding: [
    "code", "implement", "function", "class", "debug", "fix", "bug", "refactor",
    "api", "endpoint", "database", "query", "algorithm", "refactor", "test",
    "typescript", "javascript", "python", "java", "rust", "go", "programming",
    "developer", "software", "web", "frontend", "backend", "fullstack",
  ],
  writing: [
    "write", "document", "documentation", "article", "blog", "post", "content",
    "draft", "compose", "describe", "explain", "tutorial", "guide", "readme",
    "markdown", "prose", "narrative", "story", "summary", "outline",
  ],
  research: [
    "research", "investigate", "explore", "find", "search", "analyze",
    "study", "compare", "review", "evaluate", "benchmark", "survey",
    "discover", "learn", "understand", "information", "data", "report",
  ],
  analysis: [
    "analyze", "review", "audit", "assess", "evaluate", "examine",
    "inspect", "check", "test", "validate", "verify", "compare",
    "diagnose", "optimize", "improve", "performance", "security",
  ],
  general: [],
};

// Confidence thresholds
const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.5;
const LOW_CONFIDENCE = 0.3;

// Fallback team configurations
const DEFAULT_TEAM_MAPPING: Record<TaskType, string> = {
  coding: "preset_balanced",
  writing: "preset_fast",
  research: "preset_thorough",
  analysis: "preset_balanced",
  general: "preset_balanced",
};

/**
 * Task type detection result
 */
export interface TaskDetectionResult {
  taskType: TaskType;
  confidence: number;
  matchedKeywords: string[];
  reasoning: string;
}

/**
 * Auto-Assignment Manager
 * Handles task type detection and team assignment
 */
export class AutoAssignManager {
  private teamConfig: TeamConfigManager;
  private presetManager: TeamPresetManager;
  private overrideManager: UserOverrideManager;
  
  constructor(
    teamConfig?: TeamConfigManager,
    presetManager?: TeamPresetManager,
    overrideManager?: UserOverrideManager
  ) {
    this.teamConfig = teamConfig || getTeamConfig();
    this.presetManager = presetManager || getTeamPresets();
    this.overrideManager = overrideManager || getUserOverrideManager();
  }
  
  /**
   * Detect task type from prompt
   */
  detectTaskType(prompt: string): TaskDetectionResult {
    const promptLower = prompt.toLowerCase();
    const scores: Partial<Record<TaskType, number>> = {};
    const matchedKeywords: Partial<Record<TaskType, string[]>> = {};
    
    // Calculate scores for each task type
    for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS) as [TaskType, string[]][]) {
      scores[taskType] = 0;
      matchedKeywords[taskType] = [];
      
      for (const keyword of keywords) {
        if (promptLower.includes(keyword)) {
          scores[taskType]!++;
          matchedKeywords[taskType]!.push(keyword);
        }
      }
    }
    
    // Find the task type with highest score
    let maxScore = 0;
    let detectedType: TaskType = "general";
    
    for (const [taskType, score] of Object.entries(scores) as [TaskType, number][]) {
      if (score > maxScore) {
        maxScore = score;
        detectedType = taskType;
      }
    }
    
    // Calculate confidence
    const totalKeywords = Object.values(TASK_KEYWORDS).flat().length;
    const confidence = maxScore / Math.max(1, (TASK_KEYWORDS[detectedType] || []).length);
    
    // If no keywords matched, default to general
    if (maxScore === 0) {
      detectedType = "general";
    }
    
    // Generate reasoning
    const reasoning = this.generateReasoning(detectedType, matchedKeywords[detectedType] || [], confidence);
    
    return {
      taskType: detectedType,
      confidence,
      matchedKeywords: matchedKeywords[detectedType] || [],
      reasoning,
    };
  }
  
  /**
   * Generate reasoning for detection
   */
  private generateReasoning(taskType: TaskType, matchedKeywords: string[], confidence: number): string {
    if (matchedKeywords.length === 0) {
      return "No specific keywords detected. Defaulting to general task type.";
    }
    
    const keywordList = matchedKeywords.slice(0, 5).join(", ");
    const confidenceLevel = confidence >= HIGH_CONFIDENCE ? "high" : confidence >= MEDIUM_CONFIDENCE ? "medium" : "low";
    
    return `Detected ${taskType} task with ${confidenceLevel} confidence. Matched keywords: ${keywordList}`;
  }
  
  /**
   * Get recommended team for task type
   */
  getRecommendedTeamId(taskType: TaskType): string {
    return DEFAULT_TEAM_MAPPING[taskType];
  }
  
  /**
   * Auto-assign team based on prompt and optional user context
   */
  autoAssign(
    prompt: string,
    userId?: string,
    projectId?: string
  ): AutoAssignResult {
    // First check for user override
    if (userId || projectId) {
      const override = this.overrideManager.getOverride(userId!, projectId!);
      if (override) {
        const team = this.teamConfig.getTeam(override.teamId);
        if (team) {
          return {
            teamId: override.teamId,
            teamName: team.name,
            taskType: override.taskType || "general",
            confidence: 1.0,
            reasoning: "Using user-specified team override",
          };
        }
      }
    }
    
    // Detect task type
    const detection = this.detectTaskType(prompt);
    
    // Get recommended team
    const teamId = this.getRecommendedTeamId(detection.taskType);
    const team = this.teamConfig.getTeam(teamId);
    
    if (!team) {
      // Fallback to balanced preset if team not found
      const fallback = this.teamConfig.getTeam("preset_balanced");
      return {
        teamId: fallback?.id || "preset_balanced",
        teamName: fallback?.name || "Balanced",
        taskType: detection.taskType,
        confidence: LOW_CONFIDENCE,
        reasoning: "Team not found. Using fallback to balanced preset.",
      };
    }
    
    return {
      teamId: team.id,
      teamName: team.name,
      taskType: detection.taskType,
      confidence: detection.confidence,
      reasoning: detection.reasoning,
    };
  }
  
  /**
   * Get alternative teams for a task type
   */
  getAlternativeTeams(taskType: TaskType): Array<{
    teamId: string;
    teamName: string;
    agentCount: number;
    recommended: boolean;
  }> {
    const alternatives: Array<{
      teamId: string;
      teamName: string;
      agentCount: number;
      recommended: boolean;
    }> = [];
    
    // Get all preset teams
    const teams = this.teamConfig.listTeams();
    const recommendedId = this.getRecommendedTeamId(taskType);
    
    for (const team of teams) {
      if (team.isPreset) {
        alternatives.push({
          teamId: team.id,
          teamName: team.name,
          agentCount: team.agents.length,
          recommended: team.id === recommendedId,
        });
      }
    }
    
    return alternatives;
  }
  
  /**
   * Get team recommendations based on multiple factors
   */
  getRecommendations(
    prompt: string,
    options?: {
      userId?: string;
      projectId?: string;
      preferredSpeed?: "fast" | "balanced" | "thorough";
      requiredRoles?: AgentRole[];
    }
  ): {
    primary: AutoAssignResult;
    alternatives: AutoAssignResult[];
    factors: string[];
  } {
    const factors: string[] = [];
    
    // Check user override first
    if (options?.userId || options?.projectId) {
      const override = this.overrideManager.getOverride(options.userId!, options.projectId!);
      if (override) {
        const team = this.teamConfig.getTeam(override.teamId);
        if (team) {
          factors.push("User override applied");
          return {
            primary: {
              teamId: override.teamId,
              teamName: team.name,
              taskType: override.taskType || "general",
              confidence: 1.0,
              reasoning: "Using user-specified team override",
            },
            alternatives: [],
            factors,
          };
        }
      }
    }
    
    // Check speed preference
    if (options?.preferredSpeed) {
      const presetTeamId = `preset_${options.preferredSpeed}`;
      const team = this.teamConfig.getTeam(presetTeamId);
      if (team) {
        factors.push(`Speed preference: ${options.preferredSpeed}`);
        return {
          primary: {
            teamId: team.id,
            teamName: team.name,
            taskType: "general",
            confidence: 0.7,
            reasoning: `Selected ${options.preferredSpeed} preset based on user preference`,
          },
          alternatives: [],
          factors,
        };
      }
    }
    
    // Auto-detect from prompt
    const detection = this.detectTaskType(prompt);
    factors.push(`Detected task type: ${detection.taskType}`);
    
    // Check required roles
    if (options?.requiredRoles && options.requiredRoles.length > 0) {
      const teams = this.teamConfig.listTeams();
      const validTeams = teams.filter(t => 
        t.isPreset && this.teamConfig.hasRequiredRoles(t.id, options.requiredRoles!)
      );
      
      if (validTeams.length > 0) {
        const best = validTeams[0];
        factors.push(`Required roles matched: ${options.requiredRoles.join(", ")}`);
        return {
          primary: {
            teamId: best.id,
            teamName: best.name,
            taskType: detection.taskType,
            confidence: detection.confidence,
            reasoning: detection.reasoning + " (roles matched)",
          },
          alternatives: validTeams.slice(1).map(t => ({
            teamId: t.id,
            teamName: t.name,
            taskType: detection.taskType,
            confidence: detection.confidence * 0.8,
            reasoning: "Alternative team with required roles",
          })),
          factors,
        };
      }
    }
    
    // Default auto-assignment
    const primary = this.autoAssign(prompt, options?.userId, options?.projectId);
    
    // Get alternatives
    const alternatives = this.getAlternativeTeams(detection.taskType)
      .filter(t => t.teamId !== primary.teamId)
      .slice(0, 2)
      .map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        taskType: detection.taskType,
        confidence: detection.confidence * 0.7,
        reasoning: `Alternative team: ${t.teamName}`,
      }));
    
    return {
      primary,
      alternatives,
      factors,
    };
  }
  
  /**
   * Validate that a team can handle a task type
   */
  validateTeamForTask(teamId: string, taskType: TaskType): {
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const team = this.teamConfig.getTeam(teamId);
    if (!team) {
      return {
        compatible: false,
        issues: ["Team not found"],
        recommendations: [],
      };
    }
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check agent count for task complexity
    const minAgentsForType: Record<TaskType, number> = {
      coding: 3,
      writing: 3,
      research: 5,
      analysis: 5,
      general: 3,
    };
    
    if (team.agents.length < minAgentsForType[taskType]) {
      issues.push(`Team has ${team.agents.length} agents, but ${taskType} tasks recommended ${minAgentsForType[taskType]}+`);
      recommendations.push("Consider using a larger team for better results");
    }
    
    // Check role coverage
    const requiredRoles: AgentRole[] = ["planner", "generator", "evaluator"];
    const hasAllRoles = requiredRoles.every(role => 
      team.agents.some(agent => agent.role === role)
    );
    
    if (!hasAllRoles) {
      issues.push("Team is missing required agent roles (planner, generator, evaluator)");
      recommendations.push("Ensure team has all three agent roles for proper task handling");
    }
    
    return {
      compatible: issues.length === 0,
      issues,
      recommendations,
    };
  }
}

// Singleton instance
let autoAssignInstance: AutoAssignManager | null = null;

export function getAutoAssignManager(): AutoAssignManager {
  if (!autoAssignInstance) {
    autoAssignInstance = new AutoAssignManager();
  }
  return autoAssignInstance;
}

// Convenience function
export function autoAssignTeam(
  prompt: string,
  userId?: string,
  projectId?: string
): AutoAssignResult {
  return getAutoAssignManager().autoAssign(prompt, userId, projectId);
}

export function detectTaskType(prompt: string): TaskDetectionResult {
  return getAutoAssignManager().detectTaskType(prompt);
}