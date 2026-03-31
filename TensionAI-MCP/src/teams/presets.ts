/**
 * Team Preset Templates Module
 * 
 * Provides preset configurations for different quality/performance needs:
 * - fast: Quick response preset (3 agents, minimal retries)
 * - balanced: Standard quality preset (5 agents, moderate retries)
 * - thorough: Deep analysis preset (7 agents, max retries)
 * - custom: User-defined template
 */

import type { TeamConfig, TeamAgent, PresetTemplate, AgentRole, ProviderName } from "../shared/types.js";
import type { TeamConfigManager } from "./config.js";

export { type PresetTemplate };

// Default provider for presets
const DEFAULT_PROVIDER: ProviderName = "openai";
const DEFAULT_MODEL = "gpt-4o";

// Alternative models for different providers
type ModelMap = Record<PresetTemplate, string>;

const MODELS: Record<string, ModelMap> = {
  openai: {
    fast: "gpt-4o-mini",
    balanced: "gpt-4o",
    thorough: "gpt-4-turbo",
    custom: "gpt-4o",
  },
  anthropic: {
    fast: "claude-3-haiku-20240307",
    balanced: "claude-3-sonnet-20240229",
    thorough: "claude-3-opus-20240229",
    custom: "claude-3-sonnet-20240229",
  },
  minimax: {
    fast: "abab6.5s-chat",
    balanced: "abab6.5g-chat",
    thorough: "abab6.5s-chat",
    custom: "abab6.5g-chat",
  },
  gemini: {
    fast: "gemini-1.5-flash",
    balanced: "gemini-1.5-pro",
    thorough: "gemini-1.5-pro",
    custom: "gemini-1.5-pro",
  },
  "local-vllm": {
    fast: "llama3:8b",
    balanced: "llama3:70b",
    thorough: "llama3:70b",
    custom: "llama3:70b",
  },
  "local-llama": {
    fast: "llama3:8b",
    balanced: "llama3:70b",
    thorough: "llama3:70b",
    custom: "llama3:70b",
  },
};

/**
 * Get model for preset and provider
 */
function getModelForPreset(preset: PresetTemplate, provider: ProviderName = DEFAULT_PROVIDER): string {
  const providerModels = MODELS[provider] || MODELS.openai;
  return providerModels[preset] || DEFAULT_MODEL;
}

/**
 * Create preset agents based on template type
 */
function createPresetAgents(
  preset: PresetTemplate, 
  provider: ProviderName = DEFAULT_PROVIDER
): TeamAgent[] {
  const model = getModelForPreset(preset, provider);
  const agents: TeamAgent[] = [];
  
  switch (preset) {
    case "fast":
      // Minimal team: 1 planner, 1 generator, 1 evaluator
      agents.push(
        { id: "p1", role: "planner", model, provider, maxRetries: 1 },
        { id: "g1", role: "generator", model, provider, maxRetries: 1 },
        { id: "e1", role: "evaluator", model, provider, maxRetries: 1 }
      );
      break;
      
    case "balanced":
      // Standard team: 1 planner, 2 generators, 2 evaluators
      agents.push(
        { id: "p1", role: "planner", model, provider, maxRetries: 2 },
        { id: "g1", role: "generator", model, provider, maxRetries: 2 },
        { id: "g2", role: "generator", model, provider, maxRetries: 2 },
        { id: "e1", role: "evaluator", model, provider, maxRetries: 2 },
        { id: "e2", role: "evaluator", model, provider, maxRetries: 2 }
      );
      break;
      
    case "thorough":
      // Full team: 2 planners, 2 generators, 2 evaluators, 1 coordinator
      agents.push(
        { id: "p1", role: "planner", model, provider, maxRetries: 3 },
        { id: "p2", role: "planner", model, provider, maxRetries: 3 },
        { id: "g1", role: "generator", model, provider, maxRetries: 3 },
        { id: "g2", role: "generator", model, provider, maxRetries: 3 },
        { id: "e1", role: "evaluator", model, provider, maxRetries: 3 },
        { id: "e2", role: "evaluator", model, provider, maxRetries: 3 }
      );
      break;
      
    case "custom":
      // Empty - user will fill in
      break;
  }
  
  return agents;
}

// Preset definitions
const PRESET_DEFINITIONS: Record<PresetTemplate, {
  description: string;
  agentCount: number;
  maxSprints: number;
  maxRetriesPerSprint: number;
  recommendedFor: string[];
}> = {
  fast: {
    description: "Quick response preset for simple tasks. Minimal agents with fast models.",
    agentCount: 3,
    maxSprints: 5,
    maxRetriesPerSprint: 1,
    recommendedFor: ["simple bug fixes", "small code changes", "quick questions"],
  },
  balanced: {
    description: "Standard quality preset for most tasks. Balanced agent count and retries.",
    agentCount: 5,
    maxSprints: 10,
    maxRetriesPerSprint: 2,
    recommendedFor: ["feature development", "code reviews", "documentation"],
  },
  thorough: {
    description: "Deep analysis preset for complex tasks. Maximum agents with thorough evaluation.",
    agentCount: 6,
    maxSprints: 15,
    maxRetriesPerSprint: 3,
    recommendedFor: ["architectural changes", "security audits", "complex refactoring"],
  },
  custom: {
    description: "Custom team configuration. User-defined agent count and roles.",
    agentCount: 0,
    maxSprints: 10,
    maxRetriesPerSprint: 2,
    recommendedFor: [],
  },
};

