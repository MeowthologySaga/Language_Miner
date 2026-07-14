import type { AppLocale } from "./appLocale";
import type {
  CardTutorialAction,
  CardTutorialModule,
  CardTutorialModuleId,
  CardTutorialStep
} from "./shared/cardTutorial";

type ModuleCopy = Pick<CardTutorialModule, "title" | "description" | "goalLabel">;
type StepCopy = Pick<
  CardTutorialStep,
  "navLabel" | "title" | "goal" | "coach" | "appLocation" | "progressLabels" | "completionText"
>;
type ActionCopy = Pick<CardTutorialAction, "label" | "targetLabel" | "hint"> & {
  doneLabel?: string;
};

const englishModuleCopy = {
  inputReading: {
    title: "Reading Cards",
    description: "Practice translation, vocabulary, sentence structure, and similar expressions in order.",
    goalLabel: "Capture sentences that block comprehension"
  },
  inputListening: {
    title: "Listening Cards",
    description: "Break sentences into sound chunks, identify what you missed, and practice dictation.",
    goalLabel: "Capture sections you could not hear"
  },
  output: {
    title: "Speaking Cards",
    description: "Learn a sentence you want to use, its pronunciation, and variations in conversation context.",
    goalLabel: "Collect expressions to use later"
  },
  review: {
    title: "Cards & Review",
    description: "Find saved cards, understand automatic review timing, and finish with daily missions.",
    goalLabel: "Understand saved cards and the review loop"
  }
} as const satisfies Record<CardTutorialModuleId, ModuleCopy>;

const englishStepCopy = {
  "web-reading": {
    navLabel: "Web Reader",
    title: "Create a Reading Card in Web Reader",
    goal:
      "Web Reader lets you read a webpage inside the app and turn useful expressions into card candidates immediately. Open Web Reader, select running a little late in I’m running a little late., and create a Sentence Card.",
    coach:
      "Your first exercise is a Reading Card. A new card starts with the translation, then moves through vocabulary detail, color-coded sentence structure, and similar expressions.",
    appLocation: "Read & Listen · Input > Web Reader",
    progressLabels: ["Open", "Select phrase", "Create card", "Save card"],
    completionText: "You turned I’m running a little late. into a Reading Card and added it."
  },
  "pdf-etymology": {
    navLabel: "Document Reader",
    title: "Create a Reading Card in Document Reader",
    goal:
      "Document Reader lets you read long documents such as PDFs and turn unfamiliar words or expressions into card candidates. Open Document Reader, select a word in the sample PDF sentence, and create a Reading Card.",
    coach:
      "Cards created in Document Reader use the same Reading Card template: translation, selected vocabulary, sentence structure, then similar-expression comparison.",
    appLocation: "Read & Listen · Input > Document Reader",
    progressLabels: ["Open", "Select", "Create card", "Save card"],
    completionText: "You selected an unfamiliar word in Document Reader and created a Reading Card."
  },
  "listening-loop": {
    navLabel: "Listening Loop",
    title: "Create a Listening Card in Listening Loop",
    goal:
      "Open Listening Loop, mark the expression that is hard to hear, then press R to save a Listening Card.",
    coach:
      "A Listening Card plays the full sentence and each sound chunk separately, then combines pronunciation, IPA, reasons you may have missed it, and a short dictation exercise.",
    appLocation: "Read & Listen · Input > Listening Loop",
    progressLabels: ["Open", "Select segment", "F highlight", "R save", "Preview"],
    completionText: "You created a Listening Card with sound chunks, likely listening obstacles, and dictation."
  },
  "video-reader": {
    navLabel: "Video Reader",
    title: "Create a Listening Card in Video Reader",
    goal:
      "Open Video Reader and select was going to, shortcut, and had already started running in the sample subtitles, then create a card for the segment.",
    coach:
      "Video Reader uses the same Listening Card template. You can replay the full sentence and sound chunks together with the source video segment.",
    appLocation: "Read & Listen · Input > Video Reader",
    progressLabels: ["Open", "Phrase 1", "Phrase 2", "Phrase 3", "Create card", "Confirm"],
    completionText: "You created a Listening Card from a subtitle segment in Video Reader."
  },
  "life-capture": {
    navLabel: "Conversation capture",
    title: "See how real conversations become Life Mining candidates",
    goal:
      "See how messages you type in a Web Reader LLM conversation and Discord can become Life Mining candidates.",
    coach:
      "It can be hard to remember what you often say when you sit down to make cards. Life Mining collects messages you actually typed so you can later turn useful ones into Speaking Cards.",
    appLocation: "Web Reader LLM / Discord > Life Mining candidates",
    progressLabels: ["Speaking Cards", "Open chat", "LLM message", "Discord message", "Check candidate"],
    completionText: "You saw why and how your own messages from real conversations can become Life Mining candidates."
  },
  "life-output": {
    navLabel: "Life Mining",
    title: "Create a Speaking Card with Life Mining",
    goal:
      "Open Life Mining and turn the Korean reply you wrote into an English Speaking Card.",
    coach:
      "A Speaking Card combines messenger-style context, playback for each bubble, key chunks, adaptive insight, sentence structure, alternatives, and speaking practice.",
    appLocation: "Speak & Write · Output > Life Mining",
    progressLabels: ["Open", "Select candidate", "Create card", "Confirm"],
    completionText: "You created a Speaking Card from a phrase drawn from a real conversation."
  },
  "cards-overview": {
    navLabel: "Cards",
    title: "Find the cards you created",
    goal: "Open Cards from the left navigation and see where the cards you created are collected.",
    coach:
      "Cards created in readers, listening, and Life Mining collect on the Cards screen. Open one here, then continue into its review deck.",
    appLocation: "Manage > Cards",
    progressLabels: ["Open", "Select card", "Inspect card"],
    completionText: "You found your created cards and saw how they continue into review decks."
  },
  "review-intro": {
    navLabel: "Review",
    title: "Bring cards back through review",
    goal: "Open Review and see how cards flow into separate review queues by deck.",
    coach:
      "Review separates created cards into Reading, Listening, and Speaking decks. Recall from the front, reveal the back, then rate how well you remembered.",
    appLocation: "Review",
    progressLabels: ["Open", "Start review", "Reveal answer", "Rate"],
    completionText: "You followed a card into its review deck, revealed the answer, and rated your recall."
  },
  "today-mission": {
    navLabel: "Today",
    title: "Check daily missions and diamonds",
    goal:
      "Open Today and see how learning activity contributes to daily missions and diamond rewards.",
    coach:
      "Today is your workspace for the next useful task. Reading, listening, speaking, and review activity fills daily missions and can earn diamonds.",
    appLocation: "Today",
    progressLabels: ["Open", "Check missions", "Finish"],
    completionText: "You saw how learning activity contributes to daily missions and diamond rewards."
  }
} as const satisfies Record<string, StepCopy>;

