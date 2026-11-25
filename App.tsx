import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { registerBackgroundChecks, setupNotifications } from './src/services/background';
import { initPurchases } from './src/services/purchases';

export default function App() {
  useEffect(() => {
    setupNotifications();
    initPurchases();
    registerBackgroundChecks();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <HomeScreen />
    </SafeAreaProvider>
  );
}
