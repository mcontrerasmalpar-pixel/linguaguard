import type { Context } from '@devvit/public-api';
import type { LinguaAnalysis, AnalysisResult } from './types.js';

export const FALLBACK_RESULT: AnalysisResult = {
  detected_lang: 'unknown',
  lang_name: 'Unknown',
  translation: 'Analysis unavailable.',
  summary: 'Could not analyze content.',
  violates_rule: false,
  recommendation: 'review',
  reason: 'Analysis failed — manual review required.',
  confidence_score: 0,
  signals: [],
  matched_rule: '',
  ambiguity: 'high',
  confidence: 'low',
  confidenceScore: 0,
  source: 'heuristic',
  fallbackMode: true,
};

// ─── Layer 1: Heuristic Detection ────────────────────────────────────────────

interface HeuristicResult {
  lang: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  matchedWords: string[];
  ambiguity: 'low' | 'medium' | 'high';
}

const LANG_WORDS: Record<string, { name: string; words: string[] }> = {
  es: {
    name: 'Spanish',
    words: ['el','la','los','las','de','que','en','es','por','con','para','una','del','se','no','al','su','le','más','pero','este','esta','como','todo','cuando','hay','tiene','muy','también','ya','si','sobre','entre','lo','puede','yo','mi','me','tu','te','hola','quiero','compartir','experiencias','viajando','año','pasado','acabo','terminar','ver','serie','increíble','efectos','visuales','impresionantes','trama','mantuvo','enganchado','alguien','amigos','cómo','están','todos','películas','favoritas','somos','tengo','estoy','vamos','bueno','buena','gracias','mucho','nuevo','nueva','mejor','mundo','vida','trabajo','tiempo','casa','bien','así','creo','fue','son','era','esto','eso','aquí','donde','porque','siempre','otro','otra','nada','algo','mismo','después','antes','desde'],
  },
  pt: {
    name: 'Portuguese',
    words: ['que','não','uma','os','no','se','na','por','mais','as','dos','como','mas','foi','ao','ele','das','tem','seu','sua','ou','ser','quando','muito','há','nos','já','está','também','só','pelo','pela','até','isso','ela','entre','era','depois','sem','mesmo','aos','ter','seus','quem','nas','esse','eles','você','tinha','foram','essa','num','nem','suas','meu','minha','bem','agora','ainda','então','aqui','onde','tudo','outro','outra'],
  },
  fr: {
    name: 'French',
    words: ['le','la','les','de','du','des','un','une','et','en','que','qui','dans','est','pour','sur','au','avec','ce','se','il','elle','nous','vous','ils','elles','pas','plus','par','mais','ou','si','ne','tout','bien','aussi','comme','même','entre','très','non','je','tu','on','lui','leur','fait','été','sont','ont','cette','ces','mon','ton','son','notre','votre','être','avoir','faire','dire','aller','voir','savoir','pouvoir','vouloir'],
  },
  de: {
    name: 'German',
    words: ['der','die','das','und','in','von','zu','den','dem','nicht','ein','ist','sich','mit','er','es','sie','auf','an','auch','hat','ich','war','du','so','als','werden','noch','aber','aus','zum','nach','wenn','über','am','bei','wie','bis','um','nur','mehr','mein','sein','haben','kann','man','hier','schon','dann','sehr','oder','will','was','wir','sind','mir','dir'],
  },
  it: {
    name: 'Italian',
    words: ['il','lo','la','le','di','del','della','che','in','un','una','per','sono','con','non','si','da','come','anche','più','ma','suo','sua','questo','questa','tutto','quando','così','essere','avere','fare','dire','molto','bene','ancora','sempre','già','dopo','prima','ora','qui','dove','perché','altro','altra','niente','qualcosa','stesso'],
  },
};

const SCRIPT_PATTERNS: Array<{ pattern: RegExp; lang: string; name: string }> = [
  { pattern: /[぀-ゟ゠-ヿ]/, lang: 'ja', name: 'Japanese' },
  { pattern: /[가-힯]/, lang: 'ko', name: 'Korean' },
  { pattern: /[一-鿿]{3,}/, lang: 'zh', name: 'Chinese' },
  { pattern: /[؀-ۿ]{3,}/, lang: 'ar', name: 'Arabic' },
  { pattern: /[Ѐ-ӿ]{3,}/, lang: 'ru', name: 'Russian' },
  { pattern: /[฀-๿]{3,}/, lang: 'th', name: 'Thai' },
  { pattern: /[ऀ-ॿ]{3,}/, lang: 'hi', name: 'Hindi' },
];

