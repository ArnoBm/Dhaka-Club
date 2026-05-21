import { createStackNavigator } from '@react-navigation/stack';
import UpdatesScreen from '../screens/UpdatesScreen';
import UpdateDetailsScreen from '../screens/UpdateDetailsScreen';

const Stack = createStackNavigator();

function UpdatesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UpdatesList" component={UpdatesScreen} />
      <Stack.Screen name="UpdateDetails" component={UpdateDetailsScreen} />
    </Stack.Navigator>
  );
}

export default UpdatesNavigator;