const englishActionCopy = {
  "intro-language-loop": action(
    "View the learning loop",
    "Learning loop reviewed",
    "Language-learning loop",
    "Notes saved for later are easy to lose. Language Miner turns useful sentences into cards that are ready to review."
  ),
  "intro-card-types": action(
    "View the three card types",
    "Card types reviewed",
    "Three card types",
    "Reading and Listening Cards record what you could not understand or hear. Speaking Cards collect expressions you want to use yourself."
  ),
  "open-web-reader": action(
    "Open Web Reader",
    "Web Reader opened",
    "Web Reader",
    "Choose Web Reader under Read & Listen · Input to turn an unfamiliar expression on a webpage into a Reading Card."
  ),
  "select-running-late": action(
    "Drag running a little late",
    "running a little late selected",
    "running a little late",
    "Drag over a phrase you want to use yourself. For this exercise, select running a little late in I’m running a little late."
  ),
  "build-reading-card": action(
    "Create sentence card",
    "Reading Card preview created",
    "Sentence card",
    "Choose Sentence Card to put the complete sentence I’m running a little late. into the preview."
  ),
  "save-reading-card": action(
    "Add card",
    "Card added",
    "Add card",
    "Review the preview, then choose Add card. Next you will create one from a PDF sentence."
  ),
  "open-pdf-reader": action(
    "Open Document Reader",
    "Document Reader opened",
    "Document Reader",
    "Choose Document Reader under Read & Listen · Input. It turns words or expressions selected in a PDF into card candidates."
  ),
  "select-inanimate": action(
    "Select inanimate",
    "inanimate selected",
    "inanimate",
    "Select an unfamiliar word in the PDF. Choose inanimate; the card adds useful explanations from its context."
  ),
  "build-etymology-card": action(
    "Create card",
    "Reading Card preview created",
    "Create card",
    "Choose the sentence-card button beside the selected word. The result appears near the selection."
  ),
  "save-etymology-card": action(
    "Add card",
    "Card added",
    "Add card",
    "Review the preview, then choose Add card."
  ),
  "intro-listening-reading-sources": action(
    "Find Reading Cards",
    "Reading Card location reviewed",
    "Reading Cards",
    "Web Reader and Document Reader both let you save unfamiliar words and expressions as Reading Cards."
  ),
  "intro-listening-purpose": action(
    "Meet Listening Cards",
    "Listening Card introduced",
    "Listening Cards",
    "A Listening Card helps you review the actual sound with full-sentence audio, sound chunks, pronunciation, IPA, listening obstacles, and dictation."
  ),
  "intro-listening-tools": action(
    "Find Listening Card tools",
    "Listening tools reviewed",
    "Listening Loop and Video Reader",
    "Create Listening Cards from recommended clips in Listening Loop or from a video you choose in Video Reader."
  ),
  "open-listening-loop": action(
    "Open Listening Loop",
    "Listening Loop opened",
    "Listening Loop",
    "Choose Listening Loop under Read & Listen · Input."
  ),
  "select-listening-segment": action(
    "Select going to",
    "going to selected",
    "going to",
    "Select the part that was hard to hear. In this exercise, select going to."
  ),
  "mark-sound-points": action(
    "F highlight",
    "Hard-to-hear segment marked",
    "F highlight",
    "Press F to highlight a selected sound that was hard to hear. This optional mark helps you remember the problem during review."
  ),
  "build-listening-card": action(
    "R save sentence",
    "Listening Card preview created",
    "R save sentence",
    "Press R to save the current sentence as a Listening Card. The real screen saves immediately; the tutorial shows one preview."
  ),
  "continue-after-listening-card": action(
    "Confirm Listening Card",
    "Listening Card confirmed",
    "Confirm Listening Card",
    "Review the tutorial preview, then continue. In the real Listening Loop, pressing R saves directly without this preview."
  ),
  "open-video-reader": action(
    "Open Video Reader",
    "Video Reader opened",
    "Video Reader",
    "Choose Video Reader under Read & Listen · Input."
  ),
  "select-video-was-going-to": action(
    "Select was going to",
    "was going to selected",
    "was going to",
    "The card will include three expressions that may be hard to hear in this segment. Select was going to first."
  ),
  "select-video-shortcut": action(
    "Select shortcut",
    "shortcut selected",
    "shortcut",
    "Select shortcut next. The first syllable carries the strongest stress."
  ),
  "select-video-running": action(
    "Select had already started running",
    "had already started running selected",
    "had already started running",
    "Select had already started running to preserve the whole expression for an action that had begun earlier."
  ),
  "build-video-card": action(
    "Create card for this segment",
    "Video Listening Card created",
    "Create card for this segment",
    "Create a Listening Card from the selected subtitle expressions and the current video segment."
  ),
  "continue-after-video-card": action(
    "Confirm video card",
    "Video Listening Card confirmed",
    "Confirm and continue",
    "Review the generated Video Listening Card preview, then continue."
  ),
  "intro-output-transition": action(
    "Meet Speaking Cards",
    "Speaking Card introduced",
    "Speaking Card introduction",
    "Input helps you recognize expressions; Speaking Cards help you learn how to say things you often express in your native language."
  ),
  "intro-life-mining-purpose": action(
    "Why Life Mining?",
    "Life Mining introduced",
    "Life Mining introduction",
    "It is hard to remember what you say often when you sit down to make cards. Life Mining can collect messages you actually typed as candidates."
  ),
  "intro-life-mining-sources": action(
    "See capture sources",
    "Capture sources introduced",
    "Capture sources",
    "This exercise uses messages typed in ChatGPT on the web or Discord. Turn a candidate you want to remember into a Speaking Card."
  ),
  "open-life-capture-source": action(
    "Open Web Reader chat",
    "Chat opened",
    "Web Reader",
    "Open the sample LLM conversation in Web Reader and type as you normally would."
  ),
  "send-life-capture-message": action(
    "Press Enter to collect input",
    "Web Reader LLM input collected",
    "Enter",
    "Press Enter in the sample field. Your Korean message appears as if it had arrived as a Life Mining candidate."
  ),
  "send-discord-capture-message": action(
    "Press Enter in Discord",
    "Discord input collected",
    "Discord Enter",
    "Press Enter in the Discord sample too. Messages you type in real conversations can become Life Mining candidates."
  ),
  "confirm-life-capture": action(
    "Check candidate",
    "Capture flow confirmed",
    "Check Life Mining candidate",
    "Confirm that the message you just typed appears in the candidate preview on the right, then continue."
  ),
  "open-life-mining": action(
    "Open Life Mining",
    "Life Mining opened",
    "Life Mining",
    "Choose Life Mining under Speak & Write · Output to practice turning something you wanted to say into an English card."
  ),
  "select-life-reply": action(
    "Select my Korean reply",
    "My reply selected",
    "I'll be there soon…",
    "Select the Korean reply you typed earlier from the candidate list."
  ),
  "build-output-card": action(
    "Create English card",
    "Speaking Card preview created",
    "Create English card",
    "Choose something you say often from the collected candidates and turn it into an English Speaking Card."
  ),
  "save-output-card": action(
    "View in card list",
    "Speaking Card confirmed",
    "View in card list",
    "Review the Speaking Card preview, then continue to the card list."
  ),
  "open-cards": action(
    "Open Cards",
    "Cards opened",
    "Cards",
    "Choose Cards under Manage in the left navigation."
  ),
  "inspect-first-card": action(
    "Inspect a card",
    "Card inspected",
    "I’m running a little late. card",
    "Select the Reading Card you just created from the list and inspect its full details."
  ),
  "confirm-cards-overview": action(
    "Continue to Review",
    "Card list confirmed",
    "Continue to Review",
    "After checking the real card view on the right, continue to the review step."
  ),
  "open-review": action(
    "Open Review",
    "Review opened",
    "Review",
    "Choose Review in the left navigation."
  ),
  "start-review-session": action(
    "Start review",
    "Review session started",
    "Start review",
    "Choose Start review on the Reading Deck to open the sample card."
  ),
  "show-review-back": action(
    "Reveal answer",
    "Back revealed",
    "Reveal answer",
    "Recall the meaning from the front, then choose Reveal answer on the card."
  ),
  "rate-review-card": action(
    "Rate recall",
    "Review rating complete",
    "Review rating buttons",
    "After checking the answer, choose Again, Hard, Good, or Easy to set the next review interval."
  ),
  "open-today": action(
    "Open Today",
    "Today opened",
    "Today",
    "Choose Today at the top of the left navigation."
  ),
  "inspect-daily-missions": action(
    "View daily missions",
    "Daily missions reviewed",
    "Daily missions",
    "Review the daily missions. Creating cards, listening, Life Mining, and review can earn diamonds."
  ),
  finish: action(
    "Finish guide",
    "Guide complete",
    "Finish guide",
    "Finish the guide and return to Cards."
  )
} as const satisfies Record<string, ActionCopy>;

function action(label: string, doneLabel: string, targetLabel: string, hint: string): ActionCopy {
  return { label, doneLabel, targetLabel, hint };
}

export function localizeCardTutorialModules(
  locale: AppLocale,
  modules: readonly CardTutorialModule[]
): CardTutorialModule[] {
  if (locale !== "en") {
    return [...modules];
  }
  return modules.map((module) => ({ ...module, ...englishModuleCopy[module.id] }));
}

export function localizeCardTutorialSteps(
  locale: AppLocale,
  steps: readonly CardTutorialStep[]
): CardTutorialStep[] {
  if (locale !== "en") {
    return [...steps];
  }
  return steps.map((step) => {
    const stepCopy = englishStepCopy[step.id as keyof typeof englishStepCopy];
    return {
      ...step,
      ...(stepCopy ?? {}),
      actions: step.actions.map((tutorialAction) => ({
        ...tutorialAction,
        ...(englishActionCopy[tutorialAction.id as keyof typeof englishActionCopy] ?? {})
      }))
    };
  });
}
