import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_KEY;
const ALPHA_KEY = process.env.EXPO_PUBLIC_ALPHA_KEY;

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
  return '#818cf8';
}

function getRecommendation(change: number) {
  if (change > 1) return 'BUY';
  if (change < -1) return 'SELL';
  return 'HOLD';
}

async function fetchPrice(stock: any) {
  const isUK = stock.ticker.endsWith('.L');
  const currency = stock.market.includes('LSE') ? '£' : '$';
  try {
    if (isUK) {
      const alphaSymbol = stock.ticker.replace('.L', '.LON');
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${alphaSymbol}&apikey=${ALPHA_KEY}`
      );
      const data = await res.json();
      const quote = data['Global Quote'];
      if (!quote || !quote['05. price']) return null;
      const price = parseFloat(quote['05. price']);
      const prevPrice = parseFloat(quote['08. previous close']);
      const change = ((price - prevPrice) / prevPrice) * 100;
      return {
        ...stock,
        price: `${currency}${price.toFixed(2)}`,
        change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        up: change >= 0,
        rec: getRecommendation(change),
      };
    } else {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${stock.ticker}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();
      if (!data.c || data.c === 0) return null;
      const change = ((data.c - data.pc) / data.pc) * 100;
      return {
        ...stock,
        price: `${currency}${data.c.toFixed(2)}`,
        change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        up: change >= 0,
        rec: getRecommendation(change),
      };
    }
  } catch {
    return null;
  }
}

export default function WatchlistScreen() {
  const router = useRouter();
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadWatchlist() {
        try {
          setLoading(true);
          const stored = await AsyncStorage.getItem('watchlist');
          const items = stored ? JSON.parse(stored) : [];

          if (items.length === 0) {
            if (active) { setStocks([]); setLoading(false); }
            return;
          }

          const results = await Promise.all(items.map(fetchPrice));
          if (active) {
            setStocks(results.filter(Boolean) as any[]);
            setLoading(false);
          }
        } catch (error) {
          console.error('Failed to load watchlist:', error);
          if (active) setLoading(false);
        }
      }

      loadWatchlist();
      return () => { active = false; };
    }, [])
  );

  async function removeFromWatchlist(ticker: string) {
    const stored = await AsyncStorage.getItem('watchlist');
    const items = stored ? JSON.parse(stored) : [];
    const updated = items.filter((s: any) => s.ticker !== ticker);
    await AsyncStorage.setItem('watchlist', JSON.stringify(updated));
    setStocks(stocks.filter(s => s.ticker !== ticker));
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#818cf8" />
        <Text style={styles.loadingText}>Loading watchlist...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <Text style={styles.subtitle}>{stocks.length} stock{stocks.length !== 1 ? 's' : ''} saved</Text>
      </View>

      {stocks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="star-outline" size={48} color="#333" />
          <Text style={styles.emptyTitle}>No stocks saved yet</Text>
          <Text style={styles.emptyText}>Tap the star on any stock to add it here</Text>
        </View>
      ) : (
        stocks.map((stock) => {
          const accentColour = getExchangeColour(stock.market);
          return (
            <TouchableOpacity
              key={stock.ticker}
              style={styles.card}
              onPress={() => router.push({
                pathname: '/stock',
                params: {
                  ticker: stock.ticker,
                  name: stock.name,
                  price: stock.price,
                  change: stock.change,
                  rec: stock.rec,
                  market: stock.market,
                }
              })}
            >
              <View style={[styles.tickerBadge, { backgroundColor: accentColour + '20' }]}>
                <Text style={[styles.tickerText, { color: accentColour }]}>{stock.ticker}</Text>
              </View>
              <View style={styles.cardMiddle}>
                <Text style={styles.name}>{stock.name}</Text>
                <Text style={styles.market}>{stock.market}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.price}>{stock.price}</Text>
                <Text style={stock.up ? styles.changeUp : styles.changeDown}>
                  {stock.change}
                </Text>
                <View style={[
                  styles.recBadge,
                  stock.rec === 'BUY' ? styles.recBuy :
                  stock.rec === 'HOLD' ? styles.recHold : styles.recSell
                ]}>
                  <Text style={[
                    styles.recText,
                    stock.rec === 'BUY' ? styles.recTextBuy :
                    stock.rec === 'HOLD' ? styles.recTextHold : styles.recTextSell
                  ]}>
                    {stock.rec}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => removeFromWatchlist(stock.ticker)}
                style={styles.starButton}
              >
                <Ionicons name="star" size={18} color="#facc15" />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  loadingContainer: { flex: 1, backgroundColor: '#0f0f14', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#555', marginTop: 12, fontSize: 14 },
  header: { marginTop: 20, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '500', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 4 },
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 100, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: '#fff' },
  emptyText: { fontSize: 14, color: '#555', textAlign: 'center', paddingHorizontal: 40 },
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
  starButton: { padding: 4 },
});