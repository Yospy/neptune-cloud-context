import { basename, normalize } from "node:path";
import type { ContextType, Priority, Workstream } from "neptune-context-shared";
import { contextTypeValues, priorityValues, workstreamValues } from "neptune-context-shared";
import type { ProjectBinding } from "./config.js";

export type InferContextMetadataInput = {
  markdown: string;
  cwd?: string;
  filePath?: string;
  hint?: string;
  projectBinding?: ProjectBinding;
};

export type InferredContextMetadata = {
  title: string;
  summary: string;
  source_workstream: Workstream;
  target_workstreams: Workstream[];
  domain: string;
  code_areas: string[];
  context_type: ContextType;
  priority: Priority;
  tags: string[];
  repo_paths: string[];
  related_files: string[];
  confidence_score: number;
  inference_notes: string;
};

type KeywordMatch<T extends string> = {
  value: T;
  keywords: string[];
};

const domainMatches: KeywordMatch<string>[] = [
  { value: "auth", keywords: ["auth", "oauth", "login", "session", "token", "jwt", "permission"] },
  { value: "api", keywords: ["api", "endpoint", "route", "request", "response", "contract"] },
  { value: "database", keywords: ["database", "db", "schema", "migration", "supabase", "postgres", "sql"] },
  { value: "frontend", keywords: ["frontend", "ui", "component", "react", "page", "screen", "form"] },
  { value: "infra", keywords: ["infra", "deploy", "ci", "cd", "docker", "kubernetes", "env"] },
  { value: "testing", keywords: ["test", "tests", "vitest", "jest", "qa", "regression"] }
];

const contextTypeMatches: KeywordMatch<ContextType>[] = [
  { value: "api_contract", keywords: ["api contract", "endpoint", "request", "response", "status code"] },
  { value: "ui_contract", keywords: ["ui contract", "component", "form", "screen", "page"] },
  { value: "migration", keywords: ["migration", "schema change", "backfill", "alter table"] },
  { value: "bug_context", keywords: ["bug", "error", "failure", "regression", "broken"] },
  { value: "decision", keywords: ["decision", "adr", "decided", "tradeoff"] },
  { value: "setup_note", keywords: ["setup", "install", "configuration", "env var", "environment"] },
  { value: "requirement", keywords: ["requirement", "must", "should", "acceptance"] },
  { value: "implementation_note", keywords: ["implementation", "refactor", "function", "class", "module"] }
];

const workstreamMatches: KeywordMatch<Workstream>[] = [
  { value: "frontend", keywords: ["frontend", "ui", "react", "component", "page", "css"] },
  { value: "backend", keywords: ["backend", "api", "server", "database", "supabase", "route"] },
  { value: "mobile", keywords: ["mobile", "ios", "android", "react native"] },
  { value: "infra", keywords: ["infra", "deploy", "docker", "ci", "kubernetes"] },
  { value: "design", keywords: ["design", "figma", "mockup", "visual"] },
  { value: "qa", keywords: ["qa", "test", "regression", "manual verification"] },
  { value: "data", keywords: ["data", "analytics", "warehouse", "etl"] },
  { value: "docs", keywords: ["docs", "documentation", "readme"] }
];

const tagStopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "backend",
  "because",
  "context",
  "from",
  "have",
  "into",
  "markdown",
  "neptune",
  "that",
  "the",
  "this",
  "through",
  "with"
]);

function clampText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1).trimEnd();
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstHeading(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function firstNonEmptyLine(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line))
    .find(Boolean);
}

function titleFromFile(filePath?: string) {
  if (!filePath) return undefined;
  const name = basename(filePath).replace(/\.[^.]+$/, "");
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summaryFromMarkdown(markdown: string, title: string) {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((paragraph) => stripMarkdown(paragraph))
    .filter((paragraph) => paragraph && paragraph !== title);
  return clampText(paragraphs[0] ?? title, 500);
}

function scoreKeywords(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0);
}

