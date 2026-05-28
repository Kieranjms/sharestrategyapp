import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;

const EXCHANGE_COLOURS: Record<string, string> = {
  'NYSE': '#a78bfa',
  'NASDAQ': '#ec4899',
  'SSE': '#fb923c',
  'Euronext': '#2dd4bf',
  'TSE': '#cbd5e1',
  'HKEX': '#fda4af',
  'NSE': '#fbbf24',
  'LSE': '#60a5fa',
  'SZSE': '#dc2626',
  'TSX': '#86efac',
};

function getExchangeColour(exchange: string) {
  if (exchange.includes('LSE')) return EXCHANGE_COLOURS['LSE'];
  if (exchange.includes('NASDAQ')) return EXCHANGE_COLOURS['NASDAQ'];
  if (exchange.includes('NYSE')) return EXCHANGE_COLOURS['NYSE'];
  if (exchange.includes('TSX')) return EXCHANGE_COLOURS['TSX'];
  if (exchange.includes('TSE')) return EXCHANGE_COLOURS['TSE'];
  if (exchange.includes('HKEX')) return EXCHANGE_COLOURS['HKEX'];
  if (exchange.includes('NSE')) return EXCHANGE_COLOURS['NSE'];
  if (exchange.includes('SSE')) return EXCHANGE_COLOURS['SSE'];
  if (exchange.includes('SZSE')) return EXCHANGE_COLOURS['SZSE'];
  if (exchange.includes('Euronext')) return EXCHANGE_COLOURS['Euronext'];
  return '#6b7280';
}

function getRecColour(rec: string) {
  if (rec.includes('BUY')) return '#4ade80';
  if (rec.includes('SELL')) return '#f87171';
  if (rec.includes('HOLD')) return '#facc15';
  return '#6b7280';
}

function safeParseJSON(text: string) {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    const keys = ['stocks', 'recommendations', 'picks', 'results'];
    for (const key of keys) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [];
  } catch {
    return [];
  }
}

type StockResult = {
  ticker: string;
  name: string;
  exchange: string;
  claudeVerdict: string;
  claudeReasoning: string;
  gptVerdict: string;
  gptReasoning: string;
  consolidatedAnalysis: string;
  bothAgree: boolean;
  source: string;
  scanDate?: string;
  recChanged?: boolean;
};

