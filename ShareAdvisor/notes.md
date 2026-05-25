# ShareAdvisor — Feature Ideas & Notes

## 🚧 In Progress
- AI analysis on stock detail screen
- X axis date labels on charts
- Smarter recommendations

## 💡 Feature Ideas
- ETF Markets screen (SPY, VOO, VUSA etc. by category)
- Find the next Nvidia — penny/small cap AI scan
- Portfolio tracker (manually enter holdings + purchase price)
- News feed per stock
- Price alerts / notifications
- Apple Developer account + proper app build
- Light/dark mode toggle
- Onboarding screen for first time users

## 🐛 Known Issues
- X axis chart labels not showing correctly
- Alpha Vantage API limited to 25 requests/day

## 📝 Other Notes
- Apple Developer Account needed for standalone app (£99/year)
- Finnhub = US stock prices (free, generous limit)
- Alpha Vantage = UK stock prices + charts (free, 25/day limit)

## 🔌 API Limitations & Solutions

### Current API Limits
| API | Limit | Used for |
|-----|-------|---------|
| Finnhub | 60 calls/minute | US stock prices — very generous |
| Alpha Vantage | 25 calls/day | UK stocks + charts — very restrictive |
| Anthropic | Pay per use | Claude AI analysis |
| OpenAI | Pay per use | GPT-4 analysis |

### The Problem
Alpha Vantage's 25 calls/day limit is too restrictive for a portfolio feature.

### Options
- **Option A** — Upgrade Alpha Vantage ($50/month) — 75 calls/minute
- **Option B** — Switch charts to Polygon.io (free, 5 calls/minute)
- **Option C** — Cache prices locally, only refresh every 30 mins
- **Option D** — Portfolio uses Finnhub only (US stocks) for now

### Decision
Go with Option C + D for portfolio:
- Cache prices locally using AsyncStorage
- Use Finnhub for portfolio (generous limit)
- Add UK stock support later when API situation improves
- Revisit Polygon.io or Alpha Vantage premium when app is more built out


🤖 Agentic Feature Ideas
1. Morning Briefing Agent
Every morning, an AI scans your watchlist and portfolio, checks overnight news, and delivers a personalised "what you need to know today" summary. Like having a personal analyst who reads the FT for you.
2. "Should I Sell?" Agent
You tap a stock you own and say "should I sell?" The agent looks at your original investment goal, current performance, market conditions, and gives you a reasoned yes/no with explanation.
3. Risk Monitor Agent
Constantly monitors your watchlist for red flags — earnings misses, CEO resignations, regulatory issues — and alerts you when something significant happens to a stock you're watching.
4. Portfolio Stress Test Agent
You describe a scenario ("what if interest rates rise 2%?" or "what if there's a tech crash?") and the AI analyses how your watchlist would likely be affected.
5. Contrarian Agent
Takes your current watchlist and argues the opposite case for each stock — "here's why you might be wrong about AAPL." Helps you stress test your own thinking.
6. "Find the Next Nvidia" Agent
Scans small/micro cap stocks matching your criteria and looks for early signals of explosive growth — rising revenue, insider buying, sector momentum.