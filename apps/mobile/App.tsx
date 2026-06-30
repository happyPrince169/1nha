// ---------------------------------------------------------------------------
// App root — providers + auth-gated navigation.
//
//   not signed in  → SignIn screen
//   signed in      → native stack: PropertyList → PropertyDetail, + Account
//
// The navigator switches purely on the Supabase session (AuthProvider); there is
// no manual navigation on login/logout.
// ---------------------------------------------------------------------------
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "@/auth/auth-context";
import { SignInScreen } from "@/screens/SignInScreen";
import { PropertyListScreen } from "@/screens/PropertyListScreen";
import { PropertyDetailScreen } from "@/screens/PropertyDetailScreen";
import { AccountScreen } from "@/screens/AccountScreen";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen
        name="PropertyList"
        component={PropertyListScreen}
        options={({ navigation }) => ({
          title: "Kho nguồn",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate("Account")}
              accessibilityRole="button"
            >
              <Text style={styles.headerLink}>Tài khoản</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="PropertyDetail"
        component={PropertyDetailScreen}
        options={({ route }) => ({ title: route.params.title ?? "Chi tiết nguồn" })}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: "Tài khoản" }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  headerLink: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
