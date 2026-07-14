import { describe, expect, it } from "vitest";
import { findConversationSpeakerMarkers } from "./lifeConversationParser";

function splitConversation(text: string) {
  const markers = findConversationSpeakerMarkers(text);
  return markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    return {
      speaker: marker.speaker,
      text: text.slice(marker.contentStart, nextMarker?.markerStart ?? text.length).trim()
    };
  });
}

describe("lifeConversationParser", () => {
  it("splits repeated Discord speaker labels inside a captured line", () => {
    const text = [
      "DiscordUser: first message",
      "DiscordUser: second message",
      "third message? DiscordUser: fourth message"
    ].join("\n");

    expect(splitConversation(text)).toEqual([
      { speaker: "DiscordUser", text: "first message" },
      { speaker: "DiscordUser", text: "second message" },
      { speaker: "DiscordUser", text: "third message?" },
      { speaker: "DiscordUser", text: "fourth message" }
    ]);
  });

  it("keeps newly captured Discord message parts as separate bubbles", () => {
    const text = [
      "DiscordUser: first message",
      "DiscordUser: second message",
      "DiscordUser: third message",
      "DiscordUser: fourth message"
    ].join("\n");

    expect(splitConversation(text).map((message) => message.text)).toEqual([
      "first message",
      "second message",
      "third message",
      "fourth message"
    ]);
  });

  it("splits Discord speaker labels even when the captured colon has no following space", () => {
    const text = [
      "MeowMew:안녕하시고?",
      "MeowMew:이게뭐누",
      "MeowMew:왜 안 돼? MeowMew:왜 디코는 수집 안되누"
    ].join("\n");

    expect(splitConversation(text)).toEqual([
      { speaker: "MeowMew", text: "안녕하시고?" },
      { speaker: "MeowMew", text: "이게뭐누" },
      { speaker: "MeowMew", text: "왜 안 돼?" },
      { speaker: "MeowMew", text: "왜 디코는 수집 안되누" }
    ]);
  });

  it("does not split ChatGPT prose examples or JSON keys as speakers", () => {
    const text = [
      "ChatGPT: 크롬 익스텐션은 배포가 쉬운 편입니다. 예를 들어: Chrome Web Store를 쓸 수 있습니다.",
      "JSON",
      '"host_permissions": ["https://github.com/*"] 이걸 넣으면 권한 설명이 필요합니다.',
      "또 다른 예를 들어: 심사가 더 쉬운 방식도 있습니다.",
      "Me: 내 프로그램에는 크롬 익스텐션도 필요해?"
    ].join("\n");

    expect(splitConversation(text)).toEqual([
      {
        speaker: "ChatGPT",
        text: [
          "크롬 익스텐션은 배포가 쉬운 편입니다. 예를 들어: Chrome Web Store를 쓸 수 있습니다.",
          "JSON",
          '"host_permissions": ["https://github.com/*"] 이걸 넣으면 권한 설명이 필요합니다.',
          "또 다른 예를 들어: 심사가 더 쉬운 방식도 있습니다."
        ].join("\n")
      },
      { speaker: "Me", text: "내 프로그램에는 크롬 익스텐션도 필요해?" }
    ]);
  });

  it("splits different Discord speakers when they are captured in one line", () => {
    const text = [
      "link: 나 민희랑 밥먹는데 너도 같이 먹을래? MeowMew: 오 좋지",
      "link: 그러면 언제 먹을까?",
      "link: 아니 몇시에 먹을까",
      "Me: 난 아무때나 상관없다."
    ].join("\n");

    expect(splitConversation(text)).toEqual([
      { speaker: "link", text: "나 민희랑 밥먹는데 너도 같이 먹을래?" },
      { speaker: "MeowMew", text: "오 좋지" },
      { speaker: "link", text: "그러면 언제 먹을까?" },
      { speaker: "link", text: "아니 몇시에 먹을까" },
      { speaker: "Me", text: "난 아무때나 상관없다." }
    ]);
  });
});
