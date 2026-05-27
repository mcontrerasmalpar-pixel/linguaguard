import { Devvit, useState, useAsync } from '@devvit/public-api';
import type { Context, Post } from '@devvit/public-api';
import { analyzeWithGemini, FALLBACK_RESULT } from './ai.js';
import { saveToRedis, loadFromRedis } from './redis.js';
import { executeAction } from './actions.js';
import { getAuthorHistory, countRemovals, formatRelativeTime } from './history.js';
import type { Action } from './actions.js';
import type { ModDecision, ReviewData } from './types.js';

// ─── App Configuration ───────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

// ─── App Settings ────────────────────────────────────────────────────────────

Devvit.addSettings([
  {
    type: 'string',
    name: 'allowed_lang',
    label: 'Required language code (e.g. "en", "es", "de")',
    helpText: 'Posts in other languages will be flagged. Use ISO 639-1 codes.',
    defaultValue: 'en',
  },
  {
    type: 'string',
    name: 'allowed_lang_name',
    label: 'Language name (e.g. "English", "Spanish")',
    helpText: 'Human-readable name shown in mod panel and removal messages.',
    defaultValue: 'English',
  },
  {
    type: 'string',
    name: 'gemini_api_key',
    label: 'Gemini API key (optional)',
    helpText: 'Google AI Studio API key for enhanced detection. App works without it.',
  },
]);

// ─── Palette ─────────────────────────────────────────────────────────────────

