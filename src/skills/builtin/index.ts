import { parseSkillContent } from '../parser.js';
import { Skill } from '../types.js';

const CODE_REVIEW_RAW = `---
name: code-review
description: Code quality, security, and performance review SOP
version: 1.0.0
author: qingmei-team
tags: [review, git, quality]
required_tools: [read_file, run_command]
---

# Code Review Expert Protocol

When performing code review, adhere to the following workflow:
1. Examine git changes using \`run_command\` (e.g. \`git diff\` or \`git status\`).
2. Read the surrounding file context using \`read_file\` to verify consistency.
3. Review checklist:
   - **Correctness & Logic**: Edge cases, null/undefined safety, error handling.
   - **Performance**: Unnecessary allocations, blocking loops, memory leaks.
   - **Security**: Injection risks, secrets in code, unsafe command executions.
   - **Maintainability**: Clear naming, single responsibility, type safety.
4. Output constructive, prioritized feedback with exact file and line references.
`;

const GIT_ASSISTANT_RAW = `---
name: git-assistant
description: Conventional Commits generation and Git workflow helper
version: 1.0.0
author: qingmei-team
tags: [git, commit, workflow]
required_tools: [run_command]
---

# Git Assistant Protocol

When assisting with Git operations and commit generation:
1. Run \`git status\` and \`git diff --staged\` (or \`git diff\`) to inspect all staged/unstaged changes.
2. Formulate commit messages strictly adhering to the Conventional Commits specification:
   - \`feat:\`, \`fix:\`, \`docs:\`, \`style:\`, \`refactor:\`, \`perf:\`, \`test:\`, \`chore:\`
3. Provide a clear, concise summary on the first line (imperative mood, <= 72 characters).
4. If there are multiple distinct logical changes, recommend splitting into smaller commits.
`;

const BUG_HUNTER_RAW = `---
name: bug-hunter
description: Systematic debugging and root-cause analysis protocol
version: 1.0.0
author: qingmei-team
tags: [debug, diagnosis, troubleshooting]
required_tools: [read_file, run_command]
---

# Bug Hunter Protocol

When troubleshooting or diagnosing a bug/failure:
1. **Reproduce & Observe**: Run the failing test or command using \`run_command\` and capture exact stack trace.
2. **Trace & Isolate**: Read relevant source files and pinpoint the exact offending function/line.
3. **Root Cause Analysis**: Formulate a hypothesis and explain *why* the failure occurred.
4. **Fix & Verify**: Propose minimal, non-breaking fixes and run tests to verify resolution.
`;

export function getBuiltinSkills(): Skill[] {
  const skills: Skill[] = [];
  const s1 = parseSkillContent(CODE_REVIEW_RAW, 'builtin:code-review', 'builtin');
  if (s1) skills.push(s1);

  const s2 = parseSkillContent(GIT_ASSISTANT_RAW, 'builtin:git-assistant', 'builtin');
  if (s2) skills.push(s2);

  const s3 = parseSkillContent(BUG_HUNTER_RAW, 'builtin:bug-hunter', 'builtin');
  if (s3) skills.push(s3);

  return skills;
}
