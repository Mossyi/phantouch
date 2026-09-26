export const TAVERN_WORLDBOOK_STORAGE_KEY = 'ycy_tavern_worldbooks';
export const MAX_TAVERN_WORLDBOOKS = 20;
export const MAX_TAVERN_WORLDBOOK_ENTRIES = 200;
export const MAX_TAVERN_WORLDBOOK_CONTEXT_LENGTH = 16_000;

export interface TavernWorldbookEntry {
  id: string;
  name: string;
  keywords: string[];
  secondaryKeywords: string[];
  content: string;
  enabled: boolean;
  priority: number;
  caseSensitive: boolean;
}

export interface TavernWorldbook {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scanDepth: number;
  tokenBudget: number;
  entries: TavernWorldbookEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface TavernWorldbookMatch {
  bookId: string;
  bookName: string;
  entry: TavernWorldbookEntry;
}

const cleanText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
};

const safeId = (value: unknown, fallback: string): string => {
  const id = cleanText(value, 160);
  return /^[a-zA-Z0-9_-]{1,160}$/.test(id) ? id : fallback;
};

const uniqueStrings = (value: unknown, maximum = 30): string[] => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[,，\n]+/) : [];
  return [...new Set(source
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 100))
    .filter(Boolean))].slice(0, maximum);
};

