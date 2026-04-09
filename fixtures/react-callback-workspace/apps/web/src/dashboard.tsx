import { useCallback, useEffect } from "react";

const services = {
  profile: {
    loadProfile(userId: string) {
      return { userId };
    },
  },
};

export function Dashboard({ userId }: { userId: string }) {
  const loadProfile = useCallback(() => {
    return services.profile.loadProfile(userId);
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return loadProfile;
}
