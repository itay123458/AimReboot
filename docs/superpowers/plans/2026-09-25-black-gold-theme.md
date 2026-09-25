# AimReboot black-and-gold message theme

**Goal:** Apply the reference video's gold-accented, clearly sectioned Discord
message style across all built-in bot features.

**Architecture:** A project-owned EmbedBuilder subclass supplies the common
palette and AimReboot footer. All built-in embed producers use it explicitly,
replacing the global Discord.js prototype modifications. Keep Discord's native
embed payloads so existing message readers, pagination, collectors, and saved
panels continue to function. Discord controls backgrounds and button colors.

**Design:** Primary gold #D4AF37, softer gold #B89B56, success #65B88A,
warning #E5B95C, error #D96C75, white #F5F1E8. Preserve expressive icons,
native bold field headings, image/thumbnail placement, timestamps, and metadata.
Keep user-authored embed previews and explicitly configured welcome colors exact.
Support links remain hidden. No unsolicited messages to channels.

## Execution

- [x] Add native Node tests for palette, shared messages, direct builders,
  metadata preservation, custom embed isolation, help and music payloads.
- [x] Implement theme and migrate every direct builder import; theme hard-coded
  birthday, logging, and feature colors; update help copy and builder presets.
- [x] Verify all source parses, command modules load, help pagination, and the
  tests pass using the Pi's Node container against a separate source directory.
- [x] Review the whole diff, deploy, and verify readiness.

## Review focus

- Preserve field labels/values used by interaction handlers.
- Keep authored colors and content intact in user-facing embed editors.
- Do not append duplicate branding when cloning/editing existing embeds.
- Respect embed text/field limits and preserve clearFooter/setColor(null).
- Avoid import cycles or global changes to Discord.js classes.

## Verification ledger

Baseline: no test script or tests in the repository. Existing bot readiness was
verified during the preceding deployment. Tests here run against staged source,
without logging a second bot into Discord.

Results: the initial six tests failed on the old palette, removed icons,
suppressed metadata, and global mutation of custom embeds. After implementation,
all 12 tests pass. Every help category/page serializes and all 269 source files
parse. A separate review found a total-text-limit issue; a failing boundary test
confirmed it, and the serializer now prioritizes footer metadata over branding.
Exact-color cloning is covered too. Follow-up review found no important issues.

Deployment: production image rebuilt successfully. Live message checks confirm
the gold accent, Command Center heading, AimReboot footer, and hidden support
links. `/ready` reports ready with 99 commands, one guild, and healthy PostgreSQL.
