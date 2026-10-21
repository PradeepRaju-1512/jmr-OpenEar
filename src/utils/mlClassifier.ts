import { DomainType, MLSuggestion } from '../types';

interface KeywordRule {
  domain: DomainType;
  categoryName: string;
  subOption?: string;
  keywords: string[];
  weight: number;
}

const RULES: KeywordRule[] = [
  // Mess Rules
  {
    domain: 'MESS',
    categoryName: 'Food Quality',
    keywords: ['spoil', 'spoiled', 'raw', 'undercook', 'undercooked', 'insects', 'stale', 'smell', 'odor', 'curd', 'rice', 'dal', 'oil', 'quality', 'taste', 'salty', 'spicy', 'bland', 'burnt', 'cold food'],
    weight: 1.5,
  },
  {
    domain: 'MESS',
    categoryName: 'Hygiene',
    keywords: ['hygiene', 'dirty', 'fly', 'flies', 'cockroach', 'table clean', 'unclean', 'sink dirty', 'greasy'],
    weight: 1.4,
  },
  {
    domain: 'MESS',
    categoryName: 'Utensils and Related Items',
    keywords: ['plate', 'spoon', 'fork', 'cup', 'glass', 'utensil', 'tray', 'greasy plate', 'dishwash'],
    weight: 1.4,
  },
  {
    domain: 'MESS',
    categoryName: 'Mess Maintenance',
    keywords: ['exhaust', 'fan mess', 'water dispenser mess', 'bain marie', 'fly catcher', 'handwash sink'],
    weight: 1.2,
  },

  // Hostel Rules
  {
    domain: 'HOSTEL_BOYS',
    categoryName: 'Wifi',
    keywords: ['wifi', 'wi-fi', 'internet', 'router', 'access point', 'packet drop', 'ping', 'lan', 'ethernet', 'bandwidth', 'disconnect'],
    weight: 1.5,
  },
  {
    domain: 'HOSTEL_BOYS',
    categoryName: 'Drinking water',
    keywords: ['aquaguard', 'cooler', 'filter', 'drinking water', 'purifier', 'cold water', 'water dispensing', 'muddy water'],
    weight: 1.4,
  },
  {
    domain: 'HOSTEL_BOYS',
    categoryName: 'Washrooms',
    keywords: ['washroom', 'toilet', 'flush', 'tap leaking', 'bathroom', 'basin', 'geyser', 'shower', 'commode', 'sewage', 'drain'],
    weight: 1.5,
  },
  {
    domain: 'HOSTEL_BOYS',
    categoryName: 'Washing machines',
    keywords: ['washing machine', 'laundry', 'spin', 'dryer', 'drum', 'drain clothes', 'washing'],
    weight: 1.4,
  },
  {
    domain: 'HOSTEL_BOYS',
    categoryName: 'Room Cleaning',
    keywords: ['sweep', 'mop', 'corridor clean', 'dustbin', 'garbage', 'trash', 'cobweb'],
    weight: 1.3,
  },

  // Sports Rules
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Indoor',
    subOption: 'Badminton',
    keywords: ['badminton', 'shuttle', 'court net', 'racquet', 'indoor court'],
    weight: 1.6,
  },
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Indoor',
    subOption: 'Table tennis',
    keywords: ['table tennis', 'tt ball', 'tt bat', 'tt table', 'ping pong'],
    weight: 1.6,
  },
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Indoor',
    subOption: 'Chess',
    keywords: ['chess', 'chess board', 'chess clock', 'chess pieces'],
    weight: 1.6,
  },
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Outdoor',
    subOption: 'Cricket',
    keywords: ['cricket', 'pitch', 'nets', 'bat', 'stumps', 'cricket ground'],
    weight: 1.6,
  },
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Outdoor',
    subOption: 'Football',
    keywords: ['football', 'goal post', 'ground turf', 'soccer ball', 'crossbar'],
    weight: 1.6,
  },
  {
    domain: 'SPORTS_BOYS',
    categoryName: 'Outdoor',
    subOption: 'Volleyball',
    keywords: ['volleyball', 'antenna', 'volleyball court', 'volleyball net'],
    weight: 1.6,
  },

  // Others Rules
  {
    domain: 'OTHERS',
    categoryName: 'General Campus Grievance',
    keywords: ['street light', 'walkway', 'security', 'cycle stand', 'library', 'gate', 'stray dogs', 'pathway', 'bus'],
    weight: 1.3,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keyword-based category suggestion. This is a plain rule matcher, NOT a trained model, and it
 * never reports a confidence figure. It only pre-fills the form; the student always confirms.
 * Keywords match whole words only ("gate" does not match "investigate").
 */
export function classifyComplaintText(text: string, studentGender: 'M' | 'F' | 'O' | null = null): MLSuggestion | null {
  if (!text || text.trim().length < 8) return null;

  const normalized = text.toLowerCase();
  let bestScore = 0;
  let bestRule: KeywordRule | null = null;
  let bestTokens: string[] = [];

  for (const rule of RULES) {
    let score = 0;
    const tokens: string[] = [];
    for (const kw of rule.keywords) {
      if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}($|[^a-z0-9])`).test(normalized)) {
        score += rule.weight * (kw.includes(' ') ? 2.2 : 1.0);
        tokens.push(kw);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
      bestTokens = tokens;
    }
  }

  if (!bestRule || bestScore < 1.0) return null;

  let domain = bestRule.domain;
  if (studentGender === 'F') {
    if (domain === 'HOSTEL_BOYS') domain = 'HOSTEL_GIRLS';
    if (domain === 'SPORTS_BOYS') domain = 'SPORTS_GIRLS';
  }

  return {
    domain,
    categoryName: bestRule.categoryName,
    subOption: bestRule.subOption,
    reason: `Matched words: "${bestTokens.slice(0, 3).join('", "')}"`,
  };
}