export default function AnalysisScreen() {
  const router = useRouter();
  const [results, setResults] = useState<StockResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [strategy, setStrategy] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        const stored = await AsyncStorage.getItem('strategy');
        if (stored) setStrategy(JSON.parse(stored));

        // Load accumulated picks to show on screen
        const picks = await AsyncStorage.getItem('lastAnalysis');
        if (picks) setResults(JSON.parse(picks));
      }
      loadData();
    }, [])
  );

  async function callClaude(messages: any[]) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-client-side-api-key-allowed': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages,
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '[]';
  }

  async function callGPT(messages: any[]) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You are an investment analyst. Always respond with valid JSON array only, no markdown, no explanation.' },
          ...messages,
        ],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '[]';
  }

  async function runAnalysis() {
    setLoading(true);
    setResults([]);

    try {
      // Load previous picks so we can exclude them and merge later
      const storedPicks = await AsyncStorage.getItem('lastAnalysis');
      const previousPicks: StockResult[] = storedPicks ? JSON.parse(storedPicks) : [];
      const previousTickers = previousPicks.map(p => p.ticker);
      const exclusionText = previousTickers.length > 0
        ? `\n\nIMPORTANT: Do NOT recommend any of these tickers — they have already been analysed: ${previousTickers.join(', ')}. You MUST pick different stocks.`
        : '';

      const strategyText = strategy ? `
        Goal: ${strategy.goal}
        Time Horizon: ${strategy.horizon}
        Risk Appetite: ${strategy.riskAppetite}
        Investment Type: ${strategy.investmentType}
        Geography: ${strategy.geography}
        Market Caps: ${strategy.marketCaps?.join(', ')}
        Sectors: ${strategy.sectors?.join(', ')}
      ` : 'General balanced investor.';

      const investmentTypeInstruction =
        strategy?.investmentType === 'etf' ? 'You MUST recommend ETFs only. Do NOT recommend individual stocks.' :
        strategy?.investmentType === 'stocks' ? 'You MUST recommend individual stocks only. Do NOT recommend ETFs.' :
        'You may recommend either individual stocks or ETFs.';

      const pickPrompt = `You are an expert investment analyst. Based on this investor strategy, recommend exactly 2 investments.

IMPORTANT: ${investmentTypeInstruction}${exclusionText}

Strategy:
${strategyText}

Respond with ONLY a valid JSON array, no other text:
[
  {
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "exchange": "NASDAQ",
    "verdict": "BUY",
    "reasoning": "1-2 sentence reasoning."
  },
  {
    "ticker": "MSFT",
    "name": "Microsoft Corporation",
    "exchange": "NASDAQ",
    "verdict": "BUY",
    "reasoning": "1-2 sentence reasoning."
  }
]`;

      // Step 1 — Claude and GPT pick stocks simultaneously
      setLoadingStep('Claude and GPT-4 are picking stocks...');
      const [claudePicksText, gptPicksText] = await Promise.all([
        callClaude([{ role: 'user', content: pickPrompt }]),
        callGPT([{ role: 'user', content: pickPrompt }]),
      ]);
      const claudePicks = safeParseJSON(claudePicksText);
      const gptPicks = safeParseJSON(gptPicksText);

      // Step 2 — Claude and GPT review each other's picks simultaneously
      setLoadingStep("AIs are reviewing each other's picks...");

      const claudeReviewPrompt = `You are an investment analyst. Review these stocks that GPT-4 recommended and give your verdict on each.

GPT-4's picks: ${JSON.stringify(gptPicks)}
Investor strategy: ${strategyText}

Respond with ONLY a valid JSON array:
[{ "ticker": "AAPL", "verdict": "BUY", "reasoning": "1 sentence." }]`;

      const gptReviewPrompt = `You are an investment analyst. Review these stocks that Claude recommended and give your verdict on each.

Claude's picks: ${JSON.stringify(claudePicks)}
Investor strategy: ${strategyText}

Respond with ONLY a valid JSON array:
[{ "ticker": "AAPL", "verdict": "BUY", "reasoning": "1 sentence." }]`;

      const [claudeReviewText, gptReviewText] = await Promise.all([
        callClaude([{ role: 'user', content: claudeReviewPrompt }]),
        callGPT([{ role: 'user', content: gptReviewPrompt }]),
      ]);
      const claudeReviews = safeParseJSON(claudeReviewText);
      const gptReviews = safeParseJSON(gptReviewText);

      // Step 3 — Deduplicate and build stock list
      setLoadingStep('Agent is consolidating analysis...');
      const seen = new Set<string>();
      const allStocks = [
        ...claudePicks.map((p: any) => ({ ...p, source: 'Claude' })),
        ...gptPicks.map((p: any) => ({ ...p, source: 'GPT-4' })),
      ]
      .filter((stock) => {
        if (seen.has(stock.ticker)) return false;
        seen.add(stock.ticker);
        return true;
      })
      .map((stock) => {
        const inClaude = claudePicks.some((p: any) => p.ticker === stock.ticker);
        const inGpt = gptPicks.some((p: any) => p.ticker === stock.ticker);
        return { ...stock, source: inClaude && inGpt ? 'Both' : inClaude ? 'Claude' : 'GPT-4' };
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

      // Step 4 — Consolidation agent
      const consolidationPrompt = `You are an investment analysis agent. Provide a consolidated 2-sentence analysis for each stock.

Claude's picks: ${JSON.stringify(claudePicks)}
GPT-4's picks: ${JSON.stringify(gptPicks)}
Claude's review of GPT-4's picks: ${JSON.stringify(claudeReviews)}
GPT-4's review of Claude's picks: ${JSON.stringify(gptReviews)}
Stocks: ${allStocks.map(s => s.ticker).join(', ')}

Respond with ONLY a valid JSON array:
[{ "ticker": "AAPL", "consolidatedAnalysis": "2 sentence analysis." }]`;

      const agentRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-client-side-api-key-allowed': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          temperature: 0.2,
          messages: [{ role: 'user', content: consolidationPrompt }],
        }),
      });
      const agentData = await agentRes.json();
      const agentAnalysis = safeParseJSON(agentData.content?.[0]?.text || '[]');

      // Build new results from this scan
      const scanDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const newResults: StockResult[] = allStocks.map(stock => {
        const claudePick = claudePicks.find((p: any) => p.ticker === stock.ticker);
        const gptPick = gptPicks.find((p: any) => p.ticker === stock.ticker);
        const claudeReview = claudeReviews.find((r: any) => r.ticker === stock.ticker);
        const gptReview = gptReviews.find((r: any) => r.ticker === stock.ticker);
        const agent = agentAnalysis.find((a: any) => a.ticker === stock.ticker);

        const claudeVerdict = claudePick?.verdict || claudeReview?.verdict || 'Not reviewed';
        const gptVerdict = gptPick?.verdict || gptReview?.verdict || 'Not reviewed';

        return {
          ticker: stock.ticker,
          name: stock.name,
          exchange: stock.exchange,
          claudeVerdict,
          claudeReasoning: claudePick?.reasoning || claudeReview?.reasoning || 'No reasoning provided',
          gptVerdict,
          gptReasoning: gptPick?.reasoning || gptReview?.reasoning || 'No reasoning provided',
          consolidatedAnalysis: agent?.consolidatedAnalysis || 'Analysis unavailable.',
          bothAgree: claudeVerdict === gptVerdict && claudeVerdict !== 'Not reviewed',
          source: stock.source,
          scanDate,
          recChanged: false,
        };
      });

      // Merge new results with previous picks
      // - New tickers get added
      // - Existing tickers get updated if recommendation changed, flagged with recChanged
      // - Existing tickers with same rec are skipped (no duplicate)
      const mergedPicks = [...previousPicks];
      for (const newPick of newResults) {
        const existingIndex = mergedPicks.findIndex(p => p.ticker === newPick.ticker);
        if (existingIndex === -1) {
          // Brand new stock — add it
          mergedPicks.push(newPick);
        } else {
          const existing = mergedPicks[existingIndex];
          const recChanged =
            existing.claudeVerdict !== newPick.claudeVerdict ||
            existing.gptVerdict !== newPick.gptVerdict;
          if (recChanged) {
            // Recommendation changed — update and flag it
            mergedPicks[existingIndex] = { ...newPick, recChanged: true };
          }
          // Same rec — skip, no duplicate
        }
      }

      // Save merged list (cap at 20 most recent unique stocks)
      const trimmedPicks = mergedPicks.slice(-20);
      setResults(trimmedPicks);
      await AsyncStorage.setItem('lastAnalysis', JSON.stringify(trimmedPicks));

    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Analysis</Text>
        <Text style={styles.subtitle}>Claude & GPT-4 cross-referenced</Text>
      </View>

      {!strategy && (
        <View style={styles.noStrategy}>
          <Ionicons name="bulb-outline" size={32} color="#555" />
          <Text style={styles.noStrategyText}>Set your strategy first to get personalised recommendations</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.scanButton}
        onPress={runAnalysis}
        disabled={loading}
      >
        <Ionicons name="sparkles-outline" size={20} color="#0f0f14" />
        <Text style={styles.scanButtonText}>
          {loading ? loadingStep : 'Run AI Analysis'}
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#818cf8" />
          <Text style={styles.loadingStep}>{loadingStep}</Text>
          <Text style={styles.loadingHint}>This takes about 30-40 seconds...</Text>
        </View>
      )}

      {results.length > 0 && !loading && (
        <>
          <Text style={styles.resultsTitle}>{results.length} Stocks Analysed</Text>
          {results.map((stock) => {
            const colour = getExchangeColour(stock.exchange);
            return (
              <TouchableOpacity
                key={stock.ticker}
                style={[
                  styles.tile,
                  stock.bothAgree && styles.tileAgree,
                  stock.recChanged && styles.tileChanged,
                ]}
                onPress={() => router.push({
                  pathname: '/stock',
                  params: {
                    ticker: stock.ticker,
                    name: stock.name,
                    price: '',
                    change: '',
                    rec: stock.claudeVerdict,
                    market: stock.exchange,
                  }
                })}
              >
                <View style={styles.tileHeader}>
                  <View style={[styles.exchangeDot, { backgroundColor: colour }]} />
                  <Text style={[styles.tileExchange, { color: colour }]}>{stock.exchange}</Text>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceText}>Picked by {stock.source}</Text>
                  </View>
                  {stock.recChanged && (
                    <View style={styles.changedBadge}>
                      <Text style={styles.changedText}>⚠ Rec changed</Text>
                    </View>
                  )}
                  {stock.bothAgree && !stock.recChanged && (
                    <View style={styles.agreeBadge}>
                      <Text style={styles.agreeText}>✓ Agree</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.tileTicker}>{stock.ticker}</Text>
                <Text style={styles.tileName}>{stock.name}</Text>

                <View style={styles.verdictsRow}>
                  <View style={styles.verdictBox}>
                    <Text style={styles.verdictLabel}>Claude</Text>
                    <Text style={[styles.verdictRec, { color: getRecColour(stock.claudeVerdict) }]}>
                      {stock.claudeVerdict}
                    </Text>
                    <Text style={styles.verdictReasoning}>{stock.claudeReasoning}</Text>
                  </View>
                  <View style={styles.verdictDivider} />
                  <View style={styles.verdictBox}>
                    <Text style={styles.verdictLabel}>GPT-4</Text>
                    <Text style={[styles.verdictRec, { color: getRecColour(stock.gptVerdict) }]}>
                      {stock.gptVerdict}
                    </Text>
                    <Text style={styles.verdictReasoning}>{stock.gptReasoning}</Text>
                  </View>
                </View>

                <View style={styles.consolidatedContainer}>
                  <Text style={styles.consolidatedLabel}>⚡ Agent Analysis</Text>
                  <Text style={styles.consolidatedText}>{stock.consolidatedAnalysis}</Text>
                </View>

                <View style={styles.tileFooter}>
                  {stock.scanDate && (
                    <Text style={styles.scanDate}>Scanned {stock.scanDate}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color="#555" />
                  <Text style={styles.tapHint}>Tap for live price & chart</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  header: { marginTop: 20, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '500', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 4 },
  noStrategy: { backgroundColor: '#15151e', borderRadius: 14, padding: 20, alignItems: 'center', gap: 12, marginBottom: 20 },
  noStrategyText: { color: '#555', fontSize: 13, textAlign: 'center' },
  scanButton: { backgroundColor: '#4ade80', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  scanButtonText: { color: '#0f0f14', fontWeight: '500', fontSize: 15 },
  loadingContainer: { alignItems: 'center', padding: 40, gap: 12 },
  loadingStep: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  loadingHint: { color: '#555', fontSize: 12 },
  resultsTitle: { fontSize: 16, fontWeight: '500', color: '#fff', marginBottom: 16 },
  tile: { backgroundColor: '#15151e', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: '#1e1e2a' },
  tileAgree: { borderColor: '#4ade80', borderWidth: 1 },
  tileChanged: { borderColor: '#facc15', borderWidth: 1 },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  exchangeDot: { width: 10, height: 10, borderRadius: 5 },
  tileExchange: { fontSize: 11, fontWeight: '500' },
  sourceBadge: { flex: 1, alignItems: 'flex-end' },
  sourceText: { fontSize: 10, color: '#555' },
  agreeBadge: { backgroundColor: '#0d2818', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  agreeText: { fontSize: 10, color: '#4ade80', fontWeight: '500' },
  changedBadge: { backgroundColor: '#1a1500', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  changedText: { fontSize: 10, color: '#facc15', fontWeight: '500' },
  tileTicker: { fontSize: 24, fontWeight: '500', color: '#fff', marginBottom: 2 },
  tileName: { fontSize: 13, color: '#888', marginBottom: 16 },
  verdictsRow: { flexDirection: 'row', backgroundColor: '#0f0f14', borderRadius: 12, padding: 14, marginBottom: 14, gap: 8 },
  verdictBox: { flex: 1, gap: 4 },
  verdictDivider: { width: 0.5, backgroundColor: '#2a2a35' },
  verdictLabel: { fontSize: 10, color: '#555', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  verdictRec: { fontSize: 16, fontWeight: '500' },
  verdictReasoning: { fontSize: 11, color: '#666', lineHeight: 16, marginTop: 2 },
  consolidatedContainer: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 },
  consolidatedLabel: { fontSize: 10, color: '#818cf8', fontWeight: '500', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  consolidatedText: { fontSize: 13, color: '#ccc', lineHeight: 20 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanDate: { fontSize: 11, color: '#444', flex: 1 },
  tapHint: { fontSize: 11, color: '#555' },
});