/**
 * DRS AI Mobile — Root App component.
 *
 * Bootstraps providers (AuthProvider), sets up RTL,
 * and wires the bottom-tab navigator across:
 *   Chat · Voice · Files · Models · Settings
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { I18nManager, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isRTL, getCurrentLocale } from './i18n';
import { colors } from './theme';

import LoginScreen from './screens/Login';
import ChatScreen from './screens/Chat';
import VoiceScreen from './screens/Voice';
import FilesScreen from './screens/Files';
import ModelsScreen from './screens/Models';
import SettingsScreen from './screens/Settings';

import { MessageSquare, Mic, File as FileIcon, Cpu, Settings as SettingsIcon } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

function MainApp() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.dark.accent,
        tabBarInactiveTintColor: colors.dark.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Voice"
        component={VoiceScreen}
        options={{ tabBarIcon: ({ color, size }) => <Mic color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Files"
        component={FilesScreen}
        options={{ tabBarIcon: ({ color, size }) => <FileIcon color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Models"
        component={ModelsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Cpu color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, isReady } = useAuth();

  useEffect(() => {
    const rtl = isRTL(getCurrentLocale());
    if (I18nManager.isRTL !== rtl) {
      I18nManager.forceRTL(rtl);
      // Note: in a real app we'd reload here. For dev convenience we don't.
    }
  }, []);

  if (!isReady) return null;
  return user ? <MainApp /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.dark.surface,
    borderTopColor: colors.dark.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
