import { FACTIONS, REGIONS, CARDS } from './game/engine.js';

// Skins only change presentation. Historical engine identifiers and saved moves stay stable.
export const normalizeTheme = value => value === 'roman' ? 'roman' : 'medieval';
export const GAME_TITLE = 'The Toga Is Dead';
export const COURT = [
  { name: 'Lady Elara', role: 'The diplomat', image: 'elara', color: '#557c72', motto: 'A quiet word can move a kingdom.' },
  { name: 'Lord Cassian', role: 'The courtier', image: 'cassian', color: '#a45948', motto: 'Every alliance has its moment.' },
  { name: 'Lady Maren', role: 'The admiral', image: 'maren', color: '#54788b', motto: 'Read the tide before you sail.' },
  { name: 'Lord Rowan', role: 'The scholar', image: 'rowan', color: '#a48143', motto: 'Patience is a kind of power.' },
];
export const THEMES = {
  medieval: { title: GAME_TITLE, subtitle: 'A kingdom without a crown', place: 'kingdom', heading: 'The crown awaits.', description: 'Three factions. Eight regions. One empty throne.', ending: 'THE CORONATION', factions: { scots: 'Scottish', welsh: 'Welsh', english: 'English' } },
  roman: { title: GAME_TITLE, subtitle: 'The fate of an empire', place: 'empire', heading: 'An empire in the balance.', description: 'Win the Senate. Rally the legions. Claim the laurel.', ending: 'THE IMPERIAL SUCCESSION', factions: { scots: 'Senate', welsh: 'Citizens', english: 'Legions' }, regions: { moray: 'Cisalpina', strathclyde: 'Etruria', lancaster: 'Latium', northumbria: 'Umbria', gwynedd: 'Sardinia', warwick: 'Campania', essex: 'Apulia', devon: 'Sicilia' } },
};
export const factionMeta = {
  scots: { color: '#528a9b', symbol: '◆' },
  welsh: { color: '#b88d37', symbol: '●' },
  english: { color: '#ae6256', symbol: '▲' },
};
export const regionTitle = (theme, id) => THEMES[normalizeTheme(theme)].regions?.[id] ?? REGIONS.find(r => r.id === id)?.name ?? id;
export const factionTitle = (theme, id) => THEMES[normalizeTheme(theme)].factions[id] ?? id;
export function cardTitle(theme, id) {
  const card = CARDS[id];
  if (card?.faction) return factionTitle(theme, card.faction) + ' Support';
  if (id === 'assemble-2') return 'Assemble II';
  return card?.name ?? id;
}
export function translate(theme, value) {
  let text = String(value ?? '');
  if (normalizeTheme(theme) === 'roman') {
    for (const region of REGIONS) text = text.replaceAll(region.name, regionTitle(theme, region.id));
    for (const faction of FACTIONS) text = text.replaceAll(faction.name, factionTitle(theme, faction.id));
    text = text.replaceAll('coronation', 'imperial succession');
  }
  return text;
}
export const cardDescription = (theme, id) => translate(theme, CARDS[id]?.description ?? '');

