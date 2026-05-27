import type { JSONValue } from '@devvit/public-api';

export interface LinguaAnalysis {
  detected_lang: string;
  lang_name: string;
  translation: string;
  summary: string;
  violates_rule: boolean;
  recommendation: 'remove' | 'approve' | 'review';
  reason: string;
  confidence_score: number;
  signals: string[];
  matched_rule: string;
  ambiguity: 'low' | 'medium' | 'high';
}

export interface AnalysisResult extends LinguaAnalysis {
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  source: 'gemini' | 'heuristic';
  fallbackMode: boolean;
}

export interface SubredditConfig {
  allowed_lang: string;
  allowed_lang_name: string;
}

export interface ReviewData {
  [key: string]: JSONValue;
  targetId: string;
  targetType: 'post' | 'comment';
  authorName: string;
  langName: string;
  detectedLang: string;
  recommendation: LinguaAnalysis['recommendation'];
  reason: string;
  allowedLangName: string;
  translation: string;
  summary: string;
  violates: boolean;
  confidence: string;
  confidenceScore: number;
  source: string;
  evidence: string;
  fallbackMode: boolean;
  originalContent: string;
  matchedRule: string;
  ambiguity: string;
}

export interface ModDecision {
  [key: string]: JSONValue;
  action: 'approve' | 'remove' | 'remove_dm';
  langName: string;
  detectedLang: string;
  targetType: 'post' | 'comment';
  timestamp: number;
  aiRecommendation: string;
  modAction: string;
  wasOverride: boolean;
  confidence: number;
}

export interface ModFeedback {
  aiCorrect: boolean;
  finalClassification: 'allowed' | 'foreign' | 'mixed' | 'unclear';
  reasonOverride: string;
}
