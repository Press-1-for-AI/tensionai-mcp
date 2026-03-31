import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { PLANNER_SYSTEM_PROMPT } from "../shared/prompts.ts";
import { CLAUDE_MODEL, CLAUDE_MAX_TURNS } from "../shared/config.ts";
import { log, logError } from "../shared/logger.ts";

export async function runPlanner(userPrompt: string, workDir: string): Promise<string> {
  log("PLANNER", `Starting planning for: "${userPrompt}"`);

  const options: Options = {
    cwd: workDir,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    tools: ["Read", "Write"],
    model: CLAUDE_MODEL,
    maxTurns: CLAUDE_MAX_TURNS,
    persistSession: false,
  };

  const fullPrompt = `IMPORTANT: Your working directory is ${workDir}. All files you create (including spec.md) MUST be written inside this directory. Do NOT write files anywhere else.\n\n${userPrompt}`;

  let fullResponse = "";
  let completed = false;

  for await (const msg of query({ prompt: fullPrompt, options })) {
    if (msg.type === "assistant") {
      const message = msg as { message: { content: Array<{ type: string; text?: string }> } };
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          fullResponse += block.text;
        }
      }
    } else if (msg.type === "result") {
      const result = msg as { session_id?: string };
      completed = true;
      log("PLANNER", `Planning complete (session: ${result.session_id?.slice(0, 8)}...)`);
    }
  }

  if (!completed) {
    logError("PLANNER", "Planner query did not complete");
    throw new Error("Planner failed to produce output");
  }

  // The planner may have written spec.md via the Write tool instead of returning text.
  // Try to read from disk as the primary source.
  if (!fullResponse) {
    try {
      fullResponse = await readFile(join(workDir, "spec.md"), "utf-8");
      log("PLANNER", "Read spec from file written by planner agent");
    } catch {
      logError("PLANNER", "No text response and no spec.md on disk");
      throw new Error("Planner completed but produced no spec");
    }
  }

  log("PLANNER", "Product specification generated");
  return fullResponse;
}
