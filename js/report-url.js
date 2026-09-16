/* Composition — turning whatever the user pastes or scans into a report URL.
   People paste links out of chat apps, so this has to survive smart quotes,
   HTML entities, bare player ids and "player_id=123" fragments. */

const PLAYER_REPORT_BASE = 'http://13.251.17.127/tanita/selftestfitnesscorner/';

export function playerReportUrl(playerId, language) {
  return PLAYER_REPORT_BASE + '?player_id=' + encodeURIComponent(playerId) +
    '&language=' + encodeURIComponent(language || 'en');
}

/**
 * @returns {{ok: true, url: string, playerId: string|null, language: string|null, host: string}
 *          | {ok: false, reason: 'empty'|'not-a-url'}}
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
    const url = new URL(playerReportUrl(playerId, 'en'));
    return { ok: true, url: url.toString(), playerId, language: 'en', host: url.hostname };
  }

  const match = text.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?[^\s<>"'`]*/i);
  const playerParam = text.match(/(?:player[_-]?id)\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i);

  // A dangling "player_id=..." fragment is only used when no URL was found at
  // all, so a full link keeps its own host and language.
  if (!match && playerParam) {
    const languageMatch = text.match(/(?:language|lang)\s*[:=]\s*["']?([A-Za-z-]+)/i);
    const playerId = playerParam[1];
    const language = languageMatch ? languageMatch[1] : 'en';
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
  const language = url.searchParams.get('language') || url.searchParams.get('lang') || null;
  return { ok: true, url: url.toString(), playerId, language, host: url.hostname };
}