const P = {
  bg: '#0B1020',
  surface: '#121A2B',
  surface2: '#1A2744',
  info: '#38BDF8',
  warn: '#F59E0B',
  danger: '#DC2626',
  success: '#16A34A',
  text: '#E5E7EB',
  secondary: '#94A3B8',
  muted: '#64748B',
  dangerBg: '#450a0a',
  warnBg: '#451a03',
  successBg: '#052e16',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRiskLevel(
  violates: boolean,
  removalCount: number,
  confidence: string,
  ambiguity: string
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (!violates) return 'LOW';
  if (removalCount >= 3 || (confidence === 'high' && ambiguity === 'low')) return 'HIGH';
  if (removalCount >= 1 || confidence === 'medium') return 'MEDIUM';
  return 'MEDIUM';
}

function riskStyle(level: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (level === 'HIGH') return { bg: P.dangerBg, color: P.danger };
  if (level === 'MEDIUM') return { bg: P.warnBg, color: P.warn };
  return { bg: P.successBg, color: P.success };
}

function recStyle(rec: string) {
  if (rec === 'approve') return { color: P.success, icon: '✅' };
  if (rec === 'remove') return { color: P.danger, icon: '🗑️' };
  return { color: P.warn, icon: '🔍' };
}

function ambiguityColor(a: string) {
  if (a === 'low') return P.success;
  if (a === 'medium') return P.warn;
  return P.danger;
}

function ambiguityLabel(a: string) {
  if (a === 'low') return 'Low ambiguity';
  if (a === 'medium') return 'Mixed language';
  return 'Manual review suggested';
}

function renderHistoryRow(entry: ModDecision, index: number) {
  const isRemoval = entry.action !== 'approve';
  const hasOverride = !!entry.wasOverride;
  return (
    <hstack key={String(index)} width="100%" gap="small" alignment="middle">
      <text color={isRemoval ? P.danger : P.success} size="xsmall" weight="bold">
        {isRemoval ? '🗑️ Removed' : '✅ Approved'}
      </text>
      <text color={P.muted} size="xsmall">·</text>
      <text color={P.secondary} size="xsmall">{entry.detectedLang.toUpperCase()}</text>
      {hasOverride && <text color={P.warn} size="xsmall">· override</text>}
      <spacer grow />
      <text color={P.muted} size="xsmall">{formatRelativeTime(entry.timestamp)}</text>
    </hstack>
  );
}

// ─── Custom Post UI ──────────────────────────────────────────────────────────

Devvit.addCustomPostType({
  name: 'LinguaGuard Review',
  height: 'tall',
  render: (context) => {
    const { redis } = context;
    const userId = context.userId ?? 'anon';

    const [done, setDone] = useState(false);
    const [actionInProgress, setActionInProgress] = useState(false);

    const { data: isMod } = useAsync<boolean>(async () => {
      try {
        const user = await context.reddit.getCurrentUser();
        if (!user) return false;
        const subredditName = await context.reddit.getCurrentSubredditName();
        const modList = await context.reddit.getModerators({ subredditName });
        const mods = await modList.all();
        return mods.some((m: any) => m.username === user.username);
      } catch {
        return false;
      }
    });

    const { data: reviewData, loading } = useAsync<ReviewData>(async () =>
      loadFromRedis(redis, userId)
    );

    const { data: authorHistory } = useAsync<ModDecision[]>(async () => {
      if (!reviewData?.authorName) return [];
      const subredditName = await context.reddit.getCurrentSubredditName();
      return getAuthorHistory(redis, subredditName, reviewData.authorName);
    }, { depends: [reviewData?.authorName ?? ''] });

    const removalCount = countRemovals(authorHistory ?? []);
    const isRepeatOffender = removalCount >= 3;

    const effectiveRecommendation = isRepeatOffender && reviewData?.recommendation !== 'approve'
      ? 'remove'
      : reviewData?.recommendation ?? 'review';

    const handleAction = async (action: Action) => {
      if (!reviewData || actionInProgress) return;
      setActionInProgress(true);
      await executeAction(action, reviewData, context, userId, () => setDone(true));
      setActionInProgress(false);
    };

    // ── Loading ──
    if (loading || isMod === null) {
      return (
        <vstack width="100%" height="100%" alignment="center middle" backgroundColor={P.bg}>
          <text color={P.info} size="large" weight="bold">🌐 LinguaGuard</text>
          <spacer size="small" />
          <text color={P.secondary} size="medium">
            {isMod === null ? 'Verifying moderator access...' : 'Loading review data...'}
          </text>
        </vstack>
      );
    }

    // ── Non-mod guard ──
    if (!isMod) {
      return (
        <vstack width="100%" height="100%" alignment="center middle" backgroundColor={P.bg}>
          <text color={P.danger} size="large" weight="bold">🔒 Moderators only</text>
          <spacer size="small" />
          <text color={P.secondary} size="medium">This panel is for subreddit moderators.</text>
        </vstack>
      );
    }

    // ── Done / expired ──
    if (done || !reviewData?.targetId) {
      return (
        <vstack width="100%" height="100%" alignment="center middle" backgroundColor={P.bg}>
          <text color={P.success} size="large" weight="bold">✅ Action complete</text>
          <spacer size="small" />
          <text color={P.secondary} size="medium">This review has been resolved.</text>
          <spacer size="small" />
          <text color={P.muted} size="xsmall">Panel expires after 15 min of inactivity.</text>
        </vstack>
      );
    }

    // ── Action in progress ──
    if (actionInProgress) {
      return (
        <vstack width="100%" height="100%" alignment="center middle" backgroundColor={P.bg}>
          <text color={P.info} size="large" weight="bold">🌐 LinguaGuard</text>
          <spacer size="small" />
          <text color={P.secondary} size="medium">Applying action...</text>
        </vstack>
      );
    }

    const {
      langName, detectedLang, allowedLangName, translation, reason,
      violates, confidence, confidenceScore, source, evidence,
      originalContent, fallbackMode, matchedRule, ambiguity,
    } = reviewData;

    const isInFallback = fallbackMode;
    const confidencePercent = confidenceScore.toFixed(0);
    const riskLevel = getRiskLevel(violates, removalCount, confidence, ambiguity);
    const risk = riskStyle(riskLevel);
    const rec = recStyle(effectiveRecommendation);

    const sourceBadge = isInFallback
      ? { text: '⚠️ Fallback · Low', bg: '#2D1500', color: P.warn }
      : source === 'gemini'
        ? { text: `🤖 AI · ${confidencePercent}%`, bg: '#0A2010', color: '#4ADE80' }
        : { text: `🔍 Heuristic · ${confidencePercent}%`, bg: '#0C1F38', color: '#7DD3FC' };

    const signals = evidence ? evidence.split(' · ').filter(Boolean) : [];
    const hasRealTranslation = translation && !translation.startsWith('[');
    const displayTranslation = hasRealTranslation ? translation.slice(0, 200) : 'Full translation requires AI integration';
    const displayRule = matchedRule || `This subreddit requires posts in ${allowedLangName} only.`;

    const confidenceLabel = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Moderate' : 'Low';
    const interpretationText = violates
      ? `Likely ${langName}. Violates ${allowedLangName}-only rule. ${confidenceLabel} confidence.`
      : `Appears to be ${allowedLangName}. Complies with language rule.`;

    return (
      <vstack width="100%" height="100%" backgroundColor={P.bg}>

        {/* ── Section 1: Risk Header ── */}
        <hstack width="100%" padding="small" backgroundColor={risk.bg} alignment="middle" gap="small">
          <text color={P.secondary} size="xsmall">LinguaGuard</text>
          <spacer grow />
          <text color={risk.color} size="medium" weight="bold">{riskLevel} RISK</text>
          <hstack padding="xsmall" backgroundColor={P.surface} cornerRadius="small" alignment="middle">
            <text color={P.info} size="xsmall" weight="bold">
              {detectedLang.toUpperCase()} → {allowedLangName.slice(0, 2).toUpperCase()}
            </text>
          </hstack>
        </hstack>
        <hstack width="100%" padding="small" backgroundColor={P.bg} gap="small" alignment="middle">
          <text color={P.text} size="small">
            Detected: {langName} · {confidencePercent}% confidence · {source}
          </text>
          <spacer grow />
          {isInFallback && <text color={P.warn} size="xsmall">AI unavailable</text>}
          {isRepeatOffender && <text color={P.danger} size="xsmall">Repeat offender: {removalCount}×</text>}
        </hstack>

        {/* ── Section 2: Interpretation Line ── */}
        <vstack width="100%" padding="medium" backgroundColor={P.surface} alignment="start middle">
          <text color={P.text} size="medium" weight="bold" wrap>{interpretationText}</text>
        </vstack>

        <spacer size="small" />

        {/* ── Section 3: Decision Strip ── */}
        <hstack width="100%" padding="small" backgroundColor={P.surface} alignment="middle" gap="small">
          <text color={rec.color} size="medium" weight="bold">{rec.icon} {effectiveRecommendation.toUpperCase()}</text>
          {isRepeatOffender && <text color={P.danger} size="xsmall">· auto-escalated</text>}
          {(ambiguity === 'medium' || ambiguity === 'high') && (
            <text color={P.warn} size="xsmall">⚠️ Ambiguous</text>
          )}
          <spacer grow />
          <hstack padding="xsmall" backgroundColor={sourceBadge.bg} cornerRadius="small" alignment="middle">
            <text color={sourceBadge.color} size="xsmall" weight="bold">{sourceBadge.text}</text>
          </hstack>
        </hstack>

        <vstack width="100%" padding="small" gap="small" grow>

          {/* ── Section 4: Signal Strip ── */}
          <hstack width="100%" padding="xsmall" backgroundColor={P.surface} cornerRadius="small" gap="small" alignment="middle">
            <text color={P.info} size="xsmall" weight="bold">SIGNALS</text>
            {signals.slice(0, 4).map((sig, i) => (
              <hstack key={String(i)} padding="xsmall" backgroundColor={P.surface2} cornerRadius="small" alignment="middle">
                <text color="#CBD5E1" size="xsmall">{sig}</text>
              </hstack>
            ))}
            {signals.length === 0 && <text color={P.muted} size="xsmall">—</text>}
          </hstack>

          {/* ── Section 5: Why This Was Flagged ── */}
          <vstack width="100%" padding="medium" backgroundColor={P.surface2} cornerRadius="small" gap="small">
            <text color={P.info} size="small" weight="bold">WHY THIS WAS FLAGGED</text>

            <vstack gap="small">
              <text color="#CBD5E1" size="xsmall" weight="bold">Why flagged</text>
              <text color="#F1F5F9" size="medium" wrap>{reason}</text>
            </vstack>

            <hstack gap="small" alignment="middle">
              <text color="#CBD5E1" size="xsmall" weight="bold">Rule</text>
              <spacer size="small" />
              <text color="#B0BEC5" size="small" wrap grow>{displayRule}</text>
            </hstack>

            <hstack gap="small" alignment="middle">
              <text color="#CBD5E1" size="xsmall" weight="bold">Ambiguity</text>
              <spacer size="small" />
              <text color={ambiguityColor(ambiguity)} size="xsmall" weight="bold">
                {ambiguityLabel(ambiguity)}
              </text>
            </hstack>
          </vstack>

          {/* ── Section 6: Decision Trace ── */}
          <vstack width="100%" padding="xsmall" backgroundColor="#151E30" cornerRadius="small" gap="small">
            <text color={P.info} size="xsmall" weight="bold">DECISION TRACE</text>
            <hstack gap="small" alignment="middle">
              <text color={P.secondary} size="small">Detected language</text>
              <text color={P.muted} size="small">→</text>
              <text color={P.secondary} size="small">Checked rule</text>
              <text color={P.muted} size="small">→</text>
              <text color={P.secondary} size="small">Estimated confidence</text>
              <text color={P.muted} size="small">→</text>
              <text color={rec.color} size="small" weight="bold">Recommended action</text>
            </hstack>
          </vstack>

          {/* ── Section 7: Author Context ── */}
          <vstack width="100%" padding="small" backgroundColor={P.surface} cornerRadius="small" gap="small">
            <hstack alignment="middle" gap="small">
              <text color="#CBD5E1" size="xsmall" weight="bold">AUTHOR CONTEXT</text>
              <spacer grow />
              <text color={isRepeatOffender ? P.danger : '#B0BEC5'} size="xsmall" weight="bold">
                {removalCount > 0
                  ? `${removalCount} prior removal${removalCount !== 1 ? 's' : ''}`
                  : 'No prior violations'}
              </text>
            </hstack>
            <text color="#B0BEC5" size="xsmall">u/{reviewData.authorName}</text>
            {(authorHistory ?? []).slice(0, 3).map((entry, i) => renderHistoryRow(entry, i))}
            {isRepeatOffender && (
              <text color={P.danger} size="xsmall" weight="bold">Pattern detected: repeat language violations</text>
            )}
          </vstack>

          {/* ── Moderator Review ── */}
          <vstack width="100%" padding="small" backgroundColor="#151E30" cornerRadius="small" gap="small">
            <text color={P.info} size="xsmall" weight="bold">MODERATOR REVIEW</text>
            <text color="#B0BEC5" size="xsmall">Your action will be logged against the AI recommendation for quality tracking.</text>
            <hstack gap="small" alignment="middle">
              <text color="#B0BEC5" size="xsmall">AI recommends:</text>
              <text color={rec.color} size="small" weight="bold">{effectiveRecommendation.toUpperCase()}</text>
              <spacer grow />
              <text color="#B0BEC5" size="xsmall">If you choose differently, it will be recorded as a moderator override.</text>
            </hstack>
          </vstack>

          {/* ── Section 8: Original vs Translation ── */}
          <hstack width="100%" gap="medium">
            <vstack grow padding="small" backgroundColor="#0F1A2E" cornerRadius="small" gap="small">
              <text color={P.muted} size="xsmall" weight="bold">ORIGINAL</text>
              <text color={P.secondary} size="small" wrap>
                {originalContent ? originalContent.slice(0, 200) : '—'}
              </text>
            </vstack>
            <vstack grow padding="small" backgroundColor={P.surface2} cornerRadius="small" gap="small">
              <text color={P.info} size="xsmall" weight="bold">TRANSLATION</text>
              <text color={P.text} size="small" wrap>{displayTranslation}</text>
            </vstack>
          </hstack>

          <spacer grow />

          {/* ── Section 9: Actions ── */}
          <hstack width="100%" gap="small">
            <button appearance="destructive" grow onPress={() => handleAction('remove')}>Remove content</button>
            <button appearance="success" grow onPress={() => handleAction('approve')}>Approve content</button>
          </hstack>
          <hstack width="100%" gap="small">
            <button appearance="secondary" grow onPress={() => handleAction('remove_dm')}>Remove + notify</button>
            <button appearance="secondary" grow onPress={() => handleAction('review')}>Send to review</button>
            <button appearance="plain" grow onPress={() => handleAction('skip')}>Dismiss</button>
          </hstack>

        </vstack>
      </vstack>
    );
  },
});

// ─── Content Analyzer ────────────────────────────────────────────────────────

async function analyzeContent(
  targetType: 'post' | 'comment',
  targetId: string,
  context: Context
) {
  const { reddit, redis, ui, userId } = context;
  if (!userId) { ui.showToast('⚠️ Could not identify user.'); return; }

  const [allowed_lang, allowed_lang_name] = await Promise.all([
    context.settings.get<string>('allowed_lang'),
    context.settings.get<string>('allowed_lang_name'),
  ]);
  const lang = allowed_lang ?? 'en';
  const langName = allowed_lang_name ?? 'English';

  const item = targetType === 'post'
    ? await reddit.getPostById(targetId)
    : await reddit.getCommentById(targetId);

  const content = targetType === 'post'
    ? [(item as Post).title, item.body ?? ''].join('\n').trim()
    : (item.body ?? '').trim();

  if (!content) { ui.showToast('⚠️ No text content to analyze.'); return; }

  ui.showToast('🌐 Analyzing...');

  let analysis;
  try {
    analysis = await analyzeWithGemini(content, lang, langName, context);
  } catch {
    analysis = FALLBACK_RESULT;
  }

  const subredditName = await reddit.getCurrentSubredditName();
  await saveToRedis(
    redis, userId, item.id, targetType,
    item.authorName ?? '', langName, analysis,
    content.slice(0, 300)
  );

  await reddit.submitPost({
    subredditName,
    title: `[LinguaGuard] Review — ${analysis.lang_name} detected`,
    preview: (
      <vstack width="100%" height="100%" alignment="center middle" backgroundColor="#0B1020">
        <text color="#38BDF8" size="large" weight="bold">🌐 LinguaGuard</text>
        <spacer size="small" />
        <text color="#94A3B8">Loading review panel...</text>
      </vstack>
    ),
  });

  ui.showToast('🌐 Review panel ready — open the new post to moderate.');
}

// ─── Menu Items ───────────────────────────────────────────────────────────────

Devvit.addMenuItem({
  label: '🌐 Translate & Review language',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => analyzeContent('post', event.targetId, context),
});

Devvit.addMenuItem({
  label: '🌐 Translate & Review language',
  location: 'comment',
  forUserType: 'moderator',
  onPress: async (event, context) => analyzeContent('comment', event.targetId, context),
});

export default Devvit;
