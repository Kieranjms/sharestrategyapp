import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const GOALS = [
  { id: 'short_growth', label: 'Short Term Capital Growth', icon: '🚀', risk: 'High Risk', description: 'Quick gains over 0-2 years' },
  { id: 'long_growth', label: 'Long Term Capital Growth', icon: '📈', risk: 'Medium Risk', description: 'Steady growth over 5+ years' },
  { id: 'preservation', label: 'Capital Preservation', icon: '🛡️', risk: 'Low Risk', description: 'Protect what you have' },
  { id: 'dividend', label: 'Dividend Income', icon: '💰', risk: 'Low Risk', description: 'Regular income payments' },
  { id: 'high_dividend', label: 'High Yield Dividends', icon: '💎', risk: 'Higher Risk', description: 'Maximum dividend income' },
  { id: 'balanced', label: 'Balanced', icon: '⚖️', risk: 'Medium Risk', description: 'Mix of growth and income' },
];

const HORIZONS = [
  { id: 'short', label: 'Short', sublabel: '0-2 years' },
  { id: 'medium', label: 'Medium', sublabel: '2-5 years' },
  { id: 'long', label: 'Long', sublabel: '5+ years' },
];

const RISK_APPETITES = [
  { id: 'conservative', label: 'Conservative', description: 'Minimise losses' },
  { id: 'moderate', label: 'Moderate', description: 'Balanced approach' },
  { id: 'aggressive', label: 'Aggressive', description: 'Maximise returns' },
];

const MARKET_CAPS = [
  { id: 'large', label: 'Large Cap', sublabel: '£10B+', description: 'Apple, Microsoft' },
  { id: 'mid', label: 'Mid Cap', sublabel: '£2B-£10B', description: 'Room to grow' },
  { id: 'small', label: 'Small Cap', sublabel: '£300M-£2B', description: 'Higher reward' },
  { id: 'micro', label: 'Micro/Penny', sublabel: 'Under £300M', description: 'Find the next Nvidia' },
];

