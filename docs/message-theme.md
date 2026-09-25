# AimReboot message theme

Built-in messages use a shared gold palette and AimReboot branding, including
help, moderation, logs, tickets, reaction roles, verification, levels, economy,
music, birthdays, and configuration dashboards.

The theme is defined in `src/config/theme.js`. Use `createEmbed` from
`src/utils/embeds.js` for new messages, or `EmbedBuilder` from
`src/utils/themedEmbed.js` when chaining builder methods.

| Purpose | Color |
| --- | --- |
| Main cards and information | `#D4AF37` |
| Secondary/inactive cards | `#B89B56` |
| Success | `#65B88A` |
| Warning | `#E5B95C` |
| Error | `#D96C75` |

Outgoing messages use Components V2: accent-colored containers, header/thumbnail
sections, image galleries, separated fields and metadata, and controls inside the
card. Discord controls backgrounds, typography, and button colors; the dark
appearance follows the viewer's Discord theme. Previously posted messages migrate
when edited; reopen command panels or repost configured panels to see the layout.

`src/utils/componentsV2Transport.js` installs a client-local REST adapter after
the application's REST client is created. Existing command builders remain the
internal message model. Channel messages, DMs, interaction replies, follow-ups,
and updates share the renderer in `src/utils/componentsV2.js`. Modals and native
poll/sticker/voice messages retain their required Discord format.

Partial edits preserve card content, controls, and attachments. PATCH requests
fetch the current message, with cached-message fallback when history permission
is unavailable. After a restart, editing existing channel panels requires Read
Message History. V2 messages cannot be converted back to native embeds.

Use `readMessageEmbeds` for panel identification and `readEditableMessageEmbeds`
before changing its fields or description. Stable component IDs preserve the
card structure across restarts. Views exceeding 40 components or 4,000 text
characters show an excerpt with their controls and a complete text attachment;
that attachment also carries source data so subsequent edits preserve all fields.
Use `readMessageContent` for plain text and `getActionRows` for nested controls.
Converted embed mentions do not gain notification behavior.

User-authored embed previews use the original Discord.js builder internally and
the shared V2 renderer when sent. Saved
welcome/goodbye colors are preserved; their default accent is gold. Commands
whose color represents data, such as `/hexcolor`, use `setExactColor`.

Run `npm ci` then `npm test` to check the palette, V2 layouts, readers, partial
edits, attachments, mentions, overflow recovery, Discord.js REST integration,
command imports, music cards, and all help categories and pagination pages.
Tests do not log in to Discord or send messages.

API reference: https://docs.discord.com/developers/components/reference
