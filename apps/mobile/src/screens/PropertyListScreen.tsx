// ---------------------------------------------------------------------------
// Property List — GET /api/properties (org-scoped via the API/service layer).
// Pull-to-refresh, loading / error / empty states. Read-only.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchProperties, isAuthError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { RootStackParamList } from "@/navigation/types";
import type { PropertyListItem } from "@/lib/types";
import { formatArea, formatPrice, orDash, statusLabel } from "@/lib/format";
import { colors } from "@/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PropertyList">;

export function PropertyListScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const currentUserId = session?.user?.id ?? null;

  const [items, setItems] = useState<PropertyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const result = await fetchProperties();
        setItems(result.items);
      } catch (err) {
        if (isAuthError(err)) {
          await signOut();
          return;
        }
        setError(err instanceof Error ? err.message : "Không tải được danh sách.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [signOut]
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedText}>Đang tải kho nguồn…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load("initial")}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length === 0 ? styles.flexGrow : styles.listPad}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} />
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Chưa có nguồn nào</Text>
          <Text style={styles.mutedText}>
            Thêm nguồn mới trên web. Kéo xuống để làm mới.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            navigation.navigate("PropertyDetail", { id: item.id, title: item.title })
          }
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.status && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardMeta}>{orDash(item.district)}</Text>
          <View style={styles.cardFacts}>
            <Text style={styles.fact}>{formatPrice(item.price)}</Text>
            <Text style={styles.factDot}>·</Text>
            <Text style={styles.fact}>{formatArea(item.area)}</Text>
          </View>
          {item.assigned_to && (
            <Text style={styles.assignee}>
              {item.assigned_to === currentUserId
                ? "Bạn phụ trách"
                : "Đã có người phụ trách"}
            </Text>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flexGrow: { flexGrow: 1 },
  listPad: { padding: 12, gap: 10 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  mutedText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  errorText: { color: colors.danger, fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
  cardMeta: { fontSize: 13, color: colors.muted },
  cardFacts: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  fact: { fontSize: 15, fontWeight: "600", color: colors.accent },
  factDot: { color: colors.muted },
  assignee: { marginTop: 4, fontSize: 12, color: colors.muted },
  badge: {
    backgroundColor: colors.badgeBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
});
