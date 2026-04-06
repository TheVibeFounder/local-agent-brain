export function isCapabilityAllowed(mode, capability) {
  const currentMode = mode ?? "local-only";

  if (currentMode === "local-only") {
    if (capability.startsWith("model.cloud:")) {
      return false;
    }

    if (capability.startsWith("network.fetch:")) {
      return capability === "network.fetch:loopback" || capability === "network.fetch:local";
    }
  }

  return true;
}

export function assertCapabilityAllowed(config, capability) {
  if (!isCapabilityAllowed(config.mode, capability)) {
    throw new Error(`Capability denied by mode ${config.mode}: ${capability}`);
  }
}
