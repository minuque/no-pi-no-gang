export function shortenWorkspacePath(cwd: string, homeDir: string): string {
  const path = homeDir && cwd.startsWith(homeDir) ? `~${cwd.slice(homeDir.length)}` : cwd;
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 3) return path;
  if (parts[0] === "~") return ["~", "...", parts.at(-1)].join(separator);
  return [parts[0], parts[1], "...", parts.at(-1)].filter(Boolean).join(separator);
}