const createId = (prefix: string): string => {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${suffix}`.slice(0, 160);
};

export const createTavernWorldbook = (name = '新世界书'): TavernWorldbook => {
  const now = Date.now();
  return {
    id: createId('worldbook'),
    name: cleanText(name, 100) || '新世界书',
    description: '',
    enabled: true,
    scanDepth: 8,
    tokenBudget: 2048,
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const createTavernWorldbookEntry = (): TavernWorldbookEntry => ({
  id: createId('worldentry'),
  name: '',
  keywords: [],
  secondaryKeywords: [],
  content: '',
  enabled: true,
  priority: 5,
  caseSensitive: false,
});

export const normalizeTavernWorldbookEntry = (
  value: unknown,
  index = 0,
): TavernWorldbookEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const keywords = uniqueStrings(raw.keywords ?? raw.keys ?? raw.key);
  const content = cleanText(raw.content, 8_000);
  if (keywords.length === 0 || !content) return null;
  return {
    id: safeId(raw.id ?? raw.uid, `worldentry_${index}`),
    name: cleanText(raw.name ?? raw.comment, 100),
    keywords,
    secondaryKeywords: uniqueStrings(raw.secondaryKeywords ?? raw.secondary_keys ?? raw.keysecondary),
    content,
    enabled: raw.enabled !== false && raw.disable !== true,
    priority: clampInteger(raw.priority ?? raw.order, 1, 100, 5),
    caseSensitive: raw.caseSensitive === true || raw.case_sensitive === true,
  };
};

const entryArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>);
};

export const normalizeTavernWorldbook = (value: unknown, index = 0): TavernWorldbook | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawEntries = entryArray(raw.entries ?? raw.character_book ?? raw.worldbook);
  const entries: TavernWorldbookEntry[] = [];
  rawEntries.forEach((candidate, entryIndex) => {
    if (entries.length >= MAX_TAVERN_WORLDBOOK_ENTRIES) return;
    const entry = normalizeTavernWorldbookEntry(candidate, entryIndex);
    if (entry && !entries.some((item) => item.id === entry.id)) entries.push(entry);
  });
  const now = Date.now();
  const createdAt = clampInteger(raw.createdAt, 1, Number.MAX_SAFE_INTEGER, now);
  return {
    id: safeId(raw.id, `worldbook_${index}_${now.toString(36)}`),
    name: cleanText(raw.name, 100) || `世界书 ${index + 1}`,
    description: cleanText(raw.description, 500),
    enabled: raw.enabled !== false,
    scanDepth: clampInteger(raw.scanDepth ?? raw.scan_depth, 1, 40, 8),
    tokenBudget: clampInteger(raw.tokenBudget ?? raw.token_budget, 128, 8_192, 2_048),
    entries,
    createdAt,
    updatedAt: clampInteger(raw.updatedAt, createdAt, Number.MAX_SAFE_INTEGER, createdAt),
  };
};

export const normalizeTavernWorldbooks = (value: unknown): TavernWorldbook[] => {
  const rawBooks = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).books)
      ? (value as Record<string, unknown>).books as unknown[]
      : [];
  const books: TavernWorldbook[] = [];
  rawBooks.forEach((candidate, index) => {
    if (books.length >= MAX_TAVERN_WORLDBOOKS) return;
    const book = normalizeTavernWorldbook(candidate, index);
    if (book && !books.some((item) => item.id === book.id)) books.push(book);
  });
  return books;
};

export const loadTavernWorldbooks = (): TavernWorldbook[] => {
  try {
    return normalizeTavernWorldbooks(JSON.parse(localStorage.getItem(TAVERN_WORLDBOOK_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
};

export const saveTavernWorldbooks = (books: unknown): boolean => {
  try {
    localStorage.setItem(TAVERN_WORLDBOOK_STORAGE_KEY, JSON.stringify(normalizeTavernWorldbooks(books)));
    return true;
  } catch {
    return false;
  }
};

const containsKeyword = (text: string, keyword: string, caseSensitive: boolean): boolean => (
  caseSensitive ? text.includes(keyword) : text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
);

const messageContent = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return cleanText((value as Record<string, unknown>).content, 20_000);
};

export const matchTavernWorldbooks = (
  booksValue: unknown,
  messagesValue: unknown,
): TavernWorldbookMatch[] => {
  const books = normalizeTavernWorldbooks(booksValue);
  const messages = Array.isArray(messagesValue) ? messagesValue : [messagesValue];
  const matches: TavernWorldbookMatch[] = [];
  for (const book of books) {
    if (!book.enabled) continue;
    const scanText = messages.slice(-book.scanDepth).map(messageContent).filter(Boolean).join('\n');
    if (!scanText) continue;
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      const primaryHit = entry.keywords.some((keyword) => containsKeyword(scanText, keyword, entry.caseSensitive));
      const secondaryHit = entry.secondaryKeywords.length === 0
        || entry.secondaryKeywords.some((keyword) => containsKeyword(scanText, keyword, entry.caseSensitive));
      if (primaryHit && secondaryHit) matches.push({ bookId: book.id, bookName: book.name, entry });
    }
  }
  return matches.sort((left, right) => right.entry.priority - left.entry.priority);
};

export const buildTavernWorldbookContext = (
  booksValue: unknown,
  messagesValue: unknown,
): string => {
  const books = normalizeTavernWorldbooks(booksValue);
  const matches = matchTavernWorldbooks(books, messagesValue);
  if (matches.length === 0) return '';
  const usedByBook = new Map<string, number>();
  const sections: string[] = [];
  for (const match of matches) {
    const book = books.find((candidate) => candidate.id === match.bookId);
    if (!book) continue;
    const budget = book.tokenBudget * 4;
    const used = usedByBook.get(book.id) || 0;
    const heading = `【${book.name} · ${match.entry.name || match.entry.keywords[0]}】\n`;
    const remaining = Math.min(budget - used, MAX_TAVERN_WORLDBOOK_CONTEXT_LENGTH - sections.join('\n\n').length);
    if (remaining <= heading.length + 8) continue;
    const block = `${heading}${match.entry.content.slice(0, remaining - heading.length)}`;
    sections.push(block);
    usedByBook.set(book.id, used + block.length);
    if (sections.join('\n\n').length >= MAX_TAVERN_WORLDBOOK_CONTEXT_LENGTH) break;
  }
  return sections.join('\n\n').slice(0, MAX_TAVERN_WORLDBOOK_CONTEXT_LENGTH);
};

export const importTavernWorldbooks = (value: unknown): TavernWorldbook[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    const books = normalizeTavernWorldbooks(value).filter((book) => book.entries.length > 0);
    if (books.length > 0) return books;
    const candidateBook = normalizeTavernWorldbook({ name: '导入条目世界书', entries: value }, 0);
    return candidateBook && candidateBook.entries.length > 0
      ? [{ ...candidateBook, id: createId('worldbook'), createdAt: Date.now(), updatedAt: Date.now() }]
      : [];
  }
  const raw = value as Record<string, unknown>;
  if (Array.isArray(raw.books)) return normalizeTavernWorldbooks(raw.books).filter((book) => book.entries.length > 0);
  const nested = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
    ? raw.data as Record<string, unknown>
    : raw;
  const wrappedBook = [nested.character_book, nested.world_book, nested.worldbook, nested.lorebook]
    .find((candidate) => candidate
      && typeof candidate === 'object'
      && !Array.isArray(candidate)
      && 'entries' in (candidate as Record<string, unknown>));
  const rawBook = wrappedBook || nested;
  const normalized = normalizeTavernWorldbook(rawBook, 0);
  return normalized && normalized.entries.length > 0
    ? [{ ...normalized, id: createId('worldbook'), createdAt: Date.now(), updatedAt: Date.now() }]
    : [];
};

export const exportTavernWorldbook = (bookValue: unknown): Record<string, unknown> | null => {
  const book = normalizeTavernWorldbook(bookValue, 0);
  if (!book) return null;
  return {
    name: book.name,
    description: book.description,
    scan_depth: book.scanDepth,
    token_budget: book.tokenBudget,
    recursive_scanning: false,
    extensions: {},
    entries: book.entries.map((entry, index) => ({
      uid: index,
      key: entry.keywords,
      keysecondary: entry.secondaryKeywords,
      comment: entry.name,
      content: entry.content,
      constant: false,
      selective: entry.secondaryKeywords.length > 0,
      order: entry.priority,
      position: 0,
      disable: !entry.enabled,
      case_sensitive: entry.caseSensitive,
      extensions: {},
    })),
  };
};
