import { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_KEY;

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

function getExchangeColour(market: string) {
  if (market.includes('LSE')) return EXCHANGE_COLOURS['LSE'];
  if (market.includes('NASDAQ')) return EXCHANGE_COLOURS['NASDAQ'];
  if (market.includes('NYSE')) return EXCHANGE_COLOURS['NYSE'];
  if (market.includes('TSX')) return EXCHANGE_COLOURS['TSX'];
  if (market.includes('TSE')) return EXCHANGE_COLOURS['TSE'];
  if (market.includes('HKEX')) return EXCHANGE_COLOURS['HKEX'];
  if (market.includes('NSE')) return EXCHANGE_COLOURS['NSE'];
  if (market.includes('SSE')) return EXCHANGE_COLOURS['SSE'];
  if (market.includes('SZSE')) return EXCHANGE_COLOURS['SZSE'];
  if (market.includes('Euronext')) return EXCHANGE_COLOURS['Euronext'];
  return '#6b7280';
}

function getMarketLabel(symbol: string, exchange: string) {
  if (symbol.endsWith('.L') || exchange?.includes('LSE') || exchange?.includes('LON')) return 'LSE · UK';
  if (exchange?.includes('NYSE')) return 'NYSE · US';
  if (exchange?.includes('NASDAQ')) return 'NASDAQ · US';
  if (exchange?.includes('TSX') || exchange?.includes('Toronto')) return 'TSX · CA';
  if (exchange?.includes('TSE') || exchange?.includes('Tokyo')) return 'TSE · JP';
  if (exchange?.includes('HKEX') || exchange?.includes('Hong Kong')) return 'HKEX · HK';
  if (exchange?.includes('NSE') || exchange?.includes('Mumbai')) return 'NSE · IN';
  if (exchange?.includes('SSE') || exchange?.includes('Shanghai')) return 'SSE · CN';
  if (exchange?.includes('SZSE') || exchange?.includes('Shenzhen')) return 'SZSE · CN';
  if (exchange?.includes('Euronext') || exchange?.includes('Paris') || exchange?.includes('Amsterdam')) return 'Euronext · EU';
  return exchange || 'Unknown';
}

function getRecommendation(change: number) {
  if (change > 1) return 'BUY';
  if (change < -1) return 'SELL';
  return 'HOLD';
}

function getCurrency(exchange: string) {
  if (exchange?.includes('LSE') || exchange?.includes('LON')) return '£';
  return '$';
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setResults([]);
    setStockData({});

    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/search?q=${query}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();

      const seen = new Set();
      const filtered = (data.result || [])
        .filter((r: any) => {
          if (seen.has(r.symbol)) return false;
          seen.add(r.symbol);
          return r.type === 'Common Stock' || r.type === 'ETP';
        })
        .slice(0, 8);

      setResults(filtered);

      const stored = await AsyncStorage.getItem('watchlist');
      const items = stored ? JSON.parse(stored) : [];
      setWatchlist(items.map((s: any) => s.ticker));

      const prices: any = {};
      await Promise.all(
        filtered.map(async (stock: any) => {
          try {
            const r = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${stock.symbol}&token=${FINNHUB_KEY}`
            );
            const d = await r.json();
            if (d.c && d.c > 0) {
              const change = ((d.c - d.pc) / d.pc) * 100;
              const currency = getCurrency(stock.exchange);
              prices[stock.symbol] = {
                price: `${currency}${d.c.toFixed(2)}`,
                change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
                up: change >= 0,
                rec: getRecommendation(change),
              };
            }
          } catch (e) {
            console.log('Price fetch failed for', stock.symbol);
          }
        })
      );
      setStockData(prices);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleWatchlist(stock: any) {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const items = stored ? JSON.parse(stored) : [];
      const exists = items.find((s: any) => s.ticker === stock.symbol);
      let updated;
      if (exists) {
        updated = items.filter((s: any) => s.ticker !== stock.symbol);
      } else {
        updated = [...items, {
          ticker: stock.symbol,
          name: stock.description,
          market: getMarketLabel(stock.symbol, stock.exchange),
        }];
      }
      await AsyncStorage.setItem('watchlist', JSON.stringify(updated));
      setWatchlist(updated.map((s: any) => s.ticker));
    } catch (error) {
      console.error('Watchlist toggle failed:', error);
    }
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find any stock or ETF</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.inputWrapper}>
          <Ionicons name="search-outline" size={18} color="#444" style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="e.g. Apple, AAPL, Vanguard..."
            placeholderTextColor="#444"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={search}>
          <Text style={styles.searchButtonText}>Go</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#818cf8" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color="#333" />
          <Text style={styles.emptyText}>No results found for "{query}"</Text>
        </View>
      )}

      {!loading && results.map((stock) => {
        const data = stockData[stock.symbol];
        const isWatchlisted = watchlist.includes(stock.symbol);
        const market = getMarketLabel(stock.symbol, stock.exchange);
        const accentColour = getExchangeColour(market);

        return (
          <TouchableOpacity
            key={`${stock.symbol}-${stock.exchange}`}
            style={styles.card}
            onPress={() => data && router.push({
              pathname: '/(tabs)/stock',
              params: {
                ticker: stock.symbol,
                name: stock.description,
                price: data.price,
                change: data.change,
                rec: data.rec,
                market,
              }
            })}
          >
            <View style={[styles.tickerBadge, { backgroundColor: accentColour + '20' }]}>
              <Text style={[styles.tickerText, { color: accentColour }]}>{stock.symbol}</Text>
            </View>
            <View style={styles.cardMiddle}>
              <Text style={styles.name} numberOfLines={1}>{stock.description}</Text>
              <Text style={styles.market}>{market}</Text>
            </View>
            <View style={styles.cardRight}>
              {data ? (
                <>
                  <Text style={styles.price}>{data.price}</Text>
                  <Text style={data.up ? styles.changeUp : styles.changeDown}>
                    {data.change}
                  </Text>
                  <View style={[
                    styles.recBadge,
                    data.rec === 'BUY' ? styles.recBuy :
                    data.rec === 'HOLD' ? styles.recHold : styles.recSell
                  ]}>
                    <Text style={[
                      styles.recText,
                      data.rec === 'BUY' ? styles.recTextBuy :
                      data.rec === 'HOLD' ? styles.recTextHold : styles.recTextSell
                    ]}>
                      {data.rec}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.noPrice}>No price</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); toggleWatchlist(stock); }}
              style={styles.starButton}
            >
              <Ionicons
                name={isWatchlisted ? 'star' : 'star-outline'}
                size={18}
                color={isWatchlisted ? '#facc15' : '#444'}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  header: { marginTop: 20, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '500', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#15151e', borderRadius: 12, borderWidth: 0.5, borderColor: '#2a2a35', paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, color: '#fff', fontSize: 15 },
  searchButton: { backgroundColor: '#818cf8', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '500', fontSize: 15 },
  loadingContainer: { marginTop: 60, alignItems: 'center' },
  loadingText: { color: '#555', marginTop: 12 },
  emptyContainer: { marginTop: 60, alignItems: 'center', gap: 12 },
  emptyText: { color: '#555', fontSize: 14 },
  card: { backgroundColor: '#15151e', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerBadge: { width: 52, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tickerText: { fontSize: 11, fontWeight: '500' },
  cardMiddle: { flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  name: { fontSize: 14, fontWeight: '500', color: '#fff' },
  market: { fontSize: 11, color: '#555', marginTop: 2 },
  price: { fontSize: 14, fontWeight: '500', color: '#fff' },
  changeUp: { fontSize: 12, color: '#4ade80' },
  changeDown: { fontSize: 12, color: '#f87171' },
  recBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  recBuy: { backgroundColor: '#0d2818' },
  recHold: { backgroundColor: '#1a1a0a' },
  recSell: { backgroundColor: '#2a0d0d' },
  recText: { fontSize: 9, fontWeight: '500' },
  recTextBuy: { color: '#4ade80' },
  recTextHold: { color: '#facc15' },
  recTextSell: { color: '#f87171' },
  noPrice: { fontSize: 12, color: '#555' },
  starButton: { padding: 4 },
});