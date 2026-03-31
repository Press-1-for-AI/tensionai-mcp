/**
 * Quality Level Auto-Detection - Keyword-based detection for Fast/Standard/Deep
 * 
 * Provides keyword-based detection, complexity analysis of prompts,
 * and explicit user override support.
 */

import type { QualityLevel } from "../shared/types.js";

// ============================================================================
// Detection Types
// ============================================================================

export interface QualityDetectionResult {
  detectedLevel: QualityLevel;
  confidence: number; // 0-1
  reasons: string[];
  keywords: string[];
}

export interface QualityDetectorConfig {
  defaultLevel: QualityLevel;
  enableKeywordDetection: boolean;
  enableComplexityAnalysis: boolean;
  keywordWeights: {
    fast: Record<string, number>;
    standard: Record<string, number>;
    deep: Record<string, number>;
  };
}

// ============================================================================
// Default Keywords
// ============================================================================

const DEFAULT_KEYWORDS = {
  fast: {
    // Quick/simple tasks
    "quick": 1.0,
    "simple": 0.9,
    "basic": 0.8,
    "small": 0.7,
    "tiny": 0.7,
    "minimal": 0.8,
    "fast": 0.9,
    "prototype": 0.8,
    "demo": 0.8,
    "test": 0.6,
    "script": 0.7,
    "utility": 0.7,
    "easy": 0.7,
    "lightweight": 0.8,
    "single": 0.6,
  },
  standard: {
    // Standard tasks
    "build": 0.8,
    "create": 0.7,
    "implement": 0.7,
    "develop": 0.7,
    "make": 0.6,
    "application": 0.7,
    "feature": 0.7,
    "website": 0.7,
    "app": 0.7,
    "project": 0.6,
    "functionality": 0.7,
    "user": 0.6,
    "interface": 0.7,
    "api": 0.7,
  },
  deep: {
    // Complex/comprehensive tasks
    "comprehensive": 1.0,
    "complete": 0.9,
    "full": 0.8,
    "complex": 1.0,
    "advanced": 0.9,
    "enterprise": 0.9,
    "production": 0.9,
    "scalable": 0.9,
    "robust": 0.9,
    "detailed": 0.9,
    "thorough": 0.9,
    "extensive": 0.9,
    "deep": 0.9,
    "thousands": 1.0,
    "millions": 1.0,
    "distributed": 0.9,
    "microservices": 0.9,
    "architecture": 0.8,
    "security": 0.9,
    "performance": 0.8,
  },
};

// ============================================================================
// Quality Detector Class
// ============================================================================

export class QualityDetector {
  private config: QualityDetectorConfig;

  constructor(config?: Partial<QualityDetectorConfig>) {
    this.config = {
      defaultLevel: config?.defaultLevel ?? "standard",
      enableKeywordDetection: config?.enableKeywordDetection ?? true,
      enableComplexityAnalysis: config?.enableComplexityAnalysis ?? true,
      keywordWeights: config?.keywordWeights ?? DEFAULT_KEYWORDS,
    };
  }

  /**
   * Detect quality level from prompt
   */
  detect(prompt: string, userOverride?: QualityLevel): QualityDetectionResult {
    // If user explicitly specified, use that
    if (userOverride) {
      return {
        detectedLevel: userOverride,
        confidence: 1.0,
        reasons: ["User explicitly specified"],
        keywords: [],
      };
    }

    const reasons: string[] = [];
    const keywords: string[] = [];
    let totalScore = 0;
    let keywordCount = 0;

    const normalizedPrompt = prompt.toLowerCase();

    // Keyword detection
    if (this.config.enableKeywordDetection) {
      const keywordResult = this.analyzeKeywords(normalizedPrompt);
      totalScore += keywordResult.score;
      keywordCount += keywordResult.count;
      keywords.push(...keywordResult.matchedKeywords);
      reasons.push(...keywordResult.reasons);
    }

    // Complexity analysis
    let complexityScore = 0;
    if (this.config.enableComplexityAnalysis) {
      const complexityResult = this.analyzeComplexity(prompt);
      complexityScore = complexityResult.score;
      reasons.push(...complexityResult.reasons);
    }

    // Combine scores (weighted)
    const finalScore = keywordCount > 0 
      ? (totalScore / keywordCount) * 0.6 + complexityScore * 0.4
      : complexityScore;

    // Determine level
    let detectedLevel: QualityLevel;
    let confidence: number;

    if (finalScore <= -0.3) {
      detectedLevel = "fast";
      confidence = Math.min(0.9, 0.5 + Math.abs(finalScore));
    } else if (finalScore >= 0.3) {
      detectedLevel = "deep";
      confidence = Math.min(0.9, 0.5 + finalScore);
    } else {
      detectedLevel = "standard";
      confidence = 0.7;
    }

    // Add default reason if none provided
    if (reasons.length === 0) {
      reasons.push(`Default quality level: ${this.config.defaultLevel}`);
      detectedLevel = this.config.defaultLevel;
      confidence = 0.5;
    }

    console.log(`[QualityDetector] Detected level: ${detectedLevel} (confidence: ${confidence.toFixed(2)})`);
    console.log(`[QualityDetector] Reasons:`, reasons);

    return {
      detectedLevel,
      confidence,
      reasons,
      keywords,
    };
  }

