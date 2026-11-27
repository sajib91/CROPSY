import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';

import { isOnboardingComplete } from '../lib/auth/onboarding';
import { useApp } from '../state/AppContext';
import AssistantScreen from '../screens/AssistantScreen';
import AuthScreen from '../screens/AuthScreen';
import CartScreen from '../screens/CartScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import CropsScreen from '../screens/CropsScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DeliveryScreen from '../screens/DeliveryScreen';
import FarmsScreen from '../screens/FarmsScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import MarketplaceScreen from '../screens/MarketplaceScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: '#020617' },
};

function tabIcon(name, focused, color, size) {
  const icons = {
    Home: focused ? 'home' : 'home-outline',
    Marketplace: focused ? 'storefront' : 'storefront-outline',
    Orders: focused ? 'receipt' : 'receipt-outline',
    Assistant: focused ? 'sparkles' : 'sparkles-outline',
  };
  return <Ionicons name={icons[name] || 'ellipse-outline'} size={size} color={color} />;
}

function MainTabs() {
  const { t } = useApp();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#34d399',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ focused, color, size }) => tabIcon(route.name, focused, color, size),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: t('common.home') }} />
      <Tab.Screen
        name="Marketplace"
        component={MarketplaceScreen}
        options={{ title: t('common.marketplace') }}
      />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: t('common.orders') }} />
      <Tab.Screen
        name="Assistant"
        component={AssistantScreen}
        options={{ title: t('common.assistant') }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: t('common.notifications') }}
      />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Farms" component={FarmsScreen} />
      <Stack.Screen name="Crops" component={CropsScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <Stack.Screen name="CreateListing" component={CreateListingScreen} />
      <Stack.Screen name="Delivery" component={DeliveryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { session } = useApp();
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [checking, setChecking] = useState(Boolean(session));

  const userId = session?.user?.id || session?.user?.sub;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) {
        if (active) {
          setOnboardingComplete(true);
          setChecking(false);
        }
        return;
      }
      setChecking(true);
      const complete = await isOnboardingComplete(userId);
      if (active) {
        setOnboardingComplete(complete);
        setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!session?.accessToken) {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  if (checking) return null;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!onboardingComplete ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainStack} />
      )}
    </Stack.Navigator>
  );
}
