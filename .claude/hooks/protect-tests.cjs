// Blocks any edit to locked acceptance tests once .tests-locked exists.
// Runs as a Claude Code PreToolUse hook. Exit code 2 = block, message on stderr goes back to the agent.
const fs = require("fs");
const path = require("path");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch { process.exit(0); }

  const root = input.cwd || process.cwd();
  if (!fs.existsSync(path.join(root, ".tests-locked"))) process.exit(0); // not locked yet: tester is still writing

  const norm = (p) => String(p || "").replace(/\\/g, "/");
  const ti = input.tool_input || {};
  const protectedHit = (p) => /(^|\/)tests\/acceptance\//.test(norm(p)) || /(^|\/)\.tests-locked$/.test(norm(p)) || /(^|\/)SPEC\.md$/.test(norm(p));

  let hit = false;
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(input.tool_name)) {
    hit = protectedHit(ti.file_path || ti.notebook_path);
  } else if (input.tool_name === "Bash") {
    const cmd = norm(ti.command);
    const touches = /tests\/acceptance|\.tests-locked|SPEC\.md/.test(cmd);
    const writes = /(\brm\b|\bmv\b|\bcp\b|\bsed\s+-i|\btee\b|>|\bdel\b|Remove-Item|Set-Content|Out-File|git\s+(checkout|restore|rm))/.test(cmd);
    hit = touches && writes;
  }

  if (hit) {
    process.stderr.write(
      "BLOCKED: tests/acceptance/, .tests-locked and SPEC.md are locked. " +
      "Fix the implementation instead. If a locked test is genuinely wrong, write the reason in qa/TEST-DISPUTES.md and ask the human to unlock it."
    );
    process.exit(2);
  }
  process.exit(0);
});
