import { getProfilePhotoUrl } from "@/lib/portal-profile";

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

interface AdminUserAvatarProps {
  name?: string;
  email?: string;
  profilePhotoPath?: string | null;
  profileUpdatedAt?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS = {
  sm: "admin-user-avatar-sm",
  md: "admin-user-avatar-md",
  lg: "admin-user-avatar-lg",
} as const;

export function AdminUserAvatar({
  name,
  email,
  profilePhotoPath,
  profileUpdatedAt,
  size = "md",
  className,
}: AdminUserAvatarProps) {
  const photoUrl = getProfilePhotoUrl(profilePhotoPath ?? null, profileUpdatedAt ?? null);
  const fallbackLabel = name?.trim() || email?.trim() || "?";
  const initials = getInitials(fallbackLabel);

  return (
    <span
      className={`admin-user-avatar ${SIZE_CLASS[size]}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="admin-user-avatar-photo" />
      ) : (
        <span className="admin-user-avatar-initials">{initials}</span>
      )}
    </span>
  );
}
