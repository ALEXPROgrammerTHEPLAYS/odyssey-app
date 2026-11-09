import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;

function isPublicAddress(address, family) {
  if (family === 4) {
    const [first, second, third] = address.split('.').map(Number);
    return !(
      first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 192 && second === 0 && (third === 0 || third === 2))
      || (first === 192 && second === 88 && third === 99)
      || (first === 198 && (second === 18 || second === 19))
      || (first === 198 && second === 51 && third === 100)
      || (first === 203 && second === 0 && third === 113)
      || first >= 224
    );
  }

  const normalized = address.toLowerCase();
  return (
    /^[23][0-9a-f]{0,3}:/.test(normalized)
    && !normalized.startsWith('3ffe:')
    && !normalized.startsWith('3fff:')
    && !normalized.startsWith('2001:db8:')
    && !/^2001:(?:0|2|10|20)(?::|$)/.test(normalized)
  );
}

async function resolvePublicHost(hostname) {
  const addresses = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The source host lookup timed out.')), REQUEST_TIMEOUT_MS);
    lookup(hostname, { all: true, verbatim: true }).then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address, family))) {
    throw new Error('The source host must resolve only to public IP addresses.');
  }
  return addresses[0];
}

function validateHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('Enter a valid HTTPS source URL.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid HTTPS source URL.');
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || isIP(url.hostname)
    || !url.hostname.includes('.')
  ) {
    throw new Error('Only public HTTPS source URLs on the standard port are supported.');
  }
  return url;
}

function requestSource(url, address) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, application/rss+xml, application/atom+xml, application/xml, text/csv, text/plain;q=0.8',
        'user-agent': 'Odyssey-Opportunity-Source-Check/1.0',
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      timeout: REQUEST_TIMEOUT_MS,
      maxHeaderSize: 16 * 1024,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error('The source response exceeded the 1 MB limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        location: response.headers.location,
        contentType: response.headers['content-type'] || '',
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });

    const deadline = setTimeout(() => request.destroy(new Error('The source request timed out.')), REQUEST_TIMEOUT_MS);
    request.on('close', () => clearTimeout(deadline));
    request.on('timeout', () => request.destroy(new Error('The source request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicHttpsUrl(value) {
  let url = validateHttpsUrl(value);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const address = await resolvePublicHost(url.hostname);
    const response = await requestSource(url, address);
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirectCount === MAX_REDIRECTS) throw new Error('The source redirected too many times.');
      url = validateHttpsUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`The source returned HTTP ${response.status}.`);
    }
    return { ...response, url };
  }
  throw new Error('The source redirected too many times.');
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&#([0-9]+);/g, (_match, code) => {
      const point = Number.parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTagText(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function getFeedLink(xml, entryIsAtom) {
  if (entryIsAtom) {
    const links = [...xml.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
    const alternate = links.find((match) => !/\brel=["'](?:self|enclosure|edit)["']/i.test(match[1]));
    return decodeXml(alternate?.[1].match(/\bhref=["']([^"']+)["']/i)?.[1] || '');
  }
  return getTagText(xml, ['link']);
}

export function parseRssFeed(xml, sourceName) {
  if (typeof xml !== 'string' || !/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) {
    throw new Error('The source response is not a recognized RSS or Atom feed.');
  }
  const atom = /<feed\b/i.test(xml);
  const entryTags = atom ? /<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi : /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
  const entries = [...xml.matchAll(entryTags)].slice(0, 50);
  if (entries.length === 0) throw new Error('The feed contains no entries to review.');

  return entries.flatMap((entry) => {
    const itemXml = entry[1];
    const title = getTagText(itemXml, ['title']).slice(0, 300);
    const link = getFeedLink(itemXml, atom);
    if (!title || !link) return [];

    let safeLink;
    try {
      safeLink = new URL(link);
    } catch {
      return [];
    }
    if (!['http:', 'https:'].includes(safeLink.protocol)) return [];

    const description = getTagText(itemXml, atom ? ['summary', 'content'] : ['description', 'content:encoded'])
      .slice(0, 5000);
    const externalId = getTagText(itemXml, atom ? ['id'] : ['guid']) || safeLink.href;
    const itemId = createHash('sha256').update(externalId).digest('hex');
    return [{
      title,
      organization: sourceName.slice(0, 200),
      category: 'Tech',
      description: description || 'Imported from an official feed. Review and edit this entry before publishing.',
      requirements: 'Review the official source and confirm eligibility before publishing.',
      location: 'To be reviewed',
      format: 'virtual',
      apply_url: safeLink.href,
      source_item_id: itemId,
      publishing_status: 'pending',
    }];
  });
}
