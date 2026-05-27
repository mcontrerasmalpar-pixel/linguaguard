import type { Context } from '@devvit/public-api';
import type { AnalysisResult, ReviewData } from './types.js';

const TTL_MS = 15 * 60 * 1000;

export async function saveToRedis(
  redis: Context['redis'],
  userId: string,
  itemId: string,
  targetType: 'post' | 'comment',
  authorName: string,
  allowedLangName: string,
  analysis: AnalysisResult,
  originalContent: string
) {
  const ttl = { expiration: new Date(Date.now() + TTL_MS) };
  await Promise.all([
    redis.set(`pending:${userId}`, itemId, ttl),
    redis.set(`pending_type:${userId}`, targetType, ttl),
    redis.set(`pending_author:${userId}`, authorName, ttl),
    redis.set(`pending_lang:${userId}`, analysis.lang_name, ttl),
    redis.set(`pending_detected_lang:${userId}`, analysis.detected_lang, ttl),
    redis.set(`pending_recommendation:${userId}`, analysis.recommendation, ttl),
    redis.set(`pending_reason:${userId}`, analysis.reason, ttl),
    redis.set(`pending_allowed_lang_name:${userId}`, allowedLangName, ttl),
    redis.set(`pending_translation:${userId}`, analysis.translation, ttl),
    redis.set(`pending_summary:${userId}`, analysis.summary, ttl),
    redis.set(`pending_violates:${userId}`, String(analysis.violates_rule), ttl),
    redis.set(`pending_confidence:${userId}`, analysis.confidence, ttl),
    redis.set(`pending_confidence_score:${userId}`, String(Math.round(analysis.confidence_score * 100)), ttl),
    redis.set(`pending_source:${userId}`, analysis.source, ttl),
    redis.set(`pending_evidence:${userId}`, analysis.signals.join(' · '), ttl),
    redis.set(`pending_fallback_mode:${userId}`, String(analysis.fallbackMode), ttl),
    redis.set(`pending_content:${userId}`, originalContent.slice(0, 300), ttl),
    redis.set(`pending_matched_rule:${userId}`, analysis.matched_rule, ttl),
    redis.set(`pending_ambiguity:${userId}`, analysis.ambiguity, ttl),
  ]);
}

export async function loadFromRedis(
  redis: Context['redis'],
  userId: string
): Promise<ReviewData> {
  const [
    targetId, targetType, authorName, langName, detectedLang,
    recommendation, reason, allowedLangName, translation, summary, violates,
    confidence, confidenceScore, source, evidence, fallback, originalContent,
    matchedRule, ambiguity,
  ] = await Promise.all([
    redis.get(`pending:${userId}`),
    redis.get(`pending_type:${userId}`),
    redis.get(`pending_author:${userId}`),
    redis.get(`pending_lang:${userId}`),
    redis.get(`pending_detected_lang:${userId}`),
    redis.get(`pending_recommendation:${userId}`),
    redis.get(`pending_reason:${userId}`),
    redis.get(`pending_allowed_lang_name:${userId}`),
    redis.get(`pending_translation:${userId}`),
    redis.get(`pending_summary:${userId}`),
    redis.get(`pending_violates:${userId}`),
    redis.get(`pending_confidence:${userId}`),
    redis.get(`pending_confidence_score:${userId}`),
    redis.get(`pending_source:${userId}`),
    redis.get(`pending_evidence:${userId}`),
    redis.get(`pending_fallback_mode:${userId}`),
    redis.get(`pending_content:${userId}`),
    redis.get(`pending_matched_rule:${userId}`),
    redis.get(`pending_ambiguity:${userId}`),
  ]);

  return {
    targetId: targetId ?? '',
    targetType: (targetType ?? 'post') as 'post' | 'comment',
    authorName: authorName ?? '',
    langName: langName ?? 'Unknown',
    detectedLang: detectedLang ?? '??',
    recommendation: (recommendation ?? 'review') as 'remove' | 'approve' | 'review',
    reason: reason ?? '',
    allowedLangName: allowedLangName ?? 'English',
    translation: translation ?? '',
    summary: summary ?? '',
    violates: violates === 'true',
    confidence: confidence ?? 'low',
    confidenceScore: parseFloat(confidenceScore ?? '0'),
    source: source ?? 'heuristic',
    evidence: evidence ?? '',
    fallbackMode: fallback === 'true',
    originalContent: originalContent ?? '',
    matchedRule: matchedRule ?? '',
    ambiguity: ambiguity ?? 'low',
  };
}

export async function cleanupRedis(redis: Context['redis'], userId: string) {
  await Promise.all([
    redis.del(`pending:${userId}`),
    redis.del(`pending_type:${userId}`),
    redis.del(`pending_author:${userId}`),
    redis.del(`pending_lang:${userId}`),
    redis.del(`pending_detected_lang:${userId}`),
    redis.del(`pending_recommendation:${userId}`),
    redis.del(`pending_reason:${userId}`),
    redis.del(`pending_allowed_lang_name:${userId}`),
    redis.del(`pending_translation:${userId}`),
    redis.del(`pending_summary:${userId}`),
    redis.del(`pending_violates:${userId}`),
    redis.del(`pending_confidence:${userId}`),
    redis.del(`pending_confidence_score:${userId}`),
    redis.del(`pending_source:${userId}`),
    redis.del(`pending_evidence:${userId}`),
    redis.del(`pending_fallback_mode:${userId}`),
    redis.del(`pending_content:${userId}`),
    redis.del(`pending_matched_rule:${userId}`),
    redis.del(`pending_ambiguity:${userId}`),
  ]);
}
