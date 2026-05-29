// app/portfolio.tsx

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const TWELVE_KEY = process.env.EXPO_PUBLIC_TWELVE_KEY;

type Holding = {
  ticker:       string;
  name:         string;
  market:       string;
  quantity:     number;
  buyPrice:     number;
  currentPrice?: number;
  currentValue?: number;
  pl?:          number;
  plPct?:       number;
};

// Convert ticker to Twelve Data format — LLOY.L → LLOY:LSE
function toTwelveSymbol(ticker: string): string {
  if (ticker.endsWith('.L')) return ticker.replace('.L', ':LSE');
  return ticker;
}

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const symbol = toTwelveSymbol(ticker);
    const res    = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${TWELVE_KEY}`
    );
    const data = await res.json();
    if (data.code || !data.close) return null;
    return parseFloat(data.close);
  } catch {
    return null;
  }
}

export default function PortfolioScreen() {
  const router = useRouter();

  const [holdings, setHoldings]     = useState<Holding[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm]     = useState(false);

  const [formTicker,   setFormTicker]   = useState('');
  const [formName,     setFormName]     = useState('');
  const [formMarket,   setFormMarket]   = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formBuyPrice, setFormBuyPrice] = useState('');
  const [formError,    setFormError]    = useState('');

  useFocusEffect(
    useCallback(() => {
      loadHoldings();
    }, [])
  );

  async function loadHoldings() {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem('portfolio');
      const raw: Holding[] = stored ? JSON.parse(stored) : [];

      const priceCache     = await AsyncStorage.getItem('portfolioPriceCache');
      const priceCacheTime = await AsyncStorage.getItem('portfolioPriceCacheTime');
      const oneDay         = 24 * 60 * 60 * 1000;
      const isRecent       = priceCacheTime && (Date.now() - parseInt(priceCacheTime)) < oneDay;

      if (priceCache && isRecent) {
        const prices: Record<string, number> = JSON.parse(priceCache);
        setHoldings(enrichWithPrices(raw, prices));
      } else {
        setHoldings(raw);
        await refreshPrices(raw);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices(raw?: Holding[]) {
    const list = raw ?? holdings;
    if (list.length === 0) return;
    setRefreshing(true);
    try {
      const prices: Record<string, number> = {};
      await Promise.all(
        list.map(async h => {
          const price = await fetchCurrentPrice(h.ticker);
          if (price) prices[h.ticker] = price;
        })
      );
      await AsyncStorage.setItem('portfolioPriceCache', JSON.stringify(prices));
      await AsyncStorage.setItem('portfolioPriceCacheTime', Date.now().toString());
      const enriched = enrichWithPrices(list, prices);
      setHoldings(enriched);
      await AsyncStorage.setItem('portfolioCache', JSON.stringify(enriched));
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  function enrichWithPrices(raw: Holding[], prices: Record<string, number>): Holding[] {
    return raw.map(h => {
      const currentPrice = prices[h.ticker];
      if (!currentPrice) return h;
      const currentValue = currentPrice * h.quantity;
      const invested     = h.buyPrice * h.quantity;
      const pl           = currentValue - invested;
      const plPct        = (pl / invested) * 100;
      return { ...h, currentPrice, currentValue, pl, plPct };
    });
  }

  async function addHolding() {
    setFormError('');
    if (!formTicker || !formName || !formQuantity || !formBuyPrice) {
      setFormError('Please fill in all fields.'); return;
    }
    const qty = parseFloat(formQuantity);
    const buy = parseFloat(formBuyPrice);
    if (isNaN(qty) || qty <= 0 || isNaN(buy) || buy <= 0) {
      setFormError('Quantity and buy price must be valid numbers.'); return;
    }

    const newHolding: Holding = {
      ticker:   formTicker.toUpperCase().trim(),
      name:     formName.trim(),
      market:   formMarket.trim() || 'Unknown',
      quantity: qty,
      buyPrice: buy,
    };

    const stored = await AsyncStorage.getItem('portfolio');
    const raw: Holding[] = stored ? JSON.parse(stored) : [];
    await AsyncStorage.setItem('portfolio', JSON.stringify([...raw, newHolding]));

    setFormTicker(''); setFormName(''); setFormMarket('');
    setFormQuantity(''); setFormBuyPrice('');
    setShowForm(false);
    loadHoldings();
  }

  async function removeHolding(ticker: string) {
    Alert.alert('Remove holding', `Remove ${ticker} from your portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const stored = await AsyncStorage.getItem('portfolio');
          const raw: Holding[] = stored ? JSON.parse(stored) : [];
          await AsyncStorage.setItem('portfolio', JSON.stringify(raw.filter(h => h.ticker !== ticker)));
          loadHoldings();
        },
      },
    ]);
  }

  const totalInvested = holdings.reduce((s, h) => s + h.quantity * h.buyPrice, 0);
  const totalCurrent  = holdings.reduce((s, h) => s + (h.currentValue ?? h.quantity * h.buyPrice), 0);
  const totalPL       = totalCurrent - totalInvested;
  const totalPLPct    = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color="#fff" />
        <Text style={styles.backText}>Home</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Portfolio</Text>

      {loading ? (
        <ActivityIndicator color="#818cf8" style={{ marginTop: 40 }} />
      ) : (
        <>
          {holdings.length > 0 && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Invested</Text>
                <Text style={styles.summaryValue}>
                  £{totalInvested.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Current value</Text>
                <Text style={styles.summaryValue}>
                  £{totalCurrent.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>P&L</Text>
                <Text style={[styles.summaryValue, { color: totalPL >= 0 ? '#4ade80' : '#f87171' }]}>
                  {totalPL >= 0 ? '+' : ''}£{Math.abs(totalPL).toFixed(2)}
                </Text>
                <Text style={[styles.summaryPct, { color: totalPL >= 0 ? '#4ade80' : '#f87171' }]}>
                  {totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%
                </Text>
              </View>
            </View>
          )}

          {holdings.length > 0 && (
            <TouchableOpacity style={styles.refreshButton} onPress={() => refreshPrices()} disabled={refreshing}>
              {refreshing
                ? <ActivityIndicator size="small" color="#555" />
                : <Ionicons name="refresh-outline" size={14} color="#555" />
              }
              <Text style={styles.refreshText}>{refreshing ? 'Updating prices...' : 'Refresh prices'}</Text>
            </TouchableOpacity>
          )}

          {holdings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={40} color="#333" />
              <Text style={styles.emptyTitle}>No holdings yet</Text>
              <Text style={styles.emptyText}>Tap "Add holding" to get started</Text>
            </View>
          ) : (
            holdings.map(h => {
              const invested = h.quantity * h.buyPrice;
              const isUK     = h.ticker.endsWith('.L');
              const curr     = isUK ? '£' : '$';
              return (
                <View key={h.ticker} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticker}>{h.ticker}</Text>
                      <Text style={styles.name}>{h.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {h.currentValue != null ? (
                        <Text style={styles.currentValue}>
                          {curr}{h.currentValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      ) : (
                        <Text style={styles.noPrice}>Price unavailable</Text>
                      )}
                      {h.pl != null && (
                        <Text style={[styles.pl, { color: h.pl >= 0 ? '#4ade80' : '#f87171' }]}>
                          {h.pl >= 0 ? '+' : ''}{curr}{Math.abs(h.pl).toFixed(2)} ({h.plPct?.toFixed(1)}%)
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.detail}>{h.quantity} shares @ {curr}{h.buyPrice.toFixed(2)}</Text>
                    <Text style={styles.detail}>Invested: {curr}{invested.toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removeHolding(h.ticker)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="trash-outline" size={15} color="#444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(p => !p)}>
            <Ionicons name={showForm ? 'close' : 'add'} size={18} color="#0f0f14" />
            <Text style={styles.addButtonText}>{showForm ? 'Cancel' : 'Add holding'}</Text>
          </TouchableOpacity>

          {showForm && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>New holding</Text>

              <Text style={styles.label}>Ticker</Text>
              <TextInput style={styles.input} placeholder="e.g. AMD or LLOY.L" placeholderTextColor="#555" value={formTicker} onChangeText={setFormTicker} autoCapitalize="characters" />

              <Text style={styles.label}>Company name</Text>
              <TextInput style={styles.input} placeholder="e.g. Advanced Micro Devices" placeholderTextColor="#555" value={formName} onChangeText={setFormName} />

              <Text style={styles.label}>Exchange</Text>
              <TextInput style={styles.input} placeholder="e.g. NYSE, NASDAQ, LSE" placeholderTextColor="#555" value={formMarket} onChangeText={setFormMarket} autoCapitalize="characters" />

              <Text style={styles.label}>Quantity</Text>
              <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor="#555" value={formQuantity} onChangeText={setFormQuantity} keyboardType="decimal-pad" />

              <Text style={styles.label}>Buy price per share</Text>
              <TextInput style={styles.input} placeholder="e.g. 125.50" placeholderTextColor="#555" value={formBuyPrice} onChangeText={setFormBuyPrice} keyboardType="decimal-pad" />

              {formError !== '' && <Text style={styles.errorText}>{formError}</Text>}

              <TouchableOpacity style={styles.saveButton} onPress={addHolding}>
                <Text style={styles.saveButtonText}>Save holding</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f0f14' },
  content:        { padding: 20, paddingBottom: 60 },
  backButton:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backText:       { color: '#fff', fontSize: 15 },
  pageTitle:      { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 20 },
  summaryRow:     { flexDirection: 'row', backgroundColor: '#15151e', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: '#1e1e2a' },
  summaryBox:     { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 0.5, backgroundColor: '#1e1e2a' },
  summaryLabel:   { fontSize: 11, color: '#555', marginBottom: 4 },
  summaryValue:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  summaryPct:     { fontSize: 11, fontWeight: '600', marginTop: 2 },
  refreshButton:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  refreshText:    { fontSize: 12, color: '#555' },
  emptyState:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:     { fontSize: 17, fontWeight: '600', color: '#fff' },
  emptyText:      { fontSize: 13, color: '#555' },
  card:           { backgroundColor: '#15151e', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#1e1e2a' },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardBottom:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 0.5, borderTopColor: '#1e1e2a', paddingTop: 10 },
  ticker:         { fontSize: 16, fontWeight: '700', color: '#fff' },
  name:           { fontSize: 12, color: '#555', marginTop: 2 },
  currentValue:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  pl:             { fontSize: 12, fontWeight: '600', marginTop: 2 },
  noPrice:        { fontSize: 12, color: '#555' },
  detail:         { fontSize: 11, color: '#555', flex: 1 },
  addButton:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#818cf8', borderRadius: 12, paddingVertical: 14, gap: 8, marginTop: 8, marginBottom: 4 },
  addButtonText:  { color: '#0f0f14', fontWeight: '700', fontSize: 15 },
  form:           { backgroundColor: '#15151e', borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 0.5, borderColor: '#1e1e2a' },
  formTitle:      { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 16 },
  label:          { fontSize: 12, color: '#9ca3af', marginBottom: 6, marginTop: 12 },
  input:          { backgroundColor: '#0f0f14', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14, borderWidth: 0.5, borderColor: '#1e1e2a' },
  errorText:      { color: '#f87171', fontSize: 12, marginTop: 10 },
  saveButton:     { backgroundColor: '#818cf8', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: '#0f0f14', fontWeight: '700', fontSize: 15 },
});