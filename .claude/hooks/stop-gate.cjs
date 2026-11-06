// Stop hook: while a /build run is in progress, the session may not end until QA has passed.
// Only active when .build-in-progress exists, so normal chat is never blocked.
const fs = require("fs");
const path = require("path");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch { process.exit(0); }
  if (input.stop_hook_active) process.exit(0); // avoid an endless loop

  const root = input.cwd || process.cwd();
  if (!fs.existsSync(path.join(root, ".build-in-progress"))) process.exit(0);

  const report = path.join(root, "qa", "QA-REPORT.md");
  const last = fs.existsSync(report)
    ? fs.readFileSync(report, "utf8").trim().split(/\r?\n/).filter(Boolean).pop()
    : "";

  if (last && last.trim() === "RESULT: PASS") process.exit(0);

  process.stderr.write(
    "Build not finished: qa/QA-REPORT.md does not end with 'RESULT: PASS'. " +
    "Send the listed fixes to builder agents, then run the qa agent again. " +
    "If you are blocked on something only the human can do (keys, logins), say so clearly and delete .build-in-progress."
  );
  process.exit(2);
});