// Original engraved illustrations. Their symbols are decorative; labels carry all meaning.
let emblemSequence = 0;
export function emblem(kind = 'crown', className = '') {
  const gradientId = 'emblem-gold-' + (++emblemSequence);
  const art = {
    crown: '<path d="M30 69 22 35 40 48 60 25 80 48 98 35 90 69Z" fill="url(#gold)"/><path d="M30 74H90V84H30Z" fill="url(#gold)"/><circle cx="60" cy="51" r="5" fill="#a45f4e"/><circle cx="39" cy="58" r="3" fill="#4d7d78"/><circle cx="81" cy="58" r="3" fill="#4d7d78"/><path d="M36 77H84M34 65H86"/>',
    scots: '<path d="M60 18 90 30V60Q87 80 60 94 33 80 30 60V30Z" fill="#528a9b"/><path d="M60 30V79M43 46 77 67M77 46 43 67" stroke="#f7e8bb" stroke-width="6"/><path d="M36 34V59Q38 75 60 87 82 75 84 59V34" fill="none" stroke="#dfc791" stroke-width="2"/>',
    welsh: '<path d="M60 18 90 30V60Q87 80 60 94 33 80 30 60V30Z" fill="#b99548"/><path d="M42 75Q52 66 50 55L40 51 52 45 48 32 62 40 76 36 70 51 83 59 68 60 65 76Z" fill="#f9e6b0"/><circle cx="65" cy="46" r="2" fill="#755531"/><path d="M37 31Q60 24 83 31M38 70Q45 81 60 86 75 81 82 70" fill="none" stroke="#f5d995"/>',
    english: '<path d="M60 18 90 30V60Q87 80 60 94 33 80 30 60V30Z" fill="#aa5f50"/><path d="M45 71V57L51 45 64 42 74 48 74 60 65 57 59 62 59 74 52 74 52 64M47 54 38 48 42 40M70 52 82 51 84 41" fill="none" stroke="#f9df9d" stroke-width="5"/><path d="M35 32Q60 23 85 32M40 74 60 86 80 74" fill="none" stroke="#e0bd7d"/>',
    assemble: '<path d="M31 78V43H47V34H73V43H89V78Z" fill="#b4ad89"/><path d="M26 43 60 20 94 43Z" fill="#796e48"/><path d="M40 48V73M52 45V73M68 45V73M80 48V73" stroke="#f5e6c1" stroke-width="6"/><path d="M25 81H95M21 88H99" stroke="#9b7950" stroke-width="5"/><path d="M57 72V57Q60 52 63 57V72" fill="#5d6b5e"/>',
    negotiate: '<path d="M31 25H81L91 36V78H41Q31 78 31 88Z" fill="#f4dfaf"/><path d="M31 25V81Q25 73 20 81V31Q23 23 31 25ZM41 78H91Q100 79 94 88H31Q28 78 41 78Z" fill="#d3b680"/><path d="M43 40H74M43 49H77M43 58H67" stroke="#a68959"/><path d="M72 62 80 88 68 83 60 90 60 64Z" fill="#8e5145"/><circle cx="68" cy="66" r="12" fill="#ac6251"/><path d="m62 66 4 4 8-8" stroke="#e3b477" fill="none"/>',
    manoeuvre: '<path d="M24 73 60 86 96 70 60 57Z" fill="#beac7f"/><path d="M24 73V80L60 94 96 77V70" fill="#958563"/><path d="M40 69V45H52V34H65V45H76V69Z" fill="#e7d6ad"/><path d="M37 42H54M62 42H79M54 30H65" stroke="#887c59" stroke-width="5"/><path d="M53 72V58Q60 49 65 58V74" fill="#778276"/><path d="M30 49Q21 31 42 24M36 18 45 23 39 30" fill="none" stroke="#56877f" stroke-width="4"/>',
    outmanoeuvre: '<path d="M30 88V24M76 88V36" stroke="#846e42" stroke-width="5"/><path d="M33 25H78L67 38 77 50H33Z" fill="#618477"/><path d="M79 37H101L95 48 101 61H79Z" fill="#ae6952"/><path d="M30 74Q51 62 70 74" fill="none" stroke="#bc9653" stroke-width="4"/><path d="m62 66 11 8-10 7" fill="none" stroke="#bc9653" stroke-width="4"/><path d="M23 90H84" stroke="#a5956b"/>',
    book: '<path d="M17 29Q38 22 59 34 80 22 103 29V83Q80 77 59 88 38 77 17 83Z" fill="#f2dfb0"/><path d="M59 34V88M25 41Q42 37 51 44M25 52Q42 48 51 55M25 63Q42 59 51 66M68 44Q83 37 95 41M68 55Q83 48 95 52M68 66Q83 59 95 63" stroke="#a08a61" fill="none"/><path d="M17 83 14 88Q40 81 59 94 80 81 106 88L103 83" fill="none" stroke="#775d3a" stroke-width="4"/>',
    dice: '<rect x="23" y="26" width="46" height="46" rx="8" transform="rotate(-14 46 49)" fill="#f2e1b7"/><rect x="58" y="49" width="38" height="38" rx="7" transform="rotate(14 77 68)" fill="#d9be88"/><g fill="#685439" stroke="none"><circle cx="34" cy="41" r="3"/><circle cx="48" cy="49" r="3"/><circle cx="60" cy="58" r="3"/><circle cx="69" cy="59" r="3"/><circle cx="84" cy="76" r="3"/></g>',
  };
  return `<svg class="emblem ${className}" viewBox="0 0 120 112" aria-hidden="true" focusable="false"><defs><linearGradient id="${gradientId}" x2="0.4" y2="1"><stop stop-color="#ebce83"/><stop offset="1" stop-color="#ac8243"/></linearGradient></defs><g stroke="#765d3e" stroke-width="1.4" stroke-linejoin="round">${(art[kind] ?? art.crown).replaceAll('url(#gold)', 'url(#' + gradientId + ')')}</g></svg>`;
}
