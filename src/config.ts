import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type { AgentConfig } from "./types.js";

const AgentConfigSchema = z.object({
  timezone: z.string().default("America/Los_Angeles"),
  parents: z.object({
    notify_to: z.array(z.string().email()).min(1),
  }),
  email: z.object({
    allowed_senders: z.array(z.string()).default([]),
    allowed_domains: z.array(z.string()).default([]),
  }),
  sender_profiles: z
    .record(
      z.string(),
      z.object({
        child: z.string().optional(),
        activity: z.string().optional(),
        keywords: z.array(z.string()).optional(),
      })
    )
    .default({}),
});

let _config: AgentConfig | null = null;

export function loadConfig(
  configPath?: string
): AgentConfig {
  if (_config) return _config;

  const resolvedPath =
    configPath ??
    path.resolve(process.cwd(), "config", "agent.yml");

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = yaml.load(raw);
  _config = AgentConfigSchema.parse(parsed);

  // Override parent emails from env if provided
  const parentA = process.env.PARENT_A_EMAIL;
  const parentB = process.env.PARENT_B_EMAIL;
  if (parentA && parentB) {
    _config.parents.notify_to = [parentA, parentB];
  }

  return _config;
}

export function getConfig(): AgentConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}
