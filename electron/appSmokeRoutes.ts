export const LISTENING_RSS_MAX_DURATION_SECONDS = 10 * 60;

export type AppSmokeActionProbeResult = {
  label: string;
  selector: string;
  found: boolean;
  enabled: boolean;
  text: string;
};

export type AppSmokeRouteReport = {
  route: string;
  status: "passed" | "failed";
  titleText?: string;
  mainTextLength?: number;
  loadingIndicatorCount?: number;
  actionProbeCount?: number;
  actionProbes?: AppSmokeActionProbeResult[];
  viewportWidth?: number;
  viewportHeight?: number;
  horizontalOverflowPx?: number;
  webReaderPageHeight?: number;
  webReaderSurfaceHeight?: number;
  webReaderWebviewHeight?: number;
  webReaderGuestInnerHeight?: number;
  webReaderWebviewDebug?: string;
  webReaderPopoverDebug?: Record<string, unknown> | null;
  webReaderWindowOpenCheck?: Record<string, unknown> | null;
  webReaderSidebarMoreCheck?: Record<string, unknown> | null;
  webReaderLifeMiningCheck?: Record<string, unknown> | null;
  strayWebReaderState?: Record<string, unknown> | null;
  elapsedMs: number;
  errorCode?: string;
  error?: string;
  screenshotPath?: string;
};

export type AppSmokeRouteSnapshot = {
  route: string;
  active: boolean;
  titleText: string;
  mainText: string;
  bodyText: string;
  loadingIndicators: string[];
  leakedQaSecretFields: string[];
  secretInputIssues: string[];
  actionProbes: AppSmokeActionProbeResult[];
  viewportWidth: number;
  viewportHeight: number;
  horizontalOverflowPx: number;
  webReaderPageHeight: number;
  webReaderSurfaceHeight: number;
  webReaderWebviewHeight: number;
  webReaderGuestInnerHeight: number;
  webReaderWebviewDebug: string;
  webReaderPopoverDebug?: Record<string, unknown> | null;
  webReaderWindowOpenCheck?: Record<string, unknown> | null;
  webReaderSidebarMoreCheck?: Record<string, unknown> | null;
  webReaderLifeMiningCheck?: Record<string, unknown> | null;
  strayWebReaderState?: Record<string, unknown> | null;
  listeningRssDurationCheck?: {
    enabled: boolean;
    candidateCount: number;
    durationCount: number;
    missingDurationCount: number;
    overLimitCount: number;
    statusText: string;
    samples: Array<{
      videoId: string;
      durationSeconds: number;
      text: string;
    }>;
  };
  lifeAutoCaptureStatusText?: string;
};

export type AppSmokeRouteActionProbe = {
  label: string;
  selectors: string[];
  requireEnabled?: boolean;
};

export const appSmokeRoutes = [
  "pdfHub",
  "pdfReader",
  "webReader",
  "bookMaker",
  "cards",
  "playZone",
  "listeningLoop",
  "videoReader",
  "writingPractice",
  "characterChat",
  "review",
  "life",
  "glossary",
  "tutorial",
  "settings"
] as const;

