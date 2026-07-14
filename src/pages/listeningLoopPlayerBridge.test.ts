import { describe, expect, it } from "vitest";
import {
  getListeningYouTubePlayerUrl,
  getYouTubePlayerErrorMessage,
  getYouTubePlayerErrorTitle
} from "./listeningLoopPlayerBridge";

describe("listeningLoopPlayerBridge", () => {
  it("builds bridge player URLs with stable loop parameters", () => {
    const url = new URL(getListeningYouTubePlayerUrl("abc 123", 1.8, 9.1, true));

    expect(url.pathname).toBe("/listening-youtube-player");
    expect(url.searchParams.get("videoId")).toBe("abc 123");
    expect(url.searchParams.get("start")).toBe("1");
    expect(url.searchParams.get("end")).toBe("10");
    expect(url.searchParams.get("loop")).toBe("1");
  });

  it("labels embedded player errors for the UI", () => {
    expect(getYouTubePlayerErrorTitle(153)).toBe("앱 내부 재생이 막힌 영상입니다");
    expect(getYouTubePlayerErrorMessage(153)).toContain("YouTube 임베드");
    expect(getYouTubePlayerErrorTitle(2)).toBe("YouTube 재생 오류");
    expect(getYouTubePlayerErrorMessage(2)).toContain("플레이어 오류 2");
  });
});
