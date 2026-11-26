# Skill sources

Every file added in this change, with its source repository and pinned commit. `self-written` means it was written for this repository and does not come from an upstream skill repo.

Only Markdown, LICENSE, and YAML files were copied from upstream. No scripts, hooks, `.mcp.json`, or package files were added.

`web-quality-audit` and `scripts/analyze.sh` from addyosmani/web-quality-skills were not copied.

C's skill folder is `accessibility`. B's folder is `better-accessibility`. Those names do not collide, so C was not renamed to `web-quality-accessibility`. Frontmatter `name` matches each folder.

## Modifications

### D. web-design-guidelines

- `SKILL.md` is from vercel-labs/agent-skills at `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`, then edited so the skill reads the local `guidelines.md`.
- Every step that fetched guidelines from the network (`WebFetch`, `raw.githubusercontent.com`) was removed.
- `guidelines.md` is `command.md` from vercel-labs/web-interface-guidelines at `434b7f91364665f2f733b310ec54809bf8f37937`, with a header comment noting that source repo and commit.
- `install.sh` was not included. `skills/web-design-guidelines.zip` was not included.

### E. playwright-cli

- Only `skills/playwright-cli/` was copied from microsoft/playwright-cli at `b21724888b8100b05ef8dee3a92f2bb03bf4dcde`. No JavaScript files from the repository root.
- In `SKILL.md`, `npm install -g @playwright/cli@latest` was changed to `npm install -g --ignore-scripts @playwright/cli@0.1.24`.
- In `references/test-generation.md`, `npm init playwright@latest` was replaced with the same pinned install command. The folder contains no `@latest`.

## Files

| Path | Source repo | Pinned commit |
| --- | --- | --- |
| `.cursor/skills/SOURCES.md` | self-written | self-written |
| `.cursor/skills/duang-site-guardrails/SKILL.md` | self-written | self-written |
| `.impeccable/config.json` | self-written | self-written |
| `.cursor/skills/frontend-design/LICENSE.txt` | anthropics/skills | `2c5958ecac7cee2b583967a2c4981d0f4a75c579` |
| `.cursor/skills/frontend-design/SKILL.md` | anthropics/skills | `2c5958ecac7cee2b583967a2c4981d0f4a75c579` |
| `.cursor/skills/better-typography/SKILL.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/agents/openai.yaml` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/choosing-fonts.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/css-cheat-sheet.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/details-and-accessibility.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/spacing-and-sizing.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/variable-fonts-and-opentype.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-typography/wrapping-and-punctuation.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/SKILL.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/agents/openai.yaml` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/color-formats.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/color-usage.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/contrast.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/palette-generation.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/palette-structure.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-colors/token-naming.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-layout/SKILL.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-layout/agents/openai.yaml` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-layout/grouping-and-alignment.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-layout/spacing-and-adaptivity.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/SKILL.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/agents/openai.yaml` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/focus-and-keyboard.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/forms.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/hit-areas.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/motion-and-zoom.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/screen-readers.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/better-accessibility/semantics-and-aria.md` | jakubkrehel/skills | `a72290d140249813898ba8648becf6415abcb059` |
| `.cursor/skills/performance/SKILL.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/performance/references/MEASUREMENT.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/performance/references/RUM.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/core-web-vitals/SKILL.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/core-web-vitals/references/CLS.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/core-web-vitals/references/INP.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/core-web-vitals/references/LCP.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/accessibility/SKILL.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/accessibility/references/A11Y-PATTERNS.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/accessibility/references/WCAG.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/seo/SKILL.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/seo/references/STRUCTURED-DATA.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/best-practices/SKILL.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/best-practices/references/SECURITY.md` | addyosmani/web-quality-skills | `afa8da942115f2961fdbfa80807ea0b232ff6c00` |
| `.cursor/skills/web-design-guidelines/SKILL.md` | vercel-labs/agent-skills | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` |
| `.cursor/skills/web-design-guidelines/guidelines.md` | vercel-labs/web-interface-guidelines | `434b7f91364665f2f733b310ec54809bf8f37937` |
| `.cursor/skills/playwright-cli/SKILL.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/element-attributes.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/playwright-tests.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/pr-attachments.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/request-mocking.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/running-code.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/session-management.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/storage-state.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/test-generation.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/tracing.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |
| `.cursor/skills/playwright-cli/references/video-recording.md` | microsoft/playwright-cli | `b21724888b8100b05ef8dee3a92f2bb03bf4dcde` |

`web-design-guidelines/SKILL.md` and `playwright-cli/SKILL.md` plus `playwright-cli/references/test-generation.md` are modified copies. See Modifications above. `guidelines.md` adds only the source header comment; the rest is the pinned `command.md`.
