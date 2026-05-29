// app/(tabs)/etf.tsx

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type ETF = {
  ticker: string;
  name: string;
  market: string;
  region: string;
  category: string;
  sectors: string[];
  risk: string;
  recommendation?: string;
  reason?: string;
  description?: string;
};

type Strategy = {
  goal?: string;
  type?: string;
  horizon?: string;
  risk?: string;
  geography?: string;
  marketCap?: string;
  sectors?: string[];
};

// ─── Curated ETF List ─────────────────────────────────────────────────────────

const CURATED_ETFS: ETF[] = [
  { ticker: 'VOO',    name: 'Vanguard S&P 500 ETF',           market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'QQQ',    name: 'Invesco NASDAQ-100 ETF',          market: 'NASDAQ', region: 'US',     category: 'Equity',    sectors: ['Technology'],               risk: 'High'   },
  { ticker: 'SPY',    name: 'SPDR S&P 500 ETF',               market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'VTI',    name: 'Vanguard Total Stock Market ETF', market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'ARKK',   name: 'ARK Innovation ETF',              market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Technology', 'Healthcare'], risk: 'High'   },
  { ticker: 'GLD',    name: 'SPDR Gold Shares',                market: 'NYSE',   region: 'Global', category: 'Commodity', sectors: ['Commodities'],              risk: 'Medium' },
  { ticker: 'AGG',    name: 'iShares Core US Aggregate Bond',  market: 'NYSE',   region: 'US',     category: 'Bond',      sectors: ['Fixed Income'],             risk: 'Low'    },
  { ticker: 'VNQ',    name: 'Vanguard Real Estate ETF',        market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Real Estate'],              risk: 'Medium' },
  { ticker: 'XLK',    name: 'Technology Select Sector SPDR',   market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Technology'],               risk: 'High'   },
  { ticker: 'XLV',    name: 'Health Care Select Sector SPDR',  market: 'NYSE',   region: 'US',     category: 'Equity',    sectors: ['Healthcare'],               risk: 'Medium' },
  { ticker: 'VXUS',   name: 'Vanguard Total Intl Stock ETF',   market: 'NASDAQ', region: 'Global', category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'ISF.L',  name: 'iShares UK Equity Index Fund',    market: 'LSE',    region: 'UK',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'VUSA.L', name: 'Vanguard S&P 500 UCITS ETF',      market: 'LSE',    region: 'UK',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'VWRL.L', name: 'Vanguard FTSE All-World UCITS',   market: 'LSE',    region: 'Global', category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'CSPX.L', name: 'iShares Core S&P 500 UCITS ETF',  market: 'LSE',    region: 'UK',     category: 'Equity',    sectors: ['Diversified'],              risk: 'Medium' },
  { ticker: 'EQQQ.L', name: 'Invesco NASDAQ-100 UCITS ETF',    market: 'LSE',    region: 'UK',     category: 'Equity',    sectors: ['Technology'],               risk: 'High'   },
  { ticker: 'IGLT.L', name: 'iShares UK Gilts ETF',            market: 'LSE',    region: 'UK',     category: 'Bond',      sectors: ['Fixed Income'],             risk: 'Low'    },
  { ticker: 'INRG.L', name: 'iShares Global Clean Energy ETF', market: 'LSE',    region: 'Global', category: 'Equity',    sectors: ['Energy'],                   risk: 'High'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExchangeColour(market: string): string {
  const colours: Record<string, string> = {
    NYSE:    '#a78bfa',
    NASDAQ:  '#ec4899',
    LSE:     '#60a5fa',
    Euronext:'#2dd4bf',
  };
  return colours[market] ?? '#6b7280';
}

function getRecColour(rec: string): string {
  if (rec === 'BUY')  return '#4ade80';
  if (rec === 'SELL') return '#f87171';
  return '#facc15';
}

function scoreETF(etf: ETF, strategy: Strategy): number {
  let score = 0;
  if (strategy.geography) {
    const geo = strategy.geography.toLowerCase();
    if (geo.includes('uk')     && etf.region === 'UK')     score += 3;
    if (geo.includes('us')     && etf.region === 'US')     score += 3;
    if (geo.includes('global') && etf.region === 'Global') score += 3;
  }
  if (strategy.risk) {
    const risk = strategy.risk.toLowerCase();
    if (risk.includes('low')    && etf.risk === 'Low')    score += 2;
    if (risk.includes('medium') && etf.risk === 'Medium') score += 2;
    if (risk.includes('high')   && etf.risk === 'High')   score += 2;
  }
  if (strategy.sectors && strategy.sectors.length > 0) {
    const matched = etf.sectors.filter(s =>
      strategy.sectors!.some(ss => ss.toLowerCase().includes(s.toLowerCase()))
    );
    score += matched.length * 2;
  }
  return score;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ETFScreen() {
  const router = useRouter();

  const [searchQuery, setSearchQuery]   = useState('');
  const [strategy, setStrategy]         = useState<Strategy>({});
  const [isScanning, setIsScanning]     = useState(false);
  const [aiPicks, setAiPicks]           = useState<ETF[]>([]);
  const [scanError, setScanError]       = useState('');
  const [curatedList, setCuratedList]   = useState<ETF[]>(CURATED_ETFS);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  // Load strategy + descriptions when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadStrategy();
      loadOrFetchDescriptions();
    }, [])
  );

  // ── Load strategy from AsyncStorage ──
  async function loadStrategy() {
    try {
      const saved = await AsyncStorage.getItem('strategy');
      if (saved) {
        const parsed: Strategy = JSON.parse(saved);
        setStrategy(parsed);
        const sorted = [...CURATED_ETFS].sort(
          (a, b) => scoreETF(b, parsed) - scoreETF(a, parsed)
        );
        setCuratedList(sorted);
      }
    } catch (e) {
      console.error('Failed to load strategy', e);
    }
  }

  // ── Load descriptions from cache, or fetch from OpenAI if not cached ──
  async function loadOrFetchDescriptions() {
    try {
      // Check cache first
      const cached = await AsyncStorage.getItem('etfDescriptions');
      if (cached) {
        setDescriptions(JSON.parse(cached));
        return;
      }

      // Not cached — fetch from OpenAI
      const tickerList = CURATED_ETFS.map(e => e.ticker).join(', ');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a financial assistant. Return only valid JSON, no markdown.',
            },
            {
              role: 'user',
              content: `For each of these ETF tickers, write a single short sentence (max 15 words) describing what it tracks.
Return ONLY a JSON object where each key is the ticker and the value is the description.
Tickers: ${tickerList}`,
            },
          ],
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content ?? '';
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const result: Record<string, string> = JSON.parse(cleaned);

      await AsyncStorage.setItem('etfDescriptions', JSON.stringify(result));
      setDescriptions(result);
    } catch (e) {
      console.error('Failed to fetch ETF descriptions', e);
      // Silently fail — descriptions just won't show
    }
  }

  // ── AI Scan — asks OpenAI for ETF picks based on strategy ──
  async function runAIScan() {
    setIsScanning(true);
    setScanError('');
    setAiPicks([]);

    const strategyText = `
      Investment Goal: ${strategy.goal ?? 'Not set'}
      Investment Type: ${strategy.type ?? 'Not set'}
      Time Horizon: ${strategy.horizon ?? 'Not set'}
      Risk Appetite: ${strategy.risk ?? 'Not set'}
      Geography: ${strategy.geography ?? 'Not set'}
      Market Cap Preference: ${strategy.marketCap ?? 'Not set'}
      Sectors of Interest: ${strategy.sectors?.join(', ') ?? 'Not set'}
    `.trim();

    const prompt = `
You are an ETF recommendation engine. Based on this investment strategy, recommend exactly 5 ETFs.

STRATEGY:
${strategyText}

Respond ONLY with a valid JSON array. No explanation, no markdown, just the JSON.
Each item must have these exact fields:
- ticker (string, e.g. "VOO")
- name (string, full ETF name)
- market (string, e.g. "NYSE", "LSE", "NASDAQ")
- region (string: "US", "UK", or "Global")
- category (string: "Equity", "Bond", or "Commodity")
- sectors (array of strings)
- risk (string: "Low", "Medium", or "High")
- recommendation (string: "BUY", "HOLD", or "SELL")
- reason (string, 1 sentence explaining why this matches the strategy)

Return only the JSON array, nothing else.
    `.trim();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful ETF analyst. Return only valid JSON, no markdown, no explanation.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content ?? '';
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const picks: ETF[] = JSON.parse(cleaned);

      setAiPicks(picks);
      await AsyncStorage.setItem('etfPicks', JSON.stringify(picks));
    } catch (e) {
      console.error('AI scan failed', e);
      setScanError('Scan failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  }

  // ── Filter curated list by search query ──
  const filteredList = curatedList.filter(etf => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      etf.ticker.toLowerCase().includes(q) ||
      etf.name.toLowerCase().includes(q)
    );
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Title */}
      <Text style={styles.pageTitle}>ETFs</Text>
      <Text style={styles.pageSubtitle}>Funds aligned to your strategy</Text>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search ETFs..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── AI Recommendations — hidden while searching ── */}
      {!searchQuery && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Recommendations</Text>
          <Text style={styles.sectionSubtitle}>
            GPT picks ETFs based on your strategy settings
          </Text>

          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
            onPress={runAIScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="flash" size={16} color="#000" />
            )}
            <Text style={styles.scanButtonText}>
              {isScanning ? 'Scanning...' : 'Scan for ETFs'}
            </Text>
          </TouchableOpacity>

          {scanError !== '' && (
            <Text style={styles.errorText}>{scanError}</Text>
          )}

          {/* AI picks — single column (more detail shown) */}
          {aiPicks.map(etf => (
            <ETFCard key={etf.ticker} etf={etf} showReason />
          ))}

          {aiPicks.length === 0 && !isScanning && scanError === '' && (
            <Text style={styles.emptyText}>
              Tap "Scan for ETFs" to get personalised recommendations
            </Text>
          )}
        </View>
      )}

      {/* ── Popular ETFs — 2 column grid ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {searchQuery ? `Results for "${searchQuery}"` : 'Popular ETFs'}
        </Text>
        {!searchQuery && (
          <Text style={styles.sectionSubtitle}>
            Sorted by how well they match your strategy
          </Text>
        )}

        {filteredList.length === 0 ? (
          <Text style={styles.emptyText}>No ETFs found for "{searchQuery}"</Text>
        ) : (
          <View style={styles.grid}>
            {filteredList.map(etf => (
              <ETFCard
                key={etf.ticker}
                etf={{ ...etf, description: descriptions[etf.ticker] }}
                compact
              />
            ))}
          </View>
        )}
      </View>

    </ScrollView>
  );
}

// ─── ETF Card ─────────────────────────────────────────────────────────────────

function ETFCard({
  etf,
  showReason,
  compact,
}: {
  etf: ETF;
  showReason?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();

  function handlePress() {
    router.push({
      pathname: '/stock',
      params: { ticker: etf.ticker, name: etf.name, market: etf.market },
    });
  }

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Exchange badge */}
      <View style={[styles.exchangeBadge, { backgroundColor: getExchangeColour(etf.market) + '22' }]}>
        <Text style={[styles.exchangeText, { color: getExchangeColour(etf.market) }]}>
          {etf.market}
        </Text>
      </View>

      {/* Ticker */}
      <Text style={styles.ticker}>{etf.ticker}</Text>

      {/* Name */}
      <Text style={styles.etfName} numberOfLines={2}>{etf.name}</Text>

      {/* Description — curated cards only */}
      {etf.description && (
        <Text style={styles.description} numberOfLines={3}>{etf.description}</Text>
      )}

      {/* Tags — hidden in compact mode to save space */}
      {!compact && (
        <View style={styles.tagsRow}>
          <Text style={styles.tag}>{etf.category}</Text>
          <Text style={styles.tag}>{etf.risk} Risk</Text>
        </View>
      )}

      {/* Reason — AI picks only */}
      {showReason && etf.reason && (
        <Text style={styles.reason}>{etf.reason}</Text>
      )}

      {/* Bottom row: tags (compact) + rec badge */}
      <View style={styles.cardBottom}>
        {compact && (
          <View style={styles.tagsRow}>
            <Text style={styles.tag}>{etf.category}</Text>
            <Text style={styles.tag}>{etf.risk} Risk</Text>
          </View>
        )}
        {etf.recommendation && (
          <View style={[styles.recBadge, { backgroundColor: getRecColour(etf.recommendation) + '22' }]}>
            <Text style={[styles.recText, { color: getRecColour(etf.recommendation) }]}>
              {etf.recommendation}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },

  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
    marginTop: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 16,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f9fafb',
    fontSize: 15,
  },

  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },

  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#facc15',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 14,
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },

  // 2-column grid wrapper
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  // Card — default (full width, used for AI picks)
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  // Card — compact (half width, used in grid)
  cardCompact: {
    width: '48%',
    marginBottom: 0, // gap handles spacing in grid mode
  },

  exchangeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  exchangeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  ticker: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 2,
  },
  etfName: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 6,
    lineHeight: 16,
  },
  description: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 15,
    fontStyle: 'italic',
  },

  tagsRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#262626',
    color: '#9ca3af',
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },

  reason: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  recBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recText: {
    fontSize: 12,
    fontWeight: '700',
  },
});