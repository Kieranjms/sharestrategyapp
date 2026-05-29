import { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView,
  ActivityIndicator, TouchableOpacity, Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;
const { width } = Dimensions.get('window');
const TILE_GAP = 12;
const SMALL_TILE = (width - 40 - TILE_GAP) / 2; // two tiles side by side

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDate() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function getRecommendation(change: number) {
  if (change > 1) return 'BUY';
  if (change < -1) return 'SELL';
  return 'HOLD';
}

function safeParseJSON(text: string) {
  try {
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch { return null; }
}

function cleanCiteTags(text: string) {
  return text.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '').replace(/\s+/g, ' ').trim();
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

  const [watchlist, setWatchlist]               = useState<any[]>([]);
  const [portfolio, setPortfolio]               = useState<any[]>([]);
  const [briefing, setBriefing]                 = useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading]   = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [hotPicks, setHotPicks]                 = useState<any[]>([]);
  const [hotPicksExpanded, setHotPicksExpanded] = useState(false);
  const [lastBriefingDate, setLastBriefingDate] = useState('');
  const [expandedStocks, setExpandedStocks]     = useState<string[]>([]);
  const [topETF, setTopETF]                     = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  async function loadAll() {
    await Promise.all([
      loadWatchlist(),
      loadPortfolio(),
      loadBriefing(),
      loadHotPicks(),
      loadTopETF(),
    ]);
  }

  async function loadWatchlist() {
    try {
      const cached = await AsyncStorage.getItem('watchlistCache');
      if (cached) setWatchlist(JSON.parse(cached));
    } catch (e) { console.error(e); }
  }

  async function loadPortfolio() {
    try {
      const cached = await AsyncStorage.getItem('portfolioCache');
      if (cached) setPortfolio(JSON.parse(cached));
    } catch (e) { console.error(e); }
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
          marketOverview: '', watchToday: '', stocks: [],
        });
        return;
      }

      const tickerList = items.map((s: any) => `${s.ticker} (${s.name})`).join(', ');
      const today = new Date().toDateString();

      const prompt = `You are a personal investment analyst writing a morning briefing. Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
The investor is watching: ${tickerList}
Return ONLY a valid JSON object:
{
  "tldr": "One punchy sentence. Max 15 words.",
  "marketOverview": "2-3 sentence overview of market mood today.",
  "watchToday": "One specific thing to watch today, 1-2 sentences.",
  "stocks": [{ "ticker": "AMD", "name": "Advanced Micro Devices", "summary": "2-3 sentences.", "sources": ["Yahoo Finance"], "hasSignificantNews": true }]
}
No markdown, no cite tags.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o', max_tokens: 2000,
          messages: [
            { role: 'system', content: 'Return valid JSON only.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      const parsed = safeParseJSON(data.choices?.[0]?.message?.content || '');

      if (parsed) {
        const cleaned = {
          ...parsed,
          tldr: cleanCiteTags(parsed.tldr || ''),
          marketOverview: cleanCiteTags(parsed.marketOverview || ''),
          watchToday: cleanCiteTags(parsed.watchToday || ''),
          stocks: parsed.stocks?.map((s: any) => ({ ...s, summary: cleanCiteTags(s.summary || '') })) || [],
        };
        await AsyncStorage.setItem('briefingData', JSON.stringify(cleaned));
        await AsyncStorage.setItem('briefingDate', today);
        setBriefing(cleaned);
        setLastBriefingDate(today);
      }
    } catch (e) {
      console.error('Briefing failed:', e);
      setBriefing({ tldr: 'Unable to generate briefing.', marketOverview: '', watchToday: '', stocks: [] });
    } finally {
      setBriefingLoading(false);
    }
  }

  async function loadHotPicks() {
    const stored = await AsyncStorage.getItem('lastAnalysis');
    if (stored) setHotPicks(JSON.parse(stored));
  }

  async function loadTopETF() {
    const stored = await AsyncStorage.getItem('etfPicks');
    if (stored) {
      const picks = JSON.parse(stored);
      if (picks.length > 0) setTopETF(picks[0]);
    }
  }

  function toggleStock(ticker: string) {
    setExpandedStocks(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }

  // ── Portfolio calculations ──
  const totalInvested = portfolio.reduce((sum, h) => sum + (h.quantity * h.buyPrice), 0);
  const totalCurrent  = portfolio.reduce((sum, h) => sum + (h.currentValue ?? h.quantity * h.buyPrice), 0);
  const totalPL       = totalCurrent - totalInvested;
  const totalPLPct    = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // ── Watchlist calculations ──
  const buyCount  = watchlist.filter(s => s.rec === 'BUY').length;
  const holdCount = watchlist.filter(s => s.rec === 'HOLD').length;
  const sellCount = watchlist.filter(s => s.rec === 'SELL').length;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>{getDate()}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="notifications-outline" size={20} color="#818cf8" />
        </TouchableOpacity>
      </View>

      {/* ── Morning Briefing (full width) ── */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={[styles.iconBox, { backgroundColor: '#facc1520' }]}>
            <Ionicons name="sunny-outline" size={16} color="#facc15" />
          </View>
          <Text style={styles.tileTitle}>Morning Briefing</Text>
          <TouchableOpacity onPress={generateBriefing} disabled={briefingLoading} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="refresh-outline" size={15} color="#444" />
          </TouchableOpacity>
        </View>

        {briefingLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#818cf8" />
            <Text style={styles.loadingText}>Generating briefing...</Text>
          </View>
        ) : briefing ? (
          <>
            <Text style={styles.tldr}>{briefing.tldr}</Text>
            <TouchableOpacity style={styles.expandRow} onPress={() => setBriefingExpanded(p => !p)}>
              <Text style={styles.expandText}>{briefingExpanded ? 'Show less' : 'Read full briefing'}</Text>
              <Ionicons name={briefingExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#818cf8" />
            </TouchableOpacity>

            {briefingExpanded && (
              <>
                <Text style={styles.bodyText}>{briefing.marketOverview}</Text>
                {briefing.stocks.map(stock => {
                  const isExpanded = expandedStocks.includes(stock.ticker);
                  const wStock = watchlist.find(w => w.ticker === stock.ticker);
                  return (
                    <TouchableOpacity key={stock.ticker} style={styles.stockRow} onPress={() => toggleStock(stock.ticker)}>
                      <View style={styles.stockRowTop}>
                        <View style={styles.stockRowLeft}>
                          <Text style={styles.stockTicker}>{stock.ticker}</Text>
                          {wStock && (
                            <Text style={{ color: wStock.up ? '#4ade80' : '#f87171', fontSize: 12 }}>{wStock.change}</Text>
                          )}
                          {stock.hasSignificantNews && (
                            <View style={styles.newsBadge}><Text style={styles.newsBadgeText}>News</Text></View>
                          )}
                        </View>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#444" />
                      </View>
                      {isExpanded && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          <Text style={styles.bodyText}>{stock.summary}</Text>
                          {wStock && (
                            <TouchableOpacity onPress={() => router.push({ pathname: '/stock', params: { ticker: stock.ticker, name: stock.name, price: wStock.price, change: wStock.change, rec: wStock.rec, market: wStock.market } })}>
                              <Text style={styles.linkText}>View stock →</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {briefing.watchToday !== '' && (
                  <View style={styles.watchTodayBox}>
                    <Text style={styles.watchTodayLabel}>📌 Watch today</Text>
                    <Text style={styles.bodyText}>{briefing.watchToday}</Text>
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={generateBriefing}>
            <Ionicons name="sparkles-outline" size={15} color="#0f0f14" />
            <Text style={styles.primaryButtonText}>Generate Briefing</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Portfolio + Watchlist (2 columns) ── */}
      <View style={styles.row}>

        {/* Portfolio tile */}
        <TouchableOpacity
          style={[styles.smallTile, { width: SMALL_TILE }]}
          onPress={() => router.push('/portfolio' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.tileHeader}>
            <View style={[styles.iconBox, { backgroundColor: '#4ade8020' }]}>
              <Ionicons name="wallet-outline" size={16} color="#4ade80" />
            </View>
            <Text style={styles.tileTitle}>Portfolio</Text>
            <Ionicons name="chevron-forward" size={14} color="#444" />
          </View>

          {portfolio.length === 0 ? (
            <Text style={styles.emptySmall}>No holdings yet</Text>
          ) : (
            <>
              <Text style={styles.bigNumber}>
                £{totalCurrent.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.subLabel}>Current value</Text>
              <Text style={[styles.plText, { color: totalPL >= 0 ? '#4ade80' : '#f87171' }]}>
                {totalPL >= 0 ? '+' : ''}£{Math.abs(totalPL).toFixed(2)} ({totalPLPct.toFixed(1)}%)
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Watchlist tile */}
        <TouchableOpacity
          style={[styles.smallTile, { width: SMALL_TILE }]}
          onPress={() => router.push('/(tabs)/watchlist')}
          activeOpacity={0.7}
        >
          <View style={styles.tileHeader}>
            <View style={[styles.iconBox, { backgroundColor: '#facc1520' }]}>
              <Ionicons name="star-outline" size={16} color="#facc15" />
            </View>
            <Text style={styles.tileTitle}>Watchlist</Text>
            <Ionicons name="chevron-forward" size={14} color="#444" />
          </View>

          {watchlist.length === 0 ? (
            <Text style={styles.emptySmall}>No stocks saved</Text>
          ) : (
            <>
              <Text style={styles.bigNumber}>{watchlist.length}</Text>
              <Text style={styles.subLabel}>stocks</Text>
              <View style={styles.recRow}>
                <Text style={[styles.recPill, { color: '#4ade80' }]}>{buyCount} BUY</Text>
                <Text style={[styles.recPill, { color: '#facc15' }]}>{holdCount} HOLD</Text>
                <Text style={[styles.recPill, { color: '#f87171' }]}>{sellCount} SELL</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

      </View>

      {/* ── Hot Picks (full width) ── */}
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <View style={[styles.iconBox, { backgroundColor: '#818cf820' }]}>
            <Ionicons name="sparkles-outline" size={16} color="#818cf8" />
          </View>
          <Text style={styles.tileTitle}>Hot Picks</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/analysis')}>
            <Text style={styles.linkText}>New scan →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setHotPicksExpanded(p => !p)} style={{ padding: 4 }}>
            <Ionicons name={hotPicksExpanded ? 'chevron-up' : 'chevron-down'} size={15} color="#444" />
          </TouchableOpacity>
        </View>

        {hotPicks.length === 0 ? (
          <Text style={styles.emptyText}>No analysis yet — run a scan to see picks</Text>
        ) : (
          <>
            {(hotPicksExpanded ? hotPicks : hotPicks.slice(0, 3)).map((pick: any) => (
              <TouchableOpacity
                key={pick.ticker}
                style={styles.pickRow}
                onPress={() => router.push({ pathname: '/stock', params: { ticker: pick.ticker, name: pick.name, price: '', change: '', rec: pick.claudeVerdict, market: pick.exchange } })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickTicker}>{pick.ticker}</Text>
                  <Text style={styles.pickName} numberOfLines={1}>{pick.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.verdict, {
                    color: pick.claudeVerdict?.includes('BUY') ? '#4ade80' :
                           pick.claudeVerdict?.includes('SELL') ? '#f87171' : '#facc15'
                  }]}>
                    {pick.claudeVerdict?.split(' ')[0]}
                  </Text>
                  {pick.bothAgree && <Text style={styles.agreeText}>✓ Both agree</Text>}
                </View>
              </TouchableOpacity>
            ))}
            {!hotPicksExpanded && hotPicks.length > 3 && (
              <TouchableOpacity onPress={() => setHotPicksExpanded(true)} style={{ paddingTop: 10, alignItems: 'center' }}>
                <Text style={styles.linkText}>+{hotPicks.length - 3} more</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ── ETFs (full width) ── */}
      <TouchableOpacity style={styles.tile} onPress={() => router.push('/(tabs)/etf')} activeOpacity={0.7}>
        <View style={styles.tileHeader}>
          <View style={[styles.iconBox, { backgroundColor: '#2dd4bf20' }]}>
            <Ionicons name="bar-chart-outline" size={16} color="#2dd4bf" />
          </View>
          <Text style={styles.tileTitle}>ETFs</Text>
          <Ionicons name="chevron-forward" size={14} color="#444" />
        </View>
        {topETF ? (
          <View style={styles.etfPreview}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickTicker}>{topETF.ticker}</Text>
              <Text style={styles.pickName}>{topETF.name}</Text>
            </View>
            <Text style={[styles.verdict, {
              color: topETF.recommendation === 'BUY' ? '#4ade80' :
                     topETF.recommendation === 'SELL' ? '#f87171' : '#facc15'
            }]}>
              {topETF.recommendation}
            </Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>Tap to browse and scan ETFs</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f0f14', paddingHorizontal: 20 },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 20 },
  greeting:        { fontSize: 22, fontWeight: '600', color: '#fff' },
  date:            { fontSize: 13, color: '#555', marginTop: 2 },
  headerIcon:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#15151e', justifyContent: 'center', alignItems: 'center' },

  // Tiles
  tile:            { backgroundColor: '#15151e', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: '#1e1e2a' },
  smallTile:       { backgroundColor: '#15151e', borderRadius: 16, padding: 14, borderWidth: 0.5, borderColor: '#1e1e2a' },
  row:             { flexDirection: 'row', gap: TILE_GAP, marginBottom: 12 },
  tileHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  iconBox:         { width: 28, height: 28, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  tileTitle:       { fontSize: 14, fontWeight: '600', color: '#fff', flex: 1 },

  // Numbers
  bigNumber:       { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
  subLabel:        { fontSize: 11, color: '#555', marginBottom: 6 },
  plText:          { fontSize: 12, fontWeight: '600' },

  // Rec pills
  recRow:          { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  recPill:         { fontSize: 10, fontWeight: '600' },

  // Text styles
  tldr:            { fontSize: 14, fontWeight: '500', color: '#fff', lineHeight: 20, marginBottom: 8 },
  bodyText:        { fontSize: 13, color: '#9ca3af', lineHeight: 20, marginBottom: 4 },
  emptyText:       { fontSize: 13, color: '#444', textAlign: 'center', paddingVertical: 8 },
  emptySmall:      { fontSize: 12, color: '#444', marginTop: 4 },
  linkText:        { fontSize: 12, color: '#818cf8' },

  // Briefing
  loadingRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText:     { color: '#555', fontSize: 12 },
  expandRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  expandText:      { fontSize: 12, color: '#818cf8' },
  watchTodayBox:   { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 10, marginTop: 10 },
  watchTodayLabel: { fontSize: 11, color: '#818cf8', fontWeight: '600', marginBottom: 4 },
  newsBadge:       { backgroundColor: '#818cf820', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  newsBadgeText:   { fontSize: 9, color: '#818cf8', fontWeight: '600' },
  stockRow:        { borderTopWidth: 0.5, borderTopColor: '#1e1e2a', paddingVertical: 10 },
  stockRowTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockRowLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockTicker:     { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Button
  primaryButton:      { backgroundColor: '#818cf8', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText:  { color: '#0f0f14', fontWeight: '600', fontSize: 13 },

  // Picks
  pickRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: '#1e1e2a' },
  pickTicker: { fontSize: 13, fontWeight: '600', color: '#fff' },
  pickName:   { fontSize: 11, color: '#555', marginTop: 1 },
  verdict:    { fontSize: 13, fontWeight: '700' },
  agreeText:  { fontSize: 10, color: '#4ade80', marginTop: 2 },

  // ETF preview
  etfPreview: { flexDirection: 'row', alignItems: 'center' },
});