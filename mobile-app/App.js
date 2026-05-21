import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar
        style={isDarkMode ? 'light' : 'dark'}
        backgroundColor={isDarkMode ? '#0f172a' : '#f8fafc'}
      />
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