/**
 * Team Preset Manager
 * Manages preset templates and custom template creation
 */
export class TeamPresetManager {
  private customTemplates: Map<string, TeamConfig> = new Map();
  
  /**
   * Get a preset definition
   */
  getPreset(preset: PresetTemplate): {
    name: PresetTemplate;
    description: string;
    agentCount: number;
    maxSprints: number;
    maxRetriesPerSprint: number;
    recommendedFor: string[];
  } | null {
    const def = PRESET_DEFINITIONS[preset];
    if (!def) return null;
    return {
      name: preset,
      ...def,
    };
  }
  
  /**
   * Get agents for a preset
   */
  getPresetAgents(preset: PresetTemplate, provider?: ProviderName): TeamAgent[] {
    return createPresetAgents(preset, provider);
  }
  
  /**
   * Get full preset config including agents
   */
  getPresetConfig(preset: PresetTemplate, provider?: ProviderName): TeamConfig {
    const definition = PRESET_DEFINITIONS[preset];
    const agents = createPresetAgents(preset, provider);
    const model = getModelForPreset(preset, provider);
    
    return {
      id: `preset_${preset}`,
      name: preset.charAt(0).toUpperCase() + preset.slice(1),
      description: definition.description,
      agents,
      minAgents: definition.agentCount,
      maxAgents: definition.agentCount,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPreset: true,
    };
  }
  
  /**
   * Get all presets (for listing)
   */
  getAllPresets(): Array<{
    name: PresetTemplate;
    description: string;
    agentCount: number;
    maxSprints: number;
    maxRetriesPerSprint: number;
    recommendedFor: string[];
  }> {
    return Object.entries(PRESET_DEFINITIONS)
      .filter(([name]) => name !== "custom")
      .map(([name, def]) => ({
        name: name as PresetTemplate,
        ...def,
      }));
  }
  
  /**
   * Create a custom template from an existing team
   */
  createCustomTemplate(name: string, team: TeamConfig): TeamConfig {
    const template: TeamConfig = {
      ...team,
      id: `custom_${Date.now()}`,
      name: `${name} (Custom Template)`,
      description: `Custom template created from team: ${team.name}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPreset: false,
    };
    
    this.customTemplates.set(template.id, template);
    return template;
  }
  
  /**
   * Get custom templates
   */
  getCustomTemplates(): TeamConfig[] {
    return Array.from(this.customTemplates.values());
  }
  
  /**
   * Delete a custom template
   */
  deleteCustomTemplate(templateId: string): boolean {
    if (!templateId.startsWith("custom_")) {
      return false;
    }
    return this.customTemplates.delete(templateId);
  }
  
  /**
   * Get recommended preset based on task complexity hint
   */
  getRecommendedPreset(taskHint?: string): PresetTemplate {
    if (!taskHint) {
      return "balanced";
    }
    
    const hint = taskHint.toLowerCase();
    
    // Simple/fast indicators
    if (
      hint.includes("simple") ||
      hint.includes("quick") ||
      hint.includes("fix") ||
      hint.includes("small") ||
      hint.includes("typo")
    ) {
      return "fast";
    }
    
    // Complex/thorough indicators
    if (
      hint.includes("complex") ||
      hint.includes("architect") ||
      hint.includes("security") ||
      hint.includes("refactor") ||
      hint.includes("audit") ||
      hint.includes("design")
    ) {
      return "thorough";
    }
    
    // Default to balanced
    return "balanced";
  }
  
  /**
   * Get presets available for a specific provider
   */
  getPresetsForProvider(provider: ProviderName): Array<{
    name: PresetTemplate;
    model: string;
    description: string;
  }> {
    const providerModels = MODELS[provider] || MODELS.openai;
    
    return (["fast", "balanced", "thorough"] as PresetTemplate[]).map(preset => ({
      name: preset,
      model: providerModels[preset] || DEFAULT_MODEL,
      description: PRESET_DEFINITIONS[preset].description,
    }));
  }
}

// Singleton instance
let presetManagerInstance: TeamPresetManager | null = null;

export function getTeamPresets(): TeamPresetManager {
  if (!presetManagerInstance) {
    presetManagerInstance = new TeamPresetManager();
  }
  return presetManagerInstance;
}

// Export convenience function
export function getPresetConfig(preset: PresetTemplate, provider?: ProviderName): TeamConfig {
  return getTeamPresets().getPresetConfig(preset, provider);
}