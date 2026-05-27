import type { Context } from '@devvit/public-api';
import type { ReviewData } from './types.js';
import { cleanupRedis } from './redis.js';
import { recordDecision } from './history.js';

export type Action = 'approve' | 'remove' | 'remove_dm' | 'review' | 'skip';

export async function executeAction(
  action: Action,
  reviewData: ReviewData,
  context: Context,
  userId: string,
  onDone: () => void
) {
  const { redis, reddit, ui } = context;
  const {
    targetId, targetType, authorName, langName, detectedLang,
    recommendation, reason, allowedLangName, confidenceScore, source,
  } = reviewData;

  if (action === 'skip' || action === 'review') {
    ui.showToast(action === 'review' ? '🔍 Flagged for manual review.' : '👁️ Skipped — no action taken.');
    await cleanupRedis(redis, userId);
    onDone();
    return;
  }

  const wasOverride =
    (action === 'approve' && (recommendation === 'remove' || recommendation === 'review')) ||
    ((action === 'remove' || action === 'remove_dm') && recommendation === 'approve');

  try {
    const subredditName = await reddit.getCurrentSubredditName();

    if (action === 'approve') {
      await reddit.approve(targetId);
      if (authorName) {
        await recordDecision(redis, subredditName, authorName, {
          action: 'approve',
          langName,
          detectedLang,
          targetType,
          timestamp: Date.now(),
          aiRecommendation: recommendation,
          modAction: 'approve',
          wasOverride,
          confidence: confidenceScore,
        });
      }
      ui.showToast({
        text: wasOverride
          ? `Override recorded — you chose approve instead of AI's ${recommendation}.`
          : '✅ Approved successfully.',
        appearance: 'success',
      });

    } else if (action === 'remove' || action === 'remove_dm') {
      await reddit.remove(targetId, false);

      if (action === 'remove_dm' && authorName) {
        try {
          await reddit.sendPrivateMessageAsSubreddit({
            fromSubredditName: subredditName,
            to: authorName,
            subject: `Your ${targetType} was removed`,
            text: [
              `Hi u/${authorName},`,
              '',
              `Your recent ${targetType} was removed because this community requires posts to be in **${allowedLangName}**.`,
              '',
              `Your ${targetType} was detected as: **${langName}**.`,
              '',
              'Feel free to repost in the required language. If you think this was an error, please message the moderators.',
            ].join('\n'),
          });
        } catch {
          // DM failed (banned user, etc.) — removal already succeeded
        }
      }

      if (authorName) {
        await recordDecision(redis, subredditName, authorName, {
          action: action === 'remove_dm' ? 'remove_dm' : 'remove',
          langName,
          detectedLang,
          targetType,
          timestamp: Date.now(),
          aiRecommendation: recommendation,
          modAction: action,
          wasOverride,
          confidence: confidenceScore,
        });

        try {
          const confPct = (confidenceScore * 100).toFixed(0);
          const overrideTag = wasOverride ? 'MOD OVERRIDE' : 'AI confirmed';
          const noteText = `[LinguaGuard] ${action.toUpperCase()} ${targetType} | lang: ${langName} (${detectedLang}) | confidence: ${confPct}% | source: ${source} | AI rec: ${recommendation} | ${overrideTag} | reason: ${reason}`;
          await reddit.addModNote({
            subreddit: subredditName,
            user: authorName,
            note: noteText.slice(0, 250),
            label: 'HELPFUL_USER',
            redditId: targetId as `t1_${string}` | `t3_${string}`,
          });
        } catch {
          // Mod note failed silently — removal already succeeded
        }
      }

      ui.showToast({
        text: wasOverride
          ? `Override recorded — you chose ${action} instead of AI's ${recommendation}.`
          : action === 'remove_dm'
            ? '🗑️ Removed and author notified by DM.'
            : '🗑️ Removed successfully.',
        appearance: 'success',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.showToast({
      text: `⚠️ Action failed: ${msg.slice(0, 80)}`,
      appearance: 'neutral',
    });
  } finally {
    await cleanupRedis(redis, userId);
    onDone();
  }
}
