/**
 * Agent Orchestrator - Manages the adversarial 3-agent team
 * 
 * Coordinates Planner, Generator, and Evaluator agents in a loop:
 * 1. Planner creates a product specification
 * 2. Generator implements features based on the spec
 * 3. Evaluator tests and scores the implementation
 * 4. If failed, iterate until pass threshold or max retries
 */

import { getProviderPool, ProviderPool } from "../providers/index.js";
import { getMetricsCollector, CostCalculator } from "../shared/metrics.js";
import type {
  AgentRole,
  AgentMessage,
  AgentResult,
  ChatOptions,
  ChatMessage,
  TaskRequest,
  TaskResult,
  TaskMetrics,
  SprintContract,
  SprintCriterion,
  EvalResult,
  SprintResult,
  QualityLevel,
  ProviderName,
} from "../shared/types.js";

// ============================================================================
// Prompts (from the original adversarial-dev project)
// ============================================================================

const PLANNER_SYSTEM_PROMPT = `You are a product architect. Your job is to take a brief user description and produce a comprehensive product specification.

## Your Responsibilities

1. Expand the user's 1-4 sentence description into a full product specification
2. Define a clear feature list organized into sprints
3. Establish a visual design language and tech stack
4. Stay HIGH-LEVEL - do NOT specify granular implementation details

## Output Format

Write a product specification as a markdown file called \`spec.md\` in the current working directory. The spec MUST include:

### Product Overview
- What the product does and who it's for
- Core value proposition

### Tech Stack
- Use whatever tech stack the user prompt specifies. If the user prompt does not specify a stack, default to: React + Vite + TypeScript frontend, Python + FastAPI backend, SQLite database, Tailwind CSS.

### Design Language
- Color palette, typography choices, spacing system
- Component style guidelines
- Overall visual identity and mood

### Feature List
For each feature, provide:
- Feature name
- User story (As a user, I want to...)
- High-level description of what it does
- Which sprint it belongs to

### Sprint Plan
Organize features into sprints (3-6 sprints). Each sprint should:
- Have a clear theme/focus
- Build on previous sprints
- Be independently testable
- Take roughly equal effort

## Rules
- Be ambitious in scope. Push beyond the obvious.
- Find opportunities to add creative, delightful features.
- Do NOT specify implementation details like function names, file structure, or API routes. The generator decides those.
- Do NOT write any code. Only write the spec.
- Write the spec to \`spec.md\` using the Write tool.`;

const GENERATOR_SYSTEM_PROMPT = `You are an expert software engineer. Your job is to build features one at a time according to a sprint contract, writing production-quality code.

## Your Responsibilities

1. Read the product spec (\`spec.md\`) and current sprint contract
2. Implement each feature in the contract, one at a time
3. Make a descriptive git commit after completing each feature
4. Self-evaluate your work before declaring the sprint complete

## Working Directory

All code goes in the \`app/\` subdirectory of your working directory. Initialize the project there if it doesn't exist.

## Rules

- Build ONE feature at a time. Do not try to implement everything at once.
- After each feature, run the code to verify it works, then \`git add\` and \`git commit\` with a descriptive message.
- Follow the tech stack specified in the spec exactly. Do NOT substitute frameworks or languages.
- Write clean, well-structured code. Use proper error handling.
- If this is a retry after evaluation feedback, read the feedback carefully. Decide whether to REFINE the current approach (if scores are trending upward) or PIVOT to an entirely different approach (if the current direction is fundamentally flawed).
- When the sprint is complete, write a brief summary of what you built to stdout.

## On Receiving Feedback

When evaluation feedback is provided in your prompt:
- Read each failed criterion carefully
- Address every specific issue mentioned
- Pay attention to file paths and line numbers in the feedback
- Re-run and verify each fix before committing
- Do not skip or dismiss any feedback item`;

