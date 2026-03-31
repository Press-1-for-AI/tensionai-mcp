/**
 * Teams Module - Index
 * 
 * Exports all team management functionality:
 * - Team Configuration (CRUD operations)
 * - Preset Templates (fast/balanced/thorough)
 * - Auto-Assignment (task type detection)
 * - User Override (preferences per user/project)
 */

export { 
  getTeamConfig, 
  initializeTeams,
  type TeamConfigManager 
} from "./config.js";

export { 
  getTeamPresets,
  getPresetConfig,
  type TeamPresetManager 
} from "./presets.js";

export { 
  getAutoAssignManager,
  autoAssignTeam,
  detectTaskType,
  type AutoAssignManager,
  type TaskDetectionResult
} from "./autoassign.js";

export { 
  getUserOverrideManager,
  setUserOverride,
  getUserOverride,
  removeUserOverride,
  type UserOverrideManager
} from "./override.js";

// Re-export types from shared
export type {
  TaskType,
  PresetTemplate,
  TeamAgent,
  TeamConfig,
  TeamPreset,
  AutoAssignResult,
  UserOverride,
} from "../shared/types.js";