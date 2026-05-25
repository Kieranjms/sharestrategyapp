import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_KEY;
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

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

export default function HomeScreen() {
  const router = useRouter();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [briefing, setBriefing] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [hotPicks, setHotPicks] = useState<any[]>([]);
  const [lastBriefingDate, setLastBriefingDate] = useState('');

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
    const cached = await AsyncStorage.getItem('briefing');
    const cachedDate = await AsyncStorage.getItem('briefingDate');
    if (cached && cachedDate === today) {
      setBriefing(cached);
      setLastBriefingDate(cachedDate);
      return;
    }
    await generateBriefing();
  }

  async function generateBriefing() {
    setBriefingLoading(true);
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const items = stored ? JSON.parse(stored) : [];
      const tickers = items.map((s: any) => s.name).join(', ');

      if (items.length === 0) {
        setBriefing('Add stocks to your watchlist to get a personalised morning briefing.');
        setBriefingLoading(false);
        return;
      }

      const today = new Date().toDateString();
      const prompt = `You are a personal investment analyst writing a morning briefing for an investor. Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

The investor is watching these stocks: ${tickers}

Please:
1. Search Yahoo Finance, Reuters and BBC Business for the latest news on these stocks and markets
2. Write a concise morning briefing covering:
   - Overall market mood today
   - Key news for any of the watched stocks
   - One thing to watch today
   
Keep it to 3-4 short paragraphs, written in plain English like a friendly analyst. No bullet points.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
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
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') || 'Unable to generate briefing.';
      setBriefing(text);
      await AsyncStorage.setItem('briefing', text);
      await AsyncStorage.setItem('briefingDate', today);
      setLastBriefingDate(today);
    } catch (error) {
      console.error('Briefing failed:', error);
      setBriefing('Unable to generate briefing. Please try again.');
    } finally {
      setBriefingLoading(false);
    }
  }

  async function loadHotPicks() {
    const stored = await AsyncStorage.getItem('lastAnalysis');
    if (stored) setHotPicks(JSON.parse(stored));
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
          <TouchableOpacity onPress={generateBriefing} disabled={briefingLoading}>
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
            <Text style={styles.briefingText}>{briefing}</Text>
            {lastBriefingDate && (
              <Text style={styles.briefingDate}>
                Last updated: {lastBriefingDate}
              </Text>
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
          hotPicks.slice(0, 3).map((pick: any) => (
            <TouchableOpacity
              key={pick.ticker}
              style={styles.pickRow}
              onPress={() => router.push({
                pathname: '/(tabs)/stock',
                params: {
                  ticker: pick.ticker,
                  name: pick.name,
                  price: 'Loading...',
                  change: '...',
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
          ))
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
  briefingText: { fontSize: 14, color: '#ccc', lineHeight: 22 },
  briefingDate: { fontSize: 11, color: '#444', marginTop: 10 },
  generateButton: { backgroundColor: '#818cf8', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  generateButtonText: { color: '#0f0f14', fontWeight: '500', fontSize: 14 },
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
});