function pickMatch<T extends string>(text: string, matches: KeywordMatch<T>[], fallback: T) {
  let best = { value: fallback, score: 0 };
  for (const match of matches) {
    const score = scoreKeywords(text, match.keywords);
    if (score > best.score) best = { value: match.value, score };
  }
  return best;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function inferTargetWorkstreams(source: Workstream, text: string): Workstream[] {
  const explicit = workstreamMatches
    .map((match) => ({ value: match.value, score: scoreKeywords(text, match.keywords) }))
    .filter((match) => match.score > 0 && match.value !== source)
    .map((match) => match.value);

  if (explicit.length) return unique(explicit).slice(0, 3);
  if (source === "frontend") return ["backend"];
  if (source === "backend") return ["frontend"];
  return ["general"];
}

function inferPriority(text: string): Priority {
  const normalized = text.toLowerCase();
  if (/(blocking|urgent|sev[ -]?1|production down|critical)/.test(normalized)) return "blocking";
  if (/(high priority|important|risk|deadline)/.test(normalized)) return "high";
  if (/(low priority|nice to have|later)/.test(normalized)) return "low";
  return "normal";
}

function inferPaths(filePath?: string) {
  if (!filePath) return { repo_paths: [], related_files: [], pathText: "" };
  const normalized = normalize(filePath);
  return {
    repo_paths: [normalized],
    related_files: [normalized],
    pathText: normalized.toLowerCase()
  };
}

function inferCodeAreas(text: string, filePath?: string) {
  const pathParts = filePath
    ? normalize(filePath)
        .split(/[\\/]/)
        .filter((part) => part && !part.includes("."))
        .slice(-3)
    : [];
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .map((match) => match[1]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .slice(0, 3) as string[];
  return unique([...pathParts, ...headings]).slice(0, 6);
}

function inferTags(text: string, domain: string, contextType: ContextType, codeAreas: string[]) {
  const words = text
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) {
    if (!tagStopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 5);
  return unique([domain, contextType.replace(/_context$|_note$|_contract$/, ""), ...codeAreas, ...repeated])
    .filter(Boolean)
    .slice(0, 10);
}

function isProjectIndex(title: string, text: string) {
  const normalizedTitle = title.toLowerCase();
  const normalizedText = text.toLowerCase();
  return normalizedTitle === "project index" || /\bcontext_type\s*[:=]\s*project_index\b/.test(normalizedText);
}

export function inferContextMetadata(input: InferContextMetadataInput): InferredContextMetadata {
  const markdown = input.markdown.trim();
  const { repo_paths, related_files, pathText } = inferPaths(input.filePath);
  const title = clampText(
    firstHeading(markdown) ?? firstNonEmptyLine(markdown) ?? titleFromFile(input.filePath) ?? "Untitled Context",
    160
  );
  const summary = summaryFromMarkdown(markdown, title);
  const combinedText = [input.hint, input.filePath, markdown].filter(Boolean).join("\n").toLowerCase();
  if (isProjectIndex(title, combinedText)) {
    const code_areas = inferCodeAreas(markdown, input.filePath);
    return {
      title,
      summary,
      source_workstream: "general",
      target_workstreams: ["general"],
      domain: "general",
      code_areas,
      context_type: "project_index",
      priority: "high",
      tags: unique(["general", "project-index", "index", ...code_areas]).slice(0, 10),
      repo_paths,
      related_files,
      confidence_score: 0.95,
      inference_notes: "project index convention detected; fixed general routing metadata"
    };
  }
  const sourcePick = pickMatch<Workstream>(
    `${input.hint ?? ""}\n${pathText}`,
    workstreamMatches,
    input.projectBinding?.default_workstream ?? "general"
  );
  const source_workstream = workstreamValues.includes(sourcePick.value) ? sourcePick.value : "general";
  const target_workstreams = inferTargetWorkstreams(source_workstream, combinedText);
  const domainPick = pickMatch(combinedText, domainMatches, "general");
  const contextTypePick = pickMatch<ContextType>(combinedText, contextTypeMatches, "general_context");
  const context_type = contextTypeValues.includes(contextTypePick.value)
    ? contextTypePick.value
    : "general_context";
  const priority = inferPriority(combinedText);
  const code_areas = inferCodeAreas(markdown, input.filePath);
  const tags = inferTags(combinedText, domainPick.value, context_type, code_areas);
  const signalCount = [
    Boolean(firstHeading(markdown)),
    summary !== title,
    sourcePick.score > 0 || Boolean(input.projectBinding?.default_workstream),
    domainPick.score > 0,
    contextTypePick.score > 0,
    code_areas.length > 0,
    tags.length > 2
  ].filter(Boolean).length;
  const confidence_score = Math.min(0.95, Math.max(0.25, Number((0.25 + signalCount * 0.1).toFixed(2))));
  const notes = [
    firstHeading(markdown) ? "title from first H1" : "title from first available text",
    sourcePick.score > 0
      ? `source workstream inferred as ${source_workstream}`
      : input.projectBinding?.default_workstream
        ? `source workstream from project binding ${source_workstream}`
        : "source workstream defaulted to general",
    domainPick.score > 0 ? `domain inferred as ${domainPick.value}` : "domain defaulted to general",
    contextTypePick.score > 0 ? `context type inferred as ${context_type}` : "context type defaulted to general_context"
  ];
  if (confidence_score < 0.6) notes.push("low confidence; confirm metadata before upload");

  return {
    title,
    summary,
    source_workstream,
    target_workstreams,
    domain: domainPick.value,
    code_areas,
    context_type,
    priority: priorityValues.includes(priority) ? priority : "normal",
    tags,
    repo_paths,
    related_files,
    confidence_score,
    inference_notes: notes.join("; ")
  };
}