const SECTORS = [
  { id: 'technology', label: 'Technology', icon: '💻' },
  { id: 'energy', label: 'Energy', icon: '⚡' },
  { id: 'financial', label: 'Financial', icon: '🏦' },
  { id: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { id: 'defence', label: 'Defence', icon: '🛡️' },
  { id: 'mining', label: 'Mining', icon: '⛏️' },
  { id: 'consumer', label: 'Consumer', icon: '🛒' },
];

const GEOGRAPHIES = [
  { id: 'us', label: '🇺🇸 US Only' },
  { id: 'uk', label: '🇬🇧 UK Only' },
  { id: 'global', label: '🌍 Global' },
];

const INVESTMENT_TYPES = [
  { id: 'etf', label: 'ETFs Only' },
  { id: 'stocks', label: 'Stocks Only' },
  { id: 'both', label: 'Both' },
];

export default function StrategyScreen() {
  const [goal, setGoal] = useState('long_growth');
  const [horizon, setHorizon] = useState('medium');
  const [riskAppetite, setRiskAppetite] = useState('moderate');
  const [investmentType, setInvestmentType] = useState('both');
  const [geography, setGeography] = useState('global');
  const [marketCaps, setMarketCaps] = useState<string[]>(['large', 'mid']);
  const [sectors, setSectors] = useState<string[]>(['technology', 'energy', 'financial', 'healthcare']);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadStrategy();
  }, []);

  async function loadStrategy() {
    const stored = await AsyncStorage.getItem('strategy');
    if (stored) {
      const s = JSON.parse(stored);
      setGoal(s.goal || 'long_growth');
      setHorizon(s.horizon || 'medium');
      setRiskAppetite(s.riskAppetite || 'moderate');
      setInvestmentType(s.investmentType || 'both');
      setGeography(s.geography || 'global');
      setMarketCaps(s.marketCaps || ['large', 'mid']);
      setSectors(s.sectors || ['technology', 'energy', 'financial', 'healthcare']);
    }
  }

  async function saveStrategy() {
    const strategy = { goal, horizon, riskAppetite, investmentType, geography, marketCaps, sectors };
    await AsyncStorage.setItem('strategy', JSON.stringify(strategy));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleMarketCap(id: string) {
    setMarketCaps(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  function toggleSector(id: string) {
    setSectors(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Strategy</Text>
        <Text style={styles.subtitle}>Personalise your investment profile</Text>
      </View>

      <Text style={styles.sectionTitle}>Investment Goal</Text>
      {GOALS.map((g) => (
        <TouchableOpacity
          key={g.id}
          style={[styles.goalCard, goal === g.id && styles.goalCardActive]}
          onPress={() => setGoal(g.id)}
        >
          <Text style={styles.goalIcon}>{g.icon}</Text>
          <View style={styles.goalMiddle}>
            <Text style={[styles.goalLabel, goal === g.id && styles.goalLabelActive]}>{g.label}</Text>
            <Text style={styles.goalDescription}>{g.description}</Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: g.risk.includes('High') ? '#2a0d0d' : g.risk.includes('Low') ? '#0d2818' : '#1a1a0a' }]}>
            <Text style={[styles.riskText, { color: g.risk.includes('High') ? '#f87171' : g.risk.includes('Low') ? '#4ade80' : '#facc15' }]}>{g.risk}</Text>
          </View>
          {goal === g.id && <Ionicons name="checkmark-circle" size={20} color="#818cf8" style={styles.check} />}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Investment Type</Text>
      <View style={styles.pillRow}>
        {INVESTMENT_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.pill, investmentType === t.id && styles.pillActive]}
            onPress={() => setInvestmentType(t.id)}
          >
            <Text style={[styles.pillText, investmentType === t.id && styles.pillTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Time Horizon</Text>
      <View style={styles.pillRow}>
        {HORIZONS.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[styles.pill, horizon === h.id && styles.pillActive]}
            onPress={() => setHorizon(h.id)}
          >
            <Text style={[styles.pillText, horizon === h.id && styles.pillTextActive]}>{h.label}</Text>
            <Text style={[styles.pillSub, horizon === h.id && styles.pillSubActive]}>{h.sublabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Risk Appetite</Text>
      <View style={styles.pillRow}>
        {RISK_APPETITES.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.pill, riskAppetite === r.id && styles.pillActive]}
            onPress={() => setRiskAppetite(r.id)}
          >
            <Text style={[styles.pillText, riskAppetite === r.id && styles.pillTextActive]}>{r.label}</Text>
            <Text style={[styles.pillSub, riskAppetite === r.id && styles.pillSubActive]}>{r.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Geography</Text>
      <View style={styles.pillRow}>
        {GEOGRAPHIES.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.pill, geography === g.id && styles.pillActive]}
            onPress={() => setGeography(g.id)}
          >
            <Text style={[styles.pillText, geography === g.id && styles.pillTextActive]}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Market Cap</Text>
      <Text style={styles.sectionHint}>Select all that apply</Text>
      <View style={styles.pillRow}>
        {MARKET_CAPS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.pill, marketCaps.includes(m.id) && styles.pillActive]}
            onPress={() => toggleMarketCap(m.id)}
          >
            <Text style={[styles.pillText, marketCaps.includes(m.id) && styles.pillTextActive]}>{m.label}</Text>
            <Text style={[styles.pillSub, marketCaps.includes(m.id) && styles.pillSubActive]}>{m.sublabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Sectors</Text>
      <Text style={styles.sectionHint}>Select all that apply</Text>
      <View style={styles.sectorGrid}>
        {SECTORS.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.sectorCard, sectors.includes(s.id) && styles.sectorCardActive]}
            onPress={() => toggleSector(s.id)}
          >
            <Text style={styles.sectorIcon}>{s.icon}</Text>
            <Text style={[styles.sectorLabel, sectors.includes(s.id) && styles.sectorLabelActive]}>{s.label}</Text>
            {sectors.includes(s.id) && <Ionicons name="checkmark-circle" size={14} color="#818cf8" />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveStrategy}>
        <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color="#fff" />
        <Text style={styles.saveButtonText}>{saved ? 'Saved!' : 'Save Strategy'}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  header: { marginTop: 20, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '500', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: '#fff', marginTop: 24, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: '#555', marginBottom: 10, marginTop: -4 },
  goalCard: { backgroundColor: '#15151e', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 0.5, borderColor: '#1e1e2a' },
  goalCardActive: { borderColor: '#818cf8', backgroundColor: '#1a1a2e' },
  goalIcon: { fontSize: 24 },
  goalMiddle: { flex: 1 },
  goalLabel: { fontSize: 14, fontWeight: '500', color: '#888' },
  goalLabelActive: { color: '#fff' },
  goalDescription: { fontSize: 12, color: '#555', marginTop: 2 },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  riskText: { fontSize: 10, fontWeight: '500' },
  check: { marginLeft: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { backgroundColor: '#15151e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 0.5, borderColor: '#1e1e2a', alignItems: 'center' },
  pillActive: { borderColor: '#818cf8', backgroundColor: '#1a1a2e' },
  pillText: { fontSize: 13, fontWeight: '500', color: '#888' },
  pillTextActive: { color: '#fff' },
  pillSub: { fontSize: 10, color: '#555', marginTop: 2 },
  pillSubActive: { color: '#818cf8' },
  sectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorCard: { backgroundColor: '#15151e', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: '#1e1e2a', alignItems: 'center', width: '30%', gap: 4 },
  sectorCardActive: { borderColor: '#818cf8', backgroundColor: '#1a1a2e' },
  sectorIcon: { fontSize: 20 },
  sectorLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  sectorLabelActive: { color: '#fff' },
  saveButton: { backgroundColor: '#818cf8', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});