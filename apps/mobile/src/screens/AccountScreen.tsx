// ---------------------------------------------------------------------------
// Account — shows the signed-in identity and a Sign Out action. Workspace /
// member management stays on the web (out of scope for the mobile skeleton).
// ---------------------------------------------------------------------------
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "@/auth/auth-context";
import { colors } from "@/theme";

export function AccountScreen() {
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const email = session?.user?.email ?? "—";

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Đăng nhập bằng</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <Text style={styles.note}>
        Quản lý nhóm, gói sử dụng và bảng giá hiện có trên web.
      </Text>

      <TouchableOpacity
        style={styles.signOut}
        onPress={onSignOut}
        disabled={signingOut}
        accessibilityRole="button"
      >
        {signingOut ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.signOutText}>Đăng xuất</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 4,
  },
  label: { fontSize: 12, color: colors.muted },
  email: { fontSize: 16, fontWeight: "600", color: colors.text },
  note: { fontSize: 13, color: colors.muted, paddingHorizontal: 4 },
  signOut: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
});
