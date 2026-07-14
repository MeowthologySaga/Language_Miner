import { rendererPrivacyLifecycle, type RendererPrivacyLifecycle } from "../../rendererPrivacyLifecycle";
import type { LLMProvider } from "./types";

export function createPrivacyGuardedProvider(
  provider: LLMProvider,
  lifecycle: RendererPrivacyLifecycle = rendererPrivacyLifecycle
): LLMProvider {
  return {
    name: provider.name,
    setUsageObserver(observer) {
      const observerEpoch = lifecycle.captureEpoch();
      provider.setUsageObserver?.((observation) => {
        if (lifecycle.canCommit(observerEpoch)) observer(observation);
      });
    },
    testConnection() {
      return runPrivacyGuardedJob(lifecycle, () => provider.testConnection());
    },
    generateReadingCard(input) {
      return runAbortableProviderJob(lifecycle, input, (nextInput) =>
        provider.generateReadingCard(nextInput)
      );
    },
    generateLifeExpressionCard(input) {
      return runAbortableProviderJob(lifecycle, input, (nextInput) =>
        provider.generateLifeExpressionCard(nextInput)
      );
    },
    generateCharacterChatReply(input) {
      return runAbortableProviderJob(lifecycle, input, (nextInput) =>
        provider.generateCharacterChatReply(nextInput)
      );
    }
  };
}

async function runAbortableProviderJob<TInput extends { signal?: AbortSignal }, TResult>(
  lifecycle: RendererPrivacyLifecycle,
  input: TInput,
  run: (input: TInput) => Promise<TResult>
) {
  return runPrivacyGuardedJob(lifecycle, async (privacySignal) => {
    const linkedSignal = linkAbortSignals(privacySignal, input.signal);
    try {
      return await run({ ...input, signal: linkedSignal.signal });
    } finally {
      linkedSignal.release();
    }
  });
}

async function runPrivacyGuardedJob<TResult>(
  lifecycle: RendererPrivacyLifecycle,
  run: (signal: AbortSignal) => Promise<TResult>
) {
  const job = lifecycle.createJob();
  if (job.controller.signal.aborted) {
    job.release();
    throw createPrivacyAbortError();
  }
  try {
    const result = await run(job.controller.signal);
    if (!lifecycle.canCommit(job.epoch)) throw createPrivacyAbortError();
    return result;
  } finally {
    job.release();
  }
}

function linkAbortSignals(primary: AbortSignal, secondary?: AbortSignal) {
  if (!secondary) {
    return { signal: primary, release: () => undefined };
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (primary.aborted || secondary.aborted) {
    controller.abort();
  } else {
    primary.addEventListener("abort", abort, { once: true });
    secondary.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    release: () => {
      primary.removeEventListener("abort", abort);
      secondary.removeEventListener("abort", abort);
    }
  };
}

function createPrivacyAbortError() {
  const error = new Error("The renderer privacy lifecycle stopped this language-model request.");
  error.name = "AbortError";
  return error;
}
