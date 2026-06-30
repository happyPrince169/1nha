// ---------------------------------------------------------------------------
// Property Detail — GET /api/properties/[id] (+ /images for read-only thumbs).
// Read-only. Shows only fields already present in the API payload; nothing is
// invented. Internal broker notes are clearly separated.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchProperty, fetchPropertyImages, isAuthError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { RootStackParamList } from "@/navigation/types";
import type { PropertyImage, PropertyRecord } from "@/lib/types";
import {
  formatArea,
  formatPrice,
  legalStatusLabel,
  orDash,
  propertyTypeLabel,
  statusLabel,
} from "@/lib/format";
import { colors } from "@/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PropertyDetail">;

export function PropertyDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { session, signOut } = useAuth();
  const currentUserId = session?.user?.id ?? null;

  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Property is required; images are best-effort (don't fail the screen).
      const record = await fetchProperty(id);
      setProperty(record);
      try {
        const result = await fetchPropertyImages(id);
        setImages(result.images.filter((img) => img.url));
      } catch {
        setImages([]);
      }
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Không tải được nguồn này.");
    } finally {
      setLoading(false);
    }
  }, [id, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !property) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "Không tìm thấy nguồn."}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const p = property;
  const location = [p.street, p.ward, p.district, p.city]
    .filter((v) => v && v.trim().length > 0)
    .join(", ");
  const assigneeLabel = p.assigned_to
    ? p.assigned_to === currentUserId
      ? "Bạn phụ trách"
      : "Thành viên khác phụ trách"
    : "Chưa phân công";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{p.title}</Text>
      <View style={styles.badgeRow}>
        <Badge text={propertyTypeLabel(p.property_type)} />
        <Badge text={statusLabel(p.status)} />
      </View>

      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
          contentContainerStyle={styles.galleryContent}
        >
          {images.map((img) => (
            <Image
              key={img.id}
              source={{ uri: img.url ?? undefined }}
              style={styles.thumb}
              resizeMode="cover"
              accessibilityLabel={img.alt_text ?? img.caption ?? "Ảnh nguồn"}
            />
          ))}
        </ScrollView>
      )}

      <Section title="Thông tin chính">
        <Field label="Giá" value={formatPrice(p.price)} />
        <Field label="Diện tích" value={formatArea(p.area)} />
        <Field label="Vị trí" value={orDash(location)} />
        <Field label="Phòng ngủ" value={numOrDash(p.bedrooms)} />
        <Field label="Phòng tắm" value={numOrDash(p.bathrooms)} />
        <Field label="Hướng nhà" value={orDash(p.house_direction)} />
        <Field label="Mặt tiền" value={p.frontage ? `${p.frontage} m` : "—"} />
        <Field label="Đường vào" value={p.alley_width ? `${p.alley_width} m` : "—"} />
      </Section>

      <Section title="Phân công">
        <Field label="Người phụ trách" value={assigneeLabel} />
      </Section>

      <Section title="Pháp lý & quy hoạch">
        <Field label="Tình trạng pháp lý" value={legalStatusLabel(p.legal_status)} />
        {p.planning_note ? (
          <Field label="Ghi chú quy hoạch" value={p.planning_note} />
        ) : null}
      </Section>

      {(p.description || p.strengths || p.weaknesses) && (
        <Section title="Mô tả">
          {p.description ? <Paragraph value={p.description} /> : null}
          {p.strengths ? <Field label="Điểm mạnh" value={p.strengths} /> : null}
          {p.weaknesses ? <Field label="Điểm yếu" value={p.weaknesses} /> : null}
        </Section>
      )}

      {(p.owner_note || p.planning_note) && (
        <Section title="Ghi chú nội bộ">
          <Text style={styles.internalHint}>
            Chỉ dành cho nội bộ — không dùng khi đăng bài.
          </Text>
          {p.owner_note ? <Field label="Ghi chú chủ nhà" value={p.owner_note} /> : null}
        </Section>
      )}
    </ScrollView>
  );
}

function numOrDash(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function Paragraph({ value }: { value: string }) {
  return <Text style={styles.paragraph}>{value}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  gallery: { marginTop: 4 },
  galleryContent: { gap: 10, paddingRight: 8 },
  thumb: {
    width: 140,
    height: 105,
    borderRadius: 10,
    backgroundColor: colors.badgeBg,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  sectionBody: { gap: 10 },
  field: { gap: 2 },
  fieldLabel: { fontSize: 12, color: colors.muted },
  fieldValue: { fontSize: 15, color: colors.text },
  paragraph: { fontSize: 15, color: colors.text, lineHeight: 22 },
  internalHint: { fontSize: 12, color: colors.danger },
  errorText: { color: colors.danger, fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  badge: {
    backgroundColor: colors.badgeBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
});
