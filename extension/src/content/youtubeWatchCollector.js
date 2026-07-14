(function setupYoutubeWatchCollector() {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const MIN_WATCH_SECONDS = 25;
  const MIN_PROGRESS_RATIO = 0.18;
  const SCAN_INTERVAL_MS = 2_000;
  const RESEND_INTERVAL_MS = 60_000;

  let activeVideoId = "";
  let watchedSeconds = 0;
  let lastTickAt = 0;
  let lastSentAt = 0;
  let sentForVideo = false;
  let siteEnabled = false;

  refreshSiteEnabled();
  window.setInterval(tick, SCAN_INTERVAL_MS);
  window.setInterval(refreshSiteEnabled, 30_000);
  document.addEventListener("yt-navigate-finish", resetIfVideoChanged);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void sendCandidate("hidden");
    }
  });
  window.addEventListener("pagehide", () => {
    void sendCandidate("pagehide");
  });

  function tick() {
    if (!siteEnabled) {
      return;
    }

    resetIfVideoChanged();
    const video = getVideoElement();
    if (!video || !activeVideoId) {
      return;
    }

    const now = Date.now();
    if (lastTickAt && !video.paused && !video.ended && document.visibilityState === "visible") {
      watchedSeconds += Math.min(5, Math.max(0, (now - lastTickAt) / 1000));
    }
    lastTickAt = now;

    const progressRatio = getProgressRatio(video);
    if (
      watchedSeconds >= MIN_WATCH_SECONDS ||
      progressRatio >= MIN_PROGRESS_RATIO ||
      (sentForVideo && now - lastSentAt >= RESEND_INTERVAL_MS)
    ) {
      void sendCandidate("watch");
    }
  }

  function resetIfVideoChanged() {
    const videoId = getCurrentVideoId();
    if (videoId === activeVideoId) {
      return;
    }
    activeVideoId = videoId;
    watchedSeconds = 0;
    lastTickAt = 0;
    lastSentAt = 0;
    sentForVideo = false;
  }

  async function sendCandidate(trigger) {
    if (!siteEnabled) {
      return;
    }

    const video = getVideoElement();
    const videoId = activeVideoId || getCurrentVideoId();
    const title = readTitle();
    if (!videoId || !title || !video) {
      return;
    }

    const progressRatio = getProgressRatio(video);
    if (!sentForVideo && watchedSeconds < MIN_WATCH_SECONDS && progressRatio < MIN_PROGRESS_RATIO) {
      return;
    }

    const now = Date.now();
    if (sentForVideo && now - lastSentAt < RESEND_INTERVAL_MS) {
      return;
    }

    const channel = readChannel();
    const payload = {
      sourceType: "youtube_extension",
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      channelName: channel.name,
      channelUrl: channel.url,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
      watchedSeconds: Math.round(watchedSeconds),
      progressRatio,
      lastPositionSeconds: Number.isFinite(video.currentTime) ? video.currentTime : undefined,
      collectedAt: new Date().toISOString(),
      metadata: {
        trigger,
        pageTitle: document.title,
        extensionVersion: "0.2.0"
      }
    };

    lastSentAt = now;
    sentForVideo = true;
    await sendRuntimeMessage({
      type: "LEM_YOUTUBE_WATCH_CAPTURE",
      payload
    });
  }

  function getCurrentVideoId() {
    try {
      const url = new URL(window.location.href);
      if (!url.hostname.includes("youtube.com") || url.pathname !== "/watch") {
        return "";
      }
      const value = url.searchParams.get("v") || "";
      return /^[A-Za-z0-9_-]{6,20}$/.test(value) ? value : "";
    } catch {
      return "";
    }
  }

  function getVideoElement() {
    return document.querySelector("video.html5-main-video") || document.querySelector("video");
  }

  function getProgressRatio(video) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, video.currentTime / video.duration));
  }

  function readTitle() {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "ytd-watch-metadata h1 yt-formatted-string",
      "h1.title yt-formatted-string",
      "h1"
    ];
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) {
        return text.replace(/\s+/g, " ").slice(0, 240);
      }
    }
    return document.title.replace(/ - YouTube$/, "").trim().slice(0, 240);
  }

  function readChannel() {
    const selectors = [
      "#owner #channel-name a",
      "ytd-watch-metadata ytd-channel-name a",
      "ytd-video-owner-renderer ytd-channel-name a"
    ];
    for (const selector of selectors) {
      const anchor = document.querySelector(selector);
      const name = anchor?.textContent?.trim().replace(/\s+/g, " ");
      if (name) {
        return {
          name,
          url: anchor.href || undefined
        };
      }
    }
    return {
      name: undefined,
      url: undefined
    };
  }

  async function refreshSiteEnabled() {
    const response = await sendRuntimeMessage({
      type: "LEM_GET_BRIDGE_SETTINGS"
    });
    siteEnabled =
      response?.lifeMiningEnabled === true &&
      response?.browserCaptureSiteSettings?.youtube === true;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false });
            return;
          }
          resolve(response || { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });
  }
})();
