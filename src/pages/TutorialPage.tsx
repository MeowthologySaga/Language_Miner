import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  BookOpen,
  Captions,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Film,
  Gem,
  Globe2,
  Headphones,
  Home,
  Inbox,
  Languages,
  Lightbulb,
  ListChecks,
  LogOut,
  MessageSquareText,
  MonitorPlay,
  MousePointer2,
  Play,
  Radio,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Volume2,
  Wand2,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CardPreview } from "../components/CardPreview";
import { Dialog } from "../components/Dialog";
import {
  CARD_TUTORIAL_MODULES,
  createCardTutorialCards,
  createCardTutorialSteps,
  readCardTutorialCompleted,
  readCardTutorialCompletedModuleIds,
  readCardTutorialStepId,
  resetCardTutorialProgress,
  writeCardTutorialCompleted,
  writeCardTutorialCompletedModuleIds,
  writeCardTutorialStepId,
  type CardTutorialAction,
  type CardTutorialModule,
  type CardTutorialModuleId,
  type CardTutorialRuntimeState,
  type CardTutorialStep,
  type CardTutorialTab
} from "../shared/cardTutorial";
import type { ProfileId, StudyCard } from "../shared/types";
import type { RouteTranslationKey } from "../appNavigation";
import {
  localizeCardTutorialModules,
  localizeCardTutorialSteps
} from "../tutorialLocalization";
import { playStandaloneTts } from "../utils/cardTts";
import "../styles/tutorial.css";

const tutorialMascotSrc = "./tutorial/mole-guide-b-transparent.png";
const tutorialListeningPosterSrc = "./samples/listening/tutorial-room-check-scene.png";
const tutorialListeningSampleText = "I am going to check the room, then I will come back.";
const tutorialVideoReaderSampleText =
  "The guide was going to explain the shortcut, but the player had already started running.";

type TutorialPageProps = {
  profileId: ProfileId;
  onNavigate?: (route: "cards") => void;
  initialStepId?: string;
  initialActionState?: CardTutorialRuntimeState;
  initialTutorialTab?: CardTutorialTab;
};

type SandboxRouteMeta = {
  labelKey: RouteTranslationKey;
  icon: LucideIcon;
};

type SandboxNavItem = {
  key: CardTutorialTab;
  labelKey?: RouteTranslationKey;
  icon?: LucideIcon;
};

type SandboxNavSection = {
  id: string;
  titleKey: RouteTranslationKey;
  icon: LucideIcon;
  directKey?: CardTutorialTab;
  groups?: Array<{
    titleKey: RouteTranslationKey;
    items: SandboxNavItem[];
  }>;
  items?: SandboxNavItem[];
};

const sandboxRouteMeta: Record<CardTutorialTab, SandboxRouteMeta> = {
  pdfHub: { labelKey: "nav.today", icon: Home },
  webReader: { labelKey: "nav.webReader", icon: Globe2 },
  pdfReader: { labelKey: "nav.documentReader", icon: BookOpen },
  listeningLoop: { labelKey: "nav.listeningLoop", icon: Headphones },
  videoReader: { labelKey: "nav.videoReader", icon: Film },
  life: { labelKey: "nav.lifeMining", icon: Lightbulb },
  cards: { labelKey: "nav.cards", icon: CreditCard },
  review: { labelKey: "nav.review", icon: RotateCcw },
  playZone: { labelKey: "nav.playZone", icon: Gem }
};

const sandboxHomeNavItem: SandboxNavItem = {
  key: "pdfHub",
  labelKey: "nav.today",
  icon: Home
};

const sandboxNavSections: SandboxNavSection[] = [
  {
    id: "input",
    titleKey: "nav.sections.input",
    icon: Inbox,
    groups: [
      {
        titleKey: "nav.sections.reading",
        items: [{ key: "pdfReader" }, { key: "webReader" }]
      },
      {
        titleKey: "nav.sections.listening",
        items: [{ key: "listeningLoop" }, { key: "videoReader" }]
      }
    ]
  },
  {
    id: "output",
    titleKey: "nav.sections.output",
    icon: Send,
    items: [{ key: "life" }]
  },
  {
    id: "review",
    titleKey: "nav.sections.review",
    icon: ListChecks,
    directKey: "review"
  },
  {
    id: "playZone",
    titleKey: "nav.sections.playZone",
    icon: Gem,
    directKey: "playZone"
  },
  {
    id: "manage",
    titleKey: "nav.sections.manage",
    icon: SlidersHorizontal,
    items: [{ key: "cards" }]
  }
];

