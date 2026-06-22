import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  fetchPortalProfile,
  getDefaultProfileValues,
  getProfileInitials,
  getProfilePhotoUrl,
  type PortalProfile,
} from "@/lib/portal-profile";

export function usePortalProfile(user: User | null | undefined) {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(user?.id));

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchPortalProfile(user.id)
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const photoUrl = useMemo(
    () => getProfilePhotoUrl(profile?.profile_photo_path, profile?.updated_at),
    [profile?.profile_photo_path, profile?.updated_at],
  );

  const initials = useMemo(() => {
    if (profile) {
      return getProfileInitials(profile.first_name, profile.last_name);
    }
    const defaults = getDefaultProfileValues(user ?? null);
    return getProfileInitials(defaults.firstName, defaults.lastName);
  }, [profile, user]);

  const displayName = useMemo(() => {
    if (profile) {
      const name = `${profile.first_name} ${profile.last_name}`.trim();
      if (name) return name;
    }
    return user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";
  }, [profile, user]);

  return { profile, photoUrl, initials, displayName, loading };
}
