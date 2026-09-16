/* Composition — turning whatever the user pastes or scans into a report URL.
   People paste links out of chat apps, so this has to survive smart quotes,
   HTML entities, bare player ids and "player_id=123" fragments.

   No report host is baked into this module. A pasted link carries its own host, and
   the only input that needs one of its own is a bare player id, which falls back to
   the base configured in Settings. */

import { Settings } from '../core/settings.js';

/* The report site treats a missing `language` as its own default, which is
   Traditional Chinese. So the way to ask for Chinese is to leave the parameter
   off entirely — the site only understands the parameter as a way to switch away
   from Chinese, and sending `language=tc` is not the same thing. */
export const DEFAULT_REPORT_LANGUAGE = 'tc';

const CHINESE_ALIASES = ['tc', 'zh', 'zh-tw', 'zh-hant', 'zh-hk', 'cht'];

/** The configured report base, or an empty string when none is set. */
export function reportBase() {
  return String(Settings.get().reportBase || '').trim();
}

/** True when this language code means "the site's own default", i.e. Chinese. */
export function isChineseLanguage(language) {
  const wanted = String(language || '').trim().toLowerCase();
  return !wanted || CHINESE_ALIASES.indexOf(wanted) !== -1;
}

/** A report URL for one player. Throws when no report base is configured. */
export function playerReportUrl(playerId, language) {
  const base = reportBase();
  if (!base) throw new Error('No report address is configured. Add one in Settings.');

  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('player_id', playerId);
  if (!isChineseLanguage(language)) url.searchParams.set('language', String(language).trim());
  return url.toString();
}

/**
 * @returns {{ok: true, url: string, playerId: string|null, language: string, host: string}
 *          | {ok: false, reason: 'empty'|'not-a-url'|'no-base'}}
 */
export function parseReportUrl(input) {
  // Decodes pasted HTML entities ("&amp;") without touching the real URL.
  const holder = document.createElement('textarea');
  holder.innerHTML = String(input || '');
  let text = holder.value.trim().replace(/^[`"']+|[`"']+$/g, '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  // A bare digit string is a player id. Checked before the URL pattern so a
  // six-digit id is never mistaken for a hostname.
  const barePlayer = text.match(/^\d{6,}$/);
  if (barePlayer) {
    const playerId = barePlayer[0];
    if (!reportBase()) return { ok: false, reason: 'no-base' };
    const url = new URL(playerReportUrl(playerId, DEFAULT_REPORT_LANGUAGE));
    return { ok: true, url: url.toString(), playerId, language: DEFAULT_REPORT_LANGUAGE, host: url.hostname };
  }

  const match = text.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?[^\s<>"'`]*/i);
  const playerParam = text.match(/(?:player[_-]?id)\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i);

  // A dangling "player_id=..." fragment is only used when no URL was found at
  // all, so a full link keeps its own host and language.
  if (!match && playerParam) {
    if (!reportBase()) return { ok: false, reason: 'no-base' };
    const languageMatch = text.match(/(?:language|lang)\s*[:=]\s*["']?([A-Za-z-]+)/i);
    const playerId = playerParam[1];
    const language = languageMatch ? languageMatch[1] : DEFAULT_REPORT_LANGUAGE;
    const url = new URL(playerReportUrl(playerId, language));
    return { ok: true, url: url.toString(), playerId, language, host: url.hostname };
  }

  let candidate = (match ? match[0] : text).replace(/[),.;!?]+$/g, '');
  if (/^www\./i.test(candidate)) candidate = 'http://' + candidate;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = 'http://' + candidate;

  let url;
  try {
    url = new URL(candidate);
  } catch (e) {
    return { ok: false, reason: 'not-a-url' };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, reason: 'not-a-url' };

  url.hash = '';
  const playerId = url.searchParams.get('player_id') || url.searchParams.get('playerId') || null;
  const language = url.searchParams.get('language') || url.searchParams.get('lang') || DEFAULT_REPORT_LANGUAGE;
  return { ok: true, url: url.toString(), playerId, language, host: url.hostname };
}
