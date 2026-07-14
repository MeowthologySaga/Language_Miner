"use strict";

const CLIENT_SECRET_NAME_PATTERN =
  /(?:^|_)(?:API_?KEY|KEY|SECRET|TOKEN|PASSWORD)(?:_|$)/i;

function findClientSecretEnvNames(environment) {
  return Object.entries(environment)
    .filter(
      ([name, value]) =>
        name.startsWith("VITE_") &&
        typeof value === "string" &&
        value.trim().length > 0 &&
        CLIENT_SECRET_NAME_PATTERN.test(name.slice("VITE_".length))
    )
    .map(([name]) => name)
    .sort();
}

function assertNoClientSecretEnv(environment) {
  const exposedNames = findClientSecretEnvNames(environment);
  if (exposedNames.length === 0) {
    return;
  }

  throw new Error(
    [
      "Production build blocked: client-exposed secret environment variables are configured.",
      `Remove these variables: ${exposedNames.join(", ")}.`,
      "VITE_ values are embedded in renderer assets and must never contain API keys, secrets, tokens, or passwords."
    ].join(" ")
  );
}

module.exports = {
  assertNoClientSecretEnv,
  findClientSecretEnvNames
};

if (require.main === module) {
  try {
    if (process.argv.includes("--self-test")) {
      const canary = String(process.env.LEM_BUILD_CANARY || "").trim();
      if (!canary) throw new Error("LEM_BUILD_CANARY is required for the client-secret guard self-test.");
      const forbiddenName = ["VITE", "GEMINI", "API", "KEY"].join("_");
      const detected = findClientSecretEnvNames({ [forbiddenName]: canary });
      if (detected.length !== 1 || detected[0] !== forbiddenName) {
        throw new Error("Client-secret guard self-test failed to detect its canary variable.");
      }
      let rejected = false;
      try {
        assertNoClientSecretEnv({ [forbiddenName]: canary });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Client-secret guard self-test failed to reject its canary variable.");
      process.stdout.write("Client secret environment guard self-test passed.\n");
    } else {
      assertNoClientSecretEnv(process.env);
      process.stdout.write("Client secret environment guard passed.\n");
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