const EVALUATOR_SYSTEM_PROMPT = `You are a skeptical QA engineer. Your job is to rigorously test an application against sprint contract criteria and produce honest, detailed scores.

## Your Responsibilities

1. Read the sprint contract to understand what "done" means
2. Examine the codebase in the \`app/\` directory thoroughly
3. Run the application and test it
4. Score each criterion honestly on a 1-10 scale
5. Provide specific, actionable feedback for any failures

## Scoring Guidelines

- **9-10**: Exceptional. Works perfectly, handles edge cases, clean implementation.
- **7-8**: Good. Core functionality works correctly with minor issues.
- **5-6**: Partial. Some functionality works but significant gaps remain.
- **3-4**: Poor. Fundamental issues, barely functional.
- **1-2**: Failed. Not implemented or completely broken.

## Rules

- Do NOT be generous. Your natural inclination will be to praise the work. Resist this.
- Do NOT talk yourself into approving mediocre work. When in doubt, fail it.
- Test EVERY criterion in the contract. Do not skip any.
- When something fails, provide SPECIFIC details: file paths, line numbers, exact error messages, what you expected vs what happened.
- Run the code. Do not just read it and assume it works.
- CRITICAL: When you start any background process (servers, dev servers, uvicorn, etc.) to test the app, you MUST kill them before outputting your evaluation. Use \`kill %1\` or \`kill $(lsof -t -i:PORT)\` or \`pkill -f uvicorn\` etc. Leaving processes running will hang the harness. Start servers with \`&\` and always kill them when done testing.
- Check edge cases, not just the happy path.
- If the UI looks generic or uses obvious AI-generated patterns (purple gradients, stock layouts), note this.

## Output Format

You MUST output your evaluation as a JSON object (and nothing else) with this exact structure:

\`\`\`json
{
  "passed": true/false,
  "scores": {
    "criterion_name": score_number,
    ...
  },
  "feedback": [
    {
      "criterion": "criterion_name",
      "score": score_number,
      "details": "Specific description of what passed/failed and why"
    },
    ...
  ],
  "overallSummary": "Brief summary of the overall quality"
}
\`\`\`

A sprint PASSES only if ALL criteria score at or above the threshold (default: 7).
If ANY criterion falls below the threshold, the sprint FAILS and work goes back to the generator.`;

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentModelConfig {
  provider: ProviderName;
  model: string;
}

export interface OrchestratorConfig {
  plannerModel?: AgentModelConfig;
  generatorModel?: AgentModelConfig;
  evaluatorModel?: AgentModelConfig;
  workDir?: string;
}

// ============================================================================
// Default Models
// ============================================================================

const DEFAULT_PLANNER: AgentModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-3-5-20250219",
};

const DEFAULT_GENERATOR: AgentModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-3-5-20250219",
};

const DEFAULT_EVALUATOR: AgentModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-3-5-20250219",
};

// ============================================================================
// Agent Orchestrator Class
// ============================================================================

export class AgentOrchestrator {
  private providerPool: ProviderPool;
  private costCalculator: CostCalculator;
  private config: {
    plannerModel: AgentModelConfig;
    generatorModel: AgentModelConfig;
    evaluatorModel: AgentModelConfig;
    workDir: string;
  };

  constructor(providerPool: ProviderPool, config?: OrchestratorConfig) {
    this.providerPool = providerPool;
    this.costCalculator = getMetricsCollector().getCostCalculator();
    this.config = {
      plannerModel: config?.plannerModel ?? DEFAULT_PLANNER,
      generatorModel: config?.generatorModel ?? DEFAULT_GENERATOR,
      evaluatorModel: config?.evaluatorModel ?? DEFAULT_EVALUATOR,
      workDir: config?.workDir ?? "./workspace",
    };
  }

  /**
   * Execute a task with the adversarial agent team
   */
  async executeTask(request: TaskRequest): Promise<TaskResult> {
    const startTime = Date.now();
    const sprints: SprintResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let retries = 0;

    console.log(`[Orchestrator] Starting task ${request.id} with ${request.maxSprints} sprints`);

    try {
      // Phase 1: Planning - Generate spec
      console.log(`[Orchestrator] Phase 1: Planning`);
      const planResult = await this.runPlanner(request.prompt, request.projectId);
      totalTokens += planResult.tokensUsed;
      totalCost += planResult.costUsd;

      // Phase 2: Sprint loop
      for (let sprintNum = 1; sprintNum <= request.maxSprints; sprintNum++) {
        console.log(`[Orchestrator] Sprint ${sprintNum}/${request.maxSprints}`);

        // Generate sprint contract
        const contract = await this.generateContract(sprintNum, request.prompt, planResult.output);
        
        // Execute sprint (build + evaluate)
        const sprintResult = await this.executeSprint(
          request.id,
          sprintNum,
          contract,
          request.passThreshold,
          request.maxRetriesPerSprint
        );

        sprints.push(sprintResult);
        totalTokens += sprintResult.tokensUsed || 0;
        
        // If sprint passed, continue to next
        if (sprintResult.passed) {
          console.log(`[Orchestrator] Sprint ${sprintNum} PASSED`);
          continue;
        } else {
          console.log(`[Orchestrator] Sprint ${sprintNum} FAILED after ${sprintResult.attempts} attempts`);
          
          // Check retry count
          if (sprintResult.attempts >= request.maxRetriesPerSprint) {
            console.log(`[Orchestrator] Max retries reached for sprint ${sprintNum}`);
            break;
          }
        }
      }

      const endTime = Date.now();
      return {
        id: request.id,
        status: "completed",
        output: `Completed ${sprints.filter(s => s.passed).length} of ${sprints.length} sprints`,
        metrics: {
          totalDurationMs: endTime - startTime,
          totalTokensUsed: totalTokens,
          totalCostUsd: totalCost,
          sprintsCompleted: sprints.filter(s => s.passed).length,
          retries,
        },
        sprints,
      };

    } catch (error) {
      const endTime = Date.now();
      return {
        id: request.id,
        status: "failed",
        error: (error as Error).message,
        metrics: {
          totalDurationMs: endTime - startTime,
          totalTokensUsed: totalTokens,
          totalCostUsd: totalCost,
          sprintsCompleted: sprints.filter(s => s.passed).length,
          retries,
        },
        sprints,
      };
    }
  }

