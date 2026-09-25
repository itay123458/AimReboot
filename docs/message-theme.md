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

Native Discord headings, fields, images, icons, and timestamps retain their
meaning. Footer metadata such as page numbers and ticket IDs follows the brand;
branding yields to metadata when a card reaches Discord's text limit.

These are standard embeds, with existing action rows and interaction IDs.
Discord controls background colors, typography, and button colors. The dark
appearance follows the viewer's Discord theme; this is not a Components V2
migration. Previously posted messages update when the bot next edits them;
reopen command panels or repost configured panels to see the new style.

User-authored embed previews use the original Discord.js builder. Saved
welcome/goodbye colors are preserved; their default accent is gold. Commands
whose color represents data, such as `/hexcolor`, use `setExactColor`.

Run `npm ci` then `npm test` to check the palette, native/custom embed isolation,
metadata, cloning, text limits, music details, command imports, and all help
categories and pagination pages. Tests do not log in to Discord or send messages.
