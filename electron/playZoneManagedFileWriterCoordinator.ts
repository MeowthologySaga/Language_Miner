export class PlayZoneManagedFileWriteBlockedError extends Error {
  constructor() {
    super("Managed data changes are unavailable during local-data deletion.");
    this.name = "PlayZoneManagedFileWriteBlockedError";
  }
}

export class PrivacyManagedDataWriterDrainTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Managed-data writers did not settle within ${timeoutMs} ms.`);
    this.name = "PrivacyManagedDataWriterDrainTimeoutError";
  }
}

export type PrivacyManagedDataWriterDrainOptions = {
  timeoutMs?: number;
};

export type PlayZoneManagedFileWriterBlock = {
  cancelActive(reason?: unknown): void;
  drain(options?: PrivacyManagedDataWriterDrainOptions): Promise<void>;
  release(): void;
};

export type PlayZoneManagedFileWriteIntent = {
  readonly epoch: number;
};

export type PrivacyManagedDataWriterOptions = {
  cancel?(reason?: unknown): void;
};

/**
 * Serializes privacy deletion with every operation that can recreate a
 * app-managed path or learning database. JavaScript runs the blocked check and lease
 * registration without yielding, so a deletion block cannot slip between
 * those two steps.
 */
export class PlayZoneManagedFileWriterCoordinator {
  private activeWriters = new Map<symbol, PrivacyManagedDataWriterOptions>();
  private blockOwner: symbol | null = null;
  private drainWaiters = new Set<() => void>();
  private writeEpoch = 0;

  get isBlocked() {
    return this.blockOwner !== null;
  }

  get activeWriterCount() {
    return this.activeWriters.size;
  }

  captureWriteIntent(): PlayZoneManagedFileWriteIntent {
    if (this.blockOwner) throw new PlayZoneManagedFileWriteBlockedError();
    return { epoch: this.writeEpoch };
  }

  async run<T>(
    operation: () => T | Promise<T>,
    intent?: PlayZoneManagedFileWriteIntent,
    options: PrivacyManagedDataWriterOptions = {}
  ): Promise<T> {
    if (this.blockOwner || (intent && intent.epoch !== this.writeEpoch)) {
      throw new PlayZoneManagedFileWriteBlockedError();
    }

    const lease = Symbol("privacy-managed-data-writer");
    this.activeWriters.set(lease, options);
    try {
      return await operation();
    } finally {
      this.activeWriters.delete(lease);
      this.resolveDrainWaitersIfIdle();
    }
  }

  runAbortable<T>(
    operation: (signal: AbortSignal) => T | Promise<T>,
    intent?: PlayZoneManagedFileWriteIntent
  ) {
    const controller = new AbortController();
    return this.run(
      () => operation(controller.signal),
      intent,
      { cancel: (reason) => controller.abort(reason) }
    );
  }

  blockNewWrites(): PlayZoneManagedFileWriterBlock {
    if (this.blockOwner) {
      throw new Error("Privacy managed-data writes are already blocked.");
    }
    const owner = Symbol("privacy-managed-data-deletion");
    this.blockOwner = owner;
    this.writeEpoch += 1;
    let released = false;
    return {
      cancelActive: (reason) => this.cancelActiveWriters(reason),
      drain: (options) => this.waitForActiveWriters(options?.timeoutMs),
      release: () => {
        if (released) return;
        released = true;
        if (this.blockOwner === owner) this.blockOwner = null;
      }
    };
  }

  private cancelActiveWriters(reason?: unknown) {
    for (const active of this.activeWriters.values()) {
      try {
        active.cancel?.(reason);
      } catch {
        // Cancellation is best effort. The deletion path still drains the
        // operation before removing and verifying managed data.
      }
    }
  }

  private waitForActiveWriters(timeoutMs?: number) {
    if (this.activeWriters.size === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const resolveWhenIdle = () => {
        if (timeout) clearTimeout(timeout);
        resolve();
      };
      this.drainWaiters.add(resolveWhenIdle);
      if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeout = setTimeout(() => {
          this.drainWaiters.delete(resolveWhenIdle);
          reject(new PrivacyManagedDataWriterDrainTimeoutError(timeoutMs));
        }, timeoutMs);
        timeout.unref?.();
      }
    });
  }

  private resolveDrainWaitersIfIdle() {
    if (this.activeWriters.size > 0) return;
    for (const resolve of this.drainWaiters) resolve();
    this.drainWaiters.clear();
  }
}