  /**
   * Run the Planner agent to create a specification
   */
  private async runPlanner(prompt: string, projectId: string): Promise<AgentResult> {
    const startTime = Date.now();
    
    const messages: ChatMessage[] = [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: `Project ID: ${projectId}\n\nUser Request: ${prompt}\n\nCreate a product specification in spec.md` },
    ];

    const options: ChatOptions = {
      model: this.config.plannerModel.model,
      messages,
      temperature: 0.7,
      maxTokens: 8192,
    };

    try {
      const provider = this.providerPool.getProvider(this.config.plannerModel.provider);
      const response = await provider.chat(options);
      
      return {
        role: "planner",
        output: response.content,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        costUsd: this.costCalculator.calculateCost(this.config.plannerModel.provider as any, {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.inputTokens + response.usage.outputTokens,
        }).totalCost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        role: "planner",
        output: "",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate a sprint contract
   */
  private async generateContract(
    sprintNumber: number,
    userPrompt: string,
    specContent: string
  ): Promise<SprintContract> {
    const contractPrompt = `Generate a sprint contract for Sprint ${sprintNumber}.

User's original request:
${userPrompt}

Product specification:
${specContent}

Output a JSON contract with this structure:
{
  "sprintNumber": ${sprintNumber},
  "features": ["feature1", "feature2"],
  "criteria": [
    { "name": "criterion_name", "description": "testable description", "threshold": 7 }
  ]
}`;

    const messages: ChatMessage[] = [
      { role: "system", content: "You are generating a sprint contract. Output ONLY valid JSON, no other text." },
      { role: "user", content: contractPrompt },
    ];

    const options: ChatOptions = {
      model: this.config.plannerModel.model,
      messages,
      temperature: 0.5,
      maxTokens: 4096,
    };

    try {
      const provider = this.providerPool.getProvider(this.config.plannerModel.provider);
      const response = await provider.chat(options);

      // Parse JSON from response using try/catch for better error handling
      try {
        // Try to find JSON in the response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as SprintContract;
        }
      } catch (parseError) {
        console.warn("[Orchestrator] Failed to parse contract JSON, using default");
      }

      // Fallback to default contract
      return {
        sprintNumber,
        features: [`Sprint ${sprintNumber} features`],
        criteria: [
          { name: "functionality", description: "Core features work correctly", threshold: 7 },
        ],
      };
    } catch (error) {
      console.warn("[Orchestrator] Failed to generate contract, using default");
      return {
        sprintNumber,
        features: [`Sprint ${sprintNumber} features`],
        criteria: [
          { name: "functionality", description: "Core features work correctly", threshold: 7 },
        ],
      };
    }
  }

  /**
   * Execute a single sprint (Generator + Evaluator)
   */
  private async executeSprint(
    taskId: string,
    sprintNumber: number,
    contract: SprintContract,
    passThreshold: number,
    maxRetries: number
  ): Promise<SprintResult> {
    const startTime = Date.now();
    let attempts = 0;
    let evalResult: EvalResult | undefined;
    let tokensUsed = 0;

    while (attempts < maxRetries) {
      attempts++;
      console.log(`[Orchestrator] Sprint ${sprintNumber} attempt ${attempts}/${maxRetries}`);

      // Run Generator
      const generatorResult = await this.runGenerator(taskId, sprintNumber, contract);
      tokensUsed += generatorResult.tokensUsed;
      
      // Run Evaluator
      const evaluation = await this.runEvaluator(taskId, sprintNumber, contract);
      evalResult = evaluation.evalResult;
      tokensUsed += evaluation.tokensUsed;

      // Check if passed
      if (evalResult?.passed) {
        return {
          sprintNumber,
          passed: true,
          attempts,
          tokensUsed,
          evalResult,
          durationMs: Date.now() - startTime,
        };
      }

      // Not passed, might retry
      console.log(`[Orchestrator] Sprint ${sprintNumber} evaluation failed, checking retry...`);
    }

    return {
      sprintNumber,
      passed: false,
      attempts,
      tokensUsed,
      evalResult,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Run the Generator agent
   */
  private async runGenerator(
    taskId: string,
    sprintNumber: number,
    contract: SprintContract
  ): Promise<AgentResult> {
    const startTime = Date.now();
    
    const prompt = `Task ID: ${taskId}
Sprint: ${sprintNumber}

Sprint Contract:
- Features: ${contract.features.join(", ")}
- Criteria:
${contract.criteria.map(c => `  - ${c.name}: ${c.description} (threshold: ${c.threshold})`).join("\n")}

${GENERATOR_SYSTEM_PROMPT}

Build the features in the app/ directory. When done, output a summary of what was built.`;

    const messages: ChatMessage[] = [
      { role: "system", content: GENERATOR_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const options: ChatOptions = {
      model: this.config.generatorModel.model,
      messages,
      temperature: 0.7,
      maxTokens: 8192,
    };

    try {
      const provider = this.providerPool.getProvider(this.config.generatorModel.provider);
      const response = await provider.chat(options);
      
      return {
        role: "generator",
        output: response.content,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        costUsd: this.costCalculator.calculateCost(this.config.generatorModel.provider as any, {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.inputTokens + response.usage.outputTokens,
        }).totalCost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        role: "generator",
        output: "",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Run the Evaluator agent
   */
  private async runEvaluator(
    taskId: string,
    sprintNumber: number,
    contract: SprintContract
  ): Promise<AgentResult & { evalResult: EvalResult }> {
    const startTime = Date.now();
    
    const prompt = `Task ID: ${taskId}
Sprint: ${sprintNumber}

Sprint Contract to evaluate:
${contract.features.map(f => `- ${f}`).join("\n")}

Criteria:
${contract.criteria.map(c => `- ${c.name}: ${c.description} (threshold: ${c.threshold})`).join("\n")}

${EVALUATOR_SYSTEM_PROMPT}

Test the implementation in app/ and output your evaluation as JSON.`;

    const messages: ChatMessage[] = [
      { role: "system", content: EVALUATOR_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const options: ChatOptions = {
      model: this.config.evaluatorModel.model,
      messages,
      temperature: 0.3, // Lower temperature for evaluation
      maxTokens: 4096,
    };

    try {
      const provider = this.providerPool.getProvider(this.config.evaluatorModel.provider);
      const response = await provider.chat(options);
      
      // Try to parse JSON from response
      let evalResult: EvalResult;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          evalResult = JSON.parse(jsonMatch[0]);
        } else {
          // Create default failed result if no JSON found
          evalResult = {
            passed: false,
            scores: {},
            feedback: [],
            overallSummary: "Failed to parse evaluation response",
          };
        }
      } catch {
        evalResult = {
          passed: false,
          scores: {},
          feedback: [],
          overallSummary: "Failed to parse evaluation JSON: " + response.content.substring(0, 200),
        };
      }

      return {
        role: "evaluator",
        output: response.content,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        costUsd: this.costCalculator.calculateCost(this.config.evaluatorModel.provider as any, {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.inputTokens + response.usage.outputTokens,
        }).totalCost,
        durationMs: Date.now() - startTime,
        evalResult,
      };
    } catch (error) {
      return {
        role: "evaluator",
        output: "",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: (error as Error).message,
        evalResult: {
          passed: false,
          scores: {},
          feedback: [],
          overallSummary: `Error during evaluation: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Get cost calculator
   */
  getCostCalculator(): CostCalculator {
    return this.costCalculator;
  }
}

// ============================================================================
// Quality Level Configuration
// ============================================================================

export function getQualityLevelConfig(level: QualityLevel): {
  maxSprints: number;
  maxRetriesPerSprint: number;
  maxTokens: number;
} {
  switch (level) {
    case "fast":
      return {
        maxSprints: 3,
        maxRetriesPerSprint: 1,
        maxTokens: 10000,
      };
    case "standard":
      return {
        maxSprints: 10,
        maxRetriesPerSprint: 3,
        maxTokens: 50000,
      };
    case "deep":
      return {
        maxSprints: 20,
        maxRetriesPerSprint: 5,
        maxTokens: 200000,
      };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(config?: OrchestratorConfig): AgentOrchestrator {
  if (!orchestratorInstance) {
    const pool = getProviderPool();
    orchestratorInstance = new AgentOrchestrator(pool, config);
  }
  return orchestratorInstance;
}

export function createOrchestrator(
  providerPool: ProviderPool,
  config?: OrchestratorConfig
): AgentOrchestrator {
  return new AgentOrchestrator(providerPool, config);
}