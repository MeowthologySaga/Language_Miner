import { describe, expect, it, vi } from "vitest";
import {
  PlayZoneManagedFileWriteBlockedError,
  PlayZoneManagedFileWriterCoordinator,
  PrivacyManagedDataWriterDrainTimeoutError
} from "./playZoneManagedFileWriterCoordinator";

describe("PlayZoneManagedFileWriterCoordinator", () => {
  it("atomically blocks new writers and drains a writer that already started", async () => {
    const coordinator = new PlayZoneManagedFileWriterCoordinator();
    let finishWriter!: () => void;
    const writer = coordinator.run(
      () => new Promise<void>((resolve) => {
        finishWriter = resolve;
      })
    );

    expect(coordinator.activeWriterCount).toBe(1);
    const block = coordinator.blockNewWrites();
    const rejectedWrite = vi.fn();
    await expect(coordinator.run(rejectedWrite)).rejects.toBeInstanceOf(
      PlayZoneManagedFileWriteBlockedError
    );
    expect(rejectedWrite).not.toHaveBeenCalled();

    let drained = false;
    const drain = block.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    finishWriter();
    await writer;
    await drain;
    expect(coordinator.activeWriterCount).toBe(0);

    block.release();
    await expect(coordinator.run(() => "allowed again")).resolves.toBe("allowed again");
  });

  it("keeps a released block idempotent and rejects overlapping deletion blocks", () => {
    const coordinator = new PlayZoneManagedFileWriterCoordinator();
    const block = coordinator.blockNewWrites();
    expect(() => coordinator.blockNewWrites()).toThrow(/already blocked/i);
    block.release();
    block.release();
    expect(coordinator.isBlocked).toBe(false);
  });

  it("invalidates picker intents captured before a deletion even after the block is released", async () => {
    const coordinator = new PlayZoneManagedFileWriterCoordinator();
    const stalePickerIntent = coordinator.captureWriteIntent();
    const block = coordinator.blockNewWrites();
    await block.drain();
    block.release();

    await expect(
      coordinator.run(() => "late picker write", stalePickerIntent)
    ).rejects.toBeInstanceOf(PlayZoneManagedFileWriteBlockedError);
    await expect(coordinator.run(() => "fresh write")).resolves.toBe("fresh write");
  });

  it("cancels abortable managed-data jobs and drains their settlement", async () => {
    const coordinator = new PlayZoneManagedFileWriterCoordinator();
    const active = coordinator.runAbortable(
      (signal) => new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      })
    );
    const block = coordinator.blockNewWrites();

    block.cancelActive(new Error("privacy deletion"));
    await block.drain();
    await active;
    expect(coordinator.activeWriterCount).toBe(0);
    block.release();
  });

  it("times out nonabortable drains without releasing the deletion block", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new PlayZoneManagedFileWriterCoordinator();
      let finishWriter!: () => void;
      const writer = coordinator.run(
        () => new Promise<void>((resolve) => {
          finishWriter = resolve;
        })
      );
      const block = coordinator.blockNewWrites();
      const drain = block.drain({ timeoutMs: 25 });
      const drainExpectation = expect(drain).rejects.toBeInstanceOf(
        PrivacyManagedDataWriterDrainTimeoutError
      );

      await vi.advanceTimersByTimeAsync(25);
      await drainExpectation;
      expect(coordinator.isBlocked).toBe(true);
      expect(coordinator.activeWriterCount).toBe(1);

      finishWriter();
      await writer;
      block.release();
      expect(coordinator.isBlocked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
