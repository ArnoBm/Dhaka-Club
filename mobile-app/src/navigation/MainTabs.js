import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/axios';
import { getMemberSocket } from '../api/socket';
import { colors } from '../theme/colors';
import CommunityScreen from '../screens/CommunityScreen';
import EventsScreen from '../screens/EventsScreen';
import HomeScreen from '../screens/HomeScreen';
import NoticesScreen from '../screens/NoticesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import UpdatesNavigator from './UpdatesNavigator';

const Tab = createBottomTabNavigator();
const COMMUNITY_SEEN_KEY = 'communityLastSeenAt';

const tabIcons = {
  Home: ['home', 'home-outline'],
  Notices: ['notifications', 'notifications-outline'],
  Updates: ['notifications-circle', 'notifications-circle-outline'],
  Events: ['calendar', 'calendar-outline'],
  Community: ['people', 'people-outline'],
  Profile: ['person', 'person-outline'],
};

function MainTabs() {
  const [communityBadgeCount, setCommunityBadgeCount] = useState(0);
  const [updatesBadgeCount, setUpdatesBadgeCount] = useState(0);

  const refreshCommunityBadge = useCallback(async () => {
    try {
      const [seenAt, response] = await Promise.all([
        AsyncStorage.getItem(COMMUNITY_SEEN_KEY),
        api.get('/community', { params: { status: 'Open' } }),
      ]);
      const seenTime = seenAt ? new Date(seenAt).getTime() : 0;
      const unreadRequests = (response.data || []).filter((request) => {
        const createdTime = new Date(request.created_at).getTime();
        return createdTime > seenTime;
      });

      setCommunityBadgeCount(unreadRequests.length);
    } catch (error) {
      setCommunityBadgeCount(0);
    }
  }, []);

  const refreshUpdatesBadge = useCallback(async () => {
    try {
      const response = await api.get('/member/updates/unread');
      setUpdatesBadgeCount(response.data?.count || 0);
    } catch (error) {
      setUpdatesBadgeCount(0);
    }
  }, []);

  useEffect(() => {
    refreshCommunityBadge();
    refreshUpdatesBadge();
    const intervalId = setInterval(refreshCommunityBadge, 10000);
    const updatesBadgeSubscription = DeviceEventEmitter.addListener(
      'updatesBadgeShouldRefresh',
      refreshUpdatesBadge,
    );
    let socketRef;

    getMemberSocket().then((socket) => {
      if (!socket) {
        return;
      }

      socketRef = socket;
      socket.on('updates:new', refreshUpdatesBadge);
      socket.on('updates:changed', refreshUpdatesBadge);
    });

    return () => {
      clearInterval(intervalId);
      updatesBadgeSubscription.remove();
      socketRef?.off('updates:new', refreshUpdatesBadge);
      socketRef?.off('updates:changed', refreshUpdatesBadge);
    };
  }, [refreshCommunityBadge, refreshUpdatesBadge]);

  const markCommunitySeen = async () => {
    await AsyncStorage.setItem(COMMUNITY_SEEN_KEY, new Date().toISOString());
    setCommunityBadgeCount(0);
  };

  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          communityBadgeCount={communityBadgeCount}
          updatesBadgeCount={updatesBadgeCount}
        />
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen
        name="Updates"
        component={UpdatesNavigator}
        options={{
          tabBarBadge: updatesBadgeCount ? Math.min(updatesBadgeCount, 99) : undefined,
        }}
        listeners={{
          tabPress: () => {
            refreshUpdatesBadge();
          },
          focus: () => {
            refreshUpdatesBadge();
          },
        }}
      />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarBadge: communityBadgeCount ? Math.min(communityBadgeCount, 99) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#dc2626',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: '900',
          },
        }}
        listeners={{
          tabPress: () => {
            markCommunitySeen();
          },
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function CustomTabBar({ state, navigation, communityBadgeCount, updatesBadgeCount }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const iconSet = tabIcons[route.name];
        const iconName = focused ? iconSet[0] : iconSet[1];
        const badgeCount =
          route.name === 'Community'
            ? communityBadgeCount
            : route.name === 'Updates'
              ? updatesBadgeCount
              : 0;
        const showBadge = badgeCount > 0;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={({ pressed }) => [
              styles.tabItem,
              pressed ? styles.tabItemPressed : null,
            ]}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={iconName}
                size={focused ? 29 : 25}
                color={focused ? colors.midnight : '#7b8494'}
              />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.min(badgeCount, 99)}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 999,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -8,
    top: -7,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  iconWrap: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 44,
  },
  tabBar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    bottom: 0,
    elevation: 0,
    flexDirection: 'row',
    left: 0,
    paddingTop: 4,
    position: 'absolute',
    right: 0,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  tabItemPressed: {
    opacity: 0.7,
  },
});

export default MainTabs;