  /**
   * Analyze keywords in prompt
   */
  private analyzeKeywords(prompt: string): {
    score: number;
    count: number;
    matchedKeywords: string[];
    reasons: string[];
  } {
    let totalScore = 0;
    let count = 0;
    const matchedKeywords: string[] = [];
    const reasons: string[] = [];

    // Check fast keywords
    for (const [keyword, weight] of Object.entries(this.config.keywordWeights.fast)) {
      if (prompt.includes(keyword)) {
        totalScore -= weight;
        count++;
        matchedKeywords.push(keyword);
      }
    }

    // Check standard keywords (neutral)
    for (const [keyword, weight] of Object.entries(this.config.keywordWeights.standard)) {
      if (prompt.includes(keyword)) {
        totalScore += weight * 0.3; // Lower weight for standard
        count++;
        matchedKeywords.push(keyword);
      }
    }

    // Check deep keywords
    for (const [keyword, weight] of Object.entries(this.config.keywordWeights.deep)) {
      if (prompt.includes(keyword)) {
        totalScore += weight;
        count++;
        matchedKeywords.push(keyword);
      }
    }

    if (count > 0) {
      if (totalScore < 0) {
        reasons.push(`Found ${count} "fast" keywords`);
      } else if (totalScore > 0) {
        reasons.push(`Found ${count} "deep" keywords`);
      } else {
        reasons.push(`Found ${count} "standard" keywords`);
      }
    }

    return { score: totalScore, count, matchedKeywords, reasons };
  }

  /**
   * Analyze prompt complexity
   */
  private analyzeComplexity(prompt: string): {
    score: number;
    reasons: string[];
  } {
    let score = 0;
    const reasons: string[] = [];

    // Length-based complexity
    const wordCount = prompt.split(/\s+/).length;
    if (wordCount > 200) {
      score += 0.4;
      reasons.push("Long prompt (>200 words)");
    } else if (wordCount > 100) {
      score += 0.2;
      reasons.push("Medium-length prompt (>100 words)");
    } else if (wordCount < 30) {
      score -= 0.2;
      reasons.push("Short prompt (<30 words)");
    }

    // Check for technical requirements
    const technicalTerms = [
      "database", "api", "authentication", "security", "cache",
      "queue", "microservice", "distributed", "cluster", "docker",
      "kubernetes", "aws", "azure", "gcp", "redis", "mongodb",
      "postgresql", "graphql", "rest", "websocket", "lambda",
    ];

    const technicalCount = technicalTerms.filter(term => 
      prompt.toLowerCase().includes(term)
    ).length;

    if (technicalCount >= 3) {
      score += 0.4;
      reasons.push(`Found ${technicalCount} technical terms`);
    } else if (technicalCount >= 1) {
      score += 0.2;
      reasons.push(`Found ${technicalCount} technical term(s)`);
    }

    // Check for explicit quality mentions
    const qualityMentions = prompt.toLowerCase().match(/quality\s+(low|medium|high|basic|standard|comprehensive|production)/g);
    if (qualityMentions) {
      for (const mention of qualityMentions) {
        if (mention.includes("low") || mention.includes("basic")) {
          score -= 0.3;
        } else if (mention.includes("high") || mention.includes("comprehensive") || mention.includes("production")) {
          score += 0.3;
        }
      }
      reasons.push("Quality requirement specified in prompt");
    }

    return { score, reasons };
  }

  /**
   * Set custom keywords
   */
  setKeywords(level: QualityLevel, keywords: Record<string, number>): void {
    this.config.keywordWeights[level] = {
      ...this.config.keywordWeights[level],
      ...keywords,
    };
    console.log(`[QualityDetector] Updated keywords for ${level} level`);
  }

  /**
   * Add keyword
   */
  addKeyword(level: QualityLevel, keyword: string, weight: number): void {
    this.config.keywordWeights[level][keyword.toLowerCase()] = weight;
  }

  /**
   * Remove keyword
   */
  removeKeyword(level: QualityLevel, keyword: string): boolean {
    if (this.config.keywordWeights[level][keyword.toLowerCase()]) {
      delete this.config.keywordWeights[level][keyword.toLowerCase()];
      return true;
    }
    return false;
  }

  /**
   * Get configuration
   */
  getConfig(): QualityDetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QualityDetectorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Reset to default keywords
   */
  resetKeywords(): void {
    this.config.keywordWeights = { ...DEFAULT_KEYWORDS };
    console.log("[QualityDetector] Keywords reset to defaults");
  }
}

// ============================================================================
// Simple Detection Functions
// ============================================================================

/**
 * Quick detection without creating a detector instance
 */
export function detectQualityLevel(prompt: string, userOverride?: QualityLevel): QualityLevel {
  if (userOverride) {
    return userOverride;
  }

  const normalized = prompt.toLowerCase();
  
  // Check for explicit quality indicators
  if (normalized.includes("quick") || normalized.includes("simple") || normalized.includes("basic") ||
      normalized.includes("prototype") || normalized.includes("demo") || normalized.includes("tiny")) {
    return "fast";
  }

  if (normalized.includes("comprehensive") || normalized.includes("complete") || normalized.includes("complex") ||
      normalized.includes("advanced") || normalized.includes("enterprise") || normalized.includes("production") ||
      normalized.includes("scalable") || normalized.includes("thorough")) {
    return "deep";
  }

  return "standard";
}

// ============================================================================
// Singleton Instance
// ============================================================================

let detectorInstance: QualityDetector | null = null;

export function getQualityDetector(config?: Partial<QualityDetectorConfig>): QualityDetector {
  if (!detectorInstance) {
    detectorInstance = new QualityDetector(config);
  }
  return detectorInstance;
}

export function createQualityDetector(config?: Partial<QualityDetectorConfig>): QualityDetector {
  return new QualityDetector(config);
}