// app/(tabs)/_layout.tsx

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f0f14',
          borderTopColor: '#1e1e2a',
          borderTopWidth: 0.5,
        },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: { fontSize: 10, marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="strategy"
        options={{
          title: 'Strategy',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bulb-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'AI Analysis',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="etf"
        options={{
          title: 'ETFs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Watchlist — kept as a screen but hidden from the tab bar */}
      <Tabs.Screen
        name="watchlist"
        options={{
          href: null, // hides it from the tab bar
        }}
      />
    </Tabs>
  );
}