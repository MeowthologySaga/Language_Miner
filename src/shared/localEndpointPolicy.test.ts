import { describe, expect, it } from "vitest";
import { isLoopbackHttpUrl, isRemoteOllamaUrl } from "./localEndpointPolicy";

describe("localEndpointPolicy", () => {
  it("recognizes only explicit loopback HTTP endpoints as local", () => {
    expect(isLoopbackHttpUrl("http://localhost:11434")).toBe(true);
    expect(isLoopbackHttpUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLoopbackHttpUrl("http://127.8.9.10:11434")).toBe(true);
    expect(isLoopbackHttpUrl("http://[::1]:11434")).toBe(true);
    expect(isLoopbackHttpUrl("https://ollama.example.com")).toBe(false);
    expect(isLoopbackHttpUrl("file:///tmp/ollama")).toBe(false);
  });

  it("marks malformed and non-loopback Ollama URLs as remote", () => {
    expect(isRemoteOllamaUrl("not-a-url")).toBe(true);
    expect(isRemoteOllamaUrl("http://192.168.0.3:11434")).toBe(true);
  });
});