export function TutorialPage({
  profileId,
  onNavigate,
  initialStepId,
  initialActionState = {},
  initialTutorialTab
}: TutorialPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  const steps = useMemo(
    () => localizeCardTutorialSteps(appLocale, createCardTutorialSteps(profileId)),
    [appLocale, profileId]
  );
  const modules = useMemo(
    () => localizeCardTutorialModules(appLocale, CARD_TUTORIAL_MODULES),
    [appLocale]
  );
  const cardsById = useMemo(
    () => new Map(createCardTutorialCards(profileId).map((card) => [card.id, card])),
    [profileId]
  );
  const [initialTutorialStorage] = useState(() => {
    const wasCompleted = readCardTutorialCompleted();
    const shouldRestartCompletedTutorial = initialStepId === undefined && wasCompleted;
    return {
      completedModuleIds: shouldRestartCompletedTutorial ? [] : readCardTutorialCompletedModuleIds(),
      shouldRestartCompletedTutorial,
      storedStepId: shouldRestartCompletedTutorial ? null : initialStepId ?? readCardTutorialStepId(),
      wasCompleted
    };
  });
  const shouldStartOnHome =
    initialStepId === undefined &&
    initialTutorialTab === undefined &&
    Object.keys(initialActionState).length === 0;
  const initialStepIndex = Math.max(
    0,
    initialTutorialStorage.shouldRestartCompletedTutorial
      ? 0
      : steps.findIndex((step) => step.id === initialTutorialStorage.storedStepId)
  );
  const initialStep = steps[initialStepIndex] ?? steps[0];
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [actionState, setActionState] = useState<CardTutorialRuntimeState>(initialActionState);
  const [completedModuleIds, setCompletedModuleIds] = useState<CardTutorialModuleId[]>(
    initialTutorialStorage.completedModuleIds
  );
  const [isHomeVisible, setIsHomeVisible] = useState(shouldStartOnHome);
  const [tutorialTab, setTutorialTab] = useState<CardTutorialTab>(
    initialTutorialTab ?? getInitialTutorialTab(initialStep, initialActionState[initialStep.id] ?? [])
  );
  const [hint, setHint] = useState("");
  const [missCount, setMissCount] = useState(0);
  const [isTutorialCompleted, setIsTutorialCompleted] = useState(
    () => initialTutorialStorage.wasCompleted && !initialTutorialStorage.shouldRestartCompletedTutorial
  );

  const currentStep = steps[stepIndex] ?? steps[0];
  const completedModuleSet = new Set(completedModuleIds);
  const currentModule = getTutorialModule(currentStep.moduleId, modules);
  const currentModuleSteps = steps.filter((step) => step.moduleId === currentStep.moduleId);
  const currentModuleCompletedStepCount = currentModuleSteps.filter((step) =>
    step.actions.every((action) => (actionState[step.id] ?? []).includes(action.id))
  ).length;
  const completedActionIds = actionState[currentStep.id] ?? [];
  const completedActionSet = new Set(completedActionIds);
  const previewCard = currentStep.previewCardId ? cardsById.get(currentStep.previewCardId) ?? null : null;
  const nextTarget = getNextTarget(currentStep, completedActionSet);
  const guideText = getTutorialGuideText(
    currentStep,
    nextTarget,
    hint || nextTarget?.hint || currentStep.coach,
    t("tutorial.shell.firstMissionGuide")
  );
  const navAction = getNavAction(currentStep);
  const requiredTab = navAction?.navTargetTab ?? "pdfHub";
  const isStepComplete = currentStep.actions.every((action) => completedActionSet.has(action.id));
  const isSandboxTabReady = tutorialTab === requiredTab && (!navAction || completedActionSet.has(navAction.id));
  const completedStepCount = steps.filter((step) =>
    step.actions.every((action) => (actionState[step.id] ?? []).includes(action.id))
  ).length;
  const progressPercent = Math.round((completedStepCount / steps.length) * 100);
  const canDebugBack = !isHomeVisible && (stepIndex > 0 || completedActionIds.length > 0);
  const shouldDisableSpotlight = false;
  const shouldShowSoundPoints = currentStep.actions.some(
    (action) => action.revealsSoundPoints && completedActionSet.has(action.id)
  );
  const shouldShowPreview = Boolean(
    previewCard &&
      currentStep.actions.some((action) => action.revealsPreview && completedActionSet.has(action.id))
  );
  const ActiveIcon = isHomeVisible ? Sparkles : sandboxRouteMeta[tutorialTab].icon;

  function isActionAvailable(action: CardTutorialAction) {
    return (action.dependsOn ?? []).every((dependency) => completedActionSet.has(dependency));
  }

  function recordAction(action: CardTutorialAction) {
    setActionState((previous) => {
      const previousIds = previous[currentStep.id] ?? [];
      if (previousIds.includes(action.id)) {
        return previous;
      }
      return {
        ...previous,
        [currentStep.id]: [...previousIds, action.id]
      };
    });
  }

  function markModuleComplete(moduleId: CardTutorialModuleId) {
    setCompletedModuleIds((previous) => {
      if (previous.includes(moduleId)) {
        return previous;
      }
      const next = modules
        .map((module) => module.id)
        .filter((candidateModuleId) => candidateModuleId === moduleId || previous.includes(candidateModuleId));
      writeCardTutorialCompletedModuleIds(next);
      return next;
    });
  }

  function runAction(action: CardTutorialAction) {
    if (completedActionSet.has(action.id)) {
      setHint(action.doneLabel ?? t("tutorial.status.alreadyComplete"));
      return;
    }
    if (!isActionAvailable(action)) {
      setHint(action.hint);
      setMissCount((count) => count + 1);
      return;
    }

    if (action.navTargetTab) {
      setTutorialTab(action.navTargetTab);
    }
    recordAction(action);
    setHint(action.doneLabel ?? t("tutorial.status.actionComplete", { action: action.label }));

    if (action.virtualSave) {
      const nextCompletedActionIds = completedActionIds.includes(action.id)
        ? completedActionIds
        : [...completedActionIds, action.id];
      advanceAfterStepAction(nextCompletedActionIds, action.doneLabel ?? t("tutorial.status.complete"));
      return;
    }
    if (action.id === "finish") {
      markModuleComplete(currentStep.moduleId);
      completeTutorial();
      setIsHomeVisible(true);
    }
  }

  function handleSandboxNav(tab: CardTutorialTab) {
    const targetNavAction = currentStep.actions.find((action) => action.navTargetTab === tab);
    if (targetNavAction) {
      runAction(targetNavAction);
      return;
    }

    if (nextTarget?.navTargetTab) {
      setHint(nextTarget.hint);
    } else {
      setHint(
        t("tutorial.status.useScreenTarget", {
          target: nextTarget?.targetLabel ?? currentStep.goal
        })
      );
    }
    setMissCount((count) => count + 1);
  }

  function handleMiss() {
    setHint(nextTarget?.hint ?? currentStep.goal);
    setMissCount((count) => count + 1);
  }

  function advanceToNextStep(previousMessage?: string) {
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    if (nextIndex === stepIndex) {
      return;
    }
    const nextStep = steps[nextIndex];
    setStepIndex(nextIndex);
    writeCardTutorialStepId(nextStep.id);
    const nextCompletedActionSet = new Set(actionState[nextStep.id] ?? []);
    const nextInitialAction = getNextTarget(nextStep, nextCompletedActionSet);
    setHint(previousMessage ? nextInitialAction?.hint ?? nextStep.coach : "");
  }

  function advanceAfterStepAction(nextCompletedActionIds: string[], previousMessage?: string) {
    const isCurrentStepComplete = currentStep.actions.every((candidate) =>
      nextCompletedActionIds.includes(candidate.id)
    );
    if (!isCurrentStepComplete) {
      return;
    }
    if (!isLastStepInModule(currentStep, modules)) {
      advanceToNextStep(previousMessage);
      return;
    }
    completeCurrentModule(currentStep.moduleId, previousMessage);
  }

  function completeCurrentModule(moduleId: CardTutorialModuleId, previousMessage?: string) {
    markModuleComplete(moduleId);
    const nextStep = getFirstStepForNextModule(moduleId, steps, modules);
    if (nextStep) {
      const nextIndex = steps.findIndex((step) => step.id === nextStep.id);
      setStepIndex(Math.max(0, nextIndex));
      setTutorialTab(getInitialTutorialTab(nextStep, actionState[nextStep.id] ?? []));
      writeCardTutorialStepId(nextStep.id);
    }
    setHint(previousMessage ?? "");
    setMissCount(0);
    setIsHomeVisible(true);
  }

  function skipStep() {
    if (stepIndex >= steps.length - 1) {
      markModuleComplete(currentStep.moduleId);
      completeTutorial();
      setIsHomeVisible(true);
      return;
    }
    if (isLastStepInModule(currentStep, modules)) {
      completeCurrentModule(currentStep.moduleId, t("tutorial.status.categorySkipped"));
      return;
    }
    advanceToNextStep(t("tutorial.status.missionSkipped"));
  }

  function debugBack() {
    const currentIds = actionState[currentStep.id] ?? [];
    if (currentIds.length > 0) {
      const nextIds = currentIds.slice(0, -1);
      setActionState((previous) => ({
        ...previous,
        [currentStep.id]: nextIds
      }));
      setTutorialTab(getInitialTutorialTab(currentStep, nextIds));
      setHint(t("tutorial.status.previousAction"));
      setMissCount(0);
      return;
    }

    if (stepIndex <= 0) {
      return;
    }

    const previousIndex = stepIndex - 1;
    const previousStep = steps[previousIndex];
    const previousActionIds = actionState[previousStep.id] ?? [];
    setStepIndex(previousIndex);
    setTutorialTab(getInitialTutorialTab(previousStep, previousActionIds));
    setHint(t("tutorial.status.previousStep"));
    setMissCount(0);
    writeCardTutorialStepId(previousStep.id);
  }

  function restartTutorial() {
    setStepIndex(0);
    setActionState({});
    setCompletedModuleIds([]);
    setIsHomeVisible(true);
    setTutorialTab("pdfHub");
    setHint("");
    setMissCount(0);
    setIsTutorialCompleted(false);
    resetCardTutorialProgress(steps[0].id);
  }

  function startModule(moduleId: CardTutorialModuleId) {
    const module = getTutorialModule(moduleId, modules);
    if (isModuleLocked(module, completedModuleSet, modules)) {
      return;
    }
    const nextStep = getStepForModuleStart(
      moduleId,
      currentStep,
      steps,
      completedModuleSet,
      modules
    );
    const nextStepIndex = steps.findIndex((step) => step.id === nextStep.id);
    const defaultCompletedActionIds = getDefaultCompletedActionIdsForModule(moduleId, nextStep.id);
    const tutorialTabCompletedActionIds = [...(actionState[nextStep.id] ?? [])];
    defaultCompletedActionIds.forEach((actionId) => {
      if (!tutorialTabCompletedActionIds.includes(actionId)) {
        tutorialTabCompletedActionIds.push(actionId);
      }
    });
    setStepIndex(Math.max(0, nextStepIndex));
    setActionState((previous) => {
      const previousIds = previous[nextStep.id] ?? [];
      const mergedIds = [...previousIds];
      defaultCompletedActionIds.forEach((actionId) => {
        if (!mergedIds.includes(actionId)) {
          mergedIds.push(actionId);
        }
      });
      if (mergedIds.length === previousIds.length) {
        return previous;
      }
      return {
        ...previous,
        [nextStep.id]: mergedIds
      };
    });
    setTutorialTab(getInitialTutorialTab(nextStep, tutorialTabCompletedActionIds));
    setHint("");
    setMissCount(0);
    setIsHomeVisible(false);
    writeCardTutorialStepId(nextStep.id);
  }

  function completeTutorial() {
    writeCardTutorialCompleted();
    setIsTutorialCompleted(true);
  }

  function exitTutorial() {
    onNavigate?.("cards");
  }

  useEffect(() => {
    if (initialTutorialStorage.shouldRestartCompletedTutorial) {
      resetCardTutorialProgress(steps[0]?.id);
    }
  }, [initialTutorialStorage.shouldRestartCompletedTutorial, steps]);

  useEffect(() => {
    function handleListeningShortcuts(event: KeyboardEvent) {
      if (currentStep.id !== "listening-loop" || tutorialTab !== "listeningLoop") {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const actionId = key === "f" ? "mark-sound-points" : key === "r" ? "build-listening-card" : null;
      if (!actionId) {
        return;
      }

      const action = currentStep.actions.find((candidate) => candidate.id === actionId);
      if (!action || completedActionSet.has(action.id) || !isActionAvailable(action)) {
        return;
      }

      event.preventDefault();
      runAction(action);
    }

    window.addEventListener("keydown", handleListeningShortcuts);
    return () => window.removeEventListener("keydown", handleListeningShortcuts);
  });

  return (
    <div className="tutorial-sandbox-overlay" data-qa="tutorial-sandbox-overlay">
      <div className="app-shell tutorial-sandbox-shell" data-qa="tutorial-sandbox-shell">
        <SandboxSidebar
          activeTab={tutorialTab}
          nextTarget={nextTarget}
          onExit={exitTutorial}
          onNavigate={handleSandboxNav}
        />

        <main
          className={missCount % 2 === 1 ? "app-main tutorial-sandbox-main nudge" : "app-main tutorial-sandbox-main"}
          onClick={handleMiss}
        >
          <header className="topbar tutorial-sandbox-topbar">
            <div className="topbar-title">
              <ActiveIcon size={20} />
              <span>
                {isHomeVisible
                  ? t("nav.tutorial")
                  : t(sandboxRouteMeta[tutorialTab].labelKey)}
              </span>
            </div>
            <div className="tutorial-mode-toolbar" onClick={(event) => event.stopPropagation()}>
              <span className="tutorial-mode-pill">
                <Sparkles size={14} />
                {t("tutorial.shell.guide")}
              </span>
              <span className="tutorial-progress-chip">
                {t("tutorial.shell.progressPercent", { percent: progressPercent })}
              </span>
              <button className="button secondary small" data-qa="tutorial-debug-back" disabled={!canDebugBack} type="button" onClick={debugBack}>
                <ArrowLeft size={14} />
                {t("onboarding.actions.previous")}
              </button>
              <button className="button secondary small" type="button" onClick={skipStep}>
                {t("tutorial.shell.skip")}
              </button>
              <button className="button ghost small" type="button" onClick={restartTutorial}>
                <RotateCcw size={14} />
                {t("tutorial.shell.restart")}
              </button>
              <button className="button primary small" type="button" onClick={() => onNavigate?.("cards")}>
                {t("tutorial.shell.exit")}
              </button>
            </div>
          </header>

          <div className="tutorial-environment-banner" role="note" onClick={(event) => event.stopPropagation()}>
            <div>
              <strong>
                <Sparkles size={15} />
                {t("tutorial.shell.environmentTitle")}
              </strong>
              <span>{t("tutorial.shell.environmentDescription")}</span>
            </div>
            <button className="button secondary small" type="button" onClick={exitTutorial}>
              <ArrowRight size={14} />
              {t("tutorial.shell.exitTutorial")}
            </button>
          </div>

          {isHomeVisible ? (
            <TutorialHome
              actionState={actionState}
              completedModuleIds={completedModuleIds}
              currentStep={currentStep}
              modules={modules}
              steps={steps}
              onNavigate={onNavigate}
              onRestart={restartTutorial}
              onStartModule={startModule}
            />
          ) : (
            <>
              <h1 className="sr-only">{currentStep.title}</h1>
              <p aria-live="polite" className="sr-only" role="status">
                {hint ||
                  t("tutorial.status.progressAnnouncement", {
                    current: completedActionIds.length,
                    title: currentStep.title,
                    total: currentStep.actions.length
                  })}
              </p>
              <div className="tutorial-mission-bar tutorial-goal-panel" onClick={(event) => event.stopPropagation()}>
                <div>
                  <span>{currentStep.appLocation}</span>
                  <strong>{t("tutorial.shell.currentGoal", { goal: currentModule.title })}</strong>
                  <small>{currentModule.description}</small>
                  <small>
                    <TutorialInstructionText
                      actionId={nextTarget?.id}
                      text={hint || nextTarget?.hint || currentStep.coach}
                    />
                  </small>
                </div>
                <div className="tutorial-goal-progress">
                  <span>
                    {t("tutorial.shell.categoryProgress", {
                      current: Math.min(
                        currentModuleCompletedStepCount + (isStepComplete ? 0 : 1),
                        currentModuleSteps.length
                      ),
                      total: currentModuleSteps.length
                    })}
                  </span>
                  <div
                    className="tutorial-flow-strip compact"
                    aria-label={t("tutorial.shell.currentFlow")}
                  >
                    {currentStep.progressLabels.map((label, index) => {
                      const phaseIndex = getPhaseIndex(currentStep, completedActionIds.length);
                      return (
                        <span className={index < phaseIndex ? "done" : index === phaseIndex ? "active" : ""} key={label}>
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {isSandboxTabReady ? (
                <PracticeScene
                  completedActionSet={completedActionSet}
                  hint={hint || currentStep.coach}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={runAction}
                  previewCard={previewCard}
                  shouldShowPreview={shouldShowPreview}
                  shouldShowSoundPoints={shouldShowSoundPoints}
                  step={currentStep}
                />
              ) : (
                <SandboxWaitingPane
                  completedActionSet={completedActionSet}
                  currentStep={currentStep}
                  isActionAvailable={isActionAvailable}
                  isTutorialCompleted={isTutorialCompleted}
                  nextTarget={nextTarget}
                  onAction={runAction}
                />
              )}
            </>
          )}
        </main>
      </div>
      <TutorialSpotlightOverlay disabled={shouldDisableSpotlight || isHomeVisible} targetId={nextTarget?.id} />
      <TutorialFloatingGuide
        targetId={nextTarget?.id}
        text={guideText}
        visible={Boolean(!isHomeVisible && nextTarget?.navTargetTab && !isSandboxTabReady)}
      />
    </div>
  );
}

function getTutorialGuideText(
  currentStep: CardTutorialStep,
  nextTarget: CardTutorialAction | undefined,
  fallback: string,
  firstMissionGuide: string
) {
  if (currentStep.id === "web-reading" && nextTarget?.id === "open-web-reader") {
    return firstMissionGuide;
  }
  return fallback;
}

function TutorialHome({
  actionState,
  completedModuleIds,
  currentStep,
  modules,
  onNavigate,
  onRestart,
  onStartModule,
  steps
}: {
  actionState: CardTutorialRuntimeState;
  completedModuleIds: CardTutorialModuleId[];
  currentStep: CardTutorialStep;
  modules: CardTutorialModule[];
  onNavigate?: (route: "cards") => void;
  onRestart: () => void;
  onStartModule: (moduleId: CardTutorialModuleId) => void;
  steps: CardTutorialStep[];
}) {
  const { t } = useTranslation();
  const completedModuleSet = new Set(completedModuleIds);
  const completedCount = modules.filter((module) => completedModuleSet.has(module.id)).length;

  return (
    <section className="tutorial-home" data-qa="tutorial-home" onClick={(event) => event.stopPropagation()}>
      <div className="tutorial-home-intro">
        <span className="section-kicker">
          <Sparkles size={16} />
          {t("tutorial.home.kicker")}
        </span>
        <h1>{t("tutorial.home.title")}</h1>
        <div className="tutorial-home-copy">
          <p>{t("tutorial.home.copy1")}</p>
          <p>{t("tutorial.home.copy2")}</p>
          <p>{t("tutorial.home.copy3")}</p>
        </div>
        <div className="tutorial-home-concepts" aria-label={t("tutorial.home.conceptsLabel")}>
          <div className="tutorial-concept-input">
            <strong>{t("tutorial.home.inputTitle")}</strong>
            <span>{t("tutorial.home.inputDescription")}</span>
          </div>
          <div className="tutorial-concept-output">
            <strong>{t("tutorial.home.outputTitle")}</strong>
            <span>{t("tutorial.home.outputDescription")}</span>
          </div>
          <div className="tutorial-concept-mining">
            <strong>{t("tutorial.home.sentenceMiningTitle")}</strong>
            <span>{t("tutorial.home.sentenceMiningDescription")}</span>
          </div>
        </div>
        <div className="tutorial-home-flow" aria-label={t("tutorial.home.flowLabel")}>
          <span className="tutorial-flow-node input">
            <BookOpen size={16} />
            {t("tutorial.home.flowInput")}
          </span>
          <span className="tutorial-flow-line" aria-hidden />
          <span className="tutorial-flow-node card">
            <CreditCard size={16} />
            {t("tutorial.home.flowCard")}
          </span>
          <span className="tutorial-flow-line" aria-hidden />
          <span className="tutorial-flow-node output">
            <Send size={16} />
            {t("tutorial.home.flowOutput")}
          </span>
        </div>
      </div>

      <div className="tutorial-home-modules">
        <div className="tutorial-home-modules-head">
          <div>
            <span>{t("tutorial.home.sequential")}</span>
            <strong>{t("tutorial.home.moduleHeading")}</strong>
          </div>
          <span className="tutorial-progress-chip">
            {t("tutorial.home.moduleProgress", {
              completed: completedCount,
              total: modules.length
            })}
          </span>
        </div>
        <div className="tutorial-module-grid">
          {modules.map((module, index) => {
            const isComplete = completedModuleSet.has(module.id);
            const isLocked = isModuleLocked(module, completedModuleSet, modules);
            const moduleSteps = steps.filter((step) => step.moduleId === module.id);
            const moduleStepIndex = moduleSteps.findIndex((step) => step.id === currentStep.id);
            const hasStarted =
              currentStep.moduleId === module.id &&
              (moduleStepIndex > 0 ||
                moduleSteps.some((step) => (actionState[step.id] ?? []).length > 0));
            const actionLabel = isComplete
              ? t("tutorial.home.complete")
              : isLocked
                ? t("tutorial.home.locked")
                : hasStarted
                  ? t("tutorial.home.continue")
                  : t("tutorial.home.start");
            const ButtonIcon = isComplete ? CheckCircle2 : hasStarted ? RefreshCcw : Play;
            const ModuleIcon = getTutorialModuleIcon(module.id);
            const toneClass = getTutorialModuleToneClass(module.id);

            return (
              <article
                className={`tutorial-module-card ${toneClass}${isComplete ? " complete" : ""}${isLocked ? " locked" : ""}`}
                data-qa={`tutorial-module-${module.id}`}
                key={module.id}
              >
                <span className="tutorial-module-index">
                  <ModuleIcon size={17} />
                </span>
                <div className="tutorial-module-main">
                  <span className="tutorial-module-order">
                    {t("tutorial.home.stepNumber", { number: index + 1 })}
                  </span>
                  <strong>{module.title}</strong>
                  <p>{module.description}</p>
                  <div className="tutorial-module-meta">
                    <small>{module.goalLabel}</small>
                    <small>{t("tutorial.home.practiceCount", { count: moduleSteps.length })}</small>
                  </div>
                </div>
                <button
                  className={isComplete ? "button secondary small" : isLocked ? "button ghost small" : "button primary small"}
                  disabled={isComplete || isLocked}
                  type="button"
                  onClick={() => onStartModule(module.id)}
                >
                  <ButtonIcon size={14} />
                  {actionLabel}
                </button>
              </article>
            );
          })}
        </div>
        <div className="tutorial-home-actions">
          <button className="button secondary small" type="button" onClick={onRestart}>
            <RotateCcw size={14} />
            {t("tutorial.shell.restart")}
          </button>
          <button className="button ghost small" type="button" onClick={() => onNavigate?.("cards")}>
            {t("tutorial.shell.exit")}
          </button>
        </div>
      </div>
    </section>
  );
}

function useTutorialTargetRect(targetId?: string) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!targetId || typeof document === "undefined") {
      setRect(null);
      return;
    }

    let frameId = 0;
    let secondFrameId = 0;
    const timeoutIds: number[] = [];

    function updateRect() {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-tutorial-target-id="${targetId}"]`
        )
      );
      const visibleTargets = targets.filter((candidate) => {
        if (candidate.getClientRects().length === 0) {
          return false;
        }
        const candidateRect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return (
          candidateRect.width > 0 &&
          candidateRect.height > 0 &&
          candidateRect.bottom >= 0 &&
          candidateRect.right >= 0 &&
          candidateRect.top <= window.innerHeight &&
          candidateRect.left <= window.innerWidth &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });
      if (visibleTargets.length === 0) {
        setRect(null);
        return;
      }
      const rects = visibleTargets.map((target) => target.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      setRect({
        left,
        top,
        width: right - left,
        height: bottom - top
      });
    }

    function scheduleUpdate() {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(secondFrameId);
      frameId = requestAnimationFrame(() => {
        updateRect();
        secondFrameId = requestAnimationFrame(updateRect);
      });
    }

    scheduleUpdate();
    timeoutIds.push(window.setTimeout(scheduleUpdate, 80));
    timeoutIds.push(window.setTimeout(scheduleUpdate, 180));
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true
    });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(secondFrameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [targetId]);

  return rect;
}

function TutorialSpotlightOverlay({ disabled = false, targetId }: { disabled?: boolean; targetId?: string }) {
  if (disabled) {
    return null;
  }

  const rect = useTutorialTargetRect(targetId);

  if (!targetId || !rect) {
    return <div className="tutorial-spotlight-overlay" data-qa="tutorial-spotlight-overlay" />;
  }

  const padding = 10;
  const style = {
    left: Math.max(8, rect.left - padding),
    top: Math.max(8, rect.top - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };

  return (
    <div className="tutorial-spotlight-overlay" data-qa="tutorial-spotlight-overlay">
      <div className="tutorial-spotlight-hole" data-qa="tutorial-spotlight-hole" style={style} />
    </div>
  );
}

function TutorialFloatingGuide({
  targetId,
  text,
  visible
}: {
  targetId?: string;
  text: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const rect = useTutorialTargetRect(targetId);

  if (!visible || !targetId || !rect || typeof window === "undefined") {
    return null;
  }

  const gap = 16;
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const guideWidth = Math.min(520, Math.max(320, viewportWidth - gap * 2));
  const guideHeight = 178;
  const rightSideLeft = rect.left + rect.width + gap;
  const left =
    rightSideLeft + guideWidth <= viewportWidth - gap
      ? rightSideLeft
      : Math.max(gap, rect.left - guideWidth - gap);
  const top = Math.min(
    Math.max(gap, rect.top + rect.height / 2 - guideHeight / 2),
    Math.max(gap, viewportHeight - guideHeight - gap)
  );
  const isLeftOfTarget = left < rect.left;

  return (
    <div
      className={`tutorial-floating-guide${isLeftOfTarget ? " reverse" : ""}`}
      data-qa="tutorial-floating-guide"
      style={{ left, top }}
    >
      <img alt="" className="tutorial-coach-mascot" src={tutorialMascotSrc} />
      <span className="tutorial-coach-speech">
        <b>{t("tutorial.shell.moleGuide")}</b>
        <span>
          <TutorialInstructionText actionId={targetId} text={text} />
        </span>
      </span>
    </div>
  );
}

function SandboxSidebar({
  activeTab,
  nextTarget,
  onExit,
  onNavigate
}: {
  activeTab: CardTutorialTab;
  nextTarget?: CardTutorialAction;
  onExit: () => void;
  onNavigate: (tab: CardTutorialTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="app-sidebar tutorial-sandbox-sidebar" onClick={(event) => event.stopPropagation()}>
      <div className="sidebar-top">
        <div className="brand-block">
          <div className="brand-mark">LM</div>
          <div className="brand-copy">
            <strong className="brand-name">Language Miner</strong>
            <p>{t("tutorial.sandbox.aiDisconnected")}</p>
          </div>
        </div>
        <button
          aria-label={t("tutorial.sandbox.goToToday")}
          className="icon-button sidebar-collapse-button"
          type="button"
          onClick={() => onNavigate("pdfHub")}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="profile-switcher">
        <label>{t("app.profile.label")}</label>
        <button
          aria-label={t("tutorial.sandbox.profileButtonLabel")}
          className="profile-summary-button"
          type="button"
          onClick={() => onNavigate("pdfHub")}
        >
          <span className="profile-avatar">EN</span>
          <span>
            <strong>{t("tutorial.sandbox.profileName")}</strong>
            <small>{t("tutorial.sandbox.profileDescription")}</small>
          </span>
        </button>
      </div>

      <div className="tutorial-sidebar-mode-card" role="note">
        <strong>
          <Sparkles size={15} />
          {t("tutorial.sandbox.noteTitle")}
        </strong>
        <span>{t("tutorial.sandbox.noteDescription")}</span>
        <button
          aria-label={t("tutorial.shell.exitTutorial")}
          className="button primary small tutorial-sidebar-exit-button"
          type="button"
          onClick={onExit}
        >
          <LogOut aria-hidden="true" size={16} />
          <span className="tutorial-sidebar-exit-label">
            {t("tutorial.shell.exitTutorial")}
          </span>
        </button>
      </div>

      <nav className="tab-nav" aria-label={t("tutorial.sandbox.navigationLabel")}>
        <div className="nav-home">
          <SandboxNavButton
            activeTab={activeTab}
            item={sandboxHomeNavItem}
            nextTarget={nextTarget}
            onNavigate={onNavigate}
          />
        </div>
        {sandboxNavSections.map((section) => (
          <SandboxNavSectionView
            activeTab={activeTab}
            key={section.id}
            nextTarget={nextTarget}
            onNavigate={onNavigate}
            section={section}
          />
        ))}
      </nav>

      <button
        aria-label={t("tutorial.sandbox.usageButtonLabel")}
        className="sidebar-usage-card"
        type="button"
        onClick={() => onNavigate("pdfHub")}
      >
        <div className="sidebar-estimate-box sidebar-combined-estimate">
          <div className="sidebar-combined-head">
            <span>{t("tutorial.sandbox.todayEstimate")}</span>
          </div>
          <div className="sidebar-usage-breakdown">
            <div className="sidebar-usage-row api">
              <span>API</span>
              <strong>₩0</strong>
              <small>{t("app.usage.requests", { count: 0 })}</small>
            </div>
            <div className="sidebar-usage-row electricity">
              <span>{t("app.usage.electricity")}</span>
              <strong>₩0</strong>
              <small>{t("tutorial.sandbox.zeroMinutes")}</small>
            </div>
          </div>
          <span className="sidebar-limit-chip">
            {t("app.usage.guardPercent", { percent: 0 })}
          </span>
        </div>
      </button>
    </aside>
  );
}

function SandboxNavSectionView({
  activeTab,
  nextTarget,
  onNavigate,
  section
}: {
  activeTab: CardTutorialTab;
  nextTarget?: CardTutorialAction;
  onNavigate: (tab: CardTutorialTab) => void;
  section: SandboxNavSection;
}) {
  const { t } = useTranslation();
  const SectionIcon = section.icon;
  const directItem = section.directKey
    ? {
        key: section.directKey,
        labelKey: section.titleKey,
        icon: section.icon
      }
    : null;
  const isTarget = Boolean(
    directItem && nextTarget?.navTargetTab === directItem.key
  );
  const isActive = Boolean(
    directItem ? activeTab === directItem.key : section.groups?.some((group) => group.items.some((item) => item.key === activeTab)) ||
      section.items?.some((item) => item.key === activeTab)
  );

  if (directItem) {
    return (
      <section className={`nav-section nav-section-${section.id} nav-section-direct${isActive ? " active" : ""}`}>
        <button
          aria-current={isActive ? "page" : undefined}
          className={`nav-section-toggle${isActive ? " active" : ""}${isTarget ? " tutorial-nav-target tutorial-spotlight-target" : ""}`}
          data-qa={`sandbox-nav-${directItem.key}`}
          data-tutorial-target-id={isTarget ? nextTarget?.id : undefined}
          type="button"
          onClick={() => onNavigate(directItem.key)}
        >
          <SectionIcon size={18} />
          <span className="nav-section-title">{t(section.titleKey)}</span>
        </button>
      </section>
    );
  }

  return (
    <section className={`nav-section nav-section-${section.id} expanded`}>
      <button className={`nav-section-toggle${isActive ? " active" : ""}`} type="button" onClick={() => onNavigate("pdfHub")}>
        <SectionIcon size={18} />
        <span className="nav-section-title">{t(section.titleKey)}</span>
        <ChevronDown className="nav-section-chevron" size={16} />
      </button>
      <div className="nav-section-body">
        {section.groups?.map((group) => (
          <div className="nav-subgroup" key={`${section.id}-${group.titleKey}`}>
            <span className="nav-subgroup-title">{t(group.titleKey)}</span>
            {group.items.map((item) => (
              <SandboxNavButton
                activeTab={activeTab}
                item={item}
                key={item.key}
                nextTarget={nextTarget}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
        {section.items?.map((item) => (
          <SandboxNavButton
            activeTab={activeTab}
            item={item}
            key={item.key}
            nextTarget={nextTarget}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

function SandboxNavButton({
  activeTab,
  item,
  nextTarget,
  onNavigate
}: {
  activeTab: CardTutorialTab;
  item: SandboxNavItem;
  nextTarget?: CardTutorialAction;
  onNavigate: (tab: CardTutorialTab) => void;
}) {
  const { t } = useTranslation();
  const meta = sandboxRouteMeta[item.key];
  const Icon = item.icon ?? meta.icon;
  const isTarget = nextTarget?.navTargetTab === item.key;
  const label = t(item.labelKey ?? meta.labelKey);

  return (
    <button
      aria-current={activeTab === item.key ? "page" : undefined}
      className={`${activeTab === item.key ? "active" : ""}${isTarget ? " tutorial-nav-target tutorial-spotlight-target" : ""}`}
      data-qa={`sandbox-nav-${item.key}`}
      data-tutorial-target-id={isTarget ? nextTarget?.id : undefined}
      title={label}
      type="button"
      onClick={() => onNavigate(item.key)}
    >
      <Icon size={18} />
      <span className="nav-item-label">{label}</span>
    </button>
  );
}

function SandboxWaitingPane({
  completedActionSet,
  currentStep,
  isActionAvailable,
  isTutorialCompleted,
  nextTarget,
  onAction
}: {
  completedActionSet: Set<string>;
  currentStep: CardTutorialStep;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  isTutorialCompleted: boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  const showOverview = currentStep.id === "web-reading" && nextTarget?.id === "open-web-reader";
  const showIntroDialogue = isIntroDialogueAction(nextTarget);

  return (
    <section className="panel tutorial-sandbox-dashboard" data-qa="tutorial-sandbox-waiting">
      <span className="section-kicker">
        <Sparkles size={16} />
        {isTutorialCompleted ? t("tutorial.waiting.replay") : t("tutorial.waiting.nextMission")}
      </span>
      <h2>{currentStep.title}</h2>
      {!showOverview && !showIntroDialogue ? <p>{currentStep.coach}</p> : null}
      {showIntroDialogue ? (
        <TutorialIntroDialogue
          action={nextTarget}
          completedActionSet={completedActionSet}
          isActionAvailable={isActionAvailable}
          onAction={onAction}
        />
      ) : null}
      {!showIntroDialogue ? (
        <div className="tutorial-waiting-target">
          <MousePointer2 size={18} />
          <div>
            <strong>{nextTarget?.targetLabel ?? currentStep.navLabel}</strong>
            <span>
              <TutorialInstructionText
                actionId={nextTarget?.id}
                text={nextTarget?.hint ?? currentStep.goal}
              />
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isIntroDialogueAction(action?: CardTutorialAction) {
  return Boolean(action?.id.startsWith("intro-"));
}

function TutorialIntroDialogue({
  action,
  completedActionSet,
  isActionAvailable,
  onAction
}: {
  action?: CardTutorialAction;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  if (!action) {
    return null;
  }

  const available = isActionAvailable(action);

  return (
    <div
      className="tutorial-intro-dialogue tutorial-spotlight-target"
      data-qa="tutorial-intro-dialogue"
      data-tutorial-target-id={action.id}
    >
      <img alt="" className="tutorial-coach-mascot" src={tutorialMascotSrc} />
      <div className="tutorial-coach-speech tutorial-intro-speech">
        <b>{t("tutorial.shell.moleGuide")}</b>
        <span>{action.hint}</span>
        <ActionButton
          action={action}
          completedActionSet={completedActionSet}
          icon={<ArrowRight size={15} />}
          isActionAvailable={() => available}
          nextTarget={undefined}
          onAction={onAction}
          variant="primary small tutorial-intro-next"
        >
          {t("onboarding.actions.next")}
        </ActionButton>
      </div>
    </div>
  );
}

function TutorialInstructionText({ text }: { actionId?: string; text: string }) {
  return <>{text}</>;
}

type PracticeSceneProps = {
  completedActionSet: Set<string>;
  hint: string;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  previewCard: StudyCard | null;
  shouldShowPreview: boolean;
  shouldShowSoundPoints: boolean;
  step: CardTutorialStep;
};

function PracticeScene(props: PracticeSceneProps) {
  switch (props.step.sceneKind) {
    case "webReader":
      return <WebReaderPractice {...props} />;
    case "pdfReader":
      return <PdfReaderPractice {...props} />;
    case "listeningLoop":
      return <ListeningLoopPractice {...props} />;
    case "videoReader":
      return <VideoReaderPractice {...props} />;
    case "lifeCapture":
      return <LifeCapturePractice {...props} />;
    case "lifeMining":
      return <LifeMiningPractice {...props} />;
    case "cardsOverview":
      return <CardsOverviewPractice {...props} />;
    case "reviewIntro":
      return <ReviewIntroPractice {...props} />;
    case "todayMission":
      return <TodayMissionPractice {...props} />;
    case "finish":
      return <CardsOverviewPractice {...props} />;
  }
}

function WebReaderPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  shouldShowPreview,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const runningLate = getAction(step, "select-running-late");
  const build = getAction(step, "build-reading-card");
  const save = getAction(step, "save-reading-card");
  const hasInitialSelection = completedActionSet.has("select-running-late");
  const shouldShowSelectionCoach = nextTarget?.id === "select-running-late" && !hasInitialSelection;

  return (
    <div className="web-reader-page tutorial-feature-shell tutorial-web-reader" data-qa="tutorial-web-reader-scene">
      <form className="web-reader-command-rail" onSubmit={(event) => event.preventDefault()} onClick={(event) => event.stopPropagation()}>
        <div className="web-reader-nav-cluster">
          <button aria-label={t("tutorial.scene.back")} className="icon-button" disabled type="button">
            <ArrowLeft size={17} />
          </button>
          <button aria-label={t("tutorial.scene.forward")} className="icon-button" disabled type="button">
            <ArrowRight size={17} />
          </button>
          <button aria-label={t("review.refresh")} className="icon-button" type="button">
            <RefreshCcw size={16} />
          </button>
          <button aria-label={t("tutorial.scene.homePage")} className="icon-button" type="button">
            <Home size={16} />
          </button>
        </div>
        <label className="web-reader-address">
          <Search size={16} />
          <input readOnly value="https://example.org/everyday-english/running-late" />
        </label>
        <div className="web-reader-action-cluster">
          <button className="button secondary small" type="button">
            <Languages size={15} />
            {t("tutorial.scene.translatePage")}
          </button>
          <button className="button secondary small" type="button">
            <Languages size={15} />
            {t("tutorial.scene.translateSelection")}
          </button>
          <button className="button secondary small" type="button">
            <BookmarkPlus size={15} />
            {t("tutorial.scene.candidates")}
          </button>
          <button className="button primary small" type="button">
            <CreditCard size={15} />
            {t("tutorial.scene.sentenceCard")}
          </button>
        </div>
      </form>

      <div className="web-reader-stage">
        <div className="web-reader-status-bar">
          <span>{t("tutorial.scene.dragExpression")}</span>
          <small>{t("tutorial.scene.readingWebSentence")}</small>
        </div>
        <div className="web-reader-web-surface">
          <article className="tutorial-web-article" onClick={(event) => event.stopPropagation()}>
            <span className="tutorial-document-label">{t("nav.webReader")}</span>
            <h3>{t("tutorial.scene.quickMessageTitle")}</h3>
            <p lang="en">
              I’m{" "}
              {hasInitialSelection ? (
                <span className="tutorial-article-selected-term">running a little late</span>
              ) : (
                <ActionText
                  action={runningLate}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                >
                  running a little late
                </ActionText>
              )}.
            </p>
            <p>{t("tutorial.scene.quickMessageContext")}</p>
            {shouldShowSelectionCoach ? <ReadingSelectionCoach hint={hint || runningLate?.hint || step.coach} /> : null}
            {shouldShowPreview ? (
              <ReadingCardResultPopover
                card={previewCard}
                completedActionSet={completedActionSet}
                hint={hint}
                isActionAvailable={isActionAvailable}
                nextTarget={nextTarget}
                onAction={onAction}
                saveAction={save}
              />
            ) : hasInitialSelection ? (
              <ReadingActionPopover
                buildAction={build}
                completedActionSet={completedActionSet}
                hint={hint}
                isActionAvailable={isActionAvailable}
                nextTarget={nextTarget}
                onAction={onAction}
              />
            ) : (
              null
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

function ReadingSelectionCoach({ hint }: { hint: string }) {
  const { t } = useTranslation();
  return (
    <div className="tutorial-selection-coach" data-qa="tutorial-web-reader-selection-guide">
      <div className="tutorial-selection-arrow" aria-hidden="true" />
      <div className="tutorial-selection-coach-card">
        <img alt="" className="tutorial-selection-mascot" src={tutorialMascotSrc} />
        <div>
          <strong>{t("tutorial.scene.dragCoachTitle")}</strong>
          <span>{t("tutorial.scene.dragCoachDescription")}</span>
          <small>{hint}</small>
        </div>
      </div>
    </div>
  );
}

function ReadingActionPopover({
  buildAction,
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  buildAction?: CardTutorialAction;
  completedActionSet: Set<string>;
  hint: string;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="web-reader-selection-popover tutorial-popover tutorial-webview-popover compact">
      <span className="tutorial-webview-term">running a little late</span>
      <div className="tutorial-webview-usage-row">
        <span className="tutorial-webview-usage-badge">{t("nav.cards")}</span>
        <TutorialWebviewActionButton
          action={buildAction}
          completedActionSet={completedActionSet}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
          primary
          qa="tutorial-create-sentence-card-button"
          subtitle={t("tutorial.scene.generate")}
          title={t("tutorial.scene.sentenceCard")}
        />
      </div>
      <button className="tutorial-webview-button" type="button">
        <span>{t("common.close")}</span>
        <span>Esc</span>
      </button>
      <CoachBubble action={nextTarget} hint={hint} matchId={buildAction?.id} />
    </div>
  );
}

function ReadingCardResultPopover({
  card,
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  saveAction
}: {
  card: StudyCard | null;
  completedActionSet: Set<string>;
  hint: string;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  saveAction?: CardTutorialAction;
}) {
  const { t } = useTranslation();
  return (
    <div className="web-reader-selection-popover tutorial-popover tutorial-result-popover tutorial-webview-popover result" data-qa="tutorial-result-popover">
      <div className="tutorial-result-popover-head">
        <div>
          <span>{t("tutorial.scene.generationResult")}</span>
          <strong>{t("tutorial.scene.reviewSentenceCard")}</strong>
        </div>
        <button
          aria-label={t("tutorial.scene.closeCardResult")}
          className="tutorial-webview-icon-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          ×
        </button>
      </div>
      <div className="tutorial-result-popover-body">
        <PreviewOrPlaceholder card={card} showPreview={Boolean(card)} />
      </div>
      <div className="tutorial-result-popover-actions">
        <TutorialResultSaveButton
          action={saveAction}
          completedActionSet={completedActionSet}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
        />
        <button className="tutorial-webview-button" type="button">
          <span>{t("tutorial.scene.selectAgain")}</span>
          <span />
        </button>
      </div>
    </div>
  );
}

function TutorialWebviewActionButton({
  action,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction,
  primary = false,
  qa,
  subtitle,
  title
}: {
  action?: CardTutorialAction;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  primary?: boolean;
  qa?: string;
  subtitle: string;
  title: string;
}) {
  const { t } = useTranslation();
  if (!action) {
    return null;
  }
  const done = completedActionSet.has(action.id);
  const active = nextTarget?.id === action.id;
  const available = isActionAvailable(action);

  return (
    <button
      className={`tutorial-webview-button ${primary ? "primary" : ""} ${active ? "tutorial-webview-target-active tutorial-spotlight-target" : ""} ${done ? "done" : ""}`}
      data-qa={qa}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!available && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
    >
      <span>{done ? t("tutorial.common.generated") : title}</span>
      <span>{subtitle}</span>
    </button>
  );
}

function TutorialResultSaveButton({
  action,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  action?: CardTutorialAction;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  if (!action) {
    return null;
  }
  const done = completedActionSet.has(action.id);
  const active = nextTarget?.id === action.id;
  const available = isActionAvailable(action);

  return (
    <button
      className={`tutorial-webview-button primary ${active ? "tutorial-hotspot active tutorial-spotlight-target" : ""} ${done ? "done" : ""}`}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!available && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
    >
      <span>{done ? t("tutorial.common.saved") : t("common.save")}</span>
      <span>{t("nav.cards")}</span>
    </button>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function PdfReaderPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  shouldShowPreview,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const select = getAction(step, "select-inanimate");
  const build = getAction(step, "build-etymology-card");
  const save = getAction(step, "save-etymology-card");
  const hasSelection = completedActionSet.has("select-inanimate");
  const showSelectionPopover = hasSelection && !shouldShowPreview;
  const showResultPopover = shouldShowPreview;

  return (
    <div className="tutorial-feature-shell tutorial-pdf-reader" data-qa="tutorial-pdf-reader-scene">
      <div className="pdf-reader-grid">
        <div className="pdf-viewer-pane">
          <div className="tutorial-pdf-toolbar">
            <FileText size={16} />
            <strong>Frankenstein_sample.pdf</strong>
            <span>{t("tutorial.document.pageCount", { current: 1, total: 1 })}</span>
          </div>
          <div className="pdf-page-stage tutorial-pdf-page" onClick={(event) => event.stopPropagation()}>
            <span className="tutorial-document-label">{t("tutorial.document.readerLabel")}</span>
            <p lang="en">
              I had worked hard for nearly two years, for the sole purpose of infusing life into an{" "}
              <span data-tutorial-pdf-result-anchor="inanimate">
                <ActionText
                  action={select}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                >
                  inanimate
                </ActionText>
              </span>{" "}
              body.
            </p>
            <CoachBubble action={nextTarget} hint={hint} matchId={select?.id} />
            {showSelectionPopover ? (
              <PdfReaderSelectionPopover
                action={build}
                completedActionSet={completedActionSet}
                isActionAvailable={isActionAvailable}
                nextTarget={nextTarget}
                onAction={onAction}
              />
            ) : null}
            {showResultPopover ? (
              <PdfReaderResultPopover
                card={previewCard}
                completedActionSet={completedActionSet}
                isActionAvailable={isActionAvailable}
                nextTarget={nextTarget}
                onAction={onAction}
                saveAction={save}
              />
            ) : null}
          </div>
        </div>
        <aside className="pdf-translation-pane tutorial-pdf-side" onClick={(event) => event.stopPropagation()}>
          <div className="pdf-translation-header">
            <div>
              <h3>{t("tutorial.document.translationTitle")}</h3>
              <p className="muted compact">{t("tutorial.document.translationDescription")}</p>
            </div>
          </div>
          <section className="pdf-live-card-panel">
            <div className="pdf-live-card-header">
              <div>
                <strong>{t("tutorial.document.sentenceCard")}</strong>
                <span>{t("tutorial.document.selectionShortcut")}</span>
              </div>
              <div className="card-generation-action-row">
                <span className="tutorial-cost-badge">{t("tutorial.common.estimatedZero")}</span>
                <button className="button secondary small" disabled type="button">
                  <Save size={15} />
                  {t("tutorial.document.createCard")}
                </button>
              </div>
            </div>
            {shouldShowPreview ? (
              <p className="status-text compact" role="status">
                {t("tutorial.document.statusGenerated")}
              </p>
            ) : hasSelection ? (
              <p className="status-text compact" role="status">
                {t("tutorial.document.statusSelected")}
              </p>
            ) : (
              <p className="status-text compact" role="status">
                {t("tutorial.document.statusEmpty")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function PdfReaderSelectionPopover({
  action,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  action?: CardTutorialAction;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="selection-popover tutorial-pdf-selection-popover">
      <div className="selection-popover-text">inanimate</div>
      <div className="selection-popover-actions">
        <div className="card-generation-action-row selection-card-generation-row">
          <span className="tutorial-cost-badge">{t("tutorial.common.estimatedZero")}</span>
          <ActionButton
            action={action}
            completedActionSet={completedActionSet}
            icon={<CreditCard size={14} />}
            isActionAvailable={isActionAvailable}
            nextTarget={nextTarget}
            onAction={onAction}
            variant="primary selection-popover-button"
          >
            {t("tutorial.document.sentenceCard")}
          </ActionButton>
        </div>
        <button className="button secondary selection-popover-button" disabled type="button">
          {t("tutorial.scene.multipleTerms")}
        </button>
        <button aria-label={t("common.close")} className="icon-button selection-popover-close" type="button">
          ×
        </button>
      </div>
    </div>
  );
}

function PdfReaderResultPopover({
  card,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction,
  saveAction
}: {
  card: StudyCard | null;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  saveAction?: CardTutorialAction;
}) {
  const { t } = useTranslation();
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    function updatePosition() {
      const anchor = document.querySelector<HTMLElement>('[data-tutorial-pdf-result-anchor="inanimate"]');
      if (!anchor) {
        setFloatingStyle({});
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(700, Math.max(360, window.innerWidth - 320));
      const height = Math.min(720, Math.max(420, window.innerHeight - 220));
      const left = clampNumber(rect.left - 84, 24, Math.max(24, window.innerWidth - width - 24));
      const top = clampNumber(rect.top - Math.round(height * 0.42), 76, Math.max(76, window.innerHeight - height - 24));

      setFloatingStyle({
        height,
        left,
        top,
        width
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, []);

  return (
    <div
      className="selection-popover tutorial-pdf-selection-popover tutorial-pdf-result-popover"
      data-qa="tutorial-pdf-result-popover"
      style={floatingStyle}
    >
      <div className="tutorial-pdf-result-head">
        <div className="tutorial-pdf-result-title">
          <CreditCard size={17} />
          <strong>{t("tutorial.document.previewTitle")}</strong>
          <span>{t("tutorial.document.previewDescription")}</span>
        </div>
        <button aria-label={t("common.close")} className="icon-button selection-popover-close" type="button">
          ×
        </button>
      </div>
      <div className="tutorial-pdf-result-body">
        <PreviewOrPlaceholder card={card} showPreview={Boolean(card)} />
      </div>
      <div className="tutorial-pdf-result-actions">
        <ActionButton
          action={saveAction}
          completedActionSet={completedActionSet}
          icon={<Save size={15} />}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
          variant="primary wide"
        >
          {t("tutorial.document.addCard")}
        </ActionButton>
      </div>
    </div>
  );
}

function ListeningLoopPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  shouldShowPreview,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const select = getAction(step, "select-listening-segment");
  const mark = getAction(step, "mark-sound-points");
  const build = getAction(step, "build-listening-card");
  const continueAction = getAction(step, "continue-after-listening-card");
  const hasSelectedListeningPart = completedActionSet.has("select-listening-segment");
  const hasMarkedListeningHighlight = completedActionSet.has("mark-sound-points");
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [ttsStatus, setTtsStatus] = useState("");

  async function playTutorialListeningVideo() {
    if (isPlayingSample) return;
    setIsPlayingSample(true);
    setMediaError("");
    setTtsStatus("");
    try {
      setTtsStatus(await playStandaloneTts(tutorialListeningSampleText, "en"));
    } catch {
      setMediaError(t("tutorial.common.ttsError"));
    } finally {
      setIsPlayingSample(false);
    }
  }

  return (
    <div className="listening-loop-page tutorial-feature-shell tutorial-listening-loop" data-qa="tutorial-listening-loop-scene">
      <section className="panel listening-loop-main">
        <div className="listening-loop-header">
          <div>
            <span className="section-kicker">
              <Headphones size={16} />
              {t("nav.listeningLoop")}
            </span>
            <h2>{t("tutorial.listening.sampleTitle")}</h2>
            <p>{t("tutorial.listening.segmentDescription")}</p>
          </div>
          <div className="listening-loop-header-actions">
            <span className="listening-loop-counter">
              {t("tutorial.common.position", { current: 1, total: 3 })}
            </span>
            <span className="listening-loop-mode-pill active">
              {t("tutorial.listening.repeatOn")}
            </span>
          </div>
        </div>

        <div
          aria-busy={isPlayingSample}
          className="listening-player-shell tutorial-audio-player tutorial-listening-video-player"
        >
          <img
            alt={t("tutorial.listening.sampleVideoLabel")}
            className="tutorial-listening-video"
            src={tutorialListeningPosterSrc}
          />
          <div className="tutorial-listening-video-caption">
            <strong lang="en">I am going to check the room, then I will come back.</strong>
            <span lang="ko">방을 확인하고 다시 올게.</span>
          </div>
          <span className="status-text compact tutorial-runtime-tts-note">
            {t("tutorial.common.deviceTtsNotice")}
          </span>
          {ttsStatus ? <span className="status-text compact tutorial-runtime-tts-status" role="status">{ttsStatus}</span> : null}
          {mediaError ? <span className="status-text compact danger tutorial-runtime-tts-status" role="alert">{mediaError}</span> : null}
        </div>

        <div className="listening-loop-controls" onClick={(event) => event.stopPropagation()}>
          <div className="listening-video-controls" aria-label={t("tutorial.listening.videoControls")} role="group">
            <button className="button secondary" disabled type="button">
              {t("tutorial.listening.previousVideo")}
            </button>
            <button className="button primary" disabled={isPlayingSample} onClick={() => void playTutorialListeningVideo()} type="button">
              <Volume2 size={17} />
              {isPlayingSample ? t("cardPreview.actions.playing") : t("tutorial.listening.play")}
              <kbd>S</kbd>
            </button>
            <button className="button secondary" type="button">
              {t("tutorial.listening.nextVideo")}
            </button>
          </div>
          <div className="listening-sentence-controls" aria-label={t("tutorial.listening.sentenceControls")} role="group">
            <button className="button secondary small" disabled type="button">
              {t("tutorial.listening.previousSentence")}
              <kbd>A</kbd>
            </button>
            <button className="button secondary small" type="button">
              <RotateCcw size={15} />
              {t("tutorial.listening.listenAgain")}
            </button>
            <button className="button secondary small listening-loop-toggle active" type="button">
              {t("tutorial.listening.repeatOn")}
              <kbd>Q</kbd>
            </button>
            <button className="button secondary small" type="button">
              {t("tutorial.listening.nextSentence")}
              <kbd>D</kbd>
            </button>
          </div>
        </div>

        <section className="listening-subtitle-card tutorial-listening-subtitle" onClick={(event) => event.stopPropagation()}>
          <div className="listening-subtitle-head">
            <div>
              <span>
                <Captions size={16} />
                {t("tutorial.listening.narrator")}
              </span>
              <small>0:08 - 0:16</small>
            </div>
            <div className="listening-subtitle-actions">
              <ActionButton
                action={mark}
                completedActionSet={completedActionSet}
                icon={<Sparkles size={15} />}
                isActionAvailable={isActionAvailable}
                nextTarget={nextTarget}
                onAction={onAction}
                variant="ghost small"
              >
                {t("tutorial.listening.highlight")}
                <kbd>F</kbd>
              </ActionButton>
              <button className="button ghost small" type="button">
                {t("tutorial.listening.view")}
              </button>
            </div>
          </div>
          <div className="listening-subtitle-visible tutorial-listening-subtitle-visible">
            <p
              className="listening-subtitle-source tutorial-listening-source"
              data-qa="tutorial-listening-subtitle-source"
              lang="en"
            >
              I am{" "}
              {hasSelectedListeningPart ? (
                <span
                  className={`tutorial-listening-selected-phrase ${
                    hasMarkedListeningHighlight ? "highlight-yellow" : ""
                  }`}
                >
                  going to
                </span>
              ) : (
                <ListeningPhraseTarget
                  action={select}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                >
                  going to
                </ListeningPhraseTarget>
              )}{" "}
              check the room, then I'll come back.
            </p>
            <small lang="ko">방을 확인하고 다시 올게.</small>
            <em>
              {t("tutorial.listening.saveInstructionBeforeR")} <kbd>R</kbd>
              {t("tutorial.listening.saveInstructionBetweenKeys")} <kbd>F</kbd>
              {t("tutorial.listening.saveInstructionAfterF")}
            </em>
            <div className="tutorial-listening-shortcuts" aria-label={t("tutorial.listening.shortcutsLabel")}>
              <span>
                <kbd>F</kbd>
                {t("tutorial.listening.highlightShortcut")}
              </span>
              <span>
                <kbd>R</kbd>
                {t("tutorial.listening.saveShortcut")}
              </span>
            </div>
          </div>
          <div className="listening-save-row">
            <ActionButton
              action={build}
              completedActionSet={completedActionSet}
              icon={<Save size={16} />}
              isActionAvailable={isActionAvailable}
              nextTarget={nextTarget}
              onAction={onAction}
              variant="success"
            >
              {t("tutorial.listening.saveSentence")}
              <kbd>R</kbd>
            </ActionButton>
            <span>{t("tutorial.listening.saveLocation")}</span>
          </div>
        </section>
        <CoachBubble action={nextTarget} hint={hint} matchId={select?.id} />
      </section>

      {shouldShowPreview ? (
        <ListeningCardResultPopover
          card={previewCard}
          completedActionSet={completedActionSet}
          continueAction={continueAction}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
        />
      ) : null}
    </div>
  );
}

function ListeningCardResultPopover({
  card,
  completedActionSet,
  continueAction,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  card: StudyCard | null;
  completedActionSet: Set<string>;
  continueAction?: CardTutorialAction;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="selection-popover tutorial-listening-result-popover" data-qa="tutorial-listening-result-popover">
      <div className="tutorial-pdf-result-head">
        <div className="tutorial-pdf-result-title">
          <Headphones size={17} />
          <strong>{t("tutorial.listening.previewTitle")}</strong>
          <span>{t("tutorial.listening.previewDescription")}</span>
        </div>
        <button
          aria-label={t("common.close")}
          className="icon-button selection-popover-close"
          type="button"
        >
          ×
        </button>
      </div>
      <div className="tutorial-pdf-result-body">
        <PreviewOrPlaceholder card={card} showPreview={Boolean(card)} />
      </div>
      <div className="tutorial-pdf-result-actions">
        <ActionButton
          action={continueAction}
          completedActionSet={completedActionSet}
          icon={<ArrowRight size={16} />}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
          variant="primary wide"
        >
          {t("tutorial.common.confirmAndContinue")}
        </ActionButton>
      </div>
    </div>
  );
}

function VideoReaderPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  shouldShowPreview,
  shouldShowSoundPoints,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const selectWasGoingTo = getAction(step, "select-video-was-going-to");
  const selectShortcut = getAction(step, "select-video-shortcut");
  const selectRunning = getAction(step, "select-video-running");
  const build = getAction(step, "build-video-card");
  const continueAction = getAction(step, "continue-after-video-card");
  const hasSelectedVideoExpressions =
    completedActionSet.has("select-video-was-going-to") &&
    completedActionSet.has("select-video-shortcut") &&
    completedActionSet.has("select-video-running");
  const hasBuiltVideoCard = completedActionSet.has("build-video-card");
  const videoSaveHint = t("tutorial.video.saveHint");
  const videoSaveAction = build ? { ...build, hint: videoSaveHint } : undefined;
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [ttsStatus, setTtsStatus] = useState("");

  async function playTutorialVideoReaderSample() {
    if (isPlayingSample) return;
    setIsPlayingSample(true);
    setMediaError("");
    setTtsStatus("");
    try {
      setTtsStatus(await playStandaloneTts(tutorialVideoReaderSampleText, "en"));
    } catch {
      setMediaError(t("tutorial.common.ttsError"));
    } finally {
      setIsPlayingSample(false);
    }
  }

  return (
    <div className="video-reader-page tutorial-feature-shell tutorial-video-reader" data-qa="tutorial-video-reader-scene">
      <section className="panel video-reader-main">
        <div className="video-reader-player-shell">
          <div
            aria-busy={isPlayingSample}
            className="video-reader-player-media tutorial-video-frame"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              alt={t("tutorial.video.sampleVideoLabel")}
              className="tutorial-video-reader-video"
              src={tutorialListeningPosterSrc}
            />
            <div className="video-reader-player-caption mode-bilingual">
              <strong className="video-reader-caption-line source" lang="en">
                The guide{" "}
                <ActionText
                  action={selectWasGoingTo}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                  tone="teal"
                >
                  was going to
                </ActionText>{" "}
                explain the{" "}
                <ActionText
                  action={selectShortcut}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                  tone="orange"
                >
                  shortcut
                </ActionText>
                , but the player{" "}
                <ActionText
                  action={selectRunning}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                  tone="purple"
                >
                  had already started running
                </ActionText>
                .
              </strong>
              <span className="video-reader-caption-line translation" lang="ko">
                가이드는 지름길을 설명하려던 참이었는데, 플레이어는 이미 뛰기 시작했다.
              </span>
            </div>
            <span className="status-text compact tutorial-runtime-tts-note">
              {t("tutorial.common.deviceTtsNotice")}
            </span>
            {ttsStatus ? <span className="status-text compact tutorial-runtime-tts-status" role="status">{ttsStatus}</span> : null}
            {mediaError ? <span className="status-text compact danger tutorial-runtime-tts-status" role="alert">{mediaError}</span> : null}
            {hasSelectedVideoExpressions && !hasBuiltVideoCard ? (
              <div className="video-reader-key-confirm-popover tutorial-video-confirm">
                <strong>{t("tutorial.video.confirmTitle")}</strong>
                <span>was going to · shortcut · had already started running · 00:12-00:18</span>
                <p className="tutorial-video-confirm-help">
                  {t("tutorial.video.confirmDescriptionBeforeKey")} <kbd>R</kbd>
                  {t("tutorial.video.confirmDescriptionAfterKey")}
                </p>
                <div
                  className="tutorial-video-confirm-shortcuts"
                  aria-label={t("tutorial.video.saveFlowLabel")}
                >
                  <span>
                    <Sparkles size={14} />
                    {t("tutorial.video.highlight")}
                  </span>
                  <span>
                    <kbd>R</kbd>
                    {t("tutorial.video.saveSegment")}
                  </span>
                </div>
                <ActionButton
                  action={videoSaveAction}
                  completedActionSet={completedActionSet}
                  isActionAvailable={isActionAvailable}
                  nextTarget={nextTarget}
                  onAction={onAction}
                  variant="primary small"
                >
                  <kbd>R</kbd>
                  {t("tutorial.video.createSegmentCard")}
                </ActionButton>
                <CoachBubble action={videoSaveAction} hint={videoSaveHint} matchId="build-video-card" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="video-reader-controls">
          <button className="button primary" disabled={isPlayingSample} onClick={() => void playTutorialVideoReaderSample()} type="button">
            <Volume2 size={16} />
            {isPlayingSample ? t("cardPreview.actions.playing") : t("tutorial.video.play")}
          </button>
          <button className="button secondary" type="button">
            <Captions size={16} />
            {t("tutorial.video.subtitles")}
          </button>
          <button className="button secondary" type="button">
            <Subtitles size={16} />
            {t("tutorial.video.repeatSegment")}
          </button>
        </div>
        {shouldShowSoundPoints ? <SoundPointLegend /> : null}
      </section>

      <aside className="panel video-reader-side tab-subtitles tutorial-side-preview" onClick={(event) => event.stopPropagation()}>
        <div className="video-reader-side-head">
          <div>
            <strong>{t("tutorial.video.subtitleList")}</strong>
            <span>{t("tutorial.video.currentSegmentCount", { current: 2, total: 5 })}</span>
          </div>
        </div>
        <div className="video-reader-timeline">
          <button className="active" type="button">
            <span>00:12</span>
            <strong>The guide was going to explain...</strong>
            <small>{t("tutorial.video.currentSegment")}</small>
          </button>
          <button type="button">
            <span>00:19</span>
            <strong>Then everyone moved closer.</strong>
            <small>{t("tutorial.video.nextSubtitle")}</small>
          </button>
        </div>
        <PreviewOrPlaceholder card={previewCard} showPreview={false} />
      </aside>
      {shouldShowPreview ? (
        <VideoCardResultPopover
          card={previewCard}
          completedActionSet={completedActionSet}
          continueAction={continueAction}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
        />
      ) : null}
    </div>
  );
}

function VideoCardResultPopover({
  card,
  completedActionSet,
  continueAction,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  card: StudyCard | null;
  completedActionSet: Set<string>;
  continueAction?: CardTutorialAction;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="selection-popover tutorial-listening-result-popover tutorial-video-result-popover"
      data-qa="tutorial-video-result-popover"
    >
      <div className="tutorial-pdf-result-head">
        <div className="tutorial-pdf-result-title">
          <Film size={17} />
          <strong>{t("tutorial.video.previewTitle")}</strong>
          <span>{t("tutorial.video.previewDescription")}</span>
        </div>
        <button
          aria-label={t("common.close")}
          className="icon-button selection-popover-close"
          type="button"
        >
          ×
        </button>
      </div>
      <div className="tutorial-pdf-result-body">
        <PreviewOrPlaceholder card={card} showPreview={Boolean(card)} />
      </div>
      <div className="tutorial-pdf-result-actions">
        <ActionButton
          action={continueAction}
          completedActionSet={completedActionSet}
          icon={<ArrowRight size={16} />}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
          variant="primary wide"
        >
          {t("tutorial.common.confirmAndContinue")}
        </ActionButton>
      </div>
    </div>
  );
}

function LifeCapturePractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const send = getAction(step, "send-life-capture-message");
  const sendDiscord = getAction(step, "send-discord-capture-message");
  const confirm = getAction(step, "confirm-life-capture");
  const hasChatCaptured = completedActionSet.has("send-life-capture-message");
  const hasDiscordCaptured = completedActionSet.has("send-discord-capture-message");
  const hasCaptured = hasChatCaptured || hasDiscordCaptured;
  const sendActive = nextTarget?.id === send?.id;
  const sendDiscordActive = nextTarget?.id === sendDiscord?.id;
  const canSend = Boolean(send && isActionAvailable(send));
  const canSendDiscord = Boolean(sendDiscord && isActionAvailable(sendDiscord));

  function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (send && canSend && !completedActionSet.has(send.id)) {
      onAction(send);
    }
  }

  function submitDiscordCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (sendDiscord && canSendDiscord && !completedActionSet.has(sendDiscord.id)) {
      onAction(sendDiscord);
    }
  }

  return (
    <div className="tutorial-feature-shell tutorial-life-capture" data-qa="tutorial-life-capture-scene">
      <section className="panel tutorial-capture-source-panel tutorial-chatgpt-surface" onClick={(event) => event.stopPropagation()}>
        <div className="tutorial-chatgpt-app">
          <aside className="tutorial-chatgpt-sidebar" aria-label={t("tutorial.lifeCapture.chatListLabel")}>
            <div className="tutorial-chatgpt-brand">
              <span className="tutorial-chatgpt-logo">◎</span>
              <strong>ChatGPT</strong>
            </div>
            <button className="tutorial-chatgpt-new-chat" type="button">
              {t("tutorial.lifeCapture.newChat")}
            </button>
            <div className="tutorial-chatgpt-history">
              <span>{t("tutorial.lifeCapture.today")}</span>
              <button className="active" type="button">
                {t("tutorial.lifeCapture.strategyPractice")}
              </button>
              <button type="button">{t("tutorial.lifeCapture.gameExpressions")}</button>
            </div>
          </aside>

          <div className="tutorial-chatgpt-main">
            <div className="tutorial-chatgpt-topbar">
              <strong>Strategy Guide</strong>
              <span>{t("tutorial.lifeCapture.webReaderExample")}</span>
            </div>
            <div className="tutorial-chatgpt-thread">
              <article className="tutorial-chatgpt-source-card">
                <span>{t("nav.webReader")}</span>
                <strong lang="en">The guide was going to explain the next step.</strong>
              </article>
              <div className="tutorial-chatgpt-message assistant">
                <span className="tutorial-chatgpt-avatar">AI</span>
                <div className="tutorial-chatgpt-message-body">
                  <p>
                    {t("tutorial.lifeCapture.assistantInstruction")}
                  </p>
                </div>
              </div>
              {hasChatCaptured ? (
                <div className="tutorial-chatgpt-message user">
                  <div className="tutorial-chatgpt-message-body">
                    <p lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</p>
                    <small>{t("tutorial.lifeCapture.collected")}</small>
                  </div>
                  <span className="tutorial-chatgpt-avatar user">{t("tutorial.lifeCapture.me")}</span>
                </div>
              ) : null}
            </div>
            <form
              className={`tutorial-chatgpt-composer ${sendActive ? "tutorial-hotspot active tutorial-spotlight-target" : ""}`}
              data-tutorial-target-id={sendActive ? send?.id : undefined}
              onSubmit={submitCapture}
            >
              <input
                defaultValue="금방 갈게. 먼저 시작하지 말고 조금만 기다려줘."
                aria-label={t("tutorial.lifeCapture.chatInputLabel")}
                lang="ko"
              />
              <button
                className="tutorial-chatgpt-send-button"
                data-tutorial-target-id={sendActive ? send?.id : undefined}
                type="submit"
                disabled={!canSend || hasChatCaptured}
              >
                <Send size={15} />
                <span>Enter</span>
              </button>
            </form>
            <small className="tutorial-chatgpt-footnote">{t("tutorial.lifeCapture.enterFootnote")}</small>
            <CoachBubble action={nextTarget} hint={hint} matchId={send?.id} />
          </div>
        </div>
      </section>

      <section className="panel tutorial-capture-discord-panel tutorial-discord-surface" onClick={(event) => event.stopPropagation()}>
        <div className="tutorial-discord-window">
          <aside className="tutorial-discord-rail" aria-label={t("tutorial.lifeCapture.discordServersLabel")}>
            <span className="home">LM</span>
            <span>EN</span>
            <span>GM</span>
          </aside>
          <aside className="tutorial-discord-channel-list" aria-label={t("tutorial.lifeCapture.discordChannelsLabel")}>
            <div className="tutorial-discord-server-head">
              <strong>Language Mine</strong>
              <ChevronDown size={15} />
            </div>
            <div className="tutorial-discord-channel-group">
              <small>{t("tutorial.lifeCapture.textChannels")}</small>
              <button className="active" type="button">
                # boss-run
              </button>
              <button type="button"># english-practice</button>
              <button type="button"># clips</button>
            </div>
            <div className="tutorial-discord-userbar">
              <span className="tutorial-discord-avatar self">{t("tutorial.lifeCapture.me")}</span>
              <div>
                <strong>{t("tutorial.lifeCapture.me")}</strong>
                <small>{t("tutorial.lifeCapture.online")}</small>
              </div>
            </div>
          </aside>
          <div className="tutorial-discord-chat">
            <div className="tutorial-discord-channel-head">
              <strong># boss-run</strong>
              <span>{t("tutorial.lifeCapture.discordExample")}</span>
            </div>
            <div className="tutorial-discord-messages">
              <div className="tutorial-discord-date-divider">
                <span>{t("tutorial.lifeCapture.timeToday")}</span>
              </div>
              <div className="tutorial-discord-message">
                <span className="tutorial-discord-avatar mina">M</span>
                <div>
                  <strong>Mina <small>{t("tutorial.lifeCapture.timeToday")}</small></strong>
                  <p lang="ko">지금 보스전 들어갈까?</p>
                </div>
              </div>
              <div className="tutorial-discord-message">
                <span className="tutorial-discord-avatar joon">J</span>
                <div>
                  <strong>Joon <small>{t("tutorial.lifeCapture.timeToday")}</small></strong>
                  <p lang="ko">나도 준비됐어. 너만 오면 돼.</p>
                </div>
              </div>
              {hasDiscordCaptured ? (
                <div className="tutorial-discord-message own">
                  <span className="tutorial-discord-avatar self">{t("tutorial.lifeCapture.me")}</span>
                  <div>
                    <strong>{t("tutorial.lifeCapture.me")} <small>{t("tutorial.lifeCapture.justNow")}</small></strong>
                    <p lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</p>
                  </div>
                </div>
              ) : null}
            </div>
            <form
              className={`tutorial-discord-composer ${sendDiscordActive ? "tutorial-hotspot active tutorial-spotlight-target" : ""}`}
              data-tutorial-target-id={sendDiscordActive ? sendDiscord?.id : undefined}
              onSubmit={submitDiscordCapture}
            >
              <span className="tutorial-discord-plus">+</span>
              <input
                aria-label={t("tutorial.lifeCapture.discordInputLabel")}
                defaultValue="금방 갈게. 먼저 시작하지 말고 조금만 기다려줘."
                lang="ko"
              />
              <button
                className="tutorial-discord-send-button"
                data-tutorial-target-id={sendDiscordActive ? sendDiscord?.id : undefined}
                disabled={!canSendDiscord || hasDiscordCaptured}
                type="submit"
              >
                <Send size={14} />
                <span>Enter</span>
              </button>
            </form>
          </div>
        </div>
        <p className="tutorial-capture-reason">
          {t("tutorial.lifeCapture.reason")}
        </p>
        <CoachBubble action={nextTarget} hint={hint} matchId={sendDiscord?.id} />
      </section>

      <aside className="panel tutorial-capture-candidate-panel" onClick={(event) => event.stopPropagation()}>
        <div className="tutorial-side-head">
          <strong>{t("tutorial.lifeCapture.candidatesTitle")}</strong>
          <span>{t("tutorial.lifeCapture.candidatesDescription")}</span>
        </div>
        {hasCaptured ? (
          <div className="tutorial-captured-log-list">
            {hasChatCaptured ? (
              <div className="life-log-item tutorial-captured-log">
                <span className="life-log-body">
                  <span className="life-log-text" lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</span>
                  <small className="life-log-source-line">{t("tutorial.lifeCapture.webReaderSource")}</small>
                </span>
              </div>
            ) : null}
            {hasDiscordCaptured ? (
              <div className="life-log-item tutorial-captured-log">
                <span className="life-log-body">
                  <span className="life-log-text" lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</span>
                  <small className="life-log-source-line">{t("tutorial.lifeCapture.discordSource")}</small>
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="tutorial-preview-placeholder compact">
            <Lightbulb size={20} />
            <strong>{t("tutorial.lifeCapture.waitingTitle")}</strong>
            <span>{t("tutorial.lifeCapture.waitingDescription")}</span>
          </div>
        )}
        <ActionButton
          action={confirm}
          completedActionSet={completedActionSet}
          icon={<ArrowRight size={16} />}
          isActionAvailable={isActionAvailable}
          nextTarget={nextTarget}
          onAction={onAction}
          variant="primary wide"
        />
        <CoachBubble action={nextTarget} hint={hint} matchId={confirm?.id} />
      </aside>
    </div>
  );
}

function LifeMiningPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  shouldShowPreview,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const select = getAction(step, "select-life-reply");
  const build = getAction(step, "build-output-card");
  const save = getAction(step, "save-output-card");

  return (
    <div className="page-grid life-layout tutorial-feature-shell tutorial-life-mining" data-qa="tutorial-life-mining-scene">
      <section className="panel list-panel life-candidate-panel">
        <div className="life-candidate-toolbar">
          <div className="panel-heading">
            <Lightbulb size={19} />
            <h2>{t("nav.lifeMining")}</h2>
            <span className="pill">{t("tutorial.lifeMining.candidateCount", { count: 3 })}</span>
          </div>
          <div className="life-candidate-actions">
            <button className="button secondary small" type="button">
              <ListChecks size={15} />
              {t("tutorial.lifeMining.selectionMode")}
            </button>
          </div>
        </div>
        <div className="life-auto-status">
          <div>
            <Radio size={16} />
            <strong>{t("tutorial.lifeMining.browserCapture")}</strong>
            <span>{t("tutorial.lifeMining.autoCapture")}</span>
          </div>
          <small>{t("tutorial.lifeMining.captureDescription")}</small>
        </div>
        <div className="life-log-list" onClick={(event) => event.stopPropagation()}>
          <button className="life-log-item" type="button">
            <span className="life-log-body">
              <span className="life-log-text" lang="ko">지금 보스전 들어갈까?</span>
              <small className="life-log-source-line">Mina · Discord</small>
            </span>
          </button>
          <ActionPanelButton
            action={select}
            completedActionSet={completedActionSet}
            isActionAvailable={isActionAvailable}
            nextTarget={nextTarget}
            onAction={onAction}
          >
            <span className="life-log-body">
              <span className="life-log-text" lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</span>
              <small className="life-log-source-line">{t("tutorial.lifeMining.myReplySource")}</small>
            </span>
          </ActionPanelButton>
          <button className="life-log-item" type="button">
            <span className="life-log-body">
              <span className="life-log-text" lang="ko">나도 준비됐어. 너만 오면 돼.</span>
              <small className="life-log-source-line">Joon · Discord</small>
            </span>
          </button>
        </div>
      </section>

      <section className="panel detail-panel tutorial-side-preview" onClick={(event) => event.stopPropagation()}>
        {shouldShowPreview ? (
          <>
            <PreviewOrPlaceholder card={previewCard} showPreview />
            <ActionButton
              action={save}
              completedActionSet={completedActionSet}
              icon={<ArrowRight size={16} />}
              isActionAvailable={isActionAvailable}
              nextTarget={nextTarget}
              onAction={onAction}
              variant="primary wide"
            />
          </>
        ) : (
          <div className="life-log-detail">
            <div className="panel-heading">
              <Inbox size={19} />
              <h2>{t("tutorial.lifeMining.selectedCandidate")}</h2>
            </div>
            <div className="tutorial-chat-preview">
              <MessageBubble speaker="Mina"><span lang="ko">지금 보스전 들어갈까?</span></MessageBubble>
              <MessageBubble speaker="Joon"><span lang="ko">나도 준비됐어. 너만 오면 돼.</span></MessageBubble>
              <MessageBubble own speaker={t("tutorial.lifeCapture.me")}>
                <span lang="ko">금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.</span>
              </MessageBubble>
            </div>
            <p className="tutorial-capture-reason compact">
              {t("tutorial.lifeMining.conversionDescription")}
            </p>
            <ActionButton
              action={build}
              completedActionSet={completedActionSet}
              icon={<Wand2 size={16} />}
              isActionAvailable={isActionAvailable}
              nextTarget={nextTarget}
              onAction={onAction}
              variant="success wide"
            />
            <CoachBubble action={nextTarget} hint={hint} includeInSpotlight matchId={build?.id ?? select?.id} />
          </div>
        )}
      </section>
    </div>
  );
}

function CardsOverviewPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const inspect = getAction(step, "inspect-first-card");
  const confirm = getAction(step, "confirm-cards-overview");
  const hasInspectedCard = completedActionSet.has("inspect-first-card");
  const isConfirmTarget = nextTarget?.id === confirm?.id;

  return (
    <div className="page-grid tutorial-cards-finish" data-qa="tutorial-cards-overview-scene">
      <section className="panel list-panel">
        <div className="panel-heading">
          <CreditCard size={19} />
          <h2>{t("nav.cards")}</h2>
          <span className="pill">{t("app.stats.cards", { count: 5 })}</span>
        </div>
        <div className="tutorial-card-filter-tabs" aria-label={t("tutorial.mock.cardFilter")}>
          <button className="active" type="button">{t("tutorial.mock.all")}</button>
          <button type="button">{t("tutorial.mock.readingCards")}</button>
          <button type="button">{t("tutorial.mock.listeningCards")}</button>
          <button type="button">{t("tutorial.mock.speakingCards")}</button>
        </div>
        <div className="tutorial-card-list">
          <VirtualCardRow
            action={inspect}
            active={hasInspectedCard}
            completedActionSet={completedActionSet}
            isActionAvailable={isActionAvailable}
            label={t("tutorial.mock.reading")}
            meta={t("tutorial.mock.startGuideStructure")}
            nextTarget={nextTarget}
            onAction={onAction}
            title={previewCard?.sourceSentence ?? "I’m running a little late."}
          />
          <VirtualCardRow
            label={t("tutorial.mock.reading")}
            meta={t("tutorial.mock.documentSample")}
            title="inanimate"
          />
          <VirtualCardRow
            label={t("tutorial.mock.listening")}
            meta={t("tutorial.mock.startGuideLinking")}
            title="Could you send it to me when you get a chance?"
          />
          <VirtualCardRow
            label={t("tutorial.mock.listening")}
            meta={t("tutorial.mock.videoSample")}
            title="The guide was going to explain..."
          />
          <VirtualCardRow
            label={t("tutorial.mock.speaking")}
            meta={t("tutorial.mock.startGuideSpeaking")}
            title={t("tutorial.mock.speakingSample")}
          />
        </div>
        <CoachBubble action={nextTarget} hint={hint} matchId={inspect?.id} />
      </section>
      <section className="panel detail-panel tutorial-card-detail-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <CreditCard size={19} />
          <h2>{t("tutorial.mock.cardDetails")}</h2>
          <span className="pill">
            {hasInspectedCard ? t("tutorial.mock.selected") : t("tutorial.mock.waiting")}
          </span>
        </div>
        <div
          className={`tutorial-card-preview-surface ${isConfirmTarget ? "tutorial-spotlight-target" : ""}`}
          data-tutorial-target-id={isConfirmTarget ? confirm?.id : undefined}
        >
          {hasInspectedCard && previewCard ? (
            <CardPreview card={previewCard} />
          ) : (
            <div className="tutorial-card-empty-detail">
              <CreditCard size={30} />
              <strong>{t("tutorial.mock.selectCard")}</strong>
              <span>{t("tutorial.mock.selectCardDescription")}</span>
            </div>
          )}
        </div>
        {confirm ? (
          <button
            className={`button primary tutorial-action-button tutorial-card-overview-next ${
              isConfirmTarget ? "tutorial-hotspot active tutorial-spotlight-target" : ""
            }`}
            data-tutorial-target-id={isConfirmTarget ? confirm.id : undefined}
            disabled={!isActionAvailable(confirm) || completedActionSet.has(confirm.id)}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAction(confirm);
            }}
          >
            {completedActionSet.has(confirm.id) ? <CheckCircle2 size={15} /> : <RotateCcw size={16} />}
            {completedActionSet.has(confirm.id) ? confirm.doneLabel ?? confirm.label : confirm.label}
          </button>
        ) : null}
        <CoachBubble action={nextTarget} hint={hint} matchId={confirm?.id} />
      </section>
    </div>
  );
}

function ReviewIntroPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  previewCard,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const start = getAction(step, "start-review-session");
  const showBack = getAction(step, "show-review-back");
  const rate = getAction(step, "rate-review-card");
  const hasStarted = completedActionSet.has("start-review-session");
  const hasShownBack = completedActionSet.has("show-review-back");
  const showBackActive = nextTarget?.id === showBack?.id;
  const rateActive = nextTarget?.id === rate?.id;
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(hasStarted);

  useEffect(() => {
    if (hasStarted) {
      setIsReviewDialogOpen(true);
    }
  }, [hasStarted]);

  return (
    <section className="panel review-panel tutorial-review-intro" data-qa="tutorial-review-intro-scene" onClick={(event) => event.stopPropagation()}>
      <div className="panel-heading">
        <RotateCcw size={19} />
        <h2>{t("nav.review")}</h2>
        <span className="pill">{t("review.waitingCount", { count: 5 })}</span>
        <button className="button ghost small" type="button">
          {t("review.refresh")}
        </button>
      </div>
      <div className="review-deck-dashboard">
        <article className="review-deck-card active">
          <button className="review-deck-select" type="button" aria-pressed="true">
            <span className="review-deck-card-head">
              <span>
                <strong>{t("tutorial.mock.readingDeck")}</strong>
                <small>{t("tutorial.mock.readingCards")}</small>
              </span>
              <span className="review-total-count">{t("review.cardsCount", { count: 2 })}</span>
            </span>
            <span className="review-count-row">
              <span className="review-count-badge new">
                <strong>2</strong>
                <small>{t("review.newCards")}</small>
              </span>
              <span className="review-count-badge learning">
                <strong>0</strong>
                <small>{t("review.learning")}</small>
              </span>
              <span className="review-count-badge review">
                <strong>0</strong>
                <small>{t("nav.review")}</small>
              </span>
            </span>
            <span className="review-deck-meta">
              {t("review.deckMeta", { overdue: 0, completed: 0 })}
            </span>
          </button>
          <ActionButton
            action={start}
            completedActionSet={completedActionSet}
            isActionAvailable={isActionAvailable}
            nextTarget={nextTarget}
            onAction={(action) => {
              onAction(action);
              setIsReviewDialogOpen(true);
            }}
            variant="primary review-start-button"
          >
            {t("review.start")}
            <span>{t("review.cardsCount", { count: 2 })}</span>
          </ActionButton>
        </article>
        <TutorialReviewDeckCard
          title={t("tutorial.mock.listeningDeck")}
          subtitle={t("tutorial.mock.listeningCards")}
          count={2}
        />
        <TutorialReviewDeckCard
          title={t("tutorial.mock.speakingDeck")}
          subtitle={t("tutorial.mock.speakingCards")}
          count={1}
        />
      </div>

      {hasStarted && isReviewDialogOpen ? (
        <TutorialReviewSessionDialog
          ariaLabel={t("tutorial.mock.reviewSessionLabel")}
          onClose={() => setIsReviewDialogOpen(false)}
        >
          <div className="review-session-modal-header">
            <div>
              <span>{t("review.session.eyebrow")}</span>
              <h2>{t("tutorial.mock.readingDeck")}</h2>
            </div>
            <div className="tutorial-review-modal-tools">
              <span className="review-session-count">
                {t("tutorial.common.position", { current: 1, total: 2 })}
              </span>
              <button
                aria-label={t("common.close")}
                className="tutorial-review-close"
                type="button"
                onClick={() => setIsReviewDialogOpen(false)}
              >
                ×
              </button>
            </div>
          </div>
          <div className="tutorial-review-card-frame">
            {previewCard ? (
              <CardPreview
                answerToggleClassName={showBackActive ? "tutorial-hotspot active tutorial-spotlight-target" : undefined}
                answerToggleTargetId={showBackActive ? showBack?.id : undefined}
                card={previewCard}
                defaultShowBack={hasShownBack}
                onReview={() => {
                  if (rate && isActionAvailable(rate) && !completedActionSet.has(rate.id)) {
                    onAction(rate);
                  }
                }}
                onToggleBack={(nextShowBack) => {
                  if (nextShowBack && showBack && isActionAvailable(showBack) && !completedActionSet.has(showBack.id)) {
                    onAction(showBack);
                  }
                }}
                reviewActions={hasShownBack}
                reviewActionsClassName={rateActive ? "tutorial-hotspot active tutorial-spotlight-target" : undefined}
                reviewActionsTargetId={rateActive ? rate?.id : undefined}
              />
            ) : null}
          </div>
          {hasShownBack ? (
            <div className="tutorial-review-actions tutorial-review-actions-note">
              {t("tutorial.mock.ratingHint")}
            </div>
          ) : null}
        </TutorialReviewSessionDialog>
      ) : null}
      <CoachBubble action={nextTarget} hint={hint} matchId={nextTarget?.id} />
    </section>
  );
}

function TutorialReviewSessionDialog({
  ariaLabel,
  children,
  onClose
}: {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const content = <>{children}</>;
  if (typeof document === "undefined") {
    return (
      <div className="tutorial-review-modal-layer">
        <section
          aria-label={ariaLabel}
          aria-modal="true"
          className="review-session-modal tutorial-review-session"
          role="dialog"
        >
          {content}
        </section>
      </div>
    );
  }

  return (
    <Dialog
      ariaLabel={ariaLabel}
      backdropClassName="tutorial-review-modal-layer"
      className="review-session-modal tutorial-review-session"
      closeOnBackdrop={false}
      onClose={onClose}
    >
      {content}
    </Dialog>
  );
}

function TutorialReviewDeckCard({ count, subtitle, title }: { count: number; subtitle: string; title: string }) {
  const { t } = useTranslation();
  return (
    <article className="review-deck-card">
      <button className="review-deck-select" type="button">
        <span className="review-deck-card-head">
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <span className="review-total-count">{t("review.cardsCount", { count })}</span>
        </span>
        <span className="review-count-row">
          <span className="review-count-badge new">
            <strong>1</strong>
            <small>{t("review.newCards")}</small>
          </span>
          <span className="review-count-badge learning">
            <strong>0</strong>
            <small>{t("review.learning")}</small>
          </span>
          <span className="review-count-badge review">
            <strong>0</strong>
            <small>{t("nav.review")}</small>
          </span>
        </span>
      </button>
      <button className="button primary review-start-button" disabled type="button">
        {t("review.start")}
        <span>{t("review.cardsCount", { count })}</span>
      </button>
    </article>
  );
}

function TodayMissionPractice({
  completedActionSet,
  hint,
  isActionAvailable,
  nextTarget,
  onAction,
  step
}: PracticeSceneProps) {
  const { t } = useTranslation();
  const inspect = getAction(step, "inspect-daily-missions");
  const finish = getAction(step, "finish");
  const hasInspected = completedActionSet.has("inspect-daily-missions");

  return (
    <div className="document-page pdf-hub-page tutorial-today-mission" data-qa="tutorial-today-mission-scene" onClick={(event) => event.stopPropagation()}>
      <section className="pdf-hub-shell">
        <section className="today-hub-panel" data-qa="tutorial-today-hub">
          <div className="today-hub-command-row">
            <div className="today-hub-heading">
              <span className="today-hub-eyebrow">{t("today.eyebrow")}</span>
              <h2>{t("today.title")}</h2>
              <p>{t("tutorial.todayMock.description")}</p>
            </div>
          </div>
          <div className="today-hub-grid">
            <TutorialTodayHubCard accent="review" icon={<RotateCcw size={22} />} title={t("today.cards.review.title")} metric={t("review.cardsCount", { count: 5 })} actionLabel={t("today.cards.review.action")} />
            <TutorialTodayHubCard accent="life" icon={<Lightbulb size={22} />} title={t("today.cards.candidates.title")} metric={t("tutorial.todayMock.candidateCount", { count: 1 })} actionLabel={t("today.cards.candidates.action")} />
            <TutorialTodayHubCard accent="listening" icon={<Headphones size={22} />} title={t("today.cards.listening.title")} metric={t("tutorial.todayMock.sentenceCount", { count: 2 })} actionLabel={t("today.cards.listening.action")} />
          </div>
        </section>

        <section className="daily-routine-panel ready">
          <div className="daily-routine-panel-main">
            <span className="daily-routine-panel-icon">
              <ListChecks size={22} />
            </span>
            <div>
              <span className="daily-routine-eyebrow">{t("today.routine.eyebrow")}</span>
              <h2>{t("tutorial.todayMock.routineTitle")}</h2>
              <p>{t("tutorial.todayMock.routineDescription")}</p>
            </div>
          </div>
          <div className="daily-routine-side">
            <span className="daily-routine-count">
              {t("tutorial.common.position", { current: 0, total: 4 })}
            </span>
            <span className="daily-routine-track" aria-hidden="true">
              <span style={{ width: "25%" }} />
            </span>
          </div>
        </section>

        <section className="daily-mission-panel tutorial-daily-mission-panel">
          <div className="daily-mission-header">
            <div>
              <span className="daily-mission-eyebrow">{t("tutorial.todayMock.dailyQuest")}</span>
              <h2>{t("tutorial.todayMock.missionsTitle")}</h2>
              <p>{t("tutorial.todayMock.missionsDescription")}</p>
            </div>
            <div className="diamond-wallet-card">
              <Gem size={22} />
              <span>
                <strong>120</strong>
                <small>{t("tutorial.todayMock.diamondsToday", { count: 45 })}</small>
              </span>
            </div>
          </div>
          <div className="daily-mission-category-list">
            <TutorialMissionCategory title={t("nav.sections.input")} mission={t("tutorial.todayMock.readingMission")} progress="2 / 5" reward="15" />
            <TutorialMissionCategory title={t("nav.sections.output")} mission={t("tutorial.todayMock.lifeMission")} progress="1 / 5" reward="25" />
            <TutorialMissionCategory title={t("nav.review")} mission={t("tutorial.todayMock.reviewMission")} progress="0 / 1" reward="15" />
          </div>
          <ActionButton
            action={inspect}
            completedActionSet={completedActionSet}
            icon={<Gem size={16} />}
            isActionAvailable={isActionAvailable}
            nextTarget={nextTarget}
            onAction={onAction}
            variant="primary"
          />
        </section>

        {hasInspected ? (
          <section className="panel tutorial-diamond-note">
            <Gem size={24} />
            <div>
              <h3>{t("tutorial.todayMock.diamondTitle")}</h3>
              <p>{t("tutorial.todayMock.diamondDescription")}</p>
            </div>
            <ActionButton
              action={finish}
              completedActionSet={completedActionSet}
              icon={<CheckCircle2 size={16} />}
              isActionAvailable={isActionAvailable}
              nextTarget={nextTarget}
              onAction={onAction}
              variant="primary"
            />
          </section>
        ) : null}
        <CoachBubble action={nextTarget} hint={hint} matchId={nextTarget?.id} />
      </section>
    </div>
  );
}

function TutorialTodayHubCard({
  accent,
  actionLabel,
  icon,
  metric,
  title
}: {
  accent: string;
  actionLabel: string;
  icon: ReactNode;
  metric: string;
  title: string;
}) {
  const { t } = useTranslation();
  return (
    <article className={`today-hub-card ${accent}`}>
      <div className="today-hub-card-title">
        <span className="today-hub-card-icon">{icon}</span>
        <strong>{title}</strong>
      </div>
      <div className="today-hub-card-body">
        <div className="today-hub-card-metric">
          <strong>{metric}</strong>
          <span>{t("tutorial.todayMock.progressToday")}</span>
        </div>
      </div>
      <button className="button secondary small" type="button">
        {actionLabel}
      </button>
    </article>
  );
}

function TutorialMissionCategory({
  mission,
  progress,
  reward,
  title
}: {
  mission: string;
  progress: string;
  reward: string;
  title: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="daily-mission-category">
      <div className="daily-mission-category-head">
        <span>{title}</span>
        <small>{t("tutorial.todayMock.today")}</small>
      </div>
      <div className="daily-mission-grid">
        <article className="mission-card">
          <div className="mission-card-head">
            <span className="mission-icon">
              <Gem size={18} />
            </span>
            <span>
              <strong>{mission}</strong>
              <small>{t("tutorial.todayMock.rewardDescription")}</small>
            </span>
          </div>
          <div className="mission-progress-row">
            <span>{progress}</span>
            <span className="mission-reward">
              <Gem size={14} />
              {reward}
            </span>
          </div>
          <span className="mission-progress-track" aria-hidden="true">
            <span style={{ width: progress.startsWith("0") ? "12%" : "45%" }} />
          </span>
          <button className="button primary small" disabled type="button">
            {t("tutorial.todayMock.inProgress")}
          </button>
        </article>
      </div>
    </section>
  );
}

function ActionButton({
  action,
  children,
  completedActionSet,
  icon,
  isActionAvailable,
  nextTarget,
  onAction,
  variant = "secondary"
}: {
  action?: CardTutorialAction;
  children?: ReactNode;
  completedActionSet: Set<string>;
  icon?: ReactNode;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  variant?: string;
}) {
  if (!action) {
    return null;
  }
  const done = completedActionSet.has(action.id);
  const available = isActionAvailable(action);
  const active = nextTarget?.id === action.id;

  return (
    <button
      className={`button ${variant} tutorial-action-button ${active ? "tutorial-hotspot active tutorial-spotlight-target" : ""} ${done ? "done" : ""}`}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!available && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
    >
      {done ? <CheckCircle2 size={15} /> : icon}
      {done ? action.doneLabel ?? action.label : children ?? action.label}
    </button>
  );
}

function ActionText({
  action,
  children,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction,
  tone
}: {
  action?: CardTutorialAction;
  children: ReactNode;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  tone?: "orange" | "purple" | "teal";
}) {
  if (!action) {
    return <>{children}</>;
  }
  const done = completedActionSet.has(action.id);
  const available = isActionAvailable(action);
  const active = nextTarget?.id === action.id;

  return (
    <button
      className={`tutorial-inline-target${tone ? ` tone-${tone}` : ""} ${
        active ? "tutorial-hotspot active tutorial-spotlight-target" : ""
      } ${done ? "done" : ""}`}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!available && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
    >
      {children}
    </button>
  );
}

function ListeningPhraseTarget({
  action,
  children,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  action?: CardTutorialAction;
  children: ReactNode;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSelectRef = useRef(false);

  if (!action) {
    return <>{children}</>;
  }

  const done = completedActionSet.has(action.id);
  const available = isActionAvailable(action);
  const active = nextTarget?.id === action.id;

  function completeSelection() {
    if (!action || done || !available || didSelectRef.current) {
      return;
    }
    didSelectRef.current = true;
    onAction(action);
  }

  return (
    <button
      className={`tutorial-listening-drag-target ${active ? "tutorial-hotspot active tutorial-spotlight-target" : ""} ${
        done ? "selected done" : ""
      }`}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!available && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        completeSelection();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && available && !done) {
          event.preventDefault();
          event.stopPropagation();
          completeSelection();
        }
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!available || done) {
          return;
        }
        didSelectRef.current = false;
        dragStartRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = dragStartRef.current;
        if (!start || !available || done) {
          return;
        }
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance >= 18 && Math.abs(deltaX) >= 10) {
          event.preventDefault();
          completeSelection();
          dragStartRef.current = null;
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        dragStartRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      {children}
    </button>
  );
}

function ActionPanelButton({
  action,
  children,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  action?: CardTutorialAction;
  children: ReactNode;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  if (!action) {
    return <button className="life-log-item" type="button">{children}</button>;
  }
  const done = completedActionSet.has(action.id);
  const active = nextTarget?.id === action.id;

  return (
    <button
      className={`life-log-item life-log-select tutorial-panel-target ${active ? "tutorial-hotspot active tutorial-spotlight-target" : ""} ${done ? "selected" : ""}`}
      data-tutorial-target-id={active ? action.id : undefined}
      disabled={!isActionAvailable(action) && !done}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
    >
      {children}
    </button>
  );
}

function VirtualSaveButton({
  action,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction
}: {
  action?: CardTutorialAction;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
}) {
  if (!action) {
    return null;
  }
  const done = completedActionSet.has(action.id);

  return (
    <div className="tutorial-virtual-save">
      <ActionButton
        action={action}
        completedActionSet={completedActionSet}
        icon={<Save size={16} />}
        isActionAvailable={isActionAvailable}
        nextTarget={nextTarget}
        onAction={onAction}
        variant="primary wide"
      />
    </div>
  );
}

function InlinePreviewPanel({
  card,
  completedActionSet,
  isActionAvailable,
  nextTarget,
  onAction,
  saveAction,
  showPreview
}: {
  card: StudyCard | null;
  completedActionSet: Set<string>;
  isActionAvailable: (action: CardTutorialAction) => boolean;
  nextTarget?: CardTutorialAction;
  onAction: (action: CardTutorialAction) => void;
  saveAction?: CardTutorialAction;
  showPreview: boolean;
}) {
  const { t } = useTranslation();
  return (
    <aside className="tutorial-inline-preview" onClick={(event) => event.stopPropagation()}>
      <div className="tutorial-side-head">
        <strong>{t("tutorial.common.previewTitle")}</strong>
        <span>{t("tutorial.common.previewDescription")}</span>
      </div>
      <PreviewOrPlaceholder card={card} showPreview={showPreview} />
      <VirtualSaveButton
        action={saveAction}
        completedActionSet={completedActionSet}
        isActionAvailable={isActionAvailable}
        nextTarget={nextTarget}
        onAction={onAction}
      />
    </aside>
  );
}

function PreviewOrPlaceholder({ card, showPreview }: { card: StudyCard | null; showPreview: boolean }) {
  const { t } = useTranslation();
  if (showPreview && card) {
    return (
      <div className="tutorial-card-preview-frame">
        <CardPreview card={card} defaultShowBack />
      </div>
    );
  }

  return (
    <div className="tutorial-preview-placeholder" role="status">
      <CreditCard size={22} />
      <strong>{t("tutorial.common.previewWaiting")}</strong>
      <span>{t("tutorial.common.previewWaitingDescription")}</span>
    </div>
  );
}

function CoachBubble({
  action,
  hint,
  includeInSpotlight = false,
  matchId
}: {
  action?: CardTutorialAction;
  hint: string;
  includeInSpotlight?: boolean;
  matchId?: string;
}) {
  const { t } = useTranslation();
  if (!action || action.id !== matchId) {
    return null;
  }
  const guideText = action.hint || hint;

  return (
    <div
      className="tutorial-coach-bubble tutorial-spotlight-target"
      data-tutorial-coach-for={action.id}
      data-tutorial-target-id={includeInSpotlight ? action.id : undefined}
    >
      <img alt="" className="tutorial-coach-mascot" src={tutorialMascotSrc} />
      <span className="tutorial-coach-speech">
        <b>{t("tutorial.shell.moleGuide")}</b>
        <span>{guideText}</span>
      </span>
    </div>
  );
}

function SelectedChips({
  completedActionSet,
  items
}: {
  completedActionSet: Set<string>;
  items: Array<[string, string]>;
}) {
  return (
    <div className="tutorial-selected-chips">
      {items.map(([id, label]) => (
        <span className={completedActionSet.has(id) ? "selected" : ""} key={id}>
          {label}
        </span>
      ))}
    </div>
  );
}

function SoundPointLegend() {
  const { t } = useTranslation();
  return (
    <div className="tutorial-sound-point-legend">
      <span>
        <b>{t("tutorial.sound.stressShort")}</b> {t("tutorial.sound.stress")}
      </span>
      <span>
        <b>↔</b> {t("tutorial.sound.linking")}
      </span>
      <span>
        <b>{t("tutorial.sound.reducedShort")}</b> {t("tutorial.sound.reduced")}
      </span>
    </div>
  );
}

function SoundToken({ children, kind }: { children: ReactNode; kind: "stress" | "linking" | "reduced" }) {
  return <span className={`tutorial-sound-token ${kind}`}>{children}</span>;
}

function MessageBubble({ children, own = false, speaker }: { children: ReactNode; own?: boolean; speaker: string }) {
  return (
    <div className={own ? "tutorial-message own" : "tutorial-message"}>
      <span>{speaker}</span>
      <strong>{children}</strong>
    </div>
  );
}

function VirtualCardRow({
  action,
  active = false,
  completedActionSet,
  isActionAvailable,
  label,
  meta,
  nextTarget,
  onAction,
  title
}: {
  action?: CardTutorialAction;
  active?: boolean;
  completedActionSet?: Set<string>;
  isActionAvailable?: (action: CardTutorialAction) => boolean;
  label: string;
  meta?: string;
  nextTarget?: CardTutorialAction;
  onAction?: (action: CardTutorialAction) => void;
  title: string;
}) {
  const { t } = useTranslation();
  const isTarget = Boolean(action && nextTarget?.id === action.id);
  const isDone = Boolean(action && completedActionSet?.has(action.id));
  const disabled = Boolean(action && isActionAvailable && !isActionAvailable(action) && !isDone);

  return (
    <button
      className={`card-list-row${active || isDone ? " active" : ""} ${
        isTarget ? "tutorial-hotspot active tutorial-spotlight-target" : ""
      }`}
      data-tutorial-target-id={isTarget && action ? action.id : undefined}
      disabled={disabled}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (!action || !onAction || disabled || isDone) {
          return;
        }
        onAction(action);
      }}
    >
      <span className="pill">{label}</span>
      <strong>{title}</strong>
      <small>{meta ?? t("tutorial.mock.sampleCard")}</small>
    </button>
  );
}

function getAction(step: CardTutorialStep, actionId: string) {
  return step.actions.find((action) => action.id === actionId);
}

function getNavAction(step: CardTutorialStep) {
  return step.actions.find((action) => action.navTargetTab);
}

function getNextTarget(step: CardTutorialStep, completedActionSet: Set<string>) {
  return step.actions.find((action) => !completedActionSet.has(action.id));
}

function getInitialTutorialTab(step: CardTutorialStep, completedActionIds: string[]): CardTutorialTab {
  const navAction = getNavAction(step);
  if (navAction?.navTargetTab && completedActionIds.includes(navAction.id)) {
    return navAction.navTargetTab;
  }
  return "pdfHub";
}

function getPhaseIndex(step: CardTutorialStep, completedActionCount: number) {
  if (step.actions.length === 0) {
    return 0;
  }
  if (completedActionCount >= step.actions.length) {
    return step.progressLabels.length;
  }
  return Math.min(
    step.progressLabels.length - 1,
    Math.floor((completedActionCount / step.actions.length) * step.progressLabels.length)
  );
}

function getTutorialModule(moduleId: CardTutorialModuleId, modules: CardTutorialModule[]) {
  return modules.find((module) => module.id === moduleId) ?? modules[0];
}

function getTutorialModuleIcon(moduleId: CardTutorialModuleId): LucideIcon {
  if (moduleId === "inputReading") {
    return BookOpen;
  }
  if (moduleId === "inputListening") {
    return Headphones;
  }
  if (moduleId === "output") {
    return Send;
  }
  return ListChecks;
}

function getTutorialModuleToneClass(moduleId: CardTutorialModuleId) {
  if (moduleId === "inputReading" || moduleId === "inputListening") {
    return "tone-input";
  }
  if (moduleId === "output") {
    return "tone-output";
  }
  return "tone-review";
}

function isModuleLocked(
  module: CardTutorialModule,
  completedModuleSet: Set<CardTutorialModuleId>,
  modules: CardTutorialModule[]
) {
  if (!module.lockedUntilPreviousComplete) {
    return false;
  }
  const moduleIndex = modules.findIndex((candidate) => candidate.id === module.id);
  if (moduleIndex <= 0) {
    return false;
  }
  const previousModule = modules[moduleIndex - 1];
  return !completedModuleSet.has(previousModule.id);
}

function isLastStepInModule(step: CardTutorialStep, modules: CardTutorialModule[]) {
  const module = modules.find((candidate) => candidate.id === step.moduleId);
  return module?.stepIds[module.stepIds.length - 1] === step.id;
}

function getFirstStepForNextModule(
  moduleId: CardTutorialModuleId,
  steps: CardTutorialStep[],
  modules: CardTutorialModule[]
) {
  const moduleIndex = modules.findIndex((module) => module.id === moduleId);
  const nextModule = modules[moduleIndex + 1];
  if (!nextModule) {
    return null;
  }
  return steps.find((step) => step.id === nextModule.stepIds[0]) ?? null;
}

function getStepForModuleStart(
  moduleId: CardTutorialModuleId,
  currentStep: CardTutorialStep,
  steps: CardTutorialStep[],
  completedModuleSet: Set<CardTutorialModuleId>,
  modules: CardTutorialModule[]
) {
  if (currentStep.moduleId === moduleId && !completedModuleSet.has(moduleId)) {
    return currentStep;
  }
  const module = getTutorialModule(moduleId, modules);
  return steps.find((step) => step.id === module.stepIds[0]) ?? steps[0];
}

function getDefaultCompletedActionIdsForModule(moduleId: CardTutorialModuleId, stepId: string) {
  if (moduleId === "inputReading" && stepId === "web-reading") {
    return ["intro-language-loop", "intro-card-types"];
  }
  return [];
}
