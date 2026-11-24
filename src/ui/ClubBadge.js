/**
 * Crisp procedural SVG club crests & player jersey emblems.
 */

export function renderClubBadgeSVG(club, size = 44) {
  const p = club.primary || '#FFFFFF';
  const s = club.secondary || '#F59E0B';
  const a = club.accent || '#0F172A';
  const label = club.shortName || 'FC';

  const isLight = isLightHex(p);
  const textFill = isLight ? '#0F172A' : '#FFFFFF';

  if (club.crestStyle === 'circle') {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="${p}" stroke="${a}" stroke-width="4"/>
        <circle cx="32" cy="32" r="22" fill="none" stroke="${s}" stroke-width="2.5" stroke-dasharray="4 3"/>
        <text x="32" y="38" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="20" fill="${textFill}" letter-spacing="1">${label}</text>
      </svg>
    `;
  }

  if (club.crestStyle === 'crown') {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M18 16L24 8L32 14L40 8L46 16H18Z" fill="${s}" stroke="${a}" stroke-width="1.5"/>
        <circle cx="32" cy="37" r="21" fill="${p}" stroke="${s}" stroke-width="4"/>
        <path d="M18 24L46 50" stroke="${a}" stroke-width="6" stroke-linecap="round" opacity="0.22"/>
        <text x="32" y="43" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="18" fill="${a}" letter-spacing="1">${label}</text>
      </svg>
    `;
  }

  // Classic football shield (with stripes if Barcelona-style)
  const stripeOverlay =
    club.pattern === 'stripes'
      ? `<clipPath id="clip-${club.id}-${size}"><path d="M12 10H52V33C52 46 32 56 32 56C32 56 12 46 12 33V10Z"/></clipPath>
         <g clip-path="url(#clip-${club.id}-${size})">
           <rect x="20" y="10" width="8" height="48" fill="${s}"/>
           <rect x="36" y="10" width="8" height="48" fill="${s}"/>
         </g>`
      : '';

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M12 10H52V33C52 46 32 56 32 56C32 56 12 46 12 33V10Z" fill="${p}" stroke="${a}" stroke-width="3.5"/>
      ${stripeOverlay}
      <path d="M12 24H52" stroke="${s}" stroke-width="2.5" opacity="0.7"/>
      <text x="32" y="40" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="18" fill="${club.pattern === 'stripes' ? '#FFFFFF' : textFill}" stroke="${club.pattern === 'stripes' ? '#0B1218' : 'none'}" stroke-width="2" paint-order="stroke" letter-spacing="1">${label}</text>
    </svg>
  `;
}

function isLightHex(hex) {
  const c = String(hex || '#FFFFFF').replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 175;
}
