import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

const ALPHA_KEY = process.env.EXPO_PUBLIC_ALPHA_KEY;
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;
const SCREEN_WIDTH = Dimensions.get('window').width;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const RANGES = ['1W', '1M', '3M', '1Y'];

function getCurrency(market: string) {
  if (String(market).includes('LSE')) return '£';
  return '$';
}

function formatLabel(dateStr: string, range: string) {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const year = String(date.getFullYear()).slice(2);
  if (range === '1Y') return `${month} '${year}`;
  return `${day} ${month}`;
}

function sliceData(data: any[], range: string) {
  let sliced;
  switch (range) {
    case '1W': sliced = data.slice(-7); break;
    case '1M': sliced = data.slice(-30); break;
    case '3M': sliced = data.slice(-90); break;
    case '1Y': sliced = data.slice(-252); break;
    default: sliced = data.slice(-30);
  }
  if (sliced.length === 0) return [];
  return sliced.map((point, i) => {
    const isFirst = i === 0;
    const isLast = i === sliced.length - 1;
    const isMid = i === Math.floor(sliced.length / 2);
    const label = (isFirst || isLast || isMid) ? formatLabel(point.date, range) : '';
    return { ...point, label, dataPointText: label };
  });
}

export default function StockScreen() {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const { ticker, name, price, change, rec, market } = useLocalSearchParams();
  const router = useRouter();
  const [allCandles, setAllCandles] = useState<any[]>([]);
  const [range, setRange] = useState('1M');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH);

  const currency = getCurrency(String(market));
  const candles = sliceData(allCandles, range);
  const chartWidth = containerWidth - 80;
  const spacing = Math.floor(chartWidth / Math.max(candles.length, 1));
  const isUp = String(change).startsWith('+');
  const recColour = rec === 'BUY' ? '#4ade80' : rec === 'SELL' ? '#f87171' : '#facc15';
  const chartColour = isUp ? '#4ade80' : '#f87171';

  useEffect(() => {
    async function fetchCandles() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${ALPHA_KEY}`
        );
        const data = await res.json();
        if (data.Note || data.Information) {
          setError('API limit reached. Try again in a minute.');
          return;
        }
        const timeSeries = data['Time Series (Daily)'];
        if (timeSeries) {
          const points = Object.entries(timeSeries)
            .reverse()
            .map(([date, values]: any) => ({
              value: parseFloat(values['4. close']),
              date,
            }));
          setAllCandles(points);
        } else {
          setError('No data available for this stock.');
        }
      } catch (err) {
        setError('Failed to load chart data.');
        console.error('Failed to fetch candles:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCandles();
  }, [ticker]);

  async function fetchAiAnalysis() {
    setAiLoading(true);
    setAiAnalysis('');
    try {
      const stored = await AsyncStorage.getItem('strategy');
      const strategy = stored ? JSON.parse(stored) : null;
      const strategyText = strategy ? `
        Investment Goal: ${strategy.goal}
        Time Horizon: ${strategy.horizon}
        Risk Appetite: ${strategy.riskAppetite}
        Investment Type: ${strategy.investmentType}
        Geography: ${strategy.geography}
        Market Caps: ${strategy.marketCaps?.join(', ')}
        Sectors: ${strategy.sectors?.join(', ')}
      ` : 'No strategy set — provide general advice.';

      const prompt = `You are an expert investment analyst. Analyse this stock and give a personalised recommendation.

Stock: ${ticker} — ${name}
Current Price: ${price}
Today's Change: ${change}
Exchange: ${market}
Current Signal: ${rec}

Investor Strategy:
${strategyText}

Please provide:
1. A brief analysis of this stock (2-3 sentences)
2. Whether it fits the investor's strategy and why
3. A clear BUY, HOLD or SELL recommendation with reasoning
4. One key risk to be aware of

Keep it concise, clear and jargon-free. No bullet points — write in natural paragraphs.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1000,
          messages: [
            {
              role: 'system',
              content: 'You are an expert investment analyst. Give clear, concise analysis in plain English.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || 'Unable to generate analysis.';
      setAiAnalysis(text);
    } catch (error) {
      console.error('AI analysis failed:', error);
      setAiAnalysis('Failed to load analysis. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={20} color="#818cf8" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.ticker}>{ticker}</Text>
      <Text style={styles.name}>{name}</Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{currency}{String(price).replace(/[$£]/g, '')}</Text>
        <Text style={[styles.change, { color: isUp ? '#4ade80' : '#f87171' }]}>{change}</Text>
      </View>

      <View style={[styles.recBadge, { backgroundColor: recColour + '20', borderColor: recColour + '40' }]}>
        <Text style={[styles.recText, { color: recColour }]}>
          {rec === 'BUY' ? '▲' : rec === 'SELL' ? '▼' : '◆'} Recommendation: {rec}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Today</Text>
          <Text style={[styles.statValue, { color: isUp ? '#4ade80' : '#f87171' }]}>{change}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Signal</Text>
          <Text style={[styles.statValue, { color: recColour }]}>{rec}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Price</Text>
          <Text style={styles.statValue}>{currency}{String(price).replace(/[$£]/g, '')}</Text>
        </View>
      </View>

      <View
        style={styles.chartContainer}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.chartLabel}>Price History</Text>
          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRange(r)}
                style={[styles.rangeButton, range === r && styles.rangeButtonActive]}
              >
                <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#818cf8" />
            <Text style={styles.loadingText}>Loading chart...</Text>
          </View>
        ) : error ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : candles.length > 1 ? (
          <LineChart
            data={candles}
            color={chartColour}
            thickness={2}
            hideDataPoints
            areaChart
            startFillColor={chartColour}
            endFillColor={'#15151e'}
            startOpacity={0.4}
            endOpacity={0.05}
            backgroundColor={'#15151e'}
            yAxisColor={'#2a2a35'}
            xAxisColor={'#2a2a35'}
            yAxisTextStyle={{ color: '#555', fontSize: 10 }}
            rulesColor={'#1e1e2a'}
            rulesType="solid"
            width={chartWidth}
            height={200}
            curved
            hideYAxisText={false}
            noOfSections={4}
            yAxisLabelPrefix={currency}
            spacing={spacing}
            disableScroll
            xAxisLabelTextStyle={{ color: '#888', fontSize: 10, width: 60, textAlign: 'center' }}
            xAxisLabelsHeight={24}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>Not enough data for this range</Text>
          </View>
        )}
      </View>

      <View style={styles.aiContainer}>
        <View style={styles.aiHeader}>
          <Text style={styles.aiTitle}>AI Analysis</Text>
          <Text style={styles.aiSubtitle}>Powered by GPT-4o mini</Text>
        </View>

        {!aiAnalysis && !aiLoading && (
          <TouchableOpacity style={styles.aiButton} onPress={fetchAiAnalysis}>
            <Ionicons name="sparkles-outline" size={18} color="#fff" />
            <Text style={styles.aiButtonText}>Analyse this stock</Text>
          </TouchableOpacity>
        )}

        {aiLoading && (
          <View style={styles.aiLoading}>
            <ActivityIndicator size="small" color="#818cf8" />
            <Text style={styles.aiLoadingText}>Analysing with GPT-4o mini...</Text>
          </View>
        )}

        {aiAnalysis !== '' && (
          <View style={styles.aiResult}>
            <Text style={styles.aiText}>{aiAnalysis}</Text>
            <TouchableOpacity style={styles.aiRefresh} onPress={fetchAiAnalysis}>
              <Ionicons name="refresh-outline" size={14} color="#555" />
              <Text style={styles.aiRefreshText}>Refresh analysis</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14', padding: 20 },
  backButton: { marginTop: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', padding: 12 },
  backText: { color: '#818cf8', fontSize: 15 },
  ticker: { fontSize: 36, fontWeight: '500', color: '#fff', marginTop: 8 },
  name: { fontSize: 15, color: '#666', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 16 },
  price: { fontSize: 32, fontWeight: '500', color: '#fff' },
  change: { fontSize: 18 },
  recBadge: { marginTop: 12, padding: 10, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 0.5 },
  recText: { fontSize: 13, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  statCard: { flex: 1, backgroundColor: '#15151e', borderRadius: 10, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#555', marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: '500', color: '#fff' },
  chartContainer: { marginTop: 24, backgroundColor: '#15151e', borderRadius: 16, padding: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartLabel: { fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: 1 },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1e1e2a' },
  rangeButtonActive: { backgroundColor: '#818cf8' },
  rangeText: { fontSize: 11, color: '#555', fontWeight: '500' },
  rangeTextActive: { color: '#fff' },
  loadingContainer: { height: 220, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#555', marginTop: 12 },
  errorText: { color: '#555', textAlign: 'center', fontSize: 13 },
  aiContainer: { marginTop: 24, backgroundColor: '#15151e', borderRadius: 16, padding: 16, marginBottom: 40 },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  aiTitle: { fontSize: 16, fontWeight: '500', color: '#fff' },
  aiSubtitle: { fontSize: 11, color: '#555' },
  aiButton: { backgroundColor: '#818cf8', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aiButtonText: { color: '#fff', fontWeight: '500', fontSize: 15 },
  aiLoading: { alignItems: 'center', padding: 20, gap: 8 },
  aiLoadingText: { color: '#555', fontSize: 13 },
  aiResult: { gap: 12 },
  aiText: { color: '#ccc', fontSize: 14, lineHeight: 22 },
  aiRefresh: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiRefreshText: { color: '#555', fontSize: 12 },
});