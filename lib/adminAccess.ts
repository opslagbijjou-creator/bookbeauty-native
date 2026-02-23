export const ROOT_ADMIN_UID = "mR3MZu9ankZbckM4HZ4ZLFhP8UV2";
export const ROOT_ADMIN_EMAIL = "hamza@bookbeauty.nl";

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isRootAdminIdentity(params: {
  uid?: string | null;
  email?: string | null;
}): boolean {
  const uid = String(params.uid ?? "").trim();
  const email = normalize(params.email);
  return uid === ROOT_ADMIN_UID && email === ROOT_ADMIN_EMAIL;
}
