import { EmbedBuilder as DiscordEmbedBuilder, resolveColor } from 'discord.js';
import { getColor } from '../config/bot.js';
import { theme, legacyColors } from '../config/theme.js';

// Explicitly imported by built-in bot messages. User-authored embeds can use
// Discord's original builder without any global prototype side effects.
export class EmbedBuilder extends DiscordEmbedBuilder {
  constructor(data = {}) {
    super(data);
    // Keep existing message data exact when cloning (including color previews).
    if (this.data.color === undefined) this.setColor(theme.gold);
    this.setFooter(this.data.footer
      ? { text: this.data.footer.text, iconURL: this.data.footer.icon_url }
      : { text: theme.brand });
  }

  static from(other) {
    return new this(typeof other.toJSON === 'function' ? other.toJSON() : other);
  }

  setColor(color) {
    if (color === null) return super.setColor(null);
    let resolved;
    try {
      resolved = resolveColor(color);
    } catch {
      resolved = getColor(color);
    }
    return super.setColor(legacyColors.get(resolved) ?? resolved);
  }

  // Color itself is content in /hexcolor and member-role previews.
  setExactColor(color) {
    return super.setColor(color);
  }

  setFooter(footer) {
    if (footer === null) return super.setFooter(null);
    const input = typeof footer === 'string' ? { text: footer } : footer;
    const text = (input?.text || '').replace(/\bTitan\s?Bot\b/gi, theme.brand).trim();
    const branded = !text || /^Made with\b/i.test(text) ? theme.brand
      : text === theme.brand || text.startsWith(`${theme.brand} • `) ? text
        : `${theme.brand} • ${text}`;
    return super.setFooter({ ...input, text: branded.slice(0, 2048) });
  }

  toJSON() {
    const data = super.toJSON();
    if (!data.footer) return data;

    const bodyLength = (data.title?.length || 0) + (data.description?.length || 0)
      + (data.author?.name?.length || 0)
      + (data.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    const available = Math.max(0, 6000 - bodyLength);
    if (data.footer.text.length > available) {
      // Metadata takes precedence over decorative branding on full embeds.
      const prefix = `${theme.brand} • `;
      const text = data.footer.text.startsWith(prefix) ? data.footer.text.slice(prefix.length) : data.footer.text;
      if (available) data.footer = { ...data.footer, text: text.slice(0, available) };
      else delete data.footer;
    }
    return data;
  }
}
