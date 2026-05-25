export const workstreamValues = [
  "frontend",
  "backend",
  "mobile",
  "infra",
  "design",
  "qa",
  "data",
  "docs",
  "general"
] as const;

export const contextTypeValues = [
  "api_contract",
  "ui_contract",
  "implementation_note",
  "decision",
  "migration",
  "bug_context",
  "setup_note",
  "requirement",
  "general_context",
  "project_index"
] as const;

export const contextStatusValues = [
  "draft",
  "active",
  "resolved",
  "superseded",
  "archived"
] as const;

export const priorityValues = ["low", "normal", "high", "blocking"] as const;

export type Workstream = (typeof workstreamValues)[number];
export type ContextType = (typeof contextTypeValues)[number];
export type ContextStatus = (typeof contextStatusValues)[number];
export type Priority = (typeof priorityValues)[number];
