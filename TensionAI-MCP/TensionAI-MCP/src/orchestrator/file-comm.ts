/**
 * File-based Inter-Agent Communication
 * 
 * This module handles communication between agents via files instead of
 * shared context. Each agent reads and writes to a shared workspace directory.
 * 
 * Files created:
 * - spec.md - Product specification from Planner
 * - contract.json - Current sprint contract
 * - debates/ - Directory containing debate messages
 *   - round-{n}.json - Debate messages for each round
 * - results/ - Directory containing evaluation results
 *   - sprint-{n}-eval.json - Evaluation results for each sprint
 */

import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type {
  AgentRole,
  AgentCommunicationFile,
  DebateRecord,
  DebateRound,
  SprintContract,
  EvalResult,
} from "../shared/types.js";

// ============================================================================
// Configuration
// ============================================================================

export interface FileCommConfig {
  baseDir: string;
}

const DEFAULT_BASE_DIR = "./workspace";

// ============================================================================
// File Communication Manager
// ============================================================================

export class FileCommunication {
  private baseDir: string;

  constructor(config?: FileCommConfig) {
    this.baseDir = config?.baseDir ?? DEFAULT_BASE_DIR;
  }

  /**
   * Initialize the workspace directory structure
   */
  async initialize(taskId: string): Promise<void> {
    const taskDir = join(this.baseDir, taskId);
    
    await mkdir(taskDir, { recursive: true });
    await mkdir(join(taskDir, "debates"), { recursive: true });
    await mkdir(join(taskDir, "results"), { recursive: true });
    
    console.log(`[FileComm] Initialized workspace for task ${taskId} at ${taskDir}`);
  }

  /**
   * Write the product specification (from Planner)
   */
  async writeSpec(taskId: string, content: string): Promise<void> {
    const specPath = join(this.baseDir, taskId, "spec.md");
    await writeFile(specPath, content, "utf-8");
    console.log(`[FileComm] Wrote spec.md for task ${taskId}`);
  }

  /**
   * Read the product specification
   */
  async readSpec(taskId: string): Promise<string> {
    const specPath = join(this.baseDir, taskId, "spec.md");
    if (!existsSync(specPath)) {
      throw new Error(`Spec file not found for task ${taskId}`);
    }
    return readFile(specPath, "utf-8");
  }

  /**
   * Write a sprint contract
   */
  async writeContract(taskId: string, contract: SprintContract): Promise<void> {
    const contractPath = join(this.baseDir, taskId, "contract.json");
    await writeFile(contractPath, JSON.stringify(contract, null, 2), "utf-8");
    console.log(`[FileComm] Wrote contract for sprint ${contract.sprintNumber}`);
  }

  /**
   * Read the current sprint contract
   */
  async readContract(taskId: string): Promise<SprintContract> {
    const contractPath = join(this.baseDir, taskId, "contract.json");
    if (!existsSync(contractPath)) {
      throw new Error(`Contract file not found for task ${taskId}`);
    }
    const content = await readFile(contractPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Write an agent message to the debate log
   */
  async writeDebateMessage(
    taskId: string,
    round: number,
    sender: AgentRole,
    content: string
  ): Promise<void> {
    const debateFile: AgentCommunicationFile = {
      taskId,
      round,
      sender,
      content,
      timestamp: new Date().toISOString(),
    };

    const debatePath = join(this.baseDir, taskId, "debates", `round-${round}.json`);
    
    // Read existing messages or create new array
    let messages: AgentCommunicationFile[] = [];
    if (existsSync(debatePath)) {
      const existing = await readFile(debatePath, "utf-8");
      messages = JSON.parse(existing);
    }
    
    messages.push(debateFile);
    await writeFile(debatePath, JSON.stringify(messages, null, 2), "utf-8");
    
    console.log(`[FileComm] Wrote debate message from ${sender} for round ${round}`);
  }

  /**
   * Read all debate messages for a specific round
   */
  async readDebateMessages(taskId: string, round: number): Promise<AgentCommunicationFile[]> {
    const debatePath = join(this.baseDir, taskId, "debates", `round-${round}.json`);
    
    if (!existsSync(debatePath)) {
      return [];
    }
    
    const content = await readFile(debatePath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Read the full debate history for a task
   */
  async readDebateHistory(taskId: string): Promise<DebateRecord> {
    const debatesDir = join(this.baseDir, taskId, "debates");
    
    if (!existsSync(debatesDir)) {
      return { taskId, rounds: [] };
    }

    const files = await readdir(debatesDir);
    const roundFiles = files
      .filter(f => f.startsWith("round-") && f.endsWith(".json"))
      .sort((a, b) => {
        const numA = parseInt(a.match(/round-(\d+)/)?.[1] || "0");
        const numB = parseInt(b.match(/round-(\d+)/)?.[1] || "0");
        return numA - numB;
      });

    const rounds: DebateRound[] = [];

    for (const file of roundFiles) {
      const roundNum = parseInt(file.match(/round-(\d+)/)?.[1] || "0");
      const messages = await this.readDebateMessages(taskId, roundNum);
      
      rounds.push({
        roundNumber: roundNum,
        messages: messages.map(m => ({
          role: "assistant" as const,
          content: m.content,
        })),
        timestamp: messages[0]?.timestamp || new Date().toISOString(),
      });
    }

    return { taskId, rounds };
  }

  /**
   * Write evaluation results
   */
  async writeEvaluation(
    taskId: string,
    sprintNumber: number,
    evalResult: EvalResult
  ): Promise<void> {
    const evalPath = join(
      this.baseDir,
      taskId,
      "results",
      `sprint-${sprintNumber}-eval.json`
    );
    
    await writeFile(evalPath, JSON.stringify(evalResult, null, 2), "utf-8");
    console.log(`[FileComm] Wrote evaluation for sprint ${sprintNumber}`);
  }

  /**
   * Read evaluation result for a specific sprint
   */
  async readEvaluation(taskId: string, sprintNumber: number): Promise<EvalResult | null> {
    const evalPath = join(
      this.baseDir,
      taskId,
      "results",
      `sprint-${sprintNumber}-eval.json`
    );
    
    if (!existsSync(evalPath)) {
      return null;
    }
    
    const content = await readFile(evalPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Read all evaluation results for a task
   */
  async readAllEvaluations(taskId: string): Promise<Map<number, EvalResult>> {
    const resultsDir = join(this.baseDir, taskId, "results");
    const evaluations = new Map<number, EvalResult>();
    
    if (!existsSync(resultsDir)) {
      return evaluations;
    }

    const files = await readdir(resultsDir);
    const evalFiles = files.filter(f => f.endsWith("-eval.json"));

    for (const file of evalFiles) {
      const match = file.match(/sprint-(\d+)-eval\.json/);
      if (match) {
        const sprintNum = parseInt(match[1]);
        const content = await readFile(join(resultsDir, file), "utf-8");
        evaluations.set(sprintNum, JSON.parse(content));
      }
    }

    return evaluations;
  }

  /**
   * Get workspace directory for a task
   */
  getTaskDir(taskId: string): string {
    return join(this.baseDir, taskId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let fileCommInstance: FileCommunication | null = null;

export function getFileCommunication(config?: FileCommConfig): FileCommunication {
  if (!fileCommInstance) {
    fileCommInstance = new FileCommunication(config);
  }
  return fileCommInstance;
}

export function createFileCommunication(config?: FileCommConfig): FileCommunication {
  return new FileCommunication(config);
}