export const appSmokeRouteActionProbes: Partial<Record<string, AppSmokeRouteActionProbe[]>> = {
  pdfHub: [
    {
      label: "today hub review action",
      selectors: ['[data-qa="today-hub-open-review"]'],
      requireEnabled: true
    },
    {
      label: "today hub life action",
      selectors: ['[data-qa="today-hub-open-life"]'],
      requireEnabled: true
    },
    {
      label: "today hub activity grass",
      selectors: ['[data-qa="today-hub-activity-grass"]']
    },
    {
      label: "hub reader action",
      selectors: ['[data-qa="pdf-hub-open-reader"]']
    },
    {
      label: "hub listening action",
      selectors: ['[data-qa="pdf-hub-open-listening"]']
    },
    {
      label: "hub video action",
      selectors: ['[data-qa="pdf-hub-open-video"]']
    }
  ],
  pdfReader: [
    {
      label: "reader workspace navigation",
      selectors: ['[data-qa="pdf-reader-pane-reader"]'],
      requireEnabled: true
    },
    {
      label: "recent documents workspace navigation",
      selectors: ['[data-qa="pdf-reader-pane-library"]'],
      requireEnabled: true
    },
    {
      label: "bookmarks workspace navigation",
      selectors: ['[data-qa="pdf-reader-pane-bookmarks"]'],
      requireEnabled: true
    },
    {
      label: "finished reader open action",
      selectors: ['[data-qa="finished-reader-open-file"]']
    },
    {
      label: "reader mode switch action",
      selectors: ['[data-qa="pdf-reader-live-tab"]']
    }
  ],
  webReader: [
    {
      label: "web reader address bar",
      selectors: ['[data-qa="web-reader-address"]'],
      requireEnabled: true
    },
    {
      label: "web reader surface",
      selectors: [
        '[data-qa="web-reader-browser-view-slot"]',
        '[data-qa="web-reader-webview"]',
        '[data-qa="web-reader-iframe"]'
      ]
    },
    {
      label: "web reader sentence card action",
      selectors: ['[data-qa="web-reader-create-card"]'],
      requireEnabled: true
    }
  ],
  bookMaker: [
    {
      label: "book maker workspace navigation",
      selectors: ['[data-qa="book-maker-pane-maker"]'],
      requireEnabled: true
    },
    {
      label: "export history workspace navigation",
      selectors: ['[data-qa="book-maker-pane-history"]'],
      requireEnabled: true
    }
  ],
  playZone: [
    {
      label: "play zone pack import action",
      selectors: ['[data-qa="play-zone-add-lem-file"]'],
      requireEnabled: true
    },
    {
      label: "play zone library folder action",
      selectors: ['[data-qa="play-zone-pick-library-folder"]'],
      requireEnabled: true
    },
    {
      label: "play zone official on-demand pack",
      selectors: ['[data-qa="play-zone-official-pack"]'],
      requireEnabled: true
    },
    {
      label: "play zone official launch action",
      selectors: ['[data-qa="play-zone-play-selected"]'],
      requireEnabled: true
    }
  ],
  cards: [
    {
      label: "cards next action",
      selectors: [
        '[data-qa="cards-empty-open-reader"]',
        '[data-card-list-item="true"]',
        '[data-qa="cards-filter-toggle"]'
      ],
      requireEnabled: true
    }
  ],
  review: [
    {
      label: "review next action",
      selectors: [
        '[data-qa="review-empty-open-reader"]',
        '[data-qa="review-start-input"]',
        '[data-qa="review-start-input-listening"]',
        '[data-qa="review-start-output"]'
      ]
    }
  ],
  writingPractice: [
    {
      label: "writing prompt action",
      selectors: ['[data-qa="writing-random-button"]', '[data-qa="writing-empty-open-reader"]']
    },
    {
      label: "writing answer action",
      selectors: ['[data-qa="writing-check-button"]', '[data-qa="writing-empty-open-cards"]']
    }
  ],
  listeningLoop: [
    {
      label: "listening primary action",
      selectors: [
        '[data-qa="listening-resume-routine"]',
        '[data-qa="listening-create-routine"]'
      ],
      requireEnabled: true
    },
    {
      label: "listening direct source action",
      selectors: ['[data-qa="listening-direct-youtube"]'],
      requireEnabled: true
    }
  ],
  videoReader: [
    {
      label: "video local file action",
      selectors: ['[data-qa="video-reader-file-button"]', '[data-qa="video-reader-file-input"]']
    },
    {
      label: "video subtitle action",
      selectors: ['[data-qa="video-reader-subtitle-button"]', '[data-qa="video-reader-subtitle-input"]']
    },
    {
      label: "video youtube action",
      selectors: ['[data-qa="video-reader-youtube-url"]', '[data-qa="video-reader-youtube-load"]']
    }
  ],
  life: [
    {
      label: "life manual add action",
      selectors: ['[data-qa="life-manual-add"]'],
      requireEnabled: true
    },
    {
      label: "life auto capture status",
      selectors: ['[data-qa="life-auto-status"]']
    },
    {
      label: "life candidate surface",
      selectors: [
        '[data-qa="life-candidate-generate"]',
        '[data-qa="life-selected-generate"]',
        '[data-qa="life-empty-state"]'
      ]
    }
  ],
  glossary: [
    {
      label: "glossary cards action",
      selectors: ['[data-qa="glossary-open-cards"]'],
      requireEnabled: true
    },
    {
      label: "glossary reader action",
      selectors: ['[data-qa="glossary-open-reader"]'],
      requireEnabled: true
    },
    {
      label: "glossary search action",
      selectors: ['[data-qa="glossary-search"]'],
      requireEnabled: true
    }
  ],
  settings: [
    {
      label: "settings search action",
      selectors: ['[data-qa="settings-search"]'],
      requireEnabled: true
    },
    {
      label: "settings category navigation",
      selectors: [".settings-navigation-list button"],
      requireEnabled: true
    },
    {
      label: "settings profile switch action",
      selectors: ['[data-qa="settings-profile-switch"]'],
      requireEnabled: true
    },
    {
      label: "settings overview",
      selectors: [".settings-overview-panel"]
    }
  ],
  characterChat: [
    {
      label: "character chat primary action",
      selectors: [".character-home-hero-actions .button.primary"],
      requireEnabled: true
    }
  ],
  tutorial: [
    {
      label: "tutorial module picker",
      selectors: ['[data-qa="tutorial-home"]']
    }
  ]
};
