import "i18next";
import type { translationResources } from "./i18n";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof translationResources)["ko"];
  }
}
