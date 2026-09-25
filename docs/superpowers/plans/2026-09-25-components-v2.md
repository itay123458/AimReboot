# Components V2 migration

User approved migrating the reference layout across the whole bot, not just its
palette. Implement inline with a separate final review.

## Design

Render outgoing bot messages at the client's REST boundary so slash replies,
prefix commands, channel sends, DMs, webhooks and background tasks all use the
same layout. V2 containers contain banner galleries, header/thumbnail sections,
readable fields, separators, metadata, and unchanged action rows. No SDK global
prototype changes. A reader decodes known component IDs for handlers that edit
ticket/role/application messages, and still accepts old embeds.

Partial edits merge against the current message. A callback update uses its
interaction's source message; PATCH requests fetch the target first. Preserve
flags, mentions, attachments, ephemeral visibility, and button custom IDs.
Native polls/stickers/voice messages retain Discord's required native format.
Over-limit views keep their controls and expose complete text as an attachment.

## Steps

- [x] Tests first: renderer, legacy/V2 readers, edits, attachments, mentions,
  limits, REST route coverage, callbacks, and all command/help views.
- [x] Implement rendering and attach it to the client; migrate message readers
  and nested-control traversal.
- [x] Verify and independently review; deploy and check readiness and the live
  generated V2 payload. Commit and push after checks pass.

## Constraints

- Do not send unsolicited test messages to Discord.
- Components V2 is permanent per message; edits cannot switch back to embeds.
- Stay within 40 components and 4,000 total text characters.
- Embed mentions must not acquire notification behavior during conversion.
- No persistent metadata database or in-memory state required to read panels.

## Verification

- 29 tests passed on the Pi using the production Node 20 image and staged source.
- All 271 source files passed syntax parsing.
- Independent review completed; overflow state and attachment issues fixed.
- Deployed source; readiness reports Discord connected, 99 commands, PostgreSQL healthy.
- Live-container help payload uses flag 32768, a container, 12 components, and the existing category menu. No test messages sent.