function detectLanguageHeuristic(text: string): HeuristicResult {
  const lower = text.toLowerCase();

  for (const { pattern, lang, name } of SCRIPT_PATTERNS) {
    if (pattern.test(lower)) {
      return { lang, name, confidence: 'high', score: 1.0, matchedWords: [], ambiguity: 'low' };
    }
  }

  const words = lower.split(/\s+/).map(w => w.replace(/[.,?!¿¡;:'"()]/g, '')).filter(w => w.length > 1);
  const totalWords = words.length;
  if (totalWords < 3) {
    return { lang: 'unknown', name: 'Unknown', confidence: 'low', score: 0, matchedWords: [], ambiguity: 'high' };
  }

  const scores = Object.entries(LANG_WORDS).map(([lang, { name, words: langWords }]) => {
    const matched = words.filter(w => langWords.includes(w));
    return { lang, name, matches: matched.length, ratio: matched.length / totalWords, matched };
  });

  scores.sort((a, b) => b.ratio - a.ratio);
  const top = scores[0];
  const second = scores[1];

  if (top.ratio > 0.4 && top.ratio - second.ratio > 0.15) {
    return { lang: top.lang, name: top.name, confidence: 'high', score: top.ratio, matchedWords: top.matched, ambiguity: 'low' };
  }
  if (top.ratio > 0.25) {
    return { lang: top.lang, name: top.name, confidence: 'medium', score: top.ratio, matchedWords: top.matched, ambiguity: 'medium' };
  }
  if (top.matches >= 2) {
    return { lang: top.lang, name: top.name, confidence: 'low', score: top.ratio, matchedWords: top.matched, ambiguity: 'high' };
  }

  return { lang: 'en', name: 'English', confidence: 'medium', score: 0.5, matchedWords: [], ambiguity: 'medium' };
}

// ─── Semantic Signal Generation ───────────────────────────────────────────────

function generateSemanticSignals(text: string, matchedWords: string[], langName: string): string[] {
  const signals: string[] = [];
  const lower = text.toLowerCase();

  // Greeting patterns
  if (/hola|buenos|buenas|saludos/.test(lower)) signals.push(`${langName} greeting detected`);
  if (/bonjour|salut|bonsoir/.test(lower)) signals.push(`${langName} greeting detected`);
  if (/hallo|guten|moin/.test(lower)) signals.push(`${langName} greeting detected`);

  // Character/punctuation patterns
  if (/[¿]/.test(text)) signals.push('Spanish punctuation (¿)');
  if (/[ñ]/.test(lower)) signals.push('Spanish character (ñ)');
  if (/[àâêëîïôùûüç]/.test(lower)) signals.push('French diacritical marks');
  if (/[äöüß]/.test(lower)) signals.push('German characters');
  if (/[ãõçê]/.test(lower)) signals.push('Portuguese diacritical marks');

  // Vocabulary ratio
  const wordRatio = matchedWords.length / Math.max(text.split(/\s+/).length, 1);
  if (wordRatio > 0.5) signals.push(`Majority ${langName} vocabulary (${Math.round(wordRatio * 100)}%)`);
  else if (wordRatio > 0.25) signals.push(`Significant ${langName} vocabulary (${Math.round(wordRatio * 100)}%)`);

  // Mixed language detection
  const englishWords = ['the','is','and','to','of','in','for','it','that','was','on','are','with','this','have','from','at','be','not','but'];
  const engCount = lower.split(/\s+/).filter(w => englishWords.includes(w)).length;
  if (engCount >= 3 && matchedWords.length >= 3) signals.push('Mixed language content');

  // Rule mismatch marker
  if (signals.length > 0) signals.push('English-only rule mismatch');

  // Generic fallback
  if (signals.length === 0) signals.push(`${matchedWords.length} ${langName} words detected`);

  return signals.slice(0, 5);
}

// ─── Layer 1b: Mock Translation ──────────────────────────────────────────────

const ES_DICT: Record<string, string> = {
  'hola':'hello','amigos':'friends','este':'this','es':'is','un':'a','una':'a',
  'post':'post','en':'in','español':'Spanish','puro':'pure','cómo':'how',
  'están':'are','todos':'everyone','acabo':'I just','de':'of/from',
  'terminar':'finished','ver':'watching','serie':'series','increíble':'incredible',
  'sobre':'about','inteligencia':'intelligence','artificial':'artificial',
  'los':'the','efectos':'effects','visuales':'visual','eran':'were',
  'impresionantes':'impressive','la':'the','trama':'plot','me':'me',
  'mantuvo':'kept','enganchado':'hooked','hasta':'until','el':'the',
  'final':'end','alguien':'someone','más':'more','vio':'watched',
  'mis':'my','películas':'movies','favoritas':'favorites','quiero':'I want',
  'compartir':'to share','experiencias':'experiences','viajando':'traveling',
  'por':'through','año':'year','pasado':'last','y':'and','que':'that',
  'con':'with','para':'for','pero':'but','no':'no/not','si':'if/yes',
  'muy':'very','también':'also','ya':'already','su':'his/her',
};

function mockTranslate(text: string, fromLang: string, toLangName: string): string {
  if (fromLang === 'en') return `Already in ${toLangName}.`;
  if (fromLang === 'es') {
    return text.split(/\s+/).map(w => {
      const clean = w.replace(/[.,?!¿¡;:'"()]/g, '').toLowerCase();
      return ES_DICT[clean] || w;
    }).join(' ');
  }
  return `[${fromLang.toUpperCase()} content detected — full translation requires AI integration]`;
}

// ─── Layer 2: AI Analysis (optional, graceful failure) ───────────────────────

function buildPrompt(content: string, allowedLang: string, allowedLangName: string): string {
  return `You are a multilingual content moderator. Analyze this Reddit post/comment.
Return ONLY valid JSON:
{
  "detected_lang": "<ISO 639-1>",
  "lang_name": "<language name>",
  "translation": "<translation to ${allowedLangName}, max 80 words>",
  "summary": "<one sentence summary, max 25 words>",
  "violates_rule": <true if NOT in ${allowedLang}>,
  "recommendation": "<remove|approve|review>",
  "reason": "<one sentence>"
}

Rule: posts must be in ${allowedLangName} (${allowedLang}).

Content:
---
${content.slice(0, 1500)}
---`;
}

async function tryGeminiAnalysis(
  content: string,
  allowedLang: string,
  allowedLangName: string,
  context: Context
): Promise<AnalysisResult | null> {
  try {
    const apiKey = await context.settings.get<string>('gemini_api_key');
    if (!apiKey) return null;

    const prompt = buildPrompt(content, allowedLang, allowedLangName);
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return null;
    }

    const data = await response.json() as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : clean) as LinguaAnalysis;

    if (!parsed.detected_lang || !parsed.recommendation) return null;

    const matchedRule = `This subreddit requires posts in ${allowedLangName} only.`;
    return {
      ...parsed,
      confidence_score: 1.0,
      signals: [],
      matched_rule: matchedRule,
      ambiguity: 'low',
      confidence: 'high',
      confidenceScore: 1.0,
      source: 'gemini',
      fallbackMode: false,
    };
  } catch (err) {
    console.error('Gemini analysis failed:', err);
    return null;
  }
}

// ─── Layer 3: Orchestrator ───────────────────────────────────────────────────

export async function analyzeWithGemini(
  content: string,
  allowedLang: string,
  allowedLangName: string,
  context: Context
): Promise<AnalysisResult> {
  const heuristic = detectLanguageHeuristic(content);
  const matchedRule = `This subreddit requires posts in ${allowedLangName} only.`;
  console.log(`Heuristic: ${heuristic.name} (${heuristic.lang}) confidence=${heuristic.confidence} score=${heuristic.score.toFixed(2)}`);

  if (heuristic.confidence !== 'high') {
    const aiResult = await tryGeminiAnalysis(content, allowedLang, allowedLangName, context);
    if (aiResult) {
      console.log('AI analysis succeeded:', aiResult.lang_name);
      return aiResult;
    }
    console.log('AI analysis unavailable — using heuristic result');
  }

  const semanticSignals = generateSemanticSignals(content, heuristic.matchedWords, heuristic.name);
  const hasMixedLanguage = semanticSignals.includes('Mixed language content');

  const violates = heuristic.lang !== allowedLang && heuristic.lang !== 'unknown';
  const translation = mockTranslate(content, heuristic.lang, allowedLangName);

  // Ambiguity: low if high confidence + no mixed language; medium if medium confidence or mixed; high if low
  const ambiguity: 'low' | 'medium' | 'high' =
    heuristic.confidence === 'low' || heuristic.lang === 'unknown' ? 'high'
    : (heuristic.confidence === 'medium' || hasMixedLanguage) ? 'medium'
    : 'low';

  if (heuristic.confidence === 'low' || heuristic.lang === 'unknown') {
    return {
      detected_lang: heuristic.lang,
      lang_name: heuristic.name,
      translation: 'Low confidence detection — manual review recommended.',
      summary: `Uncertain language detection (${heuristic.name}).`,
      violates_rule: false,
      recommendation: 'review',
      reason: 'Language detection confidence too low for automated action — manual review recommended.',
      confidence_score: heuristic.score,
      signals: semanticSignals,
      matched_rule: matchedRule,
      ambiguity,
      confidence: 'low',
      confidenceScore: heuristic.score,
      source: 'heuristic',
      fallbackMode: false,
    };
  }

  return {
    detected_lang: heuristic.lang,
    lang_name: heuristic.name,
    translation,
    summary: violates
      ? `Post written in ${heuristic.name} in a ${allowedLangName}-only community.`
      : `Post appears to comply with ${allowedLangName} language rules.`,
    violates_rule: violates,
    recommendation: violates ? 'remove' : 'approve',
    reason: violates
      ? `Post is written in ${heuristic.name} (${(heuristic.score * 100).toFixed(0)}% confidence) but this community requires ${allowedLangName} only.`
      : `Post complies with the ${allowedLangName}-only rule.`,
    confidence_score: heuristic.score,
    signals: semanticSignals,
    matched_rule: matchedRule,
    ambiguity,
    confidence: heuristic.confidence,
    confidenceScore: heuristic.score,
    source: 'heuristic',
    fallbackMode: false,
  };
}
