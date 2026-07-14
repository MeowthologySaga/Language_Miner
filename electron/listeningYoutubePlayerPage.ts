import type { ServerResponse } from "node:http";
import {
  electronText,
  type ElectronAppLocale
} from "./appDialogLocalization";

export function writeListeningYouTubePlayerPage(
  response: ServerResponse,
  requestUrl: URL,
  locale: ElectronAppLocale = "ko"
) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "origin-when-cross-origin",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https://i.ytimg.com https://*.googleusercontent.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.googlevideo.com",
      "media-src https://*.googlevideo.com blob:",
      "base-uri 'none'"
    ].join("; ")
  });
  response.end(createListeningYouTubePlayerHtml(requestUrl, locale));
}

export function createListeningYouTubePlayerHtml(
  requestUrl: URL,
  locale: ElectronAppLocale = "ko"
) {
  const videoId = normalizeListeningYouTubePlayerVideoId(
    requestUrl.searchParams.get("videoId") ?? ""
  );
  const startSeconds = normalizeListeningYouTubePlayerSeconds(
    requestUrl.searchParams.get("start"),
    0
  );
  const endSeconds = normalizeListeningYouTubePlayerSeconds(
    requestUrl.searchParams.get("end"),
    startSeconds + 5
  );
  const loopEnabled = requestUrl.searchParams.get("loop") !== "0";
  const controlsEnabled = requestUrl.searchParams.get("controls") === "1";
  const initialState = {
    videoId,
    startSeconds,
    endSeconds: Math.max(endSeconds, startSeconds + 0.5),
    loopEnabled,
    controlsEnabled
  };
  const playerText = {
    preparing: electronText(locale, "listeningYouTubePreparing"),
    error: electronText(locale, "listeningYouTubeError")
  };
  const title = electronText(locale, "listeningYouTubeTitle");

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    html,
    body,
    #player {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #0f172a;
    }

    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #status {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: #0f172a;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 750;
    }

    #status.hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="player"></div>
  <div id="status" role="status" aria-live="polite">${escapeHtml(playerText.preparing)}</div>
  <script>
    const INITIAL_PLAYER_STATE = ${JSON.stringify(initialState)};
    const PLAYER_TEXT = ${JSON.stringify(playerText)};
    const HOST_SOURCE = "lem-listening-youtube-host";
    const PLAYER_SOURCE = "lem-listening-youtube-player";
    const statusNode = document.getElementById("status");
    let player = null;
    let ready = false;
    let playerState = 0;
    let currentVideoId = INITIAL_PLAYER_STATE.videoId;
    let loopRange = {
      startSeconds: INITIAL_PLAYER_STATE.startSeconds,
      endSeconds: INITIAL_PLAYER_STATE.endSeconds,
      enabled: INITIAL_PLAYER_STATE.loopEnabled
    };

    function postToHost(type, payload = {}) {
      window.parent.postMessage({ source: PLAYER_SOURCE, type, ...payload }, "*");
    }

    function setStatus(text, hidden = false) {
      if (!statusNode) {
        return;
      }
      statusNode.textContent = text;
      statusNode.classList.toggle("hidden", hidden);
    }

    function suppressCaptions() {
      for (const delay of [0, 250, 900, 1800]) {
        window.setTimeout(() => {
          try {
            player?.unloadModule?.("captions");
            player?.unloadModule?.("cc");
            player?.setOption?.("captions", "track", {});
          } catch {
            // YouTube iframe modules are best-effort and vary by embed state.
          }
        }, delay);
      }
    }

    function loadCurrentVideo(videoId, startSeconds, endSeconds, loopEnabled) {
      currentVideoId = String(videoId || "").trim();
      loopRange = {
        startSeconds: Math.max(0, Number(startSeconds) || 0),
        endSeconds: Math.max(Math.max(0, Number(startSeconds) || 0) + 0.5, Number(endSeconds) || 0),
        enabled: Boolean(loopEnabled)
      };
      if (!ready || !player || !currentVideoId) {
        return;
      }
      setStatus(PLAYER_TEXT.preparing);
      player.loadVideoById({
        videoId: currentVideoId,
        startSeconds: loopRange.startSeconds
      });
      suppressCaptions();
    }

    function handleHostCommand(event) {
      const data = event.data;
      if (!data || data.source !== HOST_SOURCE) {
        return;
      }

      if (data.type === "load") {
        loadCurrentVideo(data.videoId, data.startSeconds, data.endSeconds, data.loopEnabled);
        return;
      }

      if (data.type === "set-loop-range") {
        const startSeconds = Math.max(0, Number(data.startSeconds) || 0);
        loopRange = {
          startSeconds,
          endSeconds: Math.max(startSeconds + 0.5, Number(data.endSeconds) || startSeconds + 0.5),
          enabled: Boolean(data.loopEnabled)
        };
        return;
      }

      if (!ready || !player) {
        return;
      }

      if (data.type === "seek") {
        player.seekTo(Math.max(0, Number(data.seconds) || 0), Boolean(data.allowSeekAhead));
        return;
      }

      if (data.type === "play") {
        player.playVideo();
        return;
      }

      if (data.type === "pause") {
        player.pauseVideo();
        return;
      }

      if (data.type === "destroy") {
        player.destroy();
        player = null;
        ready = false;
      }
    }

    window.addEventListener("message", handleHostCommand);

    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player("player", {
        videoId: currentVideoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: INITIAL_PLAYER_STATE.controlsEnabled ? 1 : 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
          rel: 0,
          cc_load_policy: 0,
          playsinline: 1,
          start: Math.floor(loopRange.startSeconds)
        },
        events: {
          onReady: () => {
            ready = true;
            setStatus("", true);
            suppressCaptions();
            try {
              player.seekTo(loopRange.startSeconds, true);
            } catch {
              // The player can reject early seeks before the media is ready.
            }
            postToHost("ready");
          },
          onStateChange: (event) => {
            playerState = Number(event.data) || 0;
            postToHost("state", { state: playerState });
            if (playerState === 1) {
              setStatus("", true);
            }
          },
          onError: (event) => {
            const code = Number(event.data) || 0;
            setStatus(PLAYER_TEXT.error.replace("{code}", String(code)));
            postToHost("error", { code });
          }
        }
      });
    };

    window.setInterval(() => {
      if (!ready || !player) {
        return;
      }
      let time = 0;
      try {
        time = Number(player.getCurrentTime()) || 0;
      } catch {
        return;
      }
      postToHost("time", { currentTime: time });
      if (
        loopRange.enabled &&
        playerState === 1 &&
        (time >= loopRange.endSeconds - 0.12 || time < loopRange.startSeconds - 0.5)
      ) {
        player.seekTo(loopRange.startSeconds, true);
        player.playVideo();
      }
    }, 250);
  </script>
  <script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>`;
}

function normalizeListeningYouTubePlayerVideoId(value: string) {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{6,32}$/.test(trimmed) ? trimmed : "M7lc1UVf-VE";
}

function normalizeListeningYouTubePlayerSeconds(value: string | null, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
