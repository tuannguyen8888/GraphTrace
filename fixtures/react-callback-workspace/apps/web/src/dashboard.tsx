import { useCallback, useEffect, useState } from "react";

const services = {
  profile: {
    loadProfile(userId: string) {
      return { userId };
    },
    saveProfile(payload: { userId: string; name: string }) {
      return payload;
    },
  },
};

export function Dashboard({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const loadProfile = useCallback(() => {
    return services.profile.loadProfile(userId);
  }, [userId]);
  const handleSubmit = useCallback(
    (event: { preventDefault(): void }) => {
      event.preventDefault();
      return services.profile.saveProfile({ userId, name });
    },
    [userId, name],
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(event) => setName(event.target.value)} />
    </form>
  );
}
