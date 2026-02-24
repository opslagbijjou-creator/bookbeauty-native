export const SUPER_ADMIN_UID = "XSf53YUdrNMtEXB1UAdLpieoLTi2";

export function isRootAdminIdentity(params: {
  uid?: string | null;
  email?: string | null;
}): boolean {
  const uid = String(params.uid ?? "").trim();
  return uid === SUPER_ADMIN_UID;
}
