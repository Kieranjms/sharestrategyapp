import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_KEY;
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getRecommendation(change: number) {
  if (change > 1) return 'BUY';
  if (change < -1) return 'SELL';
  return 'HOLD';
}

function safeParseJSON(text: string) {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function cleanCiteTags(text: string) {
  return text
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type BriefingData = {
  tldr: string;
  marketOverview: string;
  watchToday: string;
  stocks: {
    ticker: string;
    name: string;
    summary: string;
    sources: string[];
    hasSignificantNews: boolean;
  }[];
};

export default function HomeScreen() {
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [hotPicks, setHotPicks] = useState<any[]>([]);
  const [hotPicksExpanded, setHotPicksExpanded] = useState(false);
  const [lastBriefingDate, setLastBriefingDate] = useState('');
  const [expandedStocks, setExpandedStocks] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  async function loadAll() {
    await Promise.all([
      loadWatchlist(),
      loadBriefing(),
      loadHotPicks(),
    ]);
  }

  async function loadWatchlist() {
    try {
      setWatchlistLoading(true);
      const stored = await AsyncStorage.getItem('watchlist');
      const items = stored ? JSON.parse(stored) : [];
      if (items.length === 0) { setWatchlist([]); setWatchlistLoading(false); return; }
      const results = await Promise.all(
        items.map(async (stock: any) => {
          try {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${stock.ticker}&token=${FINNHUB_KEY}`
            );
            const data = await res.json();
            if (!data.c || data.c === 0) return null;
            const change = ((data.c - data.pc) / data.pc) * 100;
            return {
              ...stock,
              price: `${stock.market?.includes('LSE') ? '£' : '$'}${data.c.toFixed(2)}`,
              change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
              up: change >= 0,
              changeNum: change,
              rec: getRecommendation(change),
            };
          } catch { return null; }
        })
      );
      setWatchlist(results.filter(Boolean));
    } catch (error) {
      console.error('Failed to load watchlist:', error);
    } finally {
      setWatchlistLoading(false);
    }
  }

  async function loadBriefing() {
    const today = new Date().toDateString();
    const cached = await AsyncStorage.getItem('briefingData');
    const cachedDate = await AsyncStorage.getItem('briefingDate');
    if (cached && cachedDate === today) {
      setBriefing(JSON.parse(cached));
      setLastBriefingDate(cachedDate);
      return;
    }
    generateBriefing();
  }

  async function generateBriefing() {
    setBriefingLoading(true);
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const items = stored ? JSON.parse(stored) : [];

      if (items.length === 0) {
        setBriefing({
          tldr: 'Add stocks to your watchlist to get a personalised morning briefing.',
          marketOverview: '',
          watchToday: '',
          stocks: [],
        });
        setBriefingLoading(false);
        return;
      }

      const tickerList = items.map((s: any) => `${s.ticker} (${s.name})`).join(', ');
      const today = new Date().toDateString();

      const prompt = `You are a personal investment analyst writing a morning briefing. Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

The investor is watching: ${tickerList}

Search Yahoo Finance, Reuters and BBC Business for the latest news.

Return ONLY a valid JSON object in this exact format, no other text, no markdown, no cite tags:
{
  "tldr": "One punchy sentence summarising the market today. Max 15 words.",
  "marketOverview": "2-3 sentence overview of overall market mood today. Cite sources by name in brackets e.g. (Reuters).",
  "watchToday": "One specific thing to watch today, 1-2 sentences.",
  "stocks": [
    {
      "ticker": "AMD",
      "name": "Advanced Micro Devices",
      "summary": "2-3 sentence summary of news for this stock. Cite sources by name in brackets e.g. (Yahoo Finance).",
      "sources": ["Yahoo Finance", "Reuters"],
      "hasSignificantNews": true
    }
  ]
}

Important: Do NOT use XML tags like <cite> in your response. Just write source names in brackets like (Reuters).
Only include stocks with significant news. If no significant news, set hasSignificantNews to false.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 2000,
          messages: [
            {
              role: 'system',
              content: 'You are a personal investment analyst. Always respond with valid JSON only, no markdown, no explanation, no cite tags.'
            },
            { role: 'user', content: prompt }
          ],
        }),
      });

      const data = await response.json();
      const textContent = data.choices?.[0]?.message?.content || '';
      const parsed = safeParseJSON(textContent);

      if (parsed) {
        const cleaned = {
          ...parsed,
          tldr: cleanCiteTags(parsed.tldr || ''),
          marketOverview: cleanCiteTags(parsed.marketOverview || ''),
          watchToday: cleanCiteTags(parsed.watchToday || ''),
          stocks: parsed.stocks?.map((s: any) => ({
            ...s,
            summary: cleanCiteTags(s.summary || ''),
          })) || [],
        };
        await AsyncStorage.setItem('briefingData', JSON.stringify(cleaned));
        await AsyncStorage.setItem('briefingDate', today);
        setBriefing(cleaned);
        setLastBriefingDate(today);
      } else {
        setBriefing({
          tldr: cleanCiteTags(textContent) || 'Unable to generate briefing.',
          marketOverview: '',
          watchToday: '',
          stocks: [],
        });
      }
    } catch (error) {
      console.error('Briefing failed:', error);
      setBriefing({
        tldr: 'Unable to generate briefing. Please try again.',
        marketOverview: '',
        watchToday: '',
        stocks: [],
      });
    } finally {
      setBriefingLoading(false);
    }
  }

  async function loadHotPicks() {
    const stored = await AsyncStorage.getItem('lastAnalysis');
    if (stored) setHotPicks(JSON.parse(stored));
  }

  function toggleStock(ticker: string) {
    setExpandedStocks(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }

  const buyCount = watchlist.filter(s => s.rec === 'BUY').length;
  const holdCount = watchlist.filter(s => s.rec === 'HOLD').length;
  const sellCount = watchlist.filter(s => s.rec === 'SELL').length;
  const biggestGainer = watchlist.reduce((a, b) => (a?.changeNum > b?.changeNum ? a : b), null);
  const biggestLoser = watchlist.reduce((a, b) => (a?.changeNum < b?.changeNum ? a : b), null);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>{getDate()}</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="notifications-outline" size={20} color="#818cf8" />
        </View>
      </View>

      {/* Tile 1 — Morning Briefing */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={styles.tileIconWrapper}>
            <Ionicons name="sunny-outline" size={18} color="#facc15" />
          </View>
          <Text style={styles.tileTitle}>Morning Briefing</Text>
          <TouchableOpacity onPress={generateBriefing} disabled={briefingLoading} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="refresh-outline" size={16} color="#555" />
          </TouchableOpacity>
        </View>

        {briefingLoading ? (
          <View style={styles.tileLoading}>
            <ActivityIndicator size="small" color="#818cf8" />
            <Text style={styles.tileLoadingText}>Searching the web & generating briefing...</Text>
          </View>
        ) : briefing ? (
          <>
            <Text style={styles.tldrText}>{briefing.tldr}</Text>

            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setBriefingExpanded(prev => !prev)}
            >
              <Text style={styles.expandButtonText}>
                {briefingExpanded ? 'Show less' : 'Read full briefing'}
              </Text>
              <Ionicons
                name={briefingExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#818cf8"
              />
            </TouchableOpacity>

            {briefingExpanded && (
              <>
                <Text style={styles.briefingText}>{briefing.marketOverview}</Text>

                {briefing.stocks.length > 0 && (
                  <View style={styles.stocksContainer}>
                    {briefing.stocks.map((stock) => {
                      const isExpanded = expandedStocks.includes(stock.ticker);
                      const watchlistStock = watchlist.find(w => w.ticker === stock.ticker);
                      return (
                        <TouchableOpacity
                          key={stock.ticker}
                          style={styles.stockRow}
                          onPress={() => toggleStock(stock.ticker)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.stockRowHeader}>
                            <View style={styles.stockRowLeft}>
                              <Text style={styles.stockRowTicker}>{stock.ticker}</Text>
                              {watchlistStock && (
                                <Text style={[
                                  styles.stockRowChange,
                                  { color: watchlistStock.up ? '#4ade80' : '#f87171' }
                                ]}>
                                  {watchlistStock.change}
                                </Text>
                              )}
                              {stock.hasSignificantNews && (
                                <View style={styles.newsBadge}>
                                  <Text style={styles.newsBadgeText}>News</Text>
                                </View>
                              )}
                            </View>
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color="#555"
                            />
                          </View>

                          {isExpanded && (
                            <View style={styles.stockExpanded}>
                              <Text style={styles.stockSummary}>{stock.summary}</Text>
                              {stock.sources.length > 0 && (
                                <View style={styles.sourcesRow}>
                                  <Ionicons name="link-outline" size={12} color="#555" />
                                  <Text style={styles.sourcesText}>
                                    Sources: {stock.sources.join(', ')}
                                  </Text>
                                </View>
                              )}
                              {watchlistStock && (
                                <TouchableOpacity
                                  style={styles.viewStockButton}
                                  onPress={() => router.push({
                                    pathname: '/stock',
                                    params: {
                                      ticker: stock.ticker,
                                      name: stock.name,
                                      price: watchlistStock.price,
                                      change: watchlistStock.change,
                                      rec: watchlistStock.rec,
                                      market: watchlistStock.market,
                                    }
                                  })}
                                >
                                  <Text style={styles.viewStockText}>View stock →</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {briefing.watchToday !== '' && (
                  <View style={styles.watchTodayContainer}>
                    <Text style={styles.watchTodayLabel}>📌 Watch today</Text>
                    <Text style={styles.watchTodayText}>{briefing.watchToday}</Text>
                  </View>
                )}

                {lastBriefingDate && (
                  <Text style={styles.briefingDate}>Last updated: {lastBriefingDate}</Text>
                )}
              </>
            )}
          </>
        ) : (
          <TouchableOpacity style={styles.generateButton} onPress={generateBriefing}>
            <Ionicons name="sparkles-outline" size={16} color="#0f0f14" />
            <Text style={styles.generateButtonText}>Generate Briefing</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tile 2 — Portfolio (placeholder) */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={[styles.tileIconWrapper, { backgroundColor: '#4ade8020' }]}>
            <Ionicons name="bar-chart-outline" size={18} color="#4ade80" />
          </View>
          <Text style={styles.tileTitle}>Portfolio</Text>
        </View>
        <View style={styles.portfolioPlaceholder}>
          <Ionicons name="wallet-outline" size={32} color="#333" />
          <Text style={styles.placeholderText}>Portfolio tracking coming soon</Text>
          <Text style={styles.placeholderSub}>Track your holdings and total value</Text>
        </View>
      </View>

      {/* Tile 3 — Watchlist Summary */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={[styles.tileIconWrapper, { backgroundColor: '#facc1520' }]}>
            <Ionicons name="star-outline" size={18} color="#facc15" />
          </View>
          <Text style={styles.tileTitle}>Watchlist</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/watchlist')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {watchlistLoading ? (
          <View style={styles.tileLoading}>
            <ActivityIndicator size="small" color="#818cf8" />
            <Text style={styles.tileLoadingText}>Loading watchlist...</Text>
          </View>
        ) : watchlist.length === 0 ? (
          <View style={styles.portfolioPlaceholder}>
            <Ionicons name="star-outline" size={32} color="#333" />
            <Text style={styles.placeholderText}>No stocks in watchlist</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
              <Text style={styles.placeholderLink}>Search and add stocks →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{watchlist.length}</Text>
                <Text style={styles.statLabel}>Watching</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#4ade80' }]}>{buyCount}</Text>
                <Text style={styles.statLabel}>Buy</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#facc15' }]}>{holdCount}</Text>
                <Text style={styles.statLabel}>Hold</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#f87171' }]}>{sellCount}</Text>
                <Text style={styles.statLabel}>Sell</Text>
              </View>
            </View>

            {biggestGainer && (
              <View style={styles.moverRow}>
                <Ionicons name="trending-up" size={14} color="#4ade80" />
                <Text style={styles.moverLabel}>Top gainer:</Text>
                <Text style={styles.moverTicker}>{biggestGainer.ticker}</Text>
                <Text style={[styles.moverChange, { color: '#4ade80' }]}>{biggestGainer.change}</Text>
              </View>
            )}
            {biggestLoser && biggestLoser.ticker !== biggestGainer?.ticker && (
              <View style={styles.moverRow}>
                <Ionicons name="trending-down" size={14} color="#f87171" />
                <Text style={styles.moverLabel}>Biggest drop:</Text>
                <Text style={styles.moverTicker}>{biggestLoser.ticker}</Text>
                <Text style={[styles.moverChange, { color: '#f87171' }]}>{biggestLoser.change}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Tile 4 — Hot Picks */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={[styles.tileIconWrapper, { backgroundColor: '#818cf820' }]}>
            <Ionicons name="sparkles-outline" size={18} color="#818cf8" />
          </View>
          <Text style={styles.tileTitle}>Hot Picks</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/analysis')}>
            <Text style={styles.seeAll}>Run new scan →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setHotPicksExpanded(prev => !prev)} style={{ padding: 4 }}>
            <Ionicons
              name={hotPicksExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#555"
            />
          </TouchableOpacity>
        </View>

        {hotPicks.length === 0 ? (
          <View style={styles.portfolioPlaceholder}>
            <Ionicons name="sparkles-outline" size={32} color="#333" />
            <Text style={styles.placeholderText}>No analysis run yet</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/analysis')}>
              <Text style={styles.placeholderLink}>Run AI Analysis →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {(hotPicksExpanded ? hotPicks : hotPicks.slice(0, 2)).map((pick: any) => (
              <TouchableOpacity
                key={pick.ticker}
                style={styles.pickRow}
                onPress={() => router.push({
                  pathname: '/stock',
                  params: {
                    ticker: pick.ticker,
                    name: pick.name,
                    price: '',
                    change: '',
                    rec: pick.claudeVerdict,
                    market: pick.exchange,
                  }
                })}
              >
                <View style={styles.pickLeft}>
                  <Text style={styles.pickTicker}>{pick.ticker}</Text>
                  <Text style={styles.pickName} numberOfLines={1}>{pick.name}</Text>
                </View>
                <View style={styles.pickRight}>
                  <Text style={[styles.pickVerdict, {
                    color: pick.claudeVerdict?.includes('BUY') ? '#4ade80' :
                      pick.claudeVerdict?.includes('SELL') ? '#f87171' : '#facc15'
                  }]}>
                    {pick.claudeVerdict?.split(' ')[0]}
                  </Text>
                  <Text style={styles.pickBothAgree}>
                    {pick.bothAgree ? '✓ Both agree' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {!hotPicksExpanded && hotPicks.length > 2 && (
              <TouchableOpacity
                onPress={() => setHotPicksExpanded(true)}
                style={styles.showMoreButton}
              >
                <Text style={styles.showMoreText}>
                  +{hotPicks.length - 2} more — tap to expand
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 24 },
  greeting: { fontSize: 22, fontWeight: '500', color: '#fff' },
  date: { fontSize: 13, color: '#555', marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#15151e', justifyContent: 'center', alignItems: 'center' },
  tile: { backgroundColor: '#15151e', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: '#1e1e2a' },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  tileIconWrapper: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#facc1520', justifyContent: 'center', alignItems: 'center' },
  tileTitle: { fontSize: 16, fontWeight: '500', color: '#fff', flex: 1 },
  tileLoading: { alignItems: 'center', padding: 20, gap: 8 },
  tileLoadingText: { color: '#555', fontSize: 12, textAlign: 'center' },
  tldrText: { fontSize: 14, color: '#fff', fontWeight: '500', lineHeight: 20, marginBottom: 10 },
  expandButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  expandButtonText: { fontSize: 12, color: '#818cf8' },
  briefingText: { fontSize: 14, color: '#ccc', lineHeight: 22, marginBottom: 12, marginTop: 12 },
  briefingDate: { fontSize: 11, color: '#444', marginTop: 10 },
  generateButton: { backgroundColor: '#818cf8', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  generateButtonText: { color: '#0f0f14', fontWeight: '500', fontSize: 14 },
  stocksContainer: { borderTopWidth: 0.5, borderTopColor: '#1e1e2a', marginTop: 4 },
  stockRow: { borderBottomWidth: 0.5, borderBottomColor: '#1e1e2a', paddingVertical: 12 },
  stockRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stockRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockRowTicker: { fontSize: 14, fontWeight: '500', color: '#fff' },
  stockRowChange: { fontSize: 13 },
  newsBadge: { backgroundColor: '#818cf820', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  newsBadgeText: { fontSize: 10, color: '#818cf8', fontWeight: '500' },
  stockExpanded: { marginTop: 10, gap: 8 },
  stockSummary: { fontSize: 13, color: '#ccc', lineHeight: 20 },
  sourcesRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourcesText: { fontSize: 11, color: '#555' },
  viewStockButton: { alignSelf: 'flex-start' },
  viewStockText: { fontSize: 12, color: '#818cf8' },
  watchTodayContainer: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, marginTop: 12 },
  watchTodayLabel: { fontSize: 11, color: '#818cf8', fontWeight: '500', marginBottom: 4 },
  watchTodayText: { fontSize: 13, color: '#ccc', lineHeight: 20 },
  portfolioPlaceholder: { alignItems: 'center', padding: 24, gap: 8 },
  placeholderText: { color: '#555', fontSize: 14, fontWeight: '500' },
  placeholderSub: { color: '#444', fontSize: 12 },
  placeholderLink: { color: '#818cf8', fontSize: 13, marginTop: 4 },
  seeAll: { color: '#818cf8', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: '#0f0f14', borderRadius: 10, padding: 10, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 20, fontWeight: '500', color: '#fff' },
  statLabel: { fontSize: 11, color: '#555' },
  moverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: '#1e1e2a' },
  moverLabel: { fontSize: 12, color: '#555', flex: 1 },
  moverTicker: { fontSize: 12, fontWeight: '500', color: '#fff' },
  moverChange: { fontSize: 12, fontWeight: '500' },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#1e1e2a' },
  pickLeft: { flex: 1 },
  pickTicker: { fontSize: 14, fontWeight: '500', color: '#fff' },
  pickName: { fontSize: 11, color: '#555', marginTop: 2 },
  pickRight: { alignItems: 'flex-end' },
  pickVerdict: { fontSize: 13, fontWeight: '500' },
  pickBothAgree: { fontSize: 10, color: '#4ade80', marginTop: 2 },
  showMoreButton: { paddingTop: 10, alignItems: 'center' },
  showMoreText: { color: '#818cf8', fontSize: 12 },
});