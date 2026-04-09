export const legacyWorker = () => "legacy";

export const legacyHooks = {
  onBoot() {
    return legacyWorker();
  },
};
