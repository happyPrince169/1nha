// ---------------------------------------------------------------------------
// Assignee field context — plain (NON server-only) types so both Server
// Components and Client Components (property form, filters) can import them.
//
// Built server-side by `buildAssigneeContext` (workspace service) and passed
// down to the property form. Labels are resolved on the server so the client
// never needs the member roster RPC or any server-only helper.
// ---------------------------------------------------------------------------

export type AssigneeOption = {
  userId: string;
  /** Display label already resolved server-side (display name / email / phone). */
  label: string;
  role: string;
};

export type AssigneeContext = {
  /** The current user's id — rendered as "Tôi phụ trách". */
  currentUserId: string;
  /** Owner/Admin may assign to anyone; members are restricted to themselves. */
  canAssignOthers: boolean;
  /** Active members of the current workspace (includes the current user). */
  members: AssigneeOption[];
};
