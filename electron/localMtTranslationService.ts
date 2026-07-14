import { app } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  TranslatePdfSegmentsInput,
  TranslateTextInput,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult
} from "../src/shared/types";
import {
  normalizeLocalMtModel,
  testLocalMtSetup,
  translatePdfSegmentsWithLocalMtPipeline,
  translateTextWithLocalMtPipeline
} from "../src/shared/localMtTranslation";

export async function testLocalMtConnection(
  input: TranslationConnectionTestInput
): Promise<TranslationConnectionTestResult> {
  try {
    const model = await testLocalMtSetup(input.localMtModel, {
      cacheDir: getLocalMtCacheDir(),
      allowRemoteModels: true
    });
    markLocalMtModelReady(model, getLocalMtCacheDir());
    return {
      ok: true,
      code: "connected",
      providerName: "localMt",
      model
    };
  } catch {
    return {
      ok: false,
      code: "local_mt_setup_failed",
      providerName: "localMt",
      model: input.localMtModel?.trim()
    };
  }
}

export async function translateWithLocalMt(input: TranslateTextInput) {
  const model = normalizeLocalMtModel(input.model);
  assertLocalMtModelReady(model, getLocalMtCacheDir());
  return translateTextWithLocalMtPipeline(
    {
      ...input,
      model
    },
    { cacheDir: getLocalMtCacheDir(), allowRemoteModels: false }
  );
}

export async function translatePdfSegmentsWithLocalMt(input: TranslatePdfSegmentsInput) {
  const model = normalizeLocalMtModel(input.model);
  assertLocalMtModelReady(model, getLocalMtCacheDir());
  return translatePdfSegmentsWithLocalMtPipeline(
    {
      ...input,
      model
    },
    { cacheDir: getLocalMtCacheDir(), allowRemoteModels: false }
  );
}

export function isLocalMtModelReady(model: string, cacheDir: string) {
  return fs.existsSync(getLocalMtReadyMarkerPath(model, cacheDir));
}

export function getLocalMtReadyMarkerPath(model: string, cacheDir: string) {
  const digest = createHash("sha256").update(normalizeLocalMtModel(model)).digest("hex");
  return path.join(cacheDir, ".language-miner-ready", `${digest}.json`);
}

function assertLocalMtModelReady(model: string, cacheDir: string) {
  if (!isLocalMtModelReady(model, cacheDir)) {
    throw new Error(
      `Local MT 모델이 아직 준비되지 않았습니다: ${model}. 설정에서 번역 엔진 연결 테스트를 눌러 모델 다운로드를 먼저 완료하세요.`
    );
  }
}

function markLocalMtModelReady(model: string, cacheDir: string) {
  const markerPath = getLocalMtReadyMarkerPath(model, cacheDir);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    JSON.stringify({ model: normalizeLocalMtModel(model), readyAt: new Date().toISOString() }),
    "utf8"
  );
}

function getLocalMtCacheDir() {
  return path.join(app.getPath("userData"), "local-mt-models");
}
