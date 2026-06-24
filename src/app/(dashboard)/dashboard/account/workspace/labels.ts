// Shared Vietnamese labels for workspace roles + types. Plain module so both
// Server Components and Client Components can import it.

export const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị",
  member: "Thành viên",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  personal: "Cá nhân",
  team: "Nhóm",
  company: "Công ty",
};

export function workspaceTypeLabel(type: string): string {
  return WORKSPACE_TYPE_LABELS[type] ?? type;
}
