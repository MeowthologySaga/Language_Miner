export function createAsyncMutationQueue() {
  let tail = Promise.resolve();
  return function runMutation(operation) {